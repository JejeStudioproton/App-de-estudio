import type { Concept, ReviewEvent, Skill, Subject } from "./domain";
import { daysUntil } from "./dates";
import { diagnoseAll, DIAGNOSIS_LABELS, type DiagnosisResult } from "./diagnosis";
import { selectSkill } from "./skills";

const DAY_MS = 86_400_000;
export const DEFAULT_MINUTES_PER_REVIEW = 3;

export type PriorityComponents = {
  /** 0-1: cercanía del examen de la materia (0 si no hay fecha o ya pasó). */
  exam: number;
  /** 0-1: 1 - dominio estimado. */
  weakness: number;
  /** 0-1: importancia declarada del concepto. */
  importance: number;
  /** 0-1: riesgo estimado de olvido según el tiempo desde el último repaso. */
  forgetting: number;
  /** 0-1: dificultades detectadas (fallos recurrentes y diagnósticos). */
  difficulty: number;
  /** 0 o 1: el repaso programado ya ha vencido. */
  due: number;
  /** Penalización por haberlo repasado hace poco (evita repetir siempre lo mismo). */
  recency: number;
};
export type PriorityItem = {
  conceptId: string;
  score: number;
  components: PriorityComponents;
  reason: string;
  suggestedSkill: Skill;
  minutes: number;
};
export type PriorityContext = {
  subjects?: Subject[];
  now?: number;
  /** Diagnósticos ya calculados (evita recalcular). */
  diagnoses?: Map<string, DiagnosisResult>;
};

/**
 * Pesos heurísticos (suman 1 antes de la penalización por repaso reciente).
 * No están calibrados con datos reales: son un punto de partida razonable y ajustable.
 */
export const WEIGHTS = { exam: 0.22, weakness: 0.24, forgetting: 0.2, importance: 0.1, difficulty: 0.14, due: 0.1 } as const;

/** Riesgo de olvido 0-1. Heurística exponencial: sube con el tiempo transcurrido respecto al intervalo programado. */
export function forgettingRisk(c: Concept, now = Date.now()): number {
  if (!c.lastReviewedAt) return 0.6; // nunca repasado: necesita primera exposición, no es "olvido" en sentido estricto
  const last = Date.parse(c.lastReviewedAt);
  if (!Number.isFinite(last)) return 0.6;
  const elapsedDays = Math.max(0, (now - last) / DAY_MS);
  const stability = Math.max(1, c.intervalDays || 1);
  return 1 - Math.exp(-elapsedDays / (stability * 1.5));
}

/** Urgencia 0-1: 1 el mismo día del examen, 0,5 a una semana, y decrece gradualmente. */
export function examUrgency(subject: Subject | undefined, now = Date.now()): number {
  const days = daysUntil(subject?.examDate, new Date(now));
  if (days === undefined || days < 0) return 0;
  return 1 / (1 + days / 7);
}

export function conceptMinutes(c: Concept): number {
  const m = c.estimatedMinutes;
  return typeof m === "number" && Number.isFinite(m) && m >= 1 ? Math.min(60, Math.round(m)) : DEFAULT_MINUTES_PER_REVIEW;
}

function difficultyScore(c: Concept, d?: DiagnosisResult): number {
  let score = Math.min(0.6, (c.lapses || 0) * 0.2);
  for (const x of d?.diagnoses ?? []) {
    if (x.kind === "underconfidence") continue;
    score += x.status === "supported" ? 0.25 : 0.12;
  }
  return Math.min(1, score);
}

function buildReason(c: Concept, comps: PriorityComponents, subject: Subject | undefined, d: DiagnosisResult | undefined, now: number): string {
  const parts: { w: number; text: string }[] = [];
  const days = daysUntil(subject?.examDate, new Date(now));
  if (comps.exam >= 0.3 && days !== undefined) parts.push({ w: comps.exam * WEIGHTS.exam, text: days === 0 ? "El examen es hoy" : `Examen en ${days} ${days === 1 ? "día" : "días"}` });
  if (!c.lastReviewedAt) parts.push({ w: 0.9 * WEIGHTS.weakness, text: "Concepto nuevo, sin repasar" });
  else if (comps.weakness >= 0.5) parts.push({ w: comps.weakness * WEIGHTS.weakness, text: `Dominio estimado bajo (${Math.round((1 - comps.weakness) * 100)} %)` });
  if (comps.due && c.lastReviewedAt) parts.push({ w: WEIGHTS.due + comps.forgetting * WEIGHTS.forgetting, text: "Repaso pendiente" });
  else if (comps.forgetting >= 0.6 && c.lastReviewedAt) parts.push({ w: comps.forgetting * WEIGHTS.forgetting, text: "Riesgo alto de olvido" });
  if (d?.diagnoses.length) parts.push({ w: comps.difficulty * WEIGHTS.difficulty, text: `${DIAGNOSIS_LABELS[d.diagnoses[0].kind]}${d.diagnoses[0].status === "provisional" ? " (provisional)" : ""}` });
  else if (c.lapses >= 2) parts.push({ w: comps.difficulty * WEIGHTS.difficulty, text: `${c.lapses} fallos acumulados` });
  if (comps.importance >= 1) parts.push({ w: comps.importance * WEIGHTS.importance, text: "Concepto clave" });
  if (!parts.length) return "Consolidación";
  return parts.sort((a, b) => b.w - a.w).slice(0, 2).map(p => p.text).join(" · ");
}

/**
 * Ordena los conceptos por prioridad de estudio combinando urgencia de examen, dominio,
 * importancia, riesgo de olvido y dificultades, y penalizando lo repasado hace poco.
 * Es determinista: a igual puntuación decide la fecha de repaso y después el título.
 */
export function prioritizeConcepts(concepts: Concept[], reviews: ReviewEvent[], ctx: PriorityContext = {}): PriorityItem[] {
  const now = ctx.now ?? Date.now();
  const diagnoses = ctx.diagnoses ?? diagnoseAll(reviews);
  const subjectById = new Map((ctx.subjects ?? []).map(s => [s.id, s]));
  const recentByConcept = new Map<string, number>();
  for (const r of reviews) {
    const t = Date.parse(r.at);
    if (Number.isFinite(t) && now - t >= 0 && now - t < DAY_MS) recentByConcept.set(r.conceptId, (recentByConcept.get(r.conceptId) ?? 0) + 1);
  }
  return concepts
    .filter(c => c && c.title && c.title.trim())
    .map(c => {
      const subject = subjectById.get(c.subjectId);
      const d = diagnoses.get(c.id);
      const dueAt = Date.parse(c.dueAt);
      const comps: PriorityComponents = {
        exam: examUrgency(subject, now),
        weakness: 1 - Math.max(0, Math.min(1, c.mastery || 0)),
        importance: ((c.importance ?? 2) - 1) / 2,
        forgetting: forgettingRisk(c, now),
        difficulty: difficultyScore(c, d),
        due: Number.isFinite(dueAt) && dueAt <= now ? 1 : 0,
        recency: Math.min(0.6, (recentByConcept.get(c.id) ?? 0) * 0.25)
      };
      const score = comps.exam * WEIGHTS.exam + comps.weakness * WEIGHTS.weakness + comps.forgetting * WEIGHTS.forgetting +
        comps.importance * WEIGHTS.importance + comps.difficulty * WEIGHTS.difficulty + comps.due * WEIGHTS.due - comps.recency;
      return { conceptId: c.id, score, components: comps, reason: buildReason(c, comps, subject, d, now), suggestedSkill: selectSkill(c), minutes: conceptMinutes(c), _due: dueAt, _title: c.title };
    })
    .sort((a, b) => b.score - a.score || (a._due || 0) - (b._due || 0) || a._title.localeCompare(b._title))
    .map(({ _due, _title, ...item }) => item);
}

/** Elige conceptos en orden de prioridad hasta agotar el tiempo o el máximo de conceptos. Siempre incluye al menos uno. */
export function selectForTime(items: PriorityItem[], minutes: number, maxCount: number): PriorityItem[] {
  const budget = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES_PER_REVIEW;
  const cap = Math.max(1, Math.floor(maxCount) || 1);
  const out: PriorityItem[] = [];
  let used = 0;
  for (const item of items) {
    if (out.length >= cap) break;
    if (out.length > 0 && used + item.minutes > budget) continue;
    out.push(item);
    used += item.minutes;
  }
  return out;
}


import type { Method, ReviewEvent, Skill } from "./domain";
import { METHOD_LABELS, METHODS, SKILLS, SKILL_LABELS } from "./domain";

/**
 * Niveles de evidencia. Son umbrales orientativos de partida: NO son una garantía
 * estadística ni sustituyen un análisis formal.
 */
export type EvidenceLevel = "insufficient" | "initial" | "moderate" | "stronger";

export const EVIDENCE_THRESHOLDS = { initial: 3, moderate: 7, stronger: 15 } as const;

export function evidenceLevel(observations: number): { level: EvidenceLevel; label: string; description: string } {
  const n = Number.isFinite(observations) && observations > 0 ? Math.floor(observations) : 0;
  if (n < EVIDENCE_THRESHOLDS.initial) {
    return { level: "insufficient", label: "Evidencia insuficiente", description: `Solo ${n} ${n === 1 ? "observación" : "observaciones"}: demasiado pronto para sacar conclusiones.` };
  }
  if (n < EVIDENCE_THRESHOLDS.moderate) {
    return { level: "initial", label: "Evidencia inicial", description: `${n} observaciones: es una sospecha inicial, que puede cambiar con más datos.` };
  }
  if (n < EVIDENCE_THRESHOLDS.stronger) {
    return { level: "moderate", label: "Evidencia moderada", description: `${n} observaciones: empieza a verse un patrón, aunque conviene seguir comprobándolo.` };
  }
  return { level: "stronger", label: "Evidencia más sólida", description: `${n} observaciones: el patrón es más fiable, pero sigue basándose en autoevaluaciones y no es una garantía.` };
}

const LEVEL_ORDER: EvidenceLevel[] = ["insufficient", "initial", "moderate", "stronger"];
export function levelAtLeast(level: EvidenceLevel, min: EvidenceLevel): boolean {
  return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(min);
}

export type MethodStat = { method: Method; observations: number; mean: number; level: EvidenceLevel };
export type SkillComparison = {
  skill: Skill;
  methods: MethodStat[];
  /** Hay al menos dos métodos con observaciones suficientes para compararlos. */
  comparable: boolean;
  /** Solo se rellena cuando la diferencia está respaldada por evidencia al menos moderada en ambos métodos. */
  leader?: Method;
  statement: string;
};

/** Diferencia mínima de puntuación media (0-1) para hablar de una ventaja. Umbral orientativo. */
export const MIN_MEANINGFUL_GAP = 0.15;

const pctText = (n: number) => `${Math.round(n * 100)} %`;

/**
 * Compara métodos de estudio dentro de cada habilidad. Usa un lenguaje prudente:
 * con pocos datos solo habla de sospechas y nunca declara a un método superior.
 */
export function compareMethods(reviews: ReviewEvent[]): SkillComparison[] {
  return SKILLS.map(skill => {
    const stats: MethodStat[] = METHODS.map(method => {
      const rows = reviews.filter(r => r.skill === skill && r.method === method && Number.isFinite(r.answerQuality));
      const mean = rows.length ? rows.reduce((s, r) => s + r.answerQuality, 0) / rows.length : 0;
      return { method, observations: rows.length, mean, level: evidenceLevel(rows.length).level };
    }).filter(s => s.observations > 0);

    const eligible = stats.filter(s => s.observations >= EVIDENCE_THRESHOLDS.initial).sort((a, b) => b.mean - a.mean);
    if (eligible.length < 2) {
      const total = stats.reduce((s, x) => s + x.observations, 0);
      return {
        skill, methods: stats, comparable: false,
        statement: total === 0
          ? `Aún no hay datos de ${SKILL_LABELS[skill].toLowerCase()}.`
          : `Todavía no hay observaciones suficientes para comparar métodos en ${SKILL_LABELS[skill].toLowerCase()} (se piden al menos ${EVIDENCE_THRESHOLDS.initial} por método).`
      };
    }
    const [top, second] = eligible;
    const gap = top.mean - second.mean;
    const minN = Math.min(top.observations, second.observations);
    const names = `${METHOD_LABELS[top.method]} (${pctText(top.mean)}, ${top.observations} obs.) frente a ${METHOD_LABELS[second.method]} (${pctText(second.mean)}, ${second.observations} obs.)`;
    const caveat = "Son autoevaluaciones y los métodos se usan con conceptos distintos, así que no prueba que un método funcione mejor.";

    if (gap < MIN_MEANINGFUL_GAP) {
      return { skill, methods: stats, comparable: true, statement: `Sin diferencia clara hasta ahora: ${names}. ${caveat}` };
    }
    if (minN < EVIDENCE_THRESHOLDS.moderate) {
      return { skill, methods: stats, comparable: true, statement: `Sospecha inicial, no una conclusión: ${names}. Hacen falta más observaciones antes de fiarse. ${caveat}` };
    }
    const strength = minN >= EVIDENCE_THRESHOLDS.stronger ? "Patrón más sólido" : "Patrón moderado";
    return { skill, methods: stats, comparable: true, leader: top.method, statement: `${strength}: ${names}. ${caveat}` };
  });
}

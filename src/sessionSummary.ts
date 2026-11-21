import type { Concept, ErrorKind, ReviewEvent } from "./domain";
import { diagnoseAll, DIAGNOSIS_LABELS, errorKindLabel } from "./diagnosis";
import { daysBetween, studyDay } from "./dates";

export type SessionSummary = {
  totalEvents: number;
  averageSeconds?: number;
  studied: { conceptId: string; title: string; attempts: number; lastRating: number }[];
  /** Conceptos con evidencia sostenida: >= 3 intentos, los 3 últimos aprobados y repartidos en al menos 2 días. */
  mastered: { conceptId: string; title: string; evidence: string }[];
  /** Buenos resultados en la sesión que aún no cumplen el criterio de dominio con evidencias. */
  unconfirmed: { conceptId: string; title: string; missing: string }[];
  stillDifficult: { conceptId: string; title: string; why: string }[];
  errorsToFix: { conceptId: string; title: string; kind: ErrorKind | "unclassified"; label: string; count: number }[];
  reviewNext: { conceptId: string; title: string; dueAt: string; inDays: number }[];
  nextActivity: string;
};

export type SessionSummaryInput = {
  /** Intentos registrados en esta sesión. */
  events: ReviewEvent[];
  /** Conceptos tras aplicar la sesión (para fechas de próximo repaso). */
  concepts: Concept[];
  /** Todo el historial (incluida la sesión) para valorar la evidencia acumulada. */
  allReviews: ReviewEvent[];
  now?: number;
};

/** Día de estudio de un intento: dos sesiones de la misma noche (antes y después de las 12) cuentan como un solo día. */
const dayOf = (iso: string) => studyDay(new Date(iso));

export function summarizeSession({ events, concepts, allReviews, now = Date.now() }: SessionSummaryInput): SessionSummary {
  const titleOf = new Map(concepts.map(c => [c.id, c.title]));
  const conceptById = new Map(concepts.map(c => [c.id, c]));
  const valid = events.filter(e => titleOf.has(e.conceptId));
  if (!valid.length) {
    return { totalEvents: 0, studied: [], mastered: [], unconfirmed: [], stillDifficult: [], errorsToFix: [], reviewNext: [], nextActivity: "Completa al menos un concepto para obtener un resumen basado en tus resultados." };
  }

  const ordered = [...valid].sort((a, b) => a.at.localeCompare(b.at));
  const byConcept = new Map<string, ReviewEvent[]>();
  ordered.forEach(e => byConcept.set(e.conceptId, [...(byConcept.get(e.conceptId) ?? []), e]));
  const timed = ordered.filter(e => e.responseSeconds > 0).map(e => e.responseSeconds);
  const diagnoses = diagnoseAll(allReviews);

  const studied = [...byConcept.entries()].map(([id, rows]) => ({ conceptId: id, title: titleOf.get(id)!, attempts: rows.length, lastRating: rows[rows.length - 1].rating }));

  const mastered: SessionSummary["mastered"] = [];
  const unconfirmed: SessionSummary["unconfirmed"] = [];
  const stillDifficult: SessionSummary["stillDifficult"] = [];
  for (const s of studied) {
    const history = allReviews.filter(r => r.conceptId === s.conceptId).sort((a, b) => a.at.localeCompare(b.at));
    const last3 = history.slice(-3);
    const days = new Set(history.map(r => dayOf(r.at))).size;
    const consistent = last3.length >= 3 && last3.every(r => r.rating >= 2) && last3.some(r => r.rating === 3);
    if (s.lastRating >= 2) {
      if (consistent && days >= 2) mastered.push({ conceptId: s.conceptId, title: s.title, evidence: `${history.length} intentos en ${days} días, los 3 últimos aprobados.` });
      else unconfirmed.push({ conceptId: s.conceptId, title: s.title, missing: history.length < 3 ? `Solo ${history.length} ${history.length === 1 ? "intento" : "intentos"} (se piden 3 o más).` : days < 2 ? "Todos los intentos son del mismo día: repítelo otro día." : "Falta consolidar los últimos resultados." });
    }
    const d = diagnoses.get(s.conceptId);
    if (s.lastRating <= 1) stillDifficult.push({ conceptId: s.conceptId, title: s.title, why: d?.diagnoses.length ? `${DIAGNOSIS_LABELS[d.diagnoses[0].kind]}${d.diagnoses[0].status === "provisional" ? " (provisional)" : ""}` : "Último intento fallido o con mucha ayuda." });
    else if (d?.diagnoses.some(x => x.kind !== "underconfidence" && x.status === "supported")) stillDifficult.push({ conceptId: s.conceptId, title: s.title, why: DIAGNOSIS_LABELS[d.diagnoses[0].kind] });
  }

  const errorMap = new Map<string, SessionSummary["errorsToFix"][number]>();
  for (const e of ordered.filter(e => e.rating <= 1)) {
    const kind: ErrorKind | "unclassified" = e.errorKind ?? "unclassified";
    const key = `${e.conceptId}:${kind}`;
    const cur = errorMap.get(key);
    if (cur) cur.count++;
    else errorMap.set(key, { conceptId: e.conceptId, title: titleOf.get(e.conceptId)!, kind, label: errorKindLabel(e.errorKind), count: 1 });
  }
  const errorsToFix = [...errorMap.values()];

  const today = studyDay(new Date(now));
  const reviewNext = studied.map(s => conceptById.get(s.conceptId)!).filter(c => Number.isFinite(Date.parse(c.dueAt)))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).slice(0, 5)
    .map(c => ({ conceptId: c.id, title: c.title, dueAt: c.dueAt, inDays: Math.max(0, daysBetween(today, studyDay(new Date(c.dueAt))) ?? 0) }));

  let nextActivity: string;
  const misconception = errorsToFix.find(e => e.kind === "misconception");
  const recallFail = errorsToFix.find(e => e.kind !== "misconception");
  if (misconception) nextActivity = `Explica con tus palabras «${misconception.title}» y compáralo con la referencia para localizar qué idea no encaja.`;
  else if (stillDifficult.length) nextActivity = `Mañana repite «${stillDifficult[0].title}» con recuerdo activo, sin mirar la referencia antes de responder.`;
  else if (recallFail) nextActivity = `Vuelve a «${recallFail.title}» con recuerdo activo en el próximo repaso.`;
  else if (unconfirmed.length) nextActivity = `Repite «${unconfirmed[0].title}» otro día para confirmar que lo dominas (${unconfirmed[0].missing.toLowerCase()})`;
  else if (reviewNext.length) nextActivity = `Vuelve a «${reviewNext[0].title}» ${reviewNext[0].inDays === 0 ? "hoy mismo" : `en ${reviewNext[0].inDays} ${reviewNext[0].inDays === 1 ? "día" : "días"}`}.`;
  else nextActivity = "Empieza una sesión nueva con los conceptos que FORMA te proponga.";

  return {
    totalEvents: ordered.length,
    averageSeconds: timed.length ? Math.round(timed.reduce((s, x) => s + x, 0) / timed.length) : undefined,
    studied, mastered, unconfirmed, stillDifficult, errorsToFix, reviewNext, nextActivity
  };
}

import type { Concept, ReviewEvent } from "./domain";

/**
 * Reinicia el progreso de un concepto (dominio, intervalos, repasos) sin tocar su contenido ni su historial de intentos.
 * Deja constancia de la fecha para que los intentos anteriores dejen de influir en diagnóstico, plan y resumen.
 */
export function resetConceptProgress(concept: Concept, now: string = new Date().toISOString()): Concept {
  return {
    ...concept,
    mastery: 0, memory: 0, understanding: 0, application: 0,
    dueAt: now, intervalDays: 0, repetitions: 0, lapses: 0,
    lastReviewedAt: undefined, lastMethod: undefined, confidenceCalibration: 0,
    progressResetAt: now, updatedAt: now
  };
}

/** Intentos que cuentan para el estado actual: excluye los anteriores al reinicio de su concepto. */
export function activeReviews(concepts: Concept[], reviews: ReviewEvent[]): ReviewEvent[] {
  const resetAt = new Map<string, number>();
  for (const c of concepts) {
    const t = c.progressResetAt ? Date.parse(c.progressResetAt) : NaN;
    if (Number.isFinite(t)) resetAt.set(c.id, t);
  }
  if (!resetAt.size) return reviews;
  return reviews.filter(r => {
    const limit = resetAt.get(r.conceptId);
    if (limit === undefined) return true;
    const t = Date.parse(r.at);
    return Number.isFinite(t) && t >= limit;
  });
}

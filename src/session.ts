import type { Method } from "./domain";

/**
 * Una tarjeta de la sesión. `attempt` 0 es el intento que cuenta (se registra y programa el repaso);
 * a partir de 1 es una repetición dentro de la misma sesión tras un fallo, que no se registra.
 * Las repeticiones guardan el método con el que se falló, para volver a hacer la misma pregunta.
 */
export type SessionItem = { conceptId: string; attempt: number; method?: Method };

/** Cuántas tarjetas pasan antes de volver a preguntar algo fallado. */
export const RELEARN_GAP = 3;
/** Repeticiones como máximo por concepto y sesión: después se deja para el día siguiente. */
export const MAX_RELEARN = 2;

export function buildQueue(conceptIds: string[]): SessionItem[] {
  const seen = new Set<string>();
  const out: SessionItem[] = [];
  for (const id of conceptIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ conceptId: id, attempt: 0 });
  }
  return out;
}

/** ¿Se puede volver a preguntar en esta sesión la tarjeta de la posición `index`? */
export function canRelearn(items: SessionItem[], index: number): boolean {
  const item = items[index];
  return !!item && item.attempt < MAX_RELEARN;
}

/**
 * Tras fallar la tarjeta `index`, la vuelve a meter unas posiciones más adelante.
 * No modifica la lista recibida. Si ya se agotaron las repeticiones, devuelve la misma lista.
 */
export function requeueAfterFail(items: SessionItem[], index: number, method?: Method): SessionItem[] {
  const item = items[index];
  if (!item || !canRelearn(items, index)) return items;
  const at = Math.min(items.length, index + 1 + RELEARN_GAP);
  const used = method ?? item.method;
  const again: SessionItem = { conceptId: item.conceptId, attempt: item.attempt + 1, ...(used ? { method: used } : {}) };
  return [...items.slice(0, at), again, ...items.slice(at)];
}

/** Repeticiones que quedan por delante de la posición actual. */
export function pendingRelearn(items: SessionItem[], index: number): number {
  return items.slice(index + 1).filter((x) => x.attempt > 0).length;
}

/** Resultado de las repeticiones de una sesión, por concepto. */
export type RelearnOutcome = "recovered" | "pending";

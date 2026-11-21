import type { AppState } from "./domain";

/** Días sin copia a partir de los cuales se recuerda guardar una. */
export const BACKUP_EVERY_DAYS = 14;
/** Con menos trabajo guardado que esto no se molesta con recordatorios. */
export const BACKUP_MIN_CONCEPTS = 10;
export const BACKUP_MIN_REVIEWS = 20;
/** Días que se pospone el aviso con «Ahora no». */
export const BACKUP_SNOOZE_DAYS = 3;

const DAY_MS = 86_400_000;
const time = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : undefined;
};

export type BackupReminder = {
  /** Días desde la última copia; `undefined` si nunca se ha guardado una desde este navegador. */
  daysSince?: number;
};

/**
 * Los datos viven solo en este navegador: si hay bastante trabajo guardado y hace tiempo de la última copia
 * (o nunca se hizo), devuelve un recordatorio. Con «Ahora no» se calla unos días.
 */
export function backupReminder(
  state: Pick<AppState, "concepts" | "reviews" | "lastBackupAt" | "backupSnoozedUntil">,
  now = Date.now(),
): BackupReminder | undefined {
  if (state.concepts.length < BACKUP_MIN_CONCEPTS && state.reviews.length < BACKUP_MIN_REVIEWS) return undefined;
  const snoozed = time(state.backupSnoozedUntil);
  if (snoozed !== undefined && now < snoozed) return undefined;
  const last = time(state.lastBackupAt);
  if (last === undefined) return {};
  const daysSince = Math.floor((now - last) / DAY_MS);
  return daysSince >= BACKUP_EVERY_DAYS ? { daysSince } : undefined;
}

export const snoozeUntil = (now = Date.now()) => new Date(now + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString();

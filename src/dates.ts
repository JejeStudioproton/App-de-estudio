/**
 * Utilidades de fechas por día natural (formato YYYY-MM-DD).
 * Se trabaja con números de día (días desde 1970-01-01 en UTC) para evitar
 * errores de zona horaria y de cambio de hora en los cálculos de calendario.
 */
const DAY_MS = 86_400_000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Devuelve el número de día de una fecha YYYY-MM-DD válida, o undefined si no lo es. */
export function parseDay(value?: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const m = DAY_RE.exec(value);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  // Rechaza fechas inexistentes como 2026-02-31.
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return undefined;
  return ms / DAY_MS;
}

export function formatDay(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

/** Fecha local del usuario (no UTC) en formato YYYY-MM-DD. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(value: string, days: number): string {
  const n = parseDay(value);
  if (n === undefined) throw new Error(`Fecha no válida: ${value}`);
  return formatDay(n + days);
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). undefined si alguna fecha no es válida. */
export function daysBetween(from: string, to: string): number | undefined {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a === undefined || b === undefined) return undefined;
  return b - a;
}

/** Días naturales que faltan para `date` (0 = hoy, negativo = ya pasó). undefined si falta o no es válida. */
export function daysUntil(date?: string, now: Date = new Date()): number | undefined {
  if (!date) return undefined;
  return daysBetween(localDateString(now), date);
}

/**
 * Hora a la que empieza el «día de estudio». Estudiar de madrugada cuenta como el día anterior,
 * para que una sesión a la 1:00 no parta la racha ni adelante los repasos del día siguiente.
 */
export const STUDY_DAY_START_HOUR = 4;
const HOUR_MS = 3_600_000;

/** Día de estudio (YYYY-MM-DD, hora local) al que pertenece un instante. */
export function studyDay(date: Date = new Date()): string {
  return localDateString(new Date(date.getTime() - STUDY_DAY_START_HOUR * HOUR_MS));
}

/** Instante en que empieza el día de estudio de `date`, desplazado `offsetDays` días naturales. */
export function studyDayStart(date: Date = new Date(), offsetDays = 0): Date {
  const shifted = new Date(date.getTime() - STUDY_DAY_START_HOUR * HOUR_MS);
  return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate() + offsetDays, STUDY_DAY_START_HOUR, 0, 0, 0);
}

/**
 * Un repaso «toca hoy» si vence antes de que acabe el día de estudio en curso, sea cual sea la hora:
 * lo programado para esta tarde ya cuenta por la mañana.
 */
export function isDueToday(dueAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(dueAt);
  return Number.isFinite(t) && t < studyDayStart(new Date(now), 1).getTime();
}

/** Días de estudio entre dos instantes (0 = el mismo día de estudio). */
export function studyDaysBetween(from: Date, to: Date): number {
  return daysBetween(studyDay(from), studyDay(to)) ?? 0;
}

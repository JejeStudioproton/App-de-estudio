import type { Concept, ReviewEvent } from "./domain";
import { addDays, daysBetween, isDueToday, parseDay, studyDay } from "./dates";
import { conceptMinutes } from "./priority";

export type WeekDay = { day: string; label: string; studied: boolean; isToday: boolean };
export type TodaySummary = {
  /** Conceptos cuyo repaso toca hoy o ya venció. */
  due: number;
  /** Minutos estimados para lo pendiente. */
  dueMinutes: number;
  /** Repasos registrados en el día de estudio en curso. */
  reviewsToday: number;
  /** Conceptos distintos repasados hoy. */
  conceptsToday: number;
  studiedToday: boolean;
  /** Días de estudio seguidos. Si hoy aún no se ha estudiado, cuenta hasta ayer: la racha no se rompe hasta que acaba el día. */
  streak: number;
  /** Los últimos siete días, de más antiguo a hoy. */
  week: WeekDay[];
  /** Días distintos con algún repaso entre los últimos siete. */
  weekDays: number;
  /** Próximo día con repasos programados cuando hoy no queda nada pendiente. */
  next?: { inDays: number; count: number };
};

const WEEKDAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

/** Resumen de lo que toca hoy y de la constancia reciente. Solo cuenta lo que hay registrado. */
export function todaySummary(concepts: Concept[], reviews: ReviewEvent[], now: Date = new Date()): TodaySummary {
  const today = studyDay(now);
  const nowMs = now.getTime();
  const dueConcepts = concepts.filter((c) => isDueToday(c.dueAt, nowMs));

  const days = new Set<string>();
  const todayConcepts = new Set<string>();
  let reviewsToday = 0;
  for (const r of reviews) {
    const t = new Date(r.at);
    if (!Number.isFinite(t.getTime())) continue;
    const day = studyDay(t);
    days.add(day);
    if (day === today) {
      reviewsToday++;
      todayConcepts.add(r.conceptId);
    }
  }

  let streak = 0;
  let cursor = days.has(today) ? today : addDays(today, -1);
  while (days.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const week: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    const weekday = new Date((parseDay(day) ?? 0) * 86_400_000).getUTCDay();
    week.push({ day, label: WEEKDAY_LABELS[weekday], studied: days.has(day), isToday: i === 0 });
  }

  let next: TodaySummary["next"];
  if (!dueConcepts.length) {
    const upcoming = new Map<number, number>();
    for (const c of concepts) {
      const t = new Date(c.dueAt);
      if (!Number.isFinite(t.getTime())) continue;
      const inDays = daysBetween(today, studyDay(t));
      if (inDays === undefined || inDays < 1) continue;
      upcoming.set(inDays, (upcoming.get(inDays) ?? 0) + 1);
    }
    const first = [...upcoming.keys()].sort((a, b) => a - b)[0];
    if (first !== undefined) next = { inDays: first, count: upcoming.get(first)! };
  }

  return {
    due: dueConcepts.length,
    dueMinutes: dueConcepts.reduce((sum, c) => sum + conceptMinutes(c), 0),
    reviewsToday,
    conceptsToday: todayConcepts.size,
    studiedToday: days.has(today),
    streak,
    week,
    weekDays: week.filter((d) => d.studied).length,
    next,
  };
}

/** «hoy», «mañana» o «en N días» para una fecha de repaso. */
export function dueLabel(dueAt: string, now: Date = new Date()): string {
  const t = new Date(dueAt);
  if (!Number.isFinite(t.getTime())) return "sin fecha";
  const inDays = daysBetween(studyDay(now), studyDay(t)) ?? 0;
  if (inDays <= 0) return "hoy";
  if (inDays === 1) return "mañana";
  if (inDays < 60) return `en ${inDays} días`;
  return `en ${Math.round(inDays / 30)} meses`;
}

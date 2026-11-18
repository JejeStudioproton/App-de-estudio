import type { Concept, ReviewEvent, Subject } from "./domain";
import { addDays, daysBetween, parseDay } from "./dates";
import { diagnoseAll } from "./diagnosis";
import { conceptMinutes, prioritizeConcepts, type PriorityItem } from "./priority";

export type ActivityKind = "recall" | "explanation" | "application";
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  recall: "Recuerdo activo", explanation: "Explicar con tus palabras", application: "Aplicar a un caso"
};
export type PlanTask = { conceptId: string; title: string; activity: ActivityKind; minutes: number; reason: string };
export type PlanDay = { date: string; tasks: PlanTask[]; minutes: number; capacity: number; note?: string };
export type PlanStatus = "ok" | "tight" | "insufficient" | "no-exam-date" | "exam-today" | "exam-passed" | "no-concepts" | "invalid-budget";
export type ExamPlan = {
  status: PlanStatus;
  subjectId: string;
  examDate?: string;
  daysLeft?: number;
  days: PlanDay[];
  requiredMinutes: number;
  plannedMinutes: number;
  availableMinutes: number;
  uncovered: { conceptId: string; title: string }[];
  warnings: string[];
  next?: { date: string; task: PlanTask; why: string };
  summary: string;
};
export type PlanInput = {
  subject: Subject;
  concepts: Concept[];
  reviews: ReviewEvent[];
  dailyMinutes: number;
  /** Fecha local de hoy (YYYY-MM-DD). */
  today: string;
  now?: number;
};

export const MIN_DAILY_MINUTES = 5;
/** El día previo al examen se limita a esta fracción del tiempo diario: repaso ligero, sin sobrecargar. */
export const EVE_FRACTION = 0.6;

/** Número de pasadas que se intentan por concepto según su dominio estimado. */
export function passesFor(c: Concept): number {
  if (!c.lastReviewedAt) return 3;
  return c.mastery < 0.4 ? 3 : c.mastery < 0.7 ? 2 : 1;
}
const activityMinutes = (base: number, activity: ActivityKind) => activity === "application" ? Math.max(base + 1, Math.ceil(base * 1.5)) : base;

function activitiesFor(c: Concept, passes: number, kinds: Set<string>): ActivityKind[] {
  const hasApplication = c.applicationAnswer.trim().length > 0;
  const middle: ActivityKind = kinds.has("misconception") ? "explanation" : hasApplication ? "application" : "explanation";
  // La primera pasada siempre es recuerdo activo; la segunda refuerza el punto débil detectado.
  if (passes <= 1) return ["recall"];
  const list: ActivityKind[] = ["recall", kinds.has("application-difficulty") && hasApplication ? "application" : middle];
  while (list.length < passes) list.push(list.length === passes - 1 ? "recall" : middle);
  return list;
}

function emptyPlan(input: PlanInput, status: PlanStatus, summary: string, extra: Partial<ExamPlan> = {}): ExamPlan {
  return { status, subjectId: input.subject.id, examDate: input.subject.examDate, days: [], requiredMinutes: 0, plannedMinutes: 0, availableMinutes: 0, uncovered: [], warnings: [], summary, ...extra };
}

/**
 * Construye un plan día a día hasta el examen con el tiempo diario disponible.
 * Es una función pura: se vuelve a llamar con el estado actual cada vez que el usuario estudia,
 * falla preguntas o cambia la fecha, y el plan se recalcula.
 * Nunca programa más minutos que la capacidad de cada día; lo que no cabe se informa como "sin cubrir".
 */
export function buildExamPlan(input: PlanInput): ExamPlan {
  const { subject, today } = input;
  const concepts = input.concepts.filter(c => c.subjectId === subject.id && c.title.trim());
  const daily = Math.floor(input.dailyMinutes);
  if (!Number.isFinite(daily) || daily < MIN_DAILY_MINUTES) {
    return emptyPlan(input, "invalid-budget", `Indica al menos ${MIN_DAILY_MINUTES} minutos diarios para poder planificar.`);
  }
  if (parseDay(today) === undefined) return emptyPlan(input, "invalid-budget", "No se pudo determinar la fecha de hoy.");
  if (!concepts.length) return emptyPlan(input, "no-concepts", "Añade conceptos a esta materia para poder preparar un plan.");

  const now = input.now ?? Date.now();
  const diagnoses = diagnoseAll(input.reviews);
  const ranking = prioritizeConcepts(concepts, input.reviews, { subjects: [subject], now, diagnoses });
  const byId = new Map(concepts.map(c => [c.id, c]));
  const daysLeft = subject.examDate ? daysBetween(today, subject.examDate) : undefined;

  if (subject.examDate && daysLeft === undefined) {
    return emptyPlan(input, "no-exam-date", "La fecha del examen no es válida. Corrígela para obtener un plan hasta el examen.");
  }
  if (daysLeft !== undefined && daysLeft < 0) {
    return emptyPlan(input, "exam-passed", "La fecha del examen ya ha pasado. Actualiza la fecha si hay un nuevo examen.", { daysLeft });
  }

  // Días de estudio disponibles y capacidad de cada uno.
  let dates: string[];
  let status: PlanStatus = "ok";
  if (daysLeft === undefined) { dates = [today]; status = "no-exam-date"; }
  else if (daysLeft === 0) { dates = [today]; status = "exam-today"; }
  else dates = Array.from({ length: daysLeft }, (_, i) => addDays(today, i)); // hoy ... víspera del examen

  const capacity = dates.map((_, i) => {
    const isEve = daysLeft !== undefined && daysLeft >= 1 && i === dates.length - 1 && dates.length > 1;
    const isExamDay = status === "exam-today";
    return isExamDay || isEve ? Math.max(MIN_DAILY_MINUTES, Math.floor(daily * EVE_FRACTION)) : daily;
  });
  const days: PlanDay[] = dates.map((date, i) => ({ date, tasks: [], minutes: 0, capacity: capacity[i], note: status === "exam-today" ? "Día del examen: solo un repaso ligero." : (daysLeft !== undefined && daysLeft >= 1 && i === dates.length - 1 && dates.length > 1) ? "Víspera del examen: repaso ligero." : undefined }));
  const lightDay = (i: number) => days[i].note !== undefined;

  // Necesidad total frente a disponibilidad.
  type Need = { item: PriorityItem; concept: Concept; activities: ActivityKind[] };
  const needs: Need[] = ranking.map(item => {
    const concept = byId.get(item.conceptId)!;
    const kinds = new Set((diagnoses.get(concept.id)?.diagnoses ?? []).map(d => d.kind as string));
    const passes = status === "no-exam-date" || status === "exam-today" ? 1 : Math.min(passesFor(concept), dates.length);
    return { item, concept, activities: activitiesFor(concept, passes, kinds) };
  });
  const required = needs.reduce((s, n) => s + n.activities.reduce((a, act) => a + activityMinutes(conceptMinutes(n.concept), act), 0), 0);
  const available = capacity.reduce((s, c) => s + c, 0);

  const placedConcepts = new Map<string, number>();
  for (const need of needs) {
    const { concept, item, activities } = need;
    const base = conceptMinutes(concept);
    let prevDay = -1;
    activities.forEach((activity, k) => {
      // Con 3 o más pasadas la última cae en la víspera (repaso ligero de recuerdo); con 2 se evita la víspera
      // para que la pasada de aplicación/explicación no quede reducida a un simple recuerdo.
      const hasEve = days.length > 1 && lightDay(days.length - 1);
      const span = activities.length >= 3 || !hasEve ? dates.length : dates.length - 1;
      const ideal = activities.length === 1 ? 0 : Math.round((k * (span - 1)) / (activities.length - 1));
      const earliest = Math.max(ideal, prevDay + (dates.length > activities.length ? 1 : 0));
      for (let d = Math.max(0, earliest); d < dates.length; d++) {
        const dayAct: ActivityKind = lightDay(d) ? "recall" : activity;
        const minutes = activityMinutes(base, dayAct);
        if (days[d].minutes + minutes <= days[d].capacity && !days[d].tasks.some(t => t.conceptId === concept.id && t.activity === dayAct)) {
          days[d].tasks.push({ conceptId: concept.id, title: concept.title, activity: dayAct, minutes, reason: item.reason });
          days[d].minutes += minutes;
          placedConcepts.set(concept.id, (placedConcepts.get(concept.id) ?? 0) + 1);
          prevDay = d;
          return;
        }
      }
    });
  }

  const planned = days.reduce((s, d) => s + d.minutes, 0);
  const uncovered = needs.filter(n => !placedConcepts.has(n.concept.id)).map(n => ({ conceptId: n.concept.id, title: n.concept.title }));
  const warnings: string[] = [];
  if (status === "ok" || status === "no-exam-date" || status === "exam-today") {
    const shortfall = required - planned;
    if (daysLeft !== undefined && daysLeft >= 1 && (uncovered.length > 0 || shortfall > 0)) {
      // Días útiles equivalentes: todos completos salvo la víspera, que cuenta como EVE_FRACTION.
      const perDay = Math.ceil(required / Math.max(1, dates.length - (dates.length > 1 ? 1 - EVE_FRACTION : 0)));
      warnings.push(uncovered.length > 0
        ? `El tiempo disponible no alcanza para cubrir todo: ${uncovered.length} de ${concepts.length} conceptos se quedan sin repasar. Con unos ${perDay} min diarios cabría el plan completo, o puedes reducir el contenido o mover el examen.`
        : `El tiempo es justo: se cubren todos los conceptos, pero con menos repasos de los ideales (faltan unos ${shortfall} min). Unos ${perDay} min diarios darían más margen.`);
      status = uncovered.length > 0 && planned < required * 0.8 ? "insufficient" : "tight";
    }
  }
  if (status === "no-exam-date") warnings.push("Sin fecha de examen solo se planifica el día de hoy. Añade la fecha para repartir los repasos.");
  if (status === "exam-today") warnings.push("El examen es hoy: el plan se limita a un repaso ligero de lo más importante.");

  const firstDay = days.find(d => d.tasks.length > 0);
  const next = firstDay ? { date: firstDay.date, task: firstDay.tasks[0], why: firstDay.tasks[0].reason } : undefined;
  const summary = status === "insufficient" ? "El tiempo disponible no cubre todo el contenido; el plan prioriza lo más necesario."
    : status === "tight" ? "Plan ajustado: cubre lo esencial con poco margen."
    : status === "exam-today" ? "Día del examen: repaso ligero."
    : status === "no-exam-date" ? "Plan de hoy (sin fecha de examen)."
    : `Plan de ${dates.length} ${dates.length === 1 ? "día" : "días"} hasta el examen. Es una guía de estudio: no garantiza un resultado.`;

  return { status, subjectId: subject.id, examDate: subject.examDate, daysLeft, days, requiredMinutes: required, plannedMinutes: planned, availableMinutes: available, uncovered, warnings, next, summary };
}

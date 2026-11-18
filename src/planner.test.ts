import { describe, expect, it } from "vitest";
import { buildExamPlan, EVE_FRACTION, passesFor, type PlanInput } from "./planner";
import { createSubject } from "./engine";
import { concept, ev } from "./test-helpers";

const NOW = Date.parse("2026-03-01T09:00:00");
const subj = (examDate?: string) => ({ ...createSubject("Historia", "", examDate), id: "s1" });
function input(p: Partial<PlanInput> & { n?: number; examDate?: string }): PlanInput {
  const { n = 5, examDate, ...rest } = p;
  return {
    subject: subj(examDate), today: "2026-03-01", now: NOW, dailyMinutes: 30, reviews: [],
    concepts: Array.from({ length: n }, (_, i) => concept({ id: `c${i}`, title: `Concepto ${i}`, applicationAnswer: "caso" })),
    ...rest
  };
}
const dayMinutesOk = (plan: ReturnType<typeof buildExamPlan>) => plan.days.every(d => d.minutes <= d.capacity && d.tasks.reduce((s, t) => s + t.minutes, 0) === d.minutes);

describe("planificador de exámenes", () => {
  it("rechaza presupuestos de tiempo inválidos", () => {
    for (const dailyMinutes of [0, -10, NaN, 3, Infinity]) {
      const plan = buildExamPlan(input({ examDate: "2026-03-10", dailyMinutes }));
      expect(plan.status).toBe("invalid-budget");
      expect(plan.days).toHaveLength(0);
    }
  });
  it("sin conceptos no genera un plan", () => {
    expect(buildExamPlan(input({ n: 0, examDate: "2026-03-10" })).status).toBe("no-concepts");
  });
  it("fecha pasada: lo indica y no planifica", () => {
    const plan = buildExamPlan(input({ examDate: "2026-02-20" }));
    expect(plan.status).toBe("exam-passed");
    expect(plan.days).toHaveLength(0);
  });
  it("fecha mal formada o inexistente no rompe y se avisa", () => {
    for (const examDate of ["2026-02-31", "mañana", "2026/03/10"]) {
      const plan = buildExamPlan(input({ examDate }));
      expect(plan.status).toBe("no-exam-date");
      expect(plan.summary).toContain("no es válida");
    }
  });
  it("sin fecha de examen planifica solo hoy y lo advierte", () => {
    const plan = buildExamPlan(input({}));
    expect(plan.status).toBe("no-exam-date");
    expect(plan.days).toHaveLength(1);
    expect(plan.warnings.join(" ")).toContain("fecha");
    expect(dayMinutesOk(plan)).toBe(true);
  });
  it("el día del examen solo propone repaso ligero (<= 60 % del tiempo)", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-01" }));
    expect(plan.status).toBe("exam-today");
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].capacity).toBeLessThanOrEqual(Math.floor(30 * EVE_FRACTION));
    expect(plan.days[0].tasks.every(t => t.activity === "recall")).toBe(true);
  });
  it("con tiempo de sobra cubre todos los conceptos sin avisos", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-15", dailyMinutes: 60, n: 4 }));
    expect(plan.status).toBe("ok");
    expect(plan.uncovered).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
    expect(dayMinutesOk(plan)).toBe(true);
    expect(plan.days).toHaveLength(14);
  });
  it("nunca supera la capacidad diaria, ni siquiera cuando el contenido no cabe", () => {
    for (const [n, daily, date] of [[40, 20, "2026-03-04"], [15, 10, "2026-03-03"], [80, 45, "2026-03-31"], [3, 5, "2026-03-02"]] as const) {
      const plan = buildExamPlan(input({ n, dailyMinutes: daily, examDate: date }));
      expect(dayMinutesOk(plan)).toBe(true);
      expect(plan.plannedMinutes).toBeLessThanOrEqual(plan.availableMinutes);
    }
  });
  it("avisa cuando el tiempo es insuficiente y lista lo que queda sin cubrir", () => {
    const plan = buildExamPlan(input({ n: 40, dailyMinutes: 15, examDate: "2026-03-04" }));
    expect(["insufficient", "tight"]).toContain(plan.status);
    expect(plan.warnings.join(" ")).toContain("no alcanza");
    expect(plan.uncovered.length).toBeGreaterThan(0);
    expect(plan.requiredMinutes).toBeGreaterThan(plan.availableMinutes);
  });
  it("lo no cubierto es lo menos prioritario", () => {
    const hard = concept({ id: "dificil", title: "difícil", mastery: 0, importance: 3 });
    const easy = concept({ id: "facil", title: "fácil", mastery: 0.95, importance: 1, lastReviewedAt: "2026-02-28T10:00:00", intervalDays: 30, dueAt: "2026-03-30T10:00:00" });
    const plan = buildExamPlan(input({ concepts: [easy, hard, ...Array.from({ length: 12 }, (_, i) => concept({ id: `x${i}`, title: `x${i}`, mastery: 0.1 }))], dailyMinutes: 6, examDate: "2026-03-03" }));
    expect(plan.uncovered.some(u => u.conceptId === "facil")).toBe(true);
    expect(plan.uncovered.some(u => u.conceptId === "dificil")).toBe(false);
  });
  it("reserva tiempo para recuperación activa y para aplicación", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-10", dailyMinutes: 40, n: 6 }));
    const tasks = plan.days.flatMap(d => d.tasks);
    expect(tasks.some(t => t.activity === "recall")).toBe(true);
    expect(tasks.some(t => t.activity === "application")).toBe(true);
    expect(tasks.every(t => ["recall", "explanation", "application"].includes(t.activity))).toBe(true);
  });
  it("sin material de aplicación usa explicación en lugar de inventar un caso", () => {
    const concepts = Array.from({ length: 3 }, (_, i) => concept({ id: `n${i}`, title: `n${i}`, applicationAnswer: "" }));
    const tasks = buildExamPlan(input({ concepts, examDate: "2026-03-08", dailyMinutes: 40 })).days.flatMap(d => d.tasks);
    expect(tasks.some(t => t.activity === "application")).toBe(false);
    expect(tasks.some(t => t.activity === "explanation")).toBe(true);
  });
  it("la víspera del examen es más ligera que un día normal", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-05", dailyMinutes: 40, n: 30 }));
    const eve = plan.days[plan.days.length - 1];
    expect(eve.date).toBe("2026-03-04");
    expect(eve.capacity).toBeLessThanOrEqual(Math.floor(40 * EVE_FRACTION));
    expect(eve.tasks.every(t => t.activity === "recall")).toBe(true);
  });
  it("con un solo día restante usa todo el tiempo de hoy", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-02", dailyMinutes: 30 }));
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].capacity).toBe(30);
  });
  it("se recalcula al fallar: un concepto con dominio bajo recibe más repasos", () => {
    const base = concept({ id: "k", title: "k", mastery: 0.9, lastReviewedAt: "2026-02-28T10:00:00", intervalDays: 10, dueAt: "2026-03-10T10:00:00", applicationAnswer: "caso" });
    const failed = { ...base, mastery: 0.2 };
    const count = (c: typeof base) => buildExamPlan(input({ concepts: [c], examDate: "2026-03-12", dailyMinutes: 60 })).days.flatMap(d => d.tasks).length;
    expect(passesFor(failed)).toBeGreaterThan(passesFor(base));
    expect(count(failed)).toBeGreaterThan(count(base));
  });
  it("se recalcula al cambiar la fecha: menos días, menos hueco", () => {
    const far = buildExamPlan(input({ examDate: "2026-03-20", dailyMinutes: 20, n: 8 }));
    const near = buildExamPlan(input({ examDate: "2026-03-03", dailyMinutes: 20, n: 8 }));
    expect(far.days.length).toBeGreaterThan(near.days.length);
    expect(near.availableMinutes).toBeLessThan(far.availableMinutes);
    expect(near.uncovered.length + (near.requiredMinutes - near.plannedMinutes)).toBeGreaterThanOrEqual(far.uncovered.length);
  });
  it("un diagnóstico de dificultad de aplicación refuerza la aplicación", () => {
    const reviews = [
      ev({ rating: 3, conceptId: "a", skill: "memory" }), ev({ rating: 3, conceptId: "a", skill: "memory" }), ev({ rating: 3, conceptId: "a", skill: "understanding" }),
      ev({ rating: 0, conceptId: "a", skill: "application" }), ev({ rating: 1, conceptId: "a", skill: "application" })
    ];
    const a = concept({ id: "a", title: "a", mastery: 0.5, lastReviewedAt: "2026-02-28T10:00:00", intervalDays: 3, dueAt: "2026-03-02T10:00:00", applicationAnswer: "caso" });
    const tasks = buildExamPlan(input({ concepts: [a], reviews, examDate: "2026-03-09", dailyMinutes: 30 })).days.flatMap(d => d.tasks);
    expect(tasks.some(t => t.activity === "application")).toBe(true);
  });
  it("muestra qué hacer a continuación y por qué", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-10" }));
    expect(plan.next).toBeDefined();
    expect(plan.next!.date).toBe("2026-03-01");
    expect(plan.next!.why.length).toBeGreaterThan(0);
  });
  it("ignora conceptos de otras materias", () => {
    const other = concept({ id: "o", title: "otra", subjectId: "otra-materia" });
    const plan = buildExamPlan(input({ concepts: [other], examDate: "2026-03-10" }));
    expect(plan.status).toBe("no-concepts");
  });
  it("no promete resultados", () => {
    const plan = buildExamPlan(input({ examDate: "2026-03-10", n: 30, dailyMinutes: 10 }));
    const text = `${plan.summary} ${plan.warnings.join(" ")}`.toLowerCase();
    expect(text).not.toMatch(/aprobar[áa]s|garantizad|aseguramos|seguro que apruebas/);
  });
  it("no modifica los datos de entrada", () => {
    const i = input({ examDate: "2026-03-10" });
    const copy = JSON.stringify(i);
    buildExamPlan(i);
    expect(JSON.stringify(i)).toBe(copy);
  });
});

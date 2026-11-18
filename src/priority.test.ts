import { describe, expect, it } from "vitest";
import { forgettingRisk, examUrgency, prioritizeConcepts, selectForTime } from "./priority";
import { planSession, createSubject } from "./engine";
import { concept, ev } from "./test-helpers";

const NOW = Date.parse("2026-03-10T12:00:00");
const subject = (examDate?: string) => ({ ...createSubject("Mate", "", examDate), id: "s1" });

describe("priorización de conceptos", () => {
  it("urgencia del examen: más alta cuanto más cerca, 0 sin fecha o con examen pasado", () => {
    const near = examUrgency(subject("2026-03-11"), NOW), far = examUrgency(subject("2026-05-10"), NOW);
    expect(near).toBeGreaterThan(far);
    expect(examUrgency(subject(), NOW)).toBe(0);
    expect(examUrgency(subject("2026-03-01"), NOW)).toBe(0);
    expect(examUrgency(subject("2026-03-10"), NOW)).toBe(1);
  });
  it("riesgo de olvido crece con el tiempo y es menor con intervalos largos", () => {
    const base = { title: "x", lastReviewedAt: "2026-03-09T12:00:00", intervalDays: 1 };
    const short = forgettingRisk(concept(base), NOW);
    const longer = forgettingRisk(concept({ ...base, lastReviewedAt: "2026-03-01T12:00:00" }), NOW);
    const stable = forgettingRisk(concept({ ...base, lastReviewedAt: "2026-03-01T12:00:00", intervalDays: 30 }), NOW);
    expect(longer).toBeGreaterThan(short);
    expect(stable).toBeLessThan(longer);
    expect(forgettingRisk(concept({ title: "nuevo" }), NOW)).toBeGreaterThan(0);
  });
  it("el riesgo de olvido tolera fechas inválidas o en el futuro", () => {
    expect(forgettingRisk(concept({ title: "x", lastReviewedAt: "no-fecha" }), NOW)).toBeGreaterThan(0);
    const future = forgettingRisk(concept({ title: "x", lastReviewedAt: "2027-01-01T00:00:00", intervalDays: 3 }), NOW);
    expect(future).toBeGreaterThanOrEqual(0);
    expect(future).toBeLessThan(0.01);
  });
  it("prioriza lo débil y vencido sobre lo dominado y reciente", () => {
    const weak = concept({ title: "débil", mastery: 0.1, lastReviewedAt: "2026-03-01T12:00:00", intervalDays: 2, dueAt: "2026-03-03T12:00:00" });
    const strong = concept({ title: "fuerte", mastery: 0.95, lastReviewedAt: "2026-03-09T12:00:00", intervalDays: 20, dueAt: "2026-03-29T12:00:00" });
    const ranked = prioritizeConcepts([strong, weak], [], { subjects: [subject()], now: NOW });
    expect(ranked[0].conceptId).toBe(weak.id);
    expect(ranked[0].reason).not.toBe("");
  });
  it("la importancia desempata entre conceptos equivalentes", () => {
    const a = concept({ title: "a", importance: 1, lastReviewedAt: "2026-03-01T12:00:00", dueAt: "2026-03-02T12:00:00", intervalDays: 1 });
    const b = concept({ title: "b", importance: 3, lastReviewedAt: "2026-03-01T12:00:00", dueAt: "2026-03-02T12:00:00", intervalDays: 1 });
    expect(prioritizeConcepts([a, b], [], { now: NOW })[0].conceptId).toBe(b.id);
  });
  it("un examen cercano sube la prioridad frente al mismo concepto en una materia sin examen", () => {
    const sNear = { ...subject("2026-03-12"), id: "near" }, sNone = { ...subject(), id: "none" };
    const common = { title: "x", mastery: 0.3, lastReviewedAt: "2026-03-05T12:00:00", dueAt: "2026-03-20T12:00:00", intervalDays: 15 };
    const a = concept({ ...common, subjectId: "none", title: "sin examen" }), b = concept({ ...common, subjectId: "near", title: "con examen" });
    expect(prioritizeConcepts([a, b], [], { subjects: [sNear, sNone], now: NOW })[0].conceptId).toBe(b.id);
  });
  it("la prioridad cambia con nueva evidencia: un diagnóstico de dificultad sube el concepto", () => {
    const a = concept({ id: "a", title: "a", mastery: 0.5, lastReviewedAt: "2026-03-05T12:00:00", dueAt: "2026-03-20T12:00:00", intervalDays: 15 });
    const b = concept({ id: "b", title: "b", mastery: 0.5, lastReviewedAt: "2026-03-05T12:00:00", dueAt: "2026-03-20T12:00:00", intervalDays: 15 });
    expect(prioritizeConcepts([a, b], [], { now: NOW })[0].conceptId).toBe("a"); // desempate por título
    const fails = [0, 0, 1].map(r => ev({ rating: r as 0 | 1, conceptId: "b", day: "2026-03-05" }));
    expect(prioritizeConcepts([a, b], fails, { now: NOW })[0].conceptId).toBe("b");
  });
  it("evita repetir lo repasado hace poco: solo difiere el repaso de las últimas 24 h", () => {
    const common = { mastery: 0.3, lastReviewedAt: "2026-03-09T09:00:00Z", dueAt: "2026-03-10T09:00:00Z", intervalDays: 1 };
    const a = concept({ id: "a", title: "a", ...common });
    const b = concept({ id: "b", title: "b", ...common });
    const now = Date.parse("2026-03-10T12:00:00Z");
    // Sin repasos recientes decide el título (a antes que b).
    expect(prioritizeConcepts([a, b], [], { now })[0].conceptId).toBe("a");
    // Con un repaso de "a" hace dos horas, pasa "b" primero.
    const justNow = [ev({ rating: 1, conceptId: "a", day: "2026-03-10", minute: 0 })]; // 10:00Z
    const ranked = prioritizeConcepts([a, b], justNow, { now });
    expect(ranked[0].conceptId).toBe("b");
    // Un repaso de hace más de 24 h ya no penaliza.
    const old = [ev({ rating: 1, conceptId: "a", day: "2026-03-08", minute: 0 })];
    expect(prioritizeConcepts([a, b], old, { now })[0].components.recency).toBe(0);
  });
  it("es determinista y no modifica la entrada", () => {
    const list = [concept({ title: "z" }), concept({ title: "a" }), concept({ title: "m" })];
    const copy = JSON.stringify(list);
    const first = prioritizeConcepts(list, [], { now: NOW }).map(x => x.conceptId);
    expect(prioritizeConcepts(list, [], { now: NOW }).map(x => x.conceptId)).toEqual(first);
    expect(JSON.stringify(list)).toBe(copy);
  });
  it("tolera conceptos sin título, vacíos y datos antiguos sin importancia ni minutos", () => {
    const old: any = concept({ title: "viejo" }); delete old.importance; delete old.estimatedMinutes;
    expect(prioritizeConcepts([old, { ...old, id: "x", title: "  " }], [], { now: NOW })).toHaveLength(1);
    expect(prioritizeConcepts([], [], { now: NOW })).toEqual([]);
  });
  it("selectForTime respeta tiempo y máximo, y siempre incluye al menos un concepto", () => {
    const items = prioritizeConcepts(Array.from({ length: 6 }, (_, i) => concept({ title: `c${i}`, estimatedMinutes: 10 })), [], { now: NOW });
    expect(selectForTime(items, 25, 10)).toHaveLength(2);
    expect(selectForTime(items, 100, 3)).toHaveLength(3);
    expect(selectForTime(items, 1, 5)).toHaveLength(1);
    expect(selectForTime([], 25, 5)).toEqual([]);
    expect(selectForTime(items, NaN, 2).length).toBeGreaterThan(0);
  });
  it("planSession usa sessionLength como tope y respeta el tiempo", () => {
    const list = Array.from({ length: 10 }, (_, i) => concept({ title: `c${i}` }));
    expect(planSession(list, [], 60, NOW, { sessionLength: 4 })).toHaveLength(4);
    expect(planSession(list, [], 9, NOW)).toHaveLength(3);
  });
});

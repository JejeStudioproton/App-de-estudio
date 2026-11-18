import { describe, expect, it } from "vitest";
import { summarizeSession } from "./sessionSummary";
import { applyReview, initialState } from "./engine";
import { concept, ev, withKind } from "./test-helpers";

const NOW = Date.parse("2026-03-10T12:00:00Z");
const c1 = concept({ id: "c1", title: "Fotosíntesis", dueAt: "2026-03-13T10:00:00Z" });
const c2 = concept({ id: "c2", title: "Mitosis", dueAt: "2026-03-11T10:00:00Z" });

describe("resumen de sesión", () => {
  it("sin eventos no inventa resultados y orienta a completar un concepto", () => {
    const s = summarizeSession({ events: [], concepts: [c1], allReviews: [], now: NOW });
    expect(s.totalEvents).toBe(0);
    expect(s.studied).toHaveLength(0);
    expect(s.nextActivity).toContain("Completa");
  });
  it("ignora eventos de conceptos que ya no existen", () => {
    const s = summarizeSession({ events: [ev({ rating: 3, conceptId: "borrado" })], concepts: [c1], allReviews: [], now: NOW });
    expect(s.totalEvents).toBe(0);
  });
  it("un buen resultado con un solo intento NO se considera dominado", () => {
    const e = ev({ rating: 3, conceptId: "c1", day: "2026-03-10" });
    const s = summarizeSession({ events: [e], concepts: [c1], allReviews: [e], now: NOW });
    expect(s.mastered).toHaveLength(0);
    expect(s.unconfirmed[0].title).toBe("Fotosíntesis");
    expect(s.unconfirmed[0].missing).toContain("1 intento");
  });
  it("tres aciertos el mismo día tampoco bastan: se pide repetirlo otro día", () => {
    const all = [0, 1, 2].map(m => ev({ rating: 3, conceptId: "c1", day: "2026-03-10", minute: m }));
    const s = summarizeSession({ events: all, concepts: [c1], allReviews: all, now: NOW });
    expect(s.mastered).toHaveLength(0);
    expect(s.unconfirmed[0].missing).toContain("otro día");
  });
  it("tres aciertos en al menos dos días sí cuentan como dominio con evidencias", () => {
    const history = [ev({ rating: 3, conceptId: "c1", day: "2026-03-07" }), ev({ rating: 2, conceptId: "c1", day: "2026-03-08" }), ev({ rating: 3, conceptId: "c1", day: "2026-03-10" })];
    const s = summarizeSession({ events: [history[2]], concepts: [c1], allReviews: history, now: NOW });
    expect(s.mastered.map(m => m.title)).toEqual(["Fotosíntesis"]);
    expect(s.mastered[0].evidence).toContain("3 intentos");
  });
  it("un fallo reciente impide declarar dominio aunque haya aciertos previos", () => {
    const history = [ev({ rating: 3, conceptId: "c1", day: "2026-03-07" }), ev({ rating: 3, conceptId: "c1", day: "2026-03-08" }), ev({ rating: 0, conceptId: "c1", day: "2026-03-10" })];
    const s = summarizeSession({ events: [history[2]], concepts: [c1], allReviews: history, now: NOW });
    expect(s.mastered).toHaveLength(0);
    expect(s.stillDifficult.map(d => d.title)).toContain("Fotosíntesis");
  });
  it("agrupa los errores por tipo y no clasifica los que el estudiante no clasificó", () => {
    const events = [
      ev({ rating: 0, conceptId: "c1", day: "2026-03-10", minute: 1, ...withKind("misconception") }),
      ev({ rating: 1, conceptId: "c1", day: "2026-03-10", minute: 2, ...withKind("misconception") }),
      ev({ rating: 0, conceptId: "c2", day: "2026-03-10", minute: 3 })
    ];
    const s = summarizeSession({ events, concepts: [c1, c2], allReviews: events, now: NOW });
    const m = s.errorsToFix.find(e => e.conceptId === "c1")!;
    expect(m.kind).toBe("misconception");
    expect(m.count).toBe(2);
    expect(s.errorsToFix.find(e => e.conceptId === "c2")!.kind).toBe("unclassified");
    expect(s.nextActivity).toContain("Explica con tus palabras");
  });
  it("lista los próximos repasos ordenados por fecha con los días que faltan", () => {
    const events = [ev({ rating: 2, conceptId: "c1", day: "2026-03-10" }), ev({ rating: 2, conceptId: "c2", day: "2026-03-10", minute: 1 })];
    const s = summarizeSession({ events, concepts: [c1, c2], allReviews: events, now: NOW });
    expect(s.reviewNext.map(r => r.title)).toEqual(["Mitosis", "Fotosíntesis"]);
    expect(s.reviewNext[0].inDays).toBe(1);
  });
  it("calcula el tiempo medio solo con intentos cuyo tiempo se midió", () => {
    const events = [ev({ rating: 2, conceptId: "c1", responseSeconds: 10 }), ev({ rating: 2, conceptId: "c1", responseSeconds: 0 }), ev({ rating: 2, conceptId: "c1", responseSeconds: 20 })];
    expect(summarizeSession({ events, concepts: [c1], allReviews: events, now: NOW }).averageSeconds).toBe(15);
    expect(summarizeSession({ events: [ev({ rating: 2, conceptId: "c1" })], concepts: [c1], allReviews: [], now: NOW }).averageSeconds).toBeUndefined();
  });
  it("funciona con el estado real tras aplicar una sesión", () => {
    const base = { ...initialState(), concepts: [c1, c2] };
    const e1 = ev({ rating: 3, conceptId: "c1", subjectId: "s1", day: "2026-03-10", confidence: 0.6 });
    const e2 = ev({ rating: 0, conceptId: "c2", subjectId: "s1", day: "2026-03-10", minute: 2, confidence: 0.9 });
    const after = [e1, e2].reduce(applyReview, base);
    const s = summarizeSession({ events: [e1, e2], concepts: after.concepts, allReviews: after.reviews, now: NOW });
    expect(s.studied).toHaveLength(2);
    expect(s.stillDifficult.map(d => d.title)).toContain("Mitosis");
    expect(s.nextActivity).toContain("Mitosis");
  });
});

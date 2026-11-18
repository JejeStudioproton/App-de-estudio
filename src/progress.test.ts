import { describe, expect, it } from "vitest";
import { applyReview, createConcept, exportState, importState, initialState } from "./engine";
import { activeReviews, resetConceptProgress } from "./progress";
import { diagnoseAll } from "./diagnosis";
import type { ReviewEvent } from "./domain";

const NOW = "2026-11-18T12:00:00.000Z";
const concept = () => ({ ...createConcept({ subjectId: "s", title: "Mitosis", answer: "x" }), mastery: 0.7, memory: 0.7, understanding: 0.6, application: 0.5, repetitions: 5, lapses: 2, intervalDays: 12, lastReviewedAt: "2026-11-10T00:00:00.000Z", lastMethod: "active-recall" as const, confidenceCalibration: 0.3 });
const rev = (conceptId: string, at: string, rating: 0 | 1 | 2 | 3 = 0): ReviewEvent => ({ id: `r${at}`, conceptId, subjectId: "s", at, method: "active-recall", skill: "memory", rating, confidence: 1, responseSeconds: 5, hintUsed: false, answerQuality: rating / 3, errorTags: [] });

describe("resetConceptProgress", () => {
  it("pone a cero el progreso, conserva el contenido y deja la fecha del reinicio", () => {
    const c = concept(); const r = resetConceptProgress(c, NOW);
    expect(r).toMatchObject({ mastery: 0, memory: 0, understanding: 0, application: 0, repetitions: 0, lapses: 0, intervalDays: 0, confidenceCalibration: 0, dueAt: NOW, progressResetAt: NOW });
    expect(r.lastReviewedAt).toBeUndefined();
    expect(r).toMatchObject({ id: c.id, title: "Mitosis", answer: "x", subjectId: "s", createdAt: c.createdAt });
  });
  it("no muta el original", () => {
    const c = concept(); const copy = JSON.stringify(c); resetConceptProgress(c, NOW);
    expect(JSON.stringify(c)).toBe(copy);
  });
});

describe("activeReviews", () => {
  it("sin reinicios devuelve el mismo array", () => {
    const rs = [rev("a", "2026-11-01T00:00:00.000Z")];
    expect(activeReviews([concept()], rs)).toBe(rs);
  });
  it("excluye solo los intentos anteriores al reinicio del concepto reiniciado", () => {
    const a = { ...concept(), id: "a", progressResetAt: NOW }; const b = { ...concept(), id: "b" };
    const rs = [rev("a", "2026-11-17T00:00:00.000Z"), rev("a", NOW), rev("a", "2026-11-19T00:00:00.000Z"), rev("b", "2026-11-01T00:00:00.000Z")];
    expect(activeReviews([a, b], rs).map(r => `${r.conceptId}:${r.at.slice(0, 10)}`)).toEqual(["a:2026-11-18", "a:2026-11-19", "b:2026-11-01"]);
  });
  it("ignora una fecha de reinicio inválida y los intentos con fecha inválida de un concepto reiniciado", () => {
    expect(activeReviews([{ ...concept(), id: "a", progressResetAt: "no-es-fecha" }], [rev("a", "2026-11-01T00:00:00.000Z")])).toHaveLength(1);
    expect(activeReviews([{ ...concept(), id: "a", progressResetAt: NOW }], [rev("a", "basura")])).toHaveLength(0);
  });
  it("tras reiniciar, los fallos antiguos ya no producen diagnóstico", () => {
    const c = { ...concept(), id: "a" };
    const olds = ["01", "02", "03", "04", "05"].map(d => rev("a", `2026-11-${d}T10:00:00.000Z`, 0));
    expect(diagnoseAll(olds).get("a")?.insufficient).toBe(false);
    const reset = resetConceptProgress(c, NOW);
    const live = activeReviews([reset], olds);
    expect(live).toHaveLength(0);
    expect(diagnoseAll(live).get("a")).toBeUndefined();
  });
});

describe("persistencia del reinicio", () => {
  it("la fecha de reinicio sobrevive a exportar y restaurar la copia JSON", () => {
    const s = initialState(); const c = resetConceptProgress(concept(), NOW);
    const restored = importState(exportState({ ...s, concepts: [c] }));
    expect(restored.concepts[0].progressResetAt).toBe(NOW);
    expect(restored.concepts[0].mastery).toBe(0);
  });
  it("datos antiguos sin el campo siguen cargando y una fecha corrupta se descarta", () => {
    const s = initialState();
    const bad = JSON.parse(exportState({ ...s, concepts: [concept()] })); bad.data.concepts[0].progressResetAt = "xx";
    expect(importState(JSON.stringify(bad)).concepts[0].progressResetAt).toBeUndefined();
  });
  it("un repaso posterior al reinicio vuelve a construir progreso", () => {
    const s = initialState(); const c = resetConceptProgress(concept(), NOW);
    const next = applyReview({ ...s, concepts: [c] }, rev(c.id, "2026-11-19T10:00:00.000Z", 3));
    expect(next.concepts[0].repetitions).toBe(1);
    expect(next.concepts[0].progressResetAt).toBe(NOW);
  });
});

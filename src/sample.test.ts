import { describe, expect, it } from "vitest";
import { buildSample, SAMPLE_SUBJECT_NAME } from "./sample";
import { dueCount, initialState, normalizeState, planSession } from "./engine";

describe("materia de ejemplo", () => {
  it("crea una materia con conceptos completos, pendientes desde el primer momento", () => {
    const { subject, concepts } = buildSample();
    expect(subject.name).toBe(SAMPLE_SUBJECT_NAME);
    expect(concepts.length).toBeGreaterThanOrEqual(5);
    for (const c of concepts) {
      expect(c.subjectId).toBe(subject.id);
      expect(c.prompt.trim().endsWith("?")).toBe(true);
      expect(c.answer.length).toBeGreaterThan(60);
      expect(c.applicationPrompt.length).toBeGreaterThan(20);
      expect(c.applicationAnswer.length).toBeGreaterThan(40);
      expect(c.tags).toContain("ejemplo");
    }
    expect(new Set(concepts.map((c) => c.title)).size).toBe(concepts.length);
    expect(dueCount(concepts)).toBe(concepts.length);
  });

  it("sobrevive a guardarse y cargarse, y entra en el plan de sesión", () => {
    const { subject, concepts } = buildSample();
    const state = normalizeState(JSON.parse(JSON.stringify({ ...initialState(), subjects: [subject], concepts })));
    expect(state.concepts).toHaveLength(concepts.length);
    expect(planSession(state.concepts, [], 25, Date.now(), { subjects: state.subjects, sessionLength: 8 }).length).toBeGreaterThan(0);
  });

  it("cada llamada genera identificadores nuevos", () => {
    const a = buildSample(), b = buildSample();
    expect(a.subject.id).not.toBe(b.subject.id);
    expect(a.concepts[0].id).not.toBe(b.concepts[0].id);
  });
});

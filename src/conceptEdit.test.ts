import { describe, expect, it } from "vitest";
import { createConcept } from "./engine";
import { applyConceptEdit } from "./conceptEdit";

const base = () => ({ ...createConcept({ subjectId: "s1", title: "Mitosis", answer: "Fases", prompt: "¿Fases?" }), mastery: 0.6, repetitions: 4, lapses: 1, intervalDays: 9, lastReviewedAt: "2026-11-01T10:00:00.000Z", source: { fileName: "a.pdf", excerpt: "x", page: 2 } });
const NOW = "2026-11-18T12:00:00.000Z";

describe("applyConceptEdit", () => {
  it("cambia el contenido y conserva todo el progreso y la fuente", () => {
    const c = base(); const r = applyConceptEdit(c, { title: "  Mitosis celular ", answer: "Profase, metafase…" }, NOW);
    if (!r.ok) throw new Error(r.error);
    expect(r.concept).toMatchObject({ title: "Mitosis celular", answer: "Profase, metafase…", mastery: 0.6, repetitions: 4, lapses: 1, intervalDays: 9, lastReviewedAt: c.lastReviewedAt, id: c.id, createdAt: c.createdAt, updatedAt: NOW });
    expect(r.concept.source).toEqual(c.source);
  });
  it("rechaza títulos vacíos, solo espacios o demasiado largos, sin modificar el original", () => {
    const c = base();
    expect(applyConceptEdit(c, { title: "   " }).ok).toBe(false);
    expect(applyConceptEdit(c, { title: "x".repeat(121) }).ok).toBe(false);
    expect(c.title).toBe("Mitosis");
  });
  it("no muta el concepto original", () => {
    const c = base(); const copy = JSON.stringify(c);
    applyConceptEdit(c, { title: "Otro", tags: ["a"] }, NOW);
    expect(JSON.stringify(c)).toBe(copy);
  });
  it("sincroniza la explicación solo si seguía a la respuesta", () => {
    const igual = { ...base(), explanation: "Fases" }; const a = applyConceptEdit(igual, { answer: "Nueva" }, NOW);
    expect(a.ok && a.concept.explanation).toBe("Nueva");
    const propia = { ...base(), explanation: "Explicación importada del PDF" }; const b = applyConceptEdit(propia, { answer: "Nueva" }, NOW);
    expect(b.ok && b.concept.explanation).toBe("Explicación importada del PDF");
  });
  it("limpia etiquetas (espacios, vacías, duplicadas) y valida la importancia", () => {
    const r = applyConceptEdit(base(), { tags: [" a ", "", "a", "b"], importance: 3 }, NOW);
    expect(r.ok && r.concept.tags).toEqual(["a", "b"]);
    expect(r.ok && r.concept.importance).toBe(3);
    const bad = applyConceptEdit(base(), { importance: 9 as never }, NOW);
    expect(bad.ok && bad.concept.importance).toBe(2);
  });
  it("permite vaciar campos opcionales y mover de materia", () => {
    const r = applyConceptEdit({ ...base(), applicationAnswer: "algo" }, { applicationAnswer: "", subjectId: "s2" }, NOW);
    expect(r.ok && r.concept.applicationAnswer).toBe("");
    expect(r.ok && r.concept.subjectId).toBe("s2");
  });
  it("una edición sin cambios solo actualiza updatedAt", () => {
    const c = base(); const r = applyConceptEdit(c, {}, NOW);
    expect(r.ok && { ...r.concept, updatedAt: c.updatedAt }).toEqual(c);
  });
});

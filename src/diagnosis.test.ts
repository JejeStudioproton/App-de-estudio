import { describe, expect, it } from "vitest";
import { diagnoseAll, diagnoseConcept, referenceTiming } from "./diagnosis";
import { ev, withKind } from "./test-helpers";

const kinds = (r: ReturnType<typeof diagnoseConcept>) => r.diagnoses.map(d => d.kind);

describe("diagnóstico de dificultades", () => {
  it("sin intentos: no diagnostica nada y pide un primer intento", () => {
    const r = diagnoseConcept([]);
    expect(r.insufficient).toBe(true);
    expect(r.diagnoses).toHaveLength(0);
    expect(r.check).toBeTruthy();
  });
  it("con menos de 3 intentos devuelve evidencia insuficiente y pide una comprobación, aunque haya fallos", () => {
    const r = diagnoseConcept([ev({ rating: 0 }), ev({ rating: 0 })]);
    expect(r.insufficient).toBe(true);
    expect(r.diagnoses).toHaveLength(0);
    expect(r.message).toContain("insuficiente");
    expect(r.check).toContain("Explica");
  });
  it("detecta fallos de recuerdo de forma provisional con pocos datos y respaldada con 7+", () => {
    const few = diagnoseConcept([ev({ rating: 0 }), ev({ rating: 1 }), ev({ rating: 3 })]);
    expect(kinds(few)).toContain("recall-failure");
    expect(few.diagnoses[0].status).toBe("provisional");
    const many = diagnoseConcept(Array.from({ length: 8 }, (_, i) => ev({ rating: i < 5 ? 0 : 3 })));
    expect(many.diagnoses.find(d => d.kind === "recall-failure")!.status).toBe("supported");
  });
  it("no etiqueta como idea equivocada un único fallo ni fallos sin señales", () => {
    const r = diagnoseConcept([ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 0, skill: "understanding", confidence: 0.9 })]);
    expect(kinds(r)).not.toContain("misconception");
  });
  it("detecta posible idea equivocada con 2+ fallos marcados por el estudiante", () => {
    const r = diagnoseConcept([
      ev({ rating: 0, skill: "understanding", ...withKind("misconception") }),
      ev({ rating: 1, skill: "understanding", ...withKind("misconception") }),
      ev({ rating: 3, skill: "memory" })
    ]);
    expect(kinds(r)).toContain("misconception");
    expect(r.diagnoses[0].help).toContain("tus palabras");
  });
  it("fallos con mucha confianza al comprender cuentan como señal, pero solo provisional", () => {
    const r = diagnoseConcept([
      ev({ rating: 0, skill: "understanding", confidence: 1 }),
      ev({ rating: 0, skill: "application", confidence: 1 }),
      ev({ rating: 3, skill: "memory", confidence: 0.6 })
    ]);
    const d = r.diagnoses.find(x => x.kind === "misconception")!;
    expect(d.status).toBe("provisional");
  });
  it("distingue dificultad para aplicar cuando recuerda y comprende bien pero aplica mal", () => {
    const r = diagnoseConcept([
      ev({ rating: 3, skill: "memory" }), ev({ rating: 3, skill: "memory" }), ev({ rating: 3, skill: "understanding" }),
      ev({ rating: 0, skill: "application", confidence: 0.5 }), ev({ rating: 1, skill: "application", confidence: 0.5 })
    ]);
    expect(kinds(r)).toContain("application-difficulty");
  });
  it("no diagnostica dificultad de aplicación si solo hay un intento de aplicación", () => {
    const r = diagnoseConcept([ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 3, skill: "understanding" }), ev({ rating: 0, skill: "application" })]);
    expect(kinds(r)).not.toContain("application-difficulty");
  });
  it("detecta exceso de confianza respecto al rendimiento real", () => {
    const r = diagnoseConcept([ev({ rating: 1, confidence: 1 }), ev({ rating: 0, confidence: 1 }), ev({ rating: 2, confidence: 1 })]);
    expect(kinds(r)).toContain("overconfidence");
  });
  it("detecta falta de confianza pese a aciertos", () => {
    const r = diagnoseConcept([ev({ rating: 3, confidence: 0.1 }), ev({ rating: 3, confidence: 0 }), ev({ rating: 3, confidence: 0.2 })]);
    expect(kinds(r)).toContain("underconfidence");
    expect(kinds(r)).not.toContain("overconfidence");
  });
  it("una confianza bien calibrada no genera diagnóstico de confianza", () => {
    const r = diagnoseConcept([ev({ rating: 3, confidence: 0.9 }), ev({ rating: 0, confidence: 0.1 }), ev({ rating: 2, confidence: 0.6 })]);
    expect(kinds(r)).not.toContain("overconfidence");
    expect(kinds(r)).not.toContain("underconfidence");
  });
  it("recuperación lenta solo con tiempos medidos y una referencia propia suficiente", () => {
    const slow = [ev({ rating: 3, responseSeconds: 50 }), ev({ rating: 3, responseSeconds: 55 }), ev({ rating: 2, responseSeconds: 60 })];
    expect(kinds(diagnoseConcept(slow))).not.toContain("slow-retrieval"); // sin referencia
    expect(kinds(diagnoseConcept(slow, { referenceSeconds: 15 }))).toContain("slow-retrieval");
    expect(diagnoseConcept(slow, { referenceSeconds: 15 }).diagnoses[0].status).toBe("provisional");
    expect(kinds(diagnoseConcept(slow, { referenceSeconds: 45 }))).not.toContain("slow-retrieval");
  });
  it("los intentos sin tiempo medido (0 s) no se consideran rápidos ni lentos", () => {
    const untimed = [ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 3 })];
    expect(kinds(diagnoseConcept(untimed, { referenceSeconds: 10 }))).not.toContain("slow-retrieval");
  });
  it("referenceTiming exige suficientes aciertos con tiempo", () => {
    expect(referenceTiming(Array.from({ length: 7 }, () => ev({ rating: 3, responseSeconds: 10 }))).referenceSeconds).toBeUndefined();
    expect(referenceTiming(Array.from({ length: 8 }, () => ev({ rating: 3, responseSeconds: 10 }))).referenceSeconds).toBe(10);
  });
  it("un fallo marcado como despiste es solo una hipótesis provisional", () => {
    const r = diagnoseConcept([ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 0, ...withKind("careless") })]);
    const d = r.diagnoses.find(x => x.kind === "possible-careless")!;
    expect(d.status).toBe("provisional");
  });
  it("un fallo aislado tras aciertos sin clasificar se trata como posible descuido, no como certeza", () => {
    const rows = [ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 2 }), ev({ rating: 0 }), ev({ rating: 3 })];
    const d = diagnoseConcept(rows).diagnoses.find(x => x.kind === "possible-careless")!;
    expect(d.status).toBe("provisional");
    expect(d.message).toContain("podría");
  });
  it("fallos repetidos no se consideran descuido", () => {
    const rows = [ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 3 }), ev({ rating: 0 }), ev({ rating: 0 })];
    expect(kinds(diagnoseConcept(rows))).not.toContain("possible-careless");
  });
  it("resultados contradictorios (aciertos y fallos alternos) no inventan una causa", () => {
    const rows = [ev({ rating: 3 }), ev({ rating: 0 }), ev({ rating: 3 }), ev({ rating: 0 }), ev({ rating: 3, confidence: 0.5 }), ev({ rating: 0, confidence: 0.5 })];
    const r = diagnoseConcept(rows);
    expect(kinds(r)).not.toContain("misconception");
    expect(kinds(r)).not.toContain("possible-careless");
  });
  it("ordena los intentos por fecha aunque lleguen desordenados", () => {
    const rows = [ev({ rating: 0, day: "2026-03-05" }), ev({ rating: 3, day: "2026-03-01" }), ev({ rating: 3, day: "2026-03-02" }), ev({ rating: 3, day: "2026-03-03" }), ev({ rating: 3, day: "2026-03-04" })];
    expect(() => diagnoseConcept(rows)).not.toThrow();
  });
  it("ignora eventos con valores corruptos sin romperse", () => {
    const bad: any = { ...ev({ rating: 2 }), rating: NaN };
    expect(() => diagnoseConcept([bad, ev({ rating: 3 })])).not.toThrow();
  });
  it("diagnoseAll agrupa por concepto", () => {
    const map = diagnoseAll([ev({ rating: 3, conceptId: "a" }), ev({ rating: 3, conceptId: "b" })]);
    expect([...map.keys()].sort()).toEqual(["a", "b"]);
  });
});

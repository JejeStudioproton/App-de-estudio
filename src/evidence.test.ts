import { describe, expect, it } from "vitest";
import { compareMethods, evidenceLevel } from "./evidence";
import { ev } from "./test-helpers";
import type { Method, Rating } from "./domain";

describe("niveles de evidencia", () => {
  it.each([
    [0, "insufficient"], [2, "insufficient"], [3, "initial"], [6, "initial"],
    [7, "moderate"], [14, "moderate"], [15, "stronger"], [200, "stronger"]
  ])("%i observaciones -> %s", (n, level) => { expect(evidenceLevel(n).level).toBe(level); });
  it("trata entradas inválidas como evidencia insuficiente", () => {
    expect(evidenceLevel(NaN).level).toBe("insufficient");
    expect(evidenceLevel(-5).level).toBe("insufficient");
    expect(evidenceLevel(Infinity).level).toBe("insufficient");
  });
  it("no presenta los umbrales como garantía", () => {
    expect(evidenceLevel(20).description.toLowerCase()).toContain("no es una garantía");
  });
});

const many = (method: Method, n: number, rating: Rating) => Array.from({ length: n }, () => ev({ method, skill: "memory", rating }));

describe("comparación de métodos", () => {
  const memory = (c: ReturnType<typeof compareMethods>) => c.find(x => x.skill === "memory")!;
  it("sin datos o con un solo método no compara", () => {
    expect(memory(compareMethods([])).comparable).toBe(false);
    expect(memory(compareMethods(many("active-recall", 10, 3))).comparable).toBe(false);
  });
  it("con menos de 3 observaciones por método no compara", () => {
    const c = memory(compareMethods([...many("active-recall", 2, 3), ...many("multiple-choice", 2, 0)]));
    expect(c.comparable).toBe(false);
    expect(c.leader).toBeUndefined();
  });
  it("con pocas observaciones habla de sospecha y no nombra un líder", () => {
    const c = memory(compareMethods([...many("active-recall", 5, 3), ...many("multiple-choice", 4, 0)]));
    expect(c.comparable).toBe(true);
    expect(c.leader).toBeUndefined();
    expect(c.statement).toContain("Sospecha inicial");
    expect(c.statement.toLowerCase()).not.toContain("superior");
    expect(c.statement.toLowerCase()).not.toContain("mejor método");
  });
  it("una diferencia pequeña no se presenta como ventaja aunque haya muchos datos", () => {
    const c = memory(compareMethods([...many("active-recall", 20, 2), ...many("multiple-choice", 20, 2)]));
    expect(c.leader).toBeUndefined();
    expect(c.statement).toContain("Sin diferencia clara");
  });
  it("con evidencia moderada y diferencia clara señala un patrón moderado", () => {
    const c = memory(compareMethods([...many("active-recall", 8, 3), ...many("multiple-choice", 8, 1)]));
    expect(c.leader).toBe("active-recall");
    expect(c.statement).toContain("Patrón moderado");
  });
  it("con 15 o más observaciones habla de patrón más sólido, pero con cautela", () => {
    const c = memory(compareMethods([...many("active-recall", 15, 3), ...many("multiple-choice", 15, 1)]));
    expect(c.statement).toContain("Patrón más sólido");
    expect(c.statement).toContain("no prueba");
  });
  it("ignora calidades no numéricas sin romperse", () => {
    const bad = ev({ rating: 2 }); (bad as any).answerQuality = NaN;
    expect(() => compareMethods([bad])).not.toThrow();
  });
});

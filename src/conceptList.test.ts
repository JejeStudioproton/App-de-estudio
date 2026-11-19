import { describe, expect, it } from "vitest";
import { createConcept } from "./engine";
import { filterAndSortConcepts, normalizeText } from "./conceptList";

const mk = (title: string, extra: Record<string, unknown> = {}) => ({ ...createConcept({ subjectId: "s", title, answer: "", prompt: "" } as never), ...extra }) as ReturnType<typeof createConcept>;

describe("filterAndSortConcepts", () => {
  const a = mk("Ósmosis", { mastery: 0.2, lastReviewedAt: "2026-11-10T10:00:00.000Z" });
  const b = mk("Mitosis", { mastery: 0.8, lastReviewedAt: "2026-11-18T10:00:00.000Z", tags: ["celula"] });
  const c = mk("ATP", { mastery: 0.5 });
  const all = [a, b, c];

  it("ignora tildes y mayúsculas", () => {
    expect(normalizeText("  ÓSMOSIS ")).toBe("osmosis");
    expect(filterAndSortConcepts(all, "osmosis").map(x => x.title)).toEqual(["Ósmosis"]);
  });
  it("exige todas las palabras y busca también en etiquetas", () => {
    expect(filterAndSortConcepts(all, "mitosis celula").map(x => x.title)).toEqual(["Mitosis"]);
    expect(filterAndSortConcepts(all, "mitosis atp")).toEqual([]);
  });
  it("sin consulta devuelve todo y no muta la entrada", () => {
    const copy = [...all];
    const out = filterAndSortConcepts(all, "  ", "title");
    expect(out).toHaveLength(3);
    expect(all).toEqual(copy);
  });
  it("ordena por dominio, título y repaso reciente (sin repasar al final)", () => {
    expect(filterAndSortConcepts(all, "", "mastery-asc").map(x => x.title)).toEqual(["Ósmosis", "ATP", "Mitosis"]);
    expect(filterAndSortConcepts(all, "", "title").map(x => x.title)).toEqual(["ATP", "Mitosis", "Ósmosis"]);
    expect(filterAndSortConcepts(all, "", "recent").map(x => x.title)).toEqual(["Mitosis", "Ósmosis", "ATP"]);
  });
});

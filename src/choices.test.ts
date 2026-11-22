import { describe, expect, it } from "vitest";
import { MAX_OPTION_CHARS, authoredDistractors, buildChoices, canBuildChoices, choicesFromForm, clipOption, wrongLinesOf } from "./choices";
import { concept } from "./test-helpers";

/** Generador determinista para que el orden de las opciones sea reproducible. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const mk = (id: string, answer: string, extra = {}) => concept({ id, title: `T-${id}`, answer, ...extra });

describe("opciones de tipo test", () => {
  const pool = [mk("a", "Uno"), mk("b", "Dos"), mk("c", "Tres"), mk("d", "Cuatro"), mk("e", "Cinco")];

  it("incluye la respuesta correcta una sola vez y tres incorrectas distintas", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const set = buildChoices(pool[0], pool, seeded(seed))!;
      expect(set.options).toHaveLength(4);
      expect(new Set(set.options).size).toBe(4);
      expect(set.options[set.correct]).toBe("Uno");
      expect(set.options.filter((o) => o === "Uno")).toHaveLength(1);
    }
  });
  it("la correcta no ocupa siempre el mismo lugar", () => {
    const places = new Set(Array.from({ length: 40 }, (_, i) => buildChoices(pool[0], pool, seeded(i + 1))!.correct));
    expect(places.size).toBeGreaterThan(1);
  });
  it("no se ofrece sin respuesta o con menos de dos incorrectas disponibles", () => {
    expect(canBuildChoices(mk("x", ""), pool)).toBe(false);
    expect(buildChoices(mk("x", ""), pool)).toBeNull();
    expect(canBuildChoices(pool[0], pool.slice(0, 2))).toBe(false);
    expect(canBuildChoices(pool[0], pool.slice(0, 3))).toBe(true);
    expect(buildChoices(pool[0], pool.slice(0, 3), seeded())!.options).toHaveLength(3);
  });
  it("no usa respuestas de otra materia, vacías ni iguales a la correcta (aunque cambien tildes o mayúsculas)", () => {
    const mixed = [
      mk("a", "La célula"),
      mk("b", "la celula."),
      mk("c", ""),
      mk("d", "Otra materia", { subjectId: "s2" }),
      mk("e", "El tejido"),
      mk("f", "El órgano"),
      mk("g", "EL TEJIDO"),
    ];
    const set = buildChoices(mixed[0], mixed, seeded())!;
    expect([...set.options].sort()).toEqual(["El tejido", "El órgano", "La célula"].sort());
  });
  it("prefiere respuestas de conceptos con las mismas etiquetas", () => {
    const tagged = [
      mk("a", "Correcta", { tags: ["tema 1"] }),
      mk("b", "Mismo tema 1", { tags: ["Tema 1"] }),
      mk("c", "Mismo tema 2", { tags: ["tema 1"] }),
      mk("d", "Mismo tema 3", { tags: ["tema 1"] }),
      ...Array.from({ length: 12 }, (_, i) => mk(`z${i}`, `Otro tema ${i}`, { tags: ["tema 9"] })),
    ];
    // Con tres del mismo tema hay suficientes: las incorrectas salen solo de ahí.
    for (let seed = 1; seed <= 20; seed++) {
      const set = buildChoices(tagged[0], tagged, seeded(seed))!;
      expect(set.options.filter((o) => o.startsWith("Mismo tema"))).toHaveLength(3);
    }
    // Con solo dos del mismo tema no bastan y se completa con las más parecidas de la materia.
    const fewer = tagged.filter((c) => c.id !== "d");
    expect(buildChoices(fewer[0], fewer, seeded())!.options).toHaveLength(4);
  });
  it("usa primero las incorrectas escritas por el estudiante y completa con las de la materia", () => {
    const own = mk("a", "Uno", { choices: ["Uno", "Once", "Ciento uno"], correctChoice: 0 });
    expect(authoredDistractors(own)).toEqual(["Once", "Ciento uno"]);
    const set = buildChoices(own, [own, ...pool.slice(1)], seeded())!;
    expect(set.options).toHaveLength(4);
    expect(set.options).toContain("Once");
    expect(set.options).toContain("Ciento uno");
    // Con las suyas basta, aunque no haya más conceptos en la materia.
    expect(buildChoices(own, [own], seeded())!.options).toHaveLength(3);
  });
  it("si la respuesta se editó después, la opción correcta es la respuesta actual", () => {
    const edited = mk("a", "Respuesta nueva", { choices: ["Respuesta vieja", "Mal 1", "Mal 2"], correctChoice: 0 });
    const set = buildChoices(edited, [edited], seeded())!;
    expect(set.options[set.correct]).toBe("Respuesta nueva");
    expect(set.options).not.toContain("Respuesta vieja");
  });
  it("tolera opciones guardadas con datos inservibles", () => {
    const broken = mk("a", "Uno", { choices: ["Uno", 5, null, "  ", "Dos"] as unknown as string[], correctChoice: 0 });
    expect(authoredDistractors(broken)).toEqual(["Dos"]);
    expect(authoredDistractors(mk("b", "Uno", { choices: "no" as unknown as string[] }))).toEqual([]);
  });
  it("recorta todas las opciones largas por igual", () => {
    const long = "palabra ".repeat(80).trim();
    expect(clipOption(long).length).toBeLessThanOrEqual(MAX_OPTION_CHARS + 1);
    expect(clipOption(long).endsWith("…")).toBe(true);
    expect(clipOption("  corta \n respuesta ")).toBe("corta respuesta");
    const set = buildChoices(mk("a", long), [mk("a", long), mk("b", "x ".repeat(300)), mk("c", "Corta")], seeded())!;
    expect(set.options.every((o) => o.length <= MAX_OPTION_CHARS + 1)).toBe(true);
  });
});

describe("opciones escritas en el formulario", () => {
  it("guarda la correcta en primer lugar y las incorrectas sin repetir ni vacías", () => {
    expect(choicesFromForm(" París ", "Lyon\n\n  Marsella \nlyon\nParís")).toEqual({ choices: ["París", "Lyon", "Marsella"], correctChoice: 0 });
  });
  it("sin incorrectas o sin respuesta no guarda opciones", () => {
    expect(choicesFromForm("París", " \n ")).toEqual({ choices: undefined, correctChoice: undefined });
    expect(choicesFromForm("", "Lyon")).toEqual({ choices: undefined, correctChoice: undefined });
  });
  it("vuelve a mostrar en el formulario solo las incorrectas", () => {
    expect(wrongLinesOf(mk("a", "París", { choices: ["París", "Lyon", "Marsella"], correctChoice: 0 }))).toBe("Lyon\nMarsella");
    expect(wrongLinesOf(mk("a", "París"))).toBe("");
    expect(wrongLinesOf(undefined)).toBe("");
  });
});

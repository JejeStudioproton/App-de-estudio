import { describe, expect, it } from "vitest";
import { ImportError, MAX_IMPORT_BYTES, importDocument, splitIntoDraftConcepts, validateImportFile } from "./importer";

const file = (name: string, content: string | Uint8Array = "contenido de prueba") => new File([content as BlobPart], name);

describe("validateImportFile", () => {
  it("acepta los formatos soportados, sin distinguir mayúsculas", () => {
    for (const n of ["a.pdf", "a.DOCX", "a.txt", "a.md", "a.markdown", "a.csv"]) expect(() => validateImportFile({ name: n, size: 10 })).not.toThrow();
  });
  it("rechaza formatos desconocidos y archivos sin extensión", () => {
    expect(() => validateImportFile({ name: "foto.png", size: 10 })).toThrow(ImportError);
    expect(() => validateImportFile({ name: "README", size: 10 })).toThrow(/no compatible/);
  });
  it("da un mensaje específico para .doc antiguo", () => {
    expect(() => validateImportFile({ name: "apuntes.doc", size: 10 })).toThrow(/\.docx/);
  });
  it("rechaza archivos vacíos y tamaños no válidos", () => {
    expect(() => validateImportFile({ name: "a.txt", size: 0 })).toThrow(/vacío/);
    expect(() => validateImportFile({ name: "a.txt", size: NaN })).toThrow(/vacío/);
    expect(() => validateImportFile({ name: "a.txt", size: -5 })).toThrow(/vacío/);
  });
  it("rechaza archivos por encima del límite y acepta el justo en el límite", () => {
    expect(() => validateImportFile({ name: "a.pdf", size: MAX_IMPORT_BYTES + 1 })).toThrow(/máximo/);
    expect(() => validateImportFile({ name: "a.pdf", size: MAX_IMPORT_BYTES })).not.toThrow();
  });
});

describe("importDocument (texto plano)", () => {
  it("lee TXT y Markdown tal cual, sin aviso", async () => {
    const r = await importDocument(file("n.md", "# Título\nLa mitosis es la división del núcleo celular."));
    expect(r.text).toContain("mitosis");
    expect(r.warning).toBeUndefined();
  });
  it("avisa de texto en blanco", async () => {
    const r = await importDocument(file("n.txt", "   \n  "));
    expect(r.warning).toMatch(/no contiene texto/);
  });
  it("avisa cuando el archivo no es UTF-8 (caracteres de sustitución)", async () => {
    const latin1 = new Uint8Array([0x4c, 0x61, 0x20, 0x61, 0x63, 0x63, 0x69, 0xf3, 0x6e]); // "La acción" en Latin-1
    const r = await importDocument(file("n.txt", latin1));
    expect(r.warning).toMatch(/UTF-8/);
  });
  it("un DOCX dañado produce un ImportError claro, no una excepción críptica", async () => {
    await expect(importDocument(file("roto.docx", "esto no es un zip"))).rejects.toThrow(/dañado/);
  });
  it("un PDF dañado produce un ImportError claro", async () => {
    await expect(importDocument(file("roto.pdf", "%PDF-1.4 basura"))).rejects.toThrow(ImportError);
  });
});

describe("splitIntoDraftConcepts", () => {
  const texto = "La mitosis es el proceso de división celular que produce dos células hijas idénticas. El ribosoma sintetiza proteínas a partir del ARN mensajero en el citoplasma.";
  it("devuelve vacío con texto vacío o solo espacios", () => {
    expect(splitIntoDraftConcepts("")).toEqual([]);
    expect(splitIntoDraftConcepts("  \n \t ")).toEqual([]);
  });
  it("propone un borrador por frase suficientemente larga, sin página si no hay marcadores", () => {
    const d = splitIntoDraftConcepts(texto);
    expect(d).toHaveLength(2);
    expect(d[0].title).toMatch(/^La mitosis es el proceso/);
    expect(d.every(x => x.page === undefined)).toBe(true);
  });
  it("asigna la página de origen a partir de los marcadores del PDF", () => {
    const d = splitIntoDraftConcepts(`\n[ Página 1 ]\n${texto.split(". ")[0]}.\n\n[ Página 2 ]\n${texto.split(". ")[1]}`);
    expect(d.map(x => x.page)).toEqual([1, 2]);
    expect(d[1].explanation).not.toMatch(/Página/);
  });
  it("descarta fragmentos demasiado cortos y respeta el máximo", () => {
    expect(splitIntoDraftConcepts("Hola. Sí. Vale.")).toEqual([]);
    const largo = Array.from({ length: 30 }, (_, i) => `Este es el concepto número ${i} con texto suficiente para ser propuesto.`).join(" ");
    expect(splitIntoDraftConcepts(largo, 5)).toHaveLength(5);
  });
  it("usa líneas como alternativa cuando no hay frases con puntuación", () => {
    const d = splitIntoDraftConcepts("Teorema de Pitágoras en triángulos\nLey de Ohm en circuitos eléctricos");
    expect(d.map(x => x.title)).toEqual(["Teorema de Pitágoras en triángulos", "Ley de Ohm en circuitos eléctricos"]);
  });
  it("trata los párrafos como límites: un encabezado corto no se pega a la primera frase", () => {
    const d = splitIntoDraftConcepts("Biologia\n\nEl ATP es la moneda energética de la célula y se produce en las mitocondrias.");
    expect(d).toHaveLength(1);
    expect(d[0].title).toMatch(/^El ATP es la moneda/);
  });
  it("limpia marcas de Markdown en los títulos", () => {
    const d = splitIntoDraftConcepts("## Genética mendeliana y herencia de caracteres\n\n- La herencia mendeliana describe cómo se transmiten los caracteres.");
    expect(d.map(x => x.title)).toEqual(["Genética mendeliana y herencia de caracteres", "La herencia mendeliana describe cómo se transmiten los caracteres"]);
  });
  it("mantiene unido un párrafo con saltos de línea simples (texto con corte duro de línea)", () => {
    const d = splitIntoDraftConcepts("La mitosis es el proceso de división\ncelular que produce dos células hijas.");
    expect(d).toHaveLength(1);
  });
});

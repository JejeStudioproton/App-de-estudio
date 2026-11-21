import { describe, expect, it } from "vitest";
import { ImportError, MAX_DRAFTS, MAX_IMPORT_BYTES, PASTED_SOURCE_NAME, draftToConceptInput, draftsFromCsv, importDocument, pageAt, parseCsv, proposeDrafts, splitIntoDraftConcepts, validateImportFile } from "./importer";

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

describe("CSV", () => {
  it("lee comillas, comas dentro de comillas, comillas escapadas y saltos de línea en una celda", () => {
    expect(parseCsv('a,b\n"uno, dos","dice ""hola"""\n"línea 1\nlínea 2",fin\n')).toEqual([["a", "b"], ["uno, dos", 'dice "hola"'], ["línea 1\nlínea 2", "fin"]]);
  });
  it("detecta punto y coma y tabulador como separador, e ignora BOM y filas vacías", () => {
    expect(parseCsv("\uFEFFconcepto;respuesta\r\n\r\nMitosis;División, del núcleo\r\n")).toEqual([["concepto", "respuesta"], ["Mitosis", "División, del núcleo"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("con cabecera reconocible crea un borrador por fila con pregunta, respuesta, aplicación y etiquetas", () => {
    const d = draftsFromCsv("Concepto;Pregunta;Respuesta;Aplicación;Respuesta de aplicación;Etiquetas\nMitosis;¿Qué es la mitosis?;División del núcleo;Dibuja sus fases;Profase, metafase…;célula, unidad 2\nMeiosis;;Reduce los cromosomas;;;");
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ title: "Mitosis", prompt: "¿Qué es la mitosis?", explanation: "División del núcleo", applicationPrompt: "Dibuja sus fases", applicationAnswer: "Profase, metafase…", tags: ["célula", "unidad 2"], origin: "csv" });
    expect(d[1].prompt).toBeUndefined();
    expect(d[1].tags).toBeUndefined();
    expect(d[0].excerpt).toContain("División del núcleo");
  });
  it("las cabeceras se reconocen sin tildes, en inglés y en cualquier orden", () => {
    const d = draftsFromCsv("answer,TITLE\nDivisión del núcleo,Mitosis");
    expect(d).toEqual([expect.objectContaining({ title: "Mitosis", explanation: "División del núcleo" })]);
  });
  it("sin cabecera se lee por posición: 2 columnas = concepto y respuesta; 3 = concepto, pregunta y respuesta", () => {
    expect(draftsFromCsv("Mitosis,División del núcleo\nRibosoma,Sintetiza proteínas").map(x => [x.title, x.explanation])).toEqual([["Mitosis", "División del núcleo"], ["Ribosoma", "Sintetiza proteínas"]]);
    expect(draftsFromCsv("Mitosis,¿Qué es?,División del núcleo")[0]).toMatchObject({ title: "Mitosis", prompt: "¿Qué es?", explanation: "División del núcleo" });
  });
  it("tarjetas «pregunta, respuesta»: la pregunta se conserva y da nombre al concepto", () => {
    const d = draftsFromCsv("¿Qué es la mitosis?,División del núcleo");
    expect(d[0]).toMatchObject({ title: "Qué es la mitosis", prompt: "¿Qué es la mitosis?", explanation: "División del núcleo" });
    const conCabecera = draftsFromCsv("pregunta,respuesta\n¿Qué es un ribosoma?,Sintetiza proteínas");
    expect(conCabecera[0]).toMatchObject({ title: "Qué es un ribosoma", prompt: "¿Qué es un ribosoma?" });
  });
  it("omite filas sin nombre, respeta el máximo y trata una sola columna como texto", () => {
    expect(draftsFromCsv("concepto,respuesta\n,sin nombre\nMitosis,ok")).toHaveLength(1);
    expect(draftsFromCsv(Array.from({ length: 30 }, (_, i) => `C${i},R${i}`).join("\n"), 5)).toHaveLength(5);
    expect(draftsFromCsv("")).toEqual([]);
    const una = draftsFromCsv("Teorema de Pitágoras en triángulos\nLey de Ohm en circuitos eléctricos");
    expect(una.map(x => x.title)).toEqual(["Teorema de Pitágoras en triángulos", "Ley de Ohm en circuitos eléctricos"]);
  });
  it("importDocument marca los CSV para que se propongan por filas", async () => {
    expect((await importDocument(file("t.csv", "concepto,respuesta\nMitosis,División"))).kind).toBe("csv");
    expect((await importDocument(file("t.txt", "texto"))).kind).toBe("text");
  });
});

describe("proposeDrafts y guardado", () => {
  it("propone por frases o por filas según el tipo, e indica cuándo recorta", () => {
    expect(proposeDrafts("concepto,respuesta\nMitosis,División", "csv").drafts[0].title).toBe("Mitosis");
    const largo = Array.from({ length: MAX_DRAFTS + 5 }, (_, i) => `Este es el concepto número ${i} con texto suficiente para ser propuesto.`).join(" ");
    const r = proposeDrafts(largo);
    expect(r.drafts).toHaveLength(MAX_DRAFTS);
    expect(r.truncated).toBe(true);
    expect(proposeDrafts("La mitosis es el proceso de división celular que produce dos células.").truncated).toBe(false);
  });
  it("divide por frases igual que antes, sin depender de «lookbehind»", () => {
    const d = splitIntoDraftConcepts("La célula es la unidad básica de la vida en la Tierra. ¿Cómo se divide una célula eucariota normalmente? 3 fases componen la interfase del ciclo celular.");
    expect(d.map(x => x.explanation)).toEqual(["La célula es la unidad básica de la vida en la Tierra.", "¿Cómo se divide una célula eucariota normalmente?", "3 fases componen la interfase del ciclo celular."]);
  });
  it("pageAt devuelve la página del marcador anterior a la posición", () => {
    const t = "inicio\n[ Página 1 ]\nuno\n[ Página 2 ]\ndos";
    expect(pageAt(t, 0)).toBeUndefined();
    expect(pageAt(t, t.indexOf("uno"))).toBe(1);
    expect(pageAt(t, t.indexOf("dos"))).toBe(2);
  });
  it("al guardar conserva archivo, página y fragmento originales aunque el borrador se haya editado", () => {
    const input = draftToConceptInput({ title: "  Mitosis corregida ", explanation: " Texto corregido ", excerpt: "fragmento original", page: 3 }, "sub_1", "apuntes.pdf");
    expect(input).toMatchObject({ subjectId: "sub_1", title: "Mitosis corregida", answer: "Texto corregido", explanation: "Texto corregido", prompt: "Explica con tus palabras: Mitosis corregida", tags: ["importado"] });
    expect(input.source).toEqual({ fileName: "apuntes.pdf", excerpt: "fragmento original", page: 3 });
    expect("applicationPrompt" in input).toBe(false);
  });
  it("usa la pregunta y la aplicación del borrador, etiqueta las propuestas de IA y nombra el texto pegado", () => {
    const input = draftToConceptInput({ title: "Mitosis", explanation: "x", excerpt: "x", prompt: "¿Qué es?", applicationPrompt: "Aplica", applicationAnswer: "Así", tags: ["célula", "importado", " "], origin: "ai" }, "s", "  ");
    expect(input).toMatchObject({ prompt: "¿Qué es?", applicationPrompt: "Aplica", applicationAnswer: "Así", tags: ["importado", "ia", "célula"] });
    expect(input.source.fileName).toBe(PASTED_SOURCE_NAME);
    expect(input.source).not.toHaveProperty("page");
  });
});

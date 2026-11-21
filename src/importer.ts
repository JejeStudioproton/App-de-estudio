/** `kind` indica cómo proponer borradores: texto corrido (por frases) o tabla CSV (una fila por concepto). */
export type ImportKind = "text" | "csv";
export type ImportedDocument = { fileName:string; text:string; pages?:number; warning?:string; kind:ImportKind };
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;
export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt", "md", "markdown", "csv"] as const;

/** Error con un mensaje ya redactado para el estudiante. */
export class ImportError extends Error {}

const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", ",");

/** Valida nombre, formato y tamaño antes de leer el archivo. Lanza ImportError con un mensaje comprensible. */
export function validateImportFile(file: { name: string; size: number }): void {
  const ext = extensionOf(file.name);
  if (ext === "doc") throw new ImportError("Los archivos .doc antiguos no son compatibles. Ábrelo en Word o Pages y guárdalo como .docx.");
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) throw new ImportError("Formato no compatible. Usa PDF con texto seleccionable, DOCX, TXT, Markdown o CSV.");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new ImportError("El archivo está vacío.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError(`El archivo pesa ${megabytes(file.size)} MB y el máximo es ${megabytes(MAX_IMPORT_BYTES)} MB. Divídelo en partes más pequeñas.`);
}

/** Lectura con FileReader para navegadores (o entornos de prueba) sin `Blob.text()` / `Blob.arrayBuffer()`. */
function readWith<T>(file: Blob, method: "readAsText" | "readAsArrayBuffer"): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T);
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader[method](file);
  });
}
const readText = (file: File) => (typeof file.text === "function" ? file.text() : readWith<string>(file, "readAsText"));
const readBuffer = (file: File) => (typeof file.arrayBuffer === "function" ? file.arrayBuffer() : readWith<ArrayBuffer>(file, "readAsArrayBuffer"));

export async function importDocument(file: File): Promise<ImportedDocument> {
  validateImportFile(file);
  const ext = extensionOf(file.name);
  if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "csv") {
    const text = await readText(file);
    const warnings: string[] = [];
    if (text.includes("\uFFFD")) warnings.push("Se detectaron caracteres no válidos: el archivo probablemente no está en UTF-8. Guárdalo como UTF-8 para conservar los acentos.");
    if (!text.trim()) warnings.push("El archivo no contiene texto.");
    return { fileName: file.name, text, warning: warnings.join(" ") || undefined, kind: ext === "csv" ? "csv" : "text" };
  }
  if (ext === "docx") {
    let result: { value: string; messages: unknown[] };
    try {
      const mammoth = await import("mammoth");
      result = await mammoth.extractRawText({ arrayBuffer: await readBuffer(file) });
    } catch {
      throw new ImportError("No se pudo leer el DOCX: el archivo parece dañado o no es un documento de Word válido.");
    }
    const warnings: string[] = [];
    if (result.messages.length) warnings.push("Se omitió parte del formato del documento (tablas, imágenes o estilos).");
    if (!result.value.trim()) warnings.push("El documento no contiene texto extraíble.");
    return { fileName: file.name, text: result.value, warning: warnings.join(" ") || undefined, kind: "text" };
  }
  // PDF
  let pdf: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> };
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdf = (await pdfjs.getDocument({ data: await readBuffer(file) }).promise) as unknown as typeof pdf;
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "PasswordException") throw new ImportError("El PDF está protegido con contraseña. Quita la protección y vuelve a importarlo.");
    throw new ImportError("No se pudo leer el PDF: el archivo parece dañado o no es un PDF válido.");
  }
  const limit = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pages: string[] = [];
  try {
    for (let i = 1; i <= limit; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      const text = content.items.map(item => (item && typeof item === "object" && "str" in item ? String((item as { str: unknown }).str) : "")).join(" ");
      pages.push(`\n[ Página ${i} ]\n${text}`);
    }
  } catch {
    throw new ImportError("No se pudo extraer el texto del PDF: alguna página está dañada.");
  }
  const text = pages.join("\n");
  const warnings: string[] = [];
  if (text.replace(/\[ Página \d+ \]/g, "").trim().length < 50) warnings.push("Parece un PDF escaneado o sin texto seleccionable. Este MVP no incluye OCR.");
  if (pdf.numPages > MAX_PDF_PAGES) warnings.push(`Solo se leyeron las primeras ${MAX_PDF_PAGES} de ${pdf.numPages} páginas.`);
  return { fileName: file.name, text, pages: pdf.numPages, warning: warnings.join(" ") || undefined, kind: "text" };
}

/**
 * Borrador de concepto propuesto a partir de una fuente. `explanation` es la respuesta de referencia editable;
 * `excerpt` es el fragmento original y no cambia aunque el estudiante edite el borrador.
 */
export type DraftConcept = {
  title: string; explanation: string; excerpt: string; page?: number;
  /** Pregunta de recuerdo. Si falta, al guardar se usa «Explica con tus palabras: …». */
  prompt?: string;
  applicationPrompt?: string; applicationAnswer?: string; tags?: string[];
  /** De dónde sale la propuesta. Las de IA se rotulan para que se revisen con más cuidado. */
  origin?: "text" | "csv" | "ai";
  /** Propuesta de IA cuya cita no aparece literalmente en el texto fuente. */
  unverified?: boolean;
};
const PAGE_MARK = /\[ Página (\d+) \]/g;

/** Divide el texto en segmentos por marcador de página. Sin marcadores devuelve un único segmento sin página. */
function segmentByPage(text: string): { page?: number; text: string }[] {
  const marks = [...text.matchAll(PAGE_MARK)];
  if (!marks.length) return [{ text }];
  const out: { page?: number; text: string }[] = [];
  const first = text.slice(0, marks[0].index).trim();
  if (first) out.push({ text: first });
  marks.forEach((m, i) => out.push({ page: Number(m[1]), text: text.slice(m.index! + m[0].length, marks[i + 1]?.index ?? text.length) }));
  return out;
}
/** Corta un párrafo en frases. No usa «lookbehind» porque Safari anterior a 16.4 no lo admite. */
function splitSentences(par: string): string[] {
  const out: string[] = [];
  const boundary = /[.!?]\s+(?=[A-ZÁÉÍÓÚÜ¿¡0-9])/g;
  let start = 0;
  for (let m = boundary.exec(par); m; m = boundary.exec(par)) {
    out.push(par.slice(start, m.index + 1));
    start = m.index + m[0].length;
  }
  out.push(par.slice(start));
  return out;
}
export function splitIntoDraftConcepts(text: string, max = 20): DraftConcept[] {
  const segments = segmentByPage(text.replace(/\r/g, "")).map(seg => ({ page: seg.page, clean: seg.text.replace(/[ \t]+/g, " ").trim() })).filter(seg => seg.clean);
  if (!segments.length) return [];
  const hasSentenceBreak = segments.some(seg => /[.!?]\s+(?=[A-ZÁÉÍÓÚÜ¿¡0-9])/.test(seg.clean));
  const lineChunks = segments.flatMap(seg => seg.clean.split(/\n+/).map(x => x.trim()).filter(x => x.length >= 25).map(x => ({ page: seg.page, sentence: x })));
  const sentenceChunks = segments.flatMap(seg => seg.clean.split(/\n\s*\n/).flatMap(splitSentences).map(x => x.trim()).filter(x => x.length >= 35).map(x => ({ page: seg.page, sentence: x })));
  // Apuntes de un título por línea y sin puntuación: cada línea es una unidad. Con frases, se divide por frases.
  const looksLikeTitleList = !hasSentenceBreak && lineChunks.length >= 2 && !lineChunks.some(l => /[.!?]$/.test(l.sentence));
  const source = looksLikeTitleList ? lineChunks : sentenceChunks.length ? sentenceChunks : lineChunks;
  return source.slice(0, max).map(({ page, sentence }, i) => {
    const title = sentence.replace(/^[#>*\-•\s]+/, "").split(/[.:;!?]/)[0].slice(0, 72).trim() || `Concepto ${i + 1}`;
    return { title, explanation: sentence, excerpt: sentence.slice(0, 360), ...(page !== undefined ? { page } : {}) };
  });
}

/** Página del PDF a la que pertenece una posición del texto extraído, según los marcadores «[ Página N ]». */
export function pageAt(text: string, index: number): number | undefined {
  let page: number | undefined;
  for (const m of text.matchAll(PAGE_MARK)) {
    if (m.index! > index) break;
    page = Number(m[1]);
  }
  return page;
}

// ---------- CSV ----------

/** Lee un CSV (comillas dobles, saltos de línea dentro de comillas y separador «,», «;» o tabulador detectado en la primera línea). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n").find(l => l.trim()) ?? "";
  const count = (ch: string) => {
    let n = 0, quoted = false;
    for (const c of firstLine) { if (c === '"') quoted = !quoted; else if (c === ch && !quoted) n++; }
    return n;
  };
  const delimiter = [",", ";", "\t"].map(ch => ({ ch, n: count(ch) })).sort((a, b) => b.n - a.n)[0];
  const sep = delimiter.n > 0 ? delimiter.ch : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const endRow = () => { row.push(cell.trim()); cell = ""; if (row.some(x => x)) rows.push(row); row = []; };
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell.trim()) { quoted = true; cell = ""; }
    else if (c === sep) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n") endRow();
    else cell += c;
  }
  if (cell.trim() || row.length) endRow();
  return rows;
}

type CsvField = "title" | "prompt" | "answer" | "applicationPrompt" | "applicationAnswer" | "tags";
const CSV_HEADERS: Record<CsvField, string[]> = {
  title: ["concepto", "titulo", "title", "termino", "term", "nombre", "tema", "concept"],
  prompt: ["pregunta", "question", "prompt", "anverso", "front", "pregunta de recuerdo"],
  answer: ["respuesta", "answer", "definicion", "definition", "explicacion", "explanation", "reverso", "back", "respuesta de referencia"],
  applicationPrompt: ["aplicacion", "application", "pregunta de aplicacion", "pregunta_aplicacion", "ejercicio", "caso"],
  applicationAnswer: ["respuesta de aplicacion", "respuesta_aplicacion", "application answer", "solucion", "solution"],
  tags: ["etiquetas", "tags", "etiqueta", "unidad"],
};
const plain = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
const fieldForHeader = (cell: string): CsvField | undefined => {
  const key = plain(cell);
  return (Object.keys(CSV_HEADERS) as CsvField[]).find(f => CSV_HEADERS[f].some(alias => plain(alias) === key));
};

/**
 * Convierte un CSV en borradores, una fila por concepto.
 * Con cabecera reconocible (concepto, pregunta, respuesta, aplicación, respuesta de aplicación, etiquetas) se usan esos nombres;
 * sin cabecera se interpreta por posición: 2 columnas = concepto y respuesta; 3 o más = concepto, pregunta y respuesta.
 * Un CSV de una sola columna se trata como texto corrido.
 */
export function draftsFromCsv(text: string, max = 20): DraftConcept[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const width = Math.max(...rows.map(r => r.length));
  if (width < 2) return splitIntoDraftConcepts(rows.map(r => r[0]).join("\n"), max).map(d => ({ ...d, origin: "csv" as const }));
  const headerFields = rows[0].map(fieldForHeader);
  const hasHeader = headerFields.some(f => f === "title" || f === "prompt" || f === "answer");
  const columns: (CsvField | undefined)[] = hasHeader ? headerFields : width === 2 ? ["title", "answer"] : ["title", "prompt", "answer"];
  const out: DraftConcept[] = [];
  for (const row of hasHeader ? rows.slice(1) : rows) {
    const get = (f: CsvField) => { const i = columns.indexOf(f); return i >= 0 ? (row[i] ?? "").trim() : ""; };
    let title = get("title"), prompt = get("prompt");
    const answer = get("answer");
    // Tarjetas «pregunta, respuesta» sin columna de concepto: la pregunta hace también de nombre.
    if (!title && prompt) title = prompt;
    if (!prompt && /\?\s*$/.test(title)) prompt = title;
    title = title.replace(/^[¿¡\s]+/, "").replace(/[?!\s]+$/, "").slice(0, 120).trim();
    if (!title) continue;
    const tags = get("tags").split(/[,;|]/).map(t => t.trim()).filter(Boolean);
    const applicationPrompt = get("applicationPrompt"), applicationAnswer = get("applicationAnswer");
    out.push({
      title, explanation: answer, excerpt: row.filter(Boolean).join(" · ").slice(0, 360), origin: "csv",
      ...(prompt ? { prompt } : {}),
      ...(applicationPrompt ? { applicationPrompt } : {}),
      ...(applicationAnswer ? { applicationAnswer } : {}),
      ...(tags.length ? { tags } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

// ---------- Propuesta y guardado ----------

/** Máximo de borradores que se muestran a la vez para revisar. */
export const MAX_DRAFTS = 60;

/** Propone borradores según el tipo de fuente e indica si se ha recortado la lista. */
export function proposeDrafts(text: string, kind: ImportKind = "text", max = MAX_DRAFTS): { drafts: DraftConcept[]; truncated: boolean } {
  const all = kind === "csv" ? draftsFromCsv(text, max + 1) : splitIntoDraftConcepts(text, max + 1);
  return { drafts: all.slice(0, max), truncated: all.length > max };
}

export const PASTED_SOURCE_NAME = "Texto pegado";

/** Datos con los que se crea el concepto a partir de un borrador revisado. Conserva el archivo, la página y el fragmento de origen. */
export function draftToConceptInput(draft: DraftConcept, subjectId: string, fileName: string) {
  const title = draft.title.trim().slice(0, 120);
  const reference = draft.explanation.trim();
  const tags = [...new Set(["importado", ...(draft.origin === "ai" ? ["ia"] : []), ...(draft.tags ?? []).map(t => t.trim()).filter(Boolean)])];
  return {
    subjectId, title,
    explanation: reference, answer: reference,
    prompt: draft.prompt?.trim() || `Explica con tus palabras: ${title}`,
    ...(draft.applicationPrompt?.trim() ? { applicationPrompt: draft.applicationPrompt.trim() } : {}),
    ...(draft.applicationAnswer?.trim() ? { applicationAnswer: draft.applicationAnswer.trim() } : {}),
    source: { fileName: fileName.trim() || PASTED_SOURCE_NAME, excerpt: draft.excerpt, ...(draft.page !== undefined ? { page: draft.page } : {}) },
    tags,
  };
}

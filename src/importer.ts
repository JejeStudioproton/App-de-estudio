export type ImportedDocument = { fileName:string; text:string; pages?:number; warning?:string };
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
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) throw new ImportError("Formato no compatible. Usa PDF con texto seleccionable, DOCX, TXT o Markdown.");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new ImportError("El archivo está vacío.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError(`El archivo pesa ${megabytes(file.size)} MB y el máximo es ${megabytes(MAX_IMPORT_BYTES)} MB. Divídelo en partes más pequeñas.`);
}

export async function importDocument(file: File): Promise<ImportedDocument> {
  validateImportFile(file);
  const ext = extensionOf(file.name);
  if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "csv") {
    const text = await file.text();
    const warnings: string[] = [];
    if (text.includes("\uFFFD")) warnings.push("Se detectaron caracteres no válidos: el archivo probablemente no está en UTF-8. Guárdalo como UTF-8 para conservar los acentos.");
    if (!text.trim()) warnings.push("El archivo no contiene texto.");
    return { fileName: file.name, text, warning: warnings.join(" ") || undefined };
  }
  if (ext === "docx") {
    let result: { value: string; messages: unknown[] };
    try {
      const mammoth = await import("mammoth");
      result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    } catch {
      throw new ImportError("No se pudo leer el DOCX: el archivo parece dañado o no es un documento de Word válido.");
    }
    const warnings: string[] = [];
    if (result.messages.length) warnings.push("Se omitió parte del formato del documento (tablas, imágenes o estilos).");
    if (!result.value.trim()) warnings.push("El documento no contiene texto extraíble.");
    return { fileName: file.name, text: result.value, warning: warnings.join(" ") || undefined };
  }
  // PDF
  let pdf: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> };
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdf = (await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise) as unknown as typeof pdf;
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
  return { fileName: file.name, text, pages: pdf.numPages, warning: warnings.join(" ") || undefined };
}

export type DraftConcept = { title: string; explanation: string; excerpt: string; page?: number };
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
export function splitIntoDraftConcepts(text: string, max = 20): DraftConcept[] {
  const segments = segmentByPage(text.replace(/\r/g, "")).map(seg => ({ page: seg.page, clean: seg.text.replace(/[ \t]+/g, " ").trim() })).filter(seg => seg.clean);
  if (!segments.length) return [];
  const hasSentenceBreak = segments.some(seg => /[.!?]\s+(?=[A-ZÁÉÍÓÚÜ¿¡0-9])/.test(seg.clean));
  const lineChunks = segments.flatMap(seg => seg.clean.split(/\n+/).map(x => x.trim()).filter(x => x.length >= 25).map(x => ({ page: seg.page, sentence: x })));
  const sentenceChunks = segments.flatMap(seg => seg.clean.split(/\n\s*\n/).flatMap(par => par.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜ¿¡0-9])/)).map(x => x.trim()).filter(x => x.length >= 35).map(x => ({ page: seg.page, sentence: x })));
  // Apuntes de un título por línea y sin puntuación: cada línea es una unidad. Con frases, se divide por frases.
  const looksLikeTitleList = !hasSentenceBreak && lineChunks.length >= 2 && !lineChunks.some(l => /[.!?]$/.test(l.sentence));
  const source = looksLikeTitleList ? lineChunks : sentenceChunks.length ? sentenceChunks : lineChunks;
  return source.slice(0, max).map(({ page, sentence }, i) => {
    const title = sentence.replace(/^[#>*\-•\s]+/, "").split(/[.:;!?]/)[0].slice(0, 72).trim() || `Concepto ${i + 1}`;
    return { title, explanation: sentence, excerpt: sentence.slice(0, 360), ...(page !== undefined ? { page } : {}) };
  });
}

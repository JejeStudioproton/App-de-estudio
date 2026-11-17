export type ImportedDocument = { fileName:string; text:string; pages?:number; warning?:string };
export async function importDocument(file: File): Promise<ImportedDocument> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "csv") return { fileName:file.name,text:await file.text() };
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return { fileName:file.name,text:result.value,warning:result.messages.length ? "Se omitió parte del formato del documento." : undefined };
  }
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages:string[] = [];
    for (let i=1;i<=pdf.numPages;i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item:any)=>"str" in item ? item.str : "").join(" ");
      pages.push(`\n[ Página ${i} ]\n${text}`);
    }
    const text = pages.join("\n");
    return { fileName:file.name,text,pages:pdf.numPages,warning:text.trim().length<50 ? "Parece un PDF escaneado o sin texto seleccionable. Este MVP no incluye OCR." : undefined };
  }
  throw new Error("Formato no compatible. Usa PDF con texto seleccionable, DOCX, TXT o Markdown.");
}
export function splitIntoDraftConcepts(text:string, max=20): {title:string; explanation:string; excerpt:string}[] {
  const clean = text.replace(/\r/g,"").replace(/[ \t]+/g," ").trim();
  if (!clean) return [];
  const chunks = clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜ¿¡0-9])/).map(s=>s.trim()).filter(s=>s.length>=35);
  const source = chunks.length ? chunks : clean.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>=25);
  return source.slice(0,max).map((sentence,i)=>{
    const title = sentence.replace(/^\[ Página \d+ \]\s*/,"").split(/[.:;!?]/)[0].slice(0,72).trim() || `Concepto ${i+1}`;
    return { title, explanation:sentence, excerpt:sentence.slice(0,360) };
  });
}

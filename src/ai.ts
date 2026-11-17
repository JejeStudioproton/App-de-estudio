/**
 * Optional OpenAI-compatible adapter. It is OFF by default and has no bundled API key.
 * Never send private school documents to an endpoint without permission.
 */
export type AIConfig = { baseUrl:string; model:string };
export async function requestAI(config:AIConfig, system:string, prompt:string, signal?:AbortSignal):Promise<string> {
  if (!config.baseUrl.trim() || !config.model.trim()) throw new Error("Configura el endpoint y el modelo antes de activar la IA.");
  const base = config.baseUrl.replace(/\/+$/,"");
  const response = await fetch(`${base}/v1/chat/completions`,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:config.model,temperature:0.2,messages:[{role:"system",content:system},{role:"user",content:prompt}]}),signal
  });
  if (!response.ok) throw new Error(`El proveedor de IA respondió ${response.status}.`);
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content!=="string" || !content.trim()) throw new Error("El proveedor no devolvió texto.");
  return content.trim();
}
export const CONCEPT_EXTRACTION_PROMPT = `Extrae conceptos educativos SOLO del texto fuente proporcionado. Devuelve JSON válido con una lista "concepts"; cada elemento debe incluir title, explanation, prompt, answer, applicationPrompt, applicationAnswer, sourceExcerpt. No inventes datos. Mantén las citas breves y fieles al texto. Si falta información para responder, deja la respuesta vacía.`;

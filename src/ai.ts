/**
 * Adaptador opcional compatible con la API de OpenAI («chat completions»).
 * Está DESACTIVADO por defecto y no incluye ninguna clave. Solo se usa cuando el estudiante lo activa en
 * Configuración y confirma cada envío. Nunca envíes documentos privados a un endpoint sin permiso.
 */
import type { DraftConcept } from "./importer";
import { pageAt } from "./importer";

export type AIConfig = { baseUrl: string; model: string; apiKey?: string };

/** Error con un mensaje ya redactado para el estudiante. */
export class AIError extends Error {}

/** Caracteres de texto fuente que se envían como máximo en una petición. */
export const MAX_AI_SOURCE_CHARS = 12000;
export const AI_TIMEOUT_MS = 60000;
const SESSION_KEY = "forma.ai.key";

/**
 * Dirección completa de «chat completions» a partir de lo que escribe el estudiante.
 * Admite la base del servidor (`https://host`), la base con versión (`https://host/v1`) o la ruta completa.
 */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v\d+$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

/** Nombre del servidor al que se enviaría el texto, para mostrarlo antes de pedir permiso. */
export function aiHost(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim()).host;
  } catch {
    return "";
  }
}

const isLocalHost = (host: string) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);

/** Devuelve un mensaje si la configuración no permite hacer la petición; `undefined` si es utilizable. */
export function validateAIConfig(config: AIConfig, pageProtocol?: string): string | undefined {
  if (!config.baseUrl.trim() || !config.model.trim()) return "Indica la dirección del servicio y el modelo antes de usar la IA.";
  let url: URL;
  try {
    url = new URL(config.baseUrl.trim());
  } catch {
    return "La dirección del servicio no es válida. Debe empezar por https:// (o http://localhost).";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "La dirección del servicio debe empezar por https:// (o http://localhost).";
  if (url.protocol === "http:" && !isLocalHost(url.host)) {
    if (pageProtocol === "https:") return "Desde una página segura (https) el navegador solo permite servicios https o un servidor en localhost.";
    return "Usa una dirección https: con http, el texto y la clave viajarían sin cifrar. Solo se admite http para localhost.";
  }
  return undefined;
}

function statusMessage(status: number): string {
  if (status === 401 || status === 403) return "El servicio rechazó la petición: la clave no es válida o no tiene permiso.";
  if (status === 404) return "El servicio no encontró esa dirección o ese modelo. Revisa ambos en Configuración.";
  if (status === 429) return "El servicio ha alcanzado su límite de uso. Espera un poco y vuelve a intentarlo.";
  if (status >= 500) return `El servicio de IA falló (error ${status}). Inténtalo más tarde.`;
  return `El servicio de IA respondió con el error ${status}.`;
}

export async function requestAI(config: AIConfig, system: string, prompt: string, signal?: AbortSignal): Promise<string> {
  const problem = validateAIConfig(config, typeof location !== "undefined" ? location.protocol : undefined);
  if (problem) throw new AIError(problem);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", onAbort);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  try {
    let response: Response;
    try {
      response = await fetch(chatCompletionsUrl(config.baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model.trim(),
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch {
      if (timedOut) throw new AIError("El servicio de IA tardó demasiado en responder.");
      if (signal?.aborted) throw new AIError("Petición cancelada.");
      throw new AIError("No se pudo conectar con el servicio de IA. Revisa la dirección, tu conexión y que el servicio permita peticiones desde el navegador (CORS).");
    }
    if (!response.ok) throw new AIError(statusMessage(response.status));
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AIError("El servicio respondió con un formato que FORMA no entiende. ¿Es compatible con la API de OpenAI?");
    }
    const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new AIError("El servicio no devolvió texto.");
    return content.trim();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export const CONCEPT_EXTRACTION_PROMPT = `Extrae conceptos educativos SOLO del texto fuente proporcionado, en el mismo idioma del texto. Devuelve únicamente JSON válido, sin texto alrededor, con una lista "concepts" de 20 elementos como máximo; cada elemento debe incluir title, explanation, prompt, answer, applicationPrompt, applicationAnswer, sourceExcerpt. sourceExcerpt debe ser una cita literal y breve del texto fuente. No inventes datos. Si falta información para responder, deja la respuesta vacía.`;

const text = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
const loose = (x: string) => x.toLowerCase().replace(/\[ Página \d+ \]/gi, " ").replace(/\s+/g, " ").trim();

/**
 * Convierte la respuesta del modelo en borradores revisables.
 * Cada cita se busca en el texto fuente: si no aparece, el borrador se marca como «sin verificar»
 * para que el estudiante sepa que el modelo puede haberla inventado.
 */
export function parseAIConcepts(content: string, sourceText: string, max = 30): DraftConcept[] {
  const unfenced = content.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.search(/[[{]/);
  const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
  if (start < 0 || end <= start) throw new AIError("La IA no devolvió una lista de conceptos. Vuelve a intentarlo o usa la propuesta automática.");
  let data: unknown;
  try {
    data = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw new AIError("La respuesta de la IA no es JSON válido. Vuelve a intentarlo o usa la propuesta automática.");
  }
  const list = Array.isArray(data) ? data : (data as { concepts?: unknown })?.concepts;
  if (!Array.isArray(list)) throw new AIError("La IA no devolvió una lista de conceptos. Vuelve a intentarlo o usa la propuesta automática.");
  const looseSource = loose(sourceText);
  const drafts: DraftConcept[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const title = text(raw.title, 120);
    if (!title) continue;
    const explanation = text(raw.answer, 4000) || text(raw.explanation, 4000);
    const cited = text(raw.sourceExcerpt, 360);
    const exactAt = cited ? sourceText.indexOf(cited) : -1;
    const verified = exactAt >= 0 || (cited.length >= 12 && looseSource.includes(loose(cited)));
    const page = exactAt >= 0 ? pageAt(sourceText, exactAt) : undefined;
    const prompt = text(raw.prompt, 500);
    const applicationPrompt = text(raw.applicationPrompt, 500);
    const applicationAnswer = text(raw.applicationAnswer, 2000);
    drafts.push({
      title,
      explanation,
      excerpt: cited || explanation.slice(0, 360),
      origin: "ai",
      ...(verified ? {} : { unverified: true }),
      ...(page !== undefined ? { page } : {}),
      ...(prompt ? { prompt } : {}),
      ...(applicationPrompt ? { applicationPrompt } : {}),
      ...(applicationAnswer ? { applicationAnswer } : {}),
    });
    if (drafts.length >= max) break;
  }
  if (!drafts.length) throw new AIError("La IA no propuso ningún concepto para este texto.");
  return drafts;
}

/** Pide al modelo que proponga conceptos a partir del texto fuente. `truncated` indica que solo se envió el principio. */
export async function extractConceptsWithAI(config: AIConfig, sourceText: string, signal?: AbortSignal): Promise<{ drafts: DraftConcept[]; truncated: boolean }> {
  const source = sourceText.trim();
  if (!source) throw new AIError("No hay texto fuente que enviar.");
  const sent = source.slice(0, MAX_AI_SOURCE_CHARS);
  const content = await requestAI(config, CONCEPT_EXTRACTION_PROMPT, `Texto fuente:\n\n${sent}`, signal);
  return { drafts: parseAIConcepts(content, sent), truncated: source.length > sent.length };
}

/** Comprueba que el servicio responde. Envía solo una palabra, ningún contenido del estudiante. */
export async function testAIConnection(config: AIConfig, signal?: AbortSignal): Promise<void> {
  await requestAI(config, "Responde únicamente con la palabra: ok", "ok", signal);
}

type SessionLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function sessionStore(): SessionLike | undefined {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
  } catch {
    return undefined;
  }
}
/**
 * La clave se guarda solo en `sessionStorage`: desaparece al cerrar la pestaña y nunca forma parte
 * del estado de la app ni de las copias de seguridad exportadas.
 */
export function loadSessionKey(store: SessionLike | undefined = sessionStore()): string {
  try {
    return store?.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}
export function saveSessionKey(key: string, store: SessionLike | undefined = sessionStore()): void {
  try {
    if (key.trim()) store?.setItem(SESSION_KEY, key.trim());
    else store?.removeItem(SESSION_KEY);
  } catch {
    /* sin almacenamiento de sesión: la clave vive solo en memoria */
  }
}

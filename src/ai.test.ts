import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AIError, MAX_AI_SOURCE_CHARS, aiHost, chatCompletionsUrl, extractConceptsWithAI, loadSessionKey, parseAIConcepts,
  requestAI, saveSessionKey, testAIConnection, validateAIConfig,
} from "./ai";

const config = { baseUrl: "https://ia.ejemplo/v1", model: "modelo-prueba" };
const reply = (content: string, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
const source = "La mitosis es la división del núcleo celular en dos núcleos idénticos. El ribosoma sintetiza proteínas a partir del ARN mensajero.";

afterEach(() => vi.unstubAllGlobals());

describe("dirección del servicio", () => {
  it("acepta la base, la base con versión o la ruta completa", () => {
    expect(chatCompletionsUrl("https://ia.ejemplo")).toBe("https://ia.ejemplo/v1/chat/completions");
    expect(chatCompletionsUrl("https://ia.ejemplo/v1/")).toBe("https://ia.ejemplo/v1/chat/completions");
    expect(chatCompletionsUrl("https://ia.ejemplo/api/v1")).toBe("https://ia.ejemplo/api/v1/chat/completions");
    expect(chatCompletionsUrl("https://ia.ejemplo/otra/chat/completions")).toBe("https://ia.ejemplo/otra/chat/completions");
    expect(aiHost("https://ia.ejemplo/v1")).toBe("ia.ejemplo");
    expect(aiHost("no es una url")).toBe("");
  });
  it("exige dirección y modelo, y rechaza http salvo en localhost", () => {
    expect(validateAIConfig({ baseUrl: "", model: "m" })).toMatch(/dirección/);
    expect(validateAIConfig({ baseUrl: "https://ia.ejemplo", model: " " })).toMatch(/modelo/);
    expect(validateAIConfig({ baseUrl: "ia.ejemplo", model: "m" })).toMatch(/no es válida/);
    expect(validateAIConfig({ baseUrl: "ftp://ia.ejemplo", model: "m" })).toMatch(/https/);
    expect(validateAIConfig({ baseUrl: "http://ia.ejemplo", model: "m" })).toMatch(/sin cifrar/);
    expect(validateAIConfig({ baseUrl: "http://ia.ejemplo", model: "m" }, "https:")).toMatch(/página segura/);
    expect(validateAIConfig({ baseUrl: "http://localhost:11434/v1", model: "m" }, "https:")).toBeUndefined();
    expect(validateAIConfig(config)).toBeUndefined();
  });
});

describe("requestAI", () => {
  it("no hace ninguna petición si falta configuración", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestAI({ baseUrl: "", model: "" }, "s", "p")).rejects.toThrow(AIError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("envía modelo y mensajes a la ruta correcta, sin cabecera de autorización si no hay clave", async () => {
    const fetchMock = vi.fn(async () => reply(" hola "));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestAI(config, "sistema", "pregunta")).resolves.toBe("hola");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ia.ejemplo/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("modelo-prueba");
    expect(body.messages).toEqual([{ role: "system", content: "sistema" }, { role: "user", content: "pregunta" }]);
  });
  it("añade la clave como Bearer solo cuando existe", async () => {
    const fetchMock = vi.fn(async () => reply("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await testAIConnection({ ...config, apiKey: " secreta " });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secreta");
  });
  it("traduce los fallos a mensajes comprensibles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("", 401)));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/clave/);
    vi.stubGlobal("fetch", vi.fn(async () => reply("", 404)));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/dirección o ese modelo/);
    vi.stubGlobal("fetch", vi.fn(async () => reply("", 429)));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/límite/);
    vi.stubGlobal("fetch", vi.fn(async () => reply("", 503)));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/503/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/No se pudo conectar/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/formato/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    await expect(requestAI(config, "s", "p")).rejects.toThrow(/no devolvió texto/);
  });
  it("una petición cancelada por el estudiante se informa como cancelada", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const controller = new AbortController();
    const pending = requestAI(config, "s", "p", controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/cancelada/);
  });
});

describe("parseAIConcepts", () => {
  const json = JSON.stringify({ concepts: [
    { title: "Mitosis", explanation: "División del núcleo.", prompt: "¿Qué es la mitosis?", answer: "División del núcleo celular.", applicationPrompt: "", applicationAnswer: "", sourceExcerpt: "La mitosis es la división del núcleo celular" },
    { title: "Meiosis", explanation: "Reduce los cromosomas a la mitad.", sourceExcerpt: "La meiosis reduce el número de cromosomas" },
    { title: "   ", explanation: "sin título" },
    "no es un objeto",
  ] });
  it("convierte la respuesta en borradores marcados como propuestos por IA", () => {
    const drafts = parseAIConcepts(json, source);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ title: "Mitosis", explanation: "División del núcleo celular.", prompt: "¿Qué es la mitosis?", origin: "ai" });
    expect(drafts[0].applicationPrompt).toBeUndefined();
  });
  it("verifica cada cita contra el texto fuente y marca las que no aparecen", () => {
    const drafts = parseAIConcepts(json, source);
    expect(drafts[0].unverified).toBeUndefined();
    expect(drafts[1].unverified).toBe(true);
    // Diferencias de mayúsculas o espacios no impiden reconocer la cita.
    const loose = parseAIConcepts(JSON.stringify([{ title: "Ribosoma", sourceExcerpt: "el  RIBOSOMA sintetiza\nproteínas" }]), source);
    expect(loose[0].unverified).toBeUndefined();
  });
  it("recupera la página del PDF cuando la cita es literal", () => {
    const paged = `\n[ Página 1 ]\nIntroducción general del tema.\n[ Página 2 ]\n${source}`;
    expect(parseAIConcepts(json, paged)[0].page).toBe(2);
  });
  it("acepta JSON envuelto en un bloque de código o con texto alrededor", () => {
    expect(parseAIConcepts("```json\n" + json + "\n```", source)).toHaveLength(2);
    expect(parseAIConcepts("Aquí tienes:\n" + json + "\nEspero que sirva.", source)).toHaveLength(2);
  });
  it("rechaza con un mensaje claro lo que no es una lista de conceptos", () => {
    expect(() => parseAIConcepts("No puedo ayudarte con eso.", source)).toThrow(AIError);
    expect(() => parseAIConcepts("{ esto no es json }", source)).toThrow(/JSON válido/);
    expect(() => parseAIConcepts('{"otra":"cosa"}', source)).toThrow(/lista de conceptos/);
    expect(() => parseAIConcepts('{"concepts":[]}', source)).toThrow(/ningún concepto/);
  });
  it("respeta el máximo de borradores", () => {
    const many = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ title: `Concepto ${i}` })));
    expect(parseAIConcepts(many, source, 5)).toHaveLength(5);
  });
});

describe("extractConceptsWithAI", () => {
  it("envía el texto fuente y devuelve los borradores", async () => {
    const fetchMock = vi.fn(async () => reply(JSON.stringify({ concepts: [{ title: "Mitosis", sourceExcerpt: "La mitosis es la división" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await extractConceptsWithAI(config, source);
    expect(result.truncated).toBe(false);
    expect(result.drafts[0].title).toBe("Mitosis");
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages[1].content).toContain("La mitosis es la división del núcleo celular");
  });
  it("recorta los textos largos y lo indica", async () => {
    const fetchMock = vi.fn(async () => reply(JSON.stringify([{ title: "Uno" }])));
    vi.stubGlobal("fetch", fetchMock);
    const long = "palabra ".repeat(MAX_AI_SOURCE_CHARS);
    const result = await extractConceptsWithAI(config, long);
    expect(result.truncated).toBe(true);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.messages[1].content.length).toBeLessThan(MAX_AI_SOURCE_CHARS + 100);
  });
  it("sin texto no envía nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(extractConceptsWithAI(config, "   ")).rejects.toThrow(/No hay texto/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("clave de sesión", () => {
  it("se guarda recortada, se recupera y se borra al vaciarla", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    expect(loadSessionKey(store)).toBe("");
    saveSessionKey("  abc  ", store);
    expect(loadSessionKey(store)).toBe("abc");
    saveSessionKey("", store);
    expect(data.size).toBe(0);
  });
  it("sin almacenamiento disponible no rompe", () => {
    const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); }, removeItem: () => undefined };
    expect(loadSessionKey(broken)).toBe("");
    expect(() => saveSessionKey("abc", broken)).not.toThrow();
  });
});

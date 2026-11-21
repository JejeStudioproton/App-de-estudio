// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

let container: HTMLDivElement;
let root: Root;

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim().includes(text),
  );
  if (!found) throw new Error(`No se encontró un botón con «${text}»`);
  return found as HTMLButtonElement;
}

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelect(el: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function submitForm() {
  const form = document.querySelector(".modal form");
  if (!form) throw new Error("No hay formulario en el modal");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  }));
  vi.stubGlobal("confirm", () => true);
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

describe("flujo principal de FORMA", () => {
  it("crea una materia, un concepto y registra una práctica completa", async () => {
    expect(container.textContent).toContain("Aprender mejor empieza");

    await click(button("Crear materia"));
    expect(document.querySelector(".modal")).not.toBeNull();

    const name = document.querySelector<HTMLInputElement>('input[placeholder="Ej. Matemáticas"]')!;
    await act(async () => { setValue(name, "Biología"); });
    await submitForm();
    expect(document.querySelector(".modal")).toBeNull();
    expect(container.textContent).toContain("Biología");

    await click(button("Añadir concepto"));
    const title = document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!;
    const prompt = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="¿Qué es…? ¿Cómo funciona…?"]')!;
    const answer = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="La explicación correcta que usarás para comprobar…"]')!;
    await act(async () => {
      setValue(title, "Mitosis");
      setValue(prompt, "¿Qué es la mitosis?");
      setValue(answer, "División celular que produce dos células hijas.");
    });
    await submitForm();
    expect(container.textContent).toContain("Mitosis");

    // La fila del concepto abre la sesión de práctica.
    await click(button("Mitosis"));
    expect(container.textContent).toContain("¿Qué es la mitosis?");
    expect(container.textContent).toContain("Concepto 1 de 1");

    await click(button("Con seguridad"));
    const confidence = document.querySelector<HTMLSelectElement>("#confidence")!;
    await act(async () => { setSelect(confidence, "3"); });
    await click(button("Guardar evaluación"));

    expect(container.textContent).toContain("Resumen de la sesión");
    expect(container.textContent).toContain("intento registrado");

    const saved = JSON.parse(localStorage.getItem("forma.state.v3") ?? "{}");
    expect(saved.concepts).toHaveLength(1);
    expect(saved.reviews).toHaveLength(1);
    expect(saved.reviews[0]).toMatchObject({ conceptId: saved.concepts[0].id, rating: 3, confidence: 1 });
  });

  it("cierra un modal con Escape y devuelve el foco al botón que lo abrió", async () => {
    const opener = button("Crear materia");
    opener.focus();
    await click(opener);
    expect(document.querySelector(".modal")).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector(".modal")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

const savedState = () => JSON.parse(localStorage.getItem("forma.state.v3") ?? "{}");
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const draftTitles = () => Array.from(document.querySelectorAll<HTMLInputElement>(".draft-title")).map((x) => x.value);
const NOTES = "La mitosis es el proceso de división celular que produce dos células hijas idénticas. El ribosoma sintetiza proteínas a partir del ARN mensajero en el citoplasma.";

async function createSubject(name: string) {
  await click(button("Crear materia"));
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Ej. Matemáticas"]')!;
  await act(async () => { setValue(input, name); });
  await submitForm();
}

describe("importación", () => {
  it("propone borradores editables a partir de texto pegado y guarda la fuente original", async () => {
    await click(button("Importar apuntes"));
    const area = document.querySelector<HTMLTextAreaElement>("#import-text")!;
    await act(async () => { setValue(area, NOTES); });
    expect(draftTitles()).toHaveLength(2);

    // El estudiante corrige el nombre y la respuesta del primer borrador y descarta el segundo.
    const title = document.querySelector<HTMLInputElement>(".draft-title")!;
    const reference = document.querySelector<HTMLTextAreaElement>(".draft-fields textarea")!;
    await act(async () => { setValue(title, "Mitosis"); setValue(reference, "División celular en dos células hijas."); });
    await click(document.querySelectorAll<HTMLInputElement>('.draft-item > input[type="checkbox"]')[1]);

    // Con borradores ya corregidos, tocar el texto fuente no los sobrescribe.
    await act(async () => { setValue(area, NOTES + " "); });
    expect(draftTitles()[0]).toBe("Mitosis");

    // Sin materias, el destino es una materia nueva.
    const guardar = button("Guardar 1 concepto");
    expect(guardar.disabled).toBe(true);
    await act(async () => { setValue(document.querySelector<HTMLInputElement>("#import-new-subject")!, "Biología"); });
    await click(button("Guardar 1 concepto"));

    expect(document.querySelector(".modal")).toBeNull();
    const saved = savedState();
    expect(saved.subjects.map((x: { name: string }) => x.name)).toEqual(["Biología"]);
    expect(saved.concepts).toHaveLength(1);
    expect(saved.concepts[0]).toMatchObject({
      title: "Mitosis", answer: "División celular en dos células hijas.", subjectId: saved.subjects[0].id,
      prompt: "Explica con tus palabras: Mitosis", tags: ["importado"],
    });
    expect(saved.concepts[0].source.fileName).toBe("Texto pegado");
    expect(saved.concepts[0].source.excerpt).toMatch(/^La mitosis es el proceso de división celular/);
    // Tras guardar se abre la materia con lo importado.
    expect(container.textContent).toContain("Conceptos de la materia");
    expect(container.textContent).toContain("Mitosis");
  });

  it("importa un CSV por filas en la materia abierta y el selector de archivo sigue disponible después", async () => {
    await createSubject("Biología");
    const inputs = () => document.querySelectorAll<HTMLInputElement>('input[type="file"][accept*=".csv"]');
    expect(inputs()).toHaveLength(1);
    const file = new File(["concepto;pregunta;respuesta\nMitosis;¿Qué es la mitosis?;División del núcleo\nRibosoma;;Sintetiza proteínas\n"], "tarjetas.csv", { type: "text/csv" });
    Object.defineProperty(inputs()[0], "files", { value: [file], configurable: true });
    await act(async () => { inputs()[0].dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();

    expect(document.querySelector(".modal")).not.toBeNull();
    expect(draftTitles()).toEqual(["Mitosis", "Ribosoma"]);
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Pregunta del concepto 1"]')!.value).toBe("¿Qué es la mitosis?");
    // Al importar desde una materia, esa materia ya viene elegida como destino.
    expect(document.querySelector<HTMLSelectElement>("#import-subject")!.value).toBe(savedState().subjects[0].id);
    await click(button("Guardar 2 conceptos"));

    const saved = savedState();
    expect(saved.concepts.map((c: { title: string }) => c.title).sort()).toEqual(["Mitosis", "Ribosoma"]);
    const mitosis = saved.concepts.find((c: { title: string }) => c.title === "Mitosis");
    expect(mitosis).toMatchObject({ prompt: "¿Qué es la mitosis?", answer: "División del núcleo" });
    expect(mitosis.source.fileName).toBe("tarjetas.csv");

    // Regresión: al cerrar la ventana el selector de archivo no desaparece y «Elegir archivo» lo abre.
    expect(inputs()).toHaveLength(1);
    await click(button("Importar"));
    const opened = vi.spyOn(inputs()[0], "click").mockImplementation(() => undefined);
    await click(button("Elegir archivo"));
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("un archivo no compatible se explica dentro de la ventana de importación", async () => {
    await click(button("Importar apuntes"));
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*=".csv"]')!;
    Object.defineProperty(input, "files", { value: [new File(["x"], "foto.png")], configurable: true });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    await flush();
    expect(document.querySelector('.modal [role="alert"]')?.textContent).toMatch(/Formato no compatible/);
  });
});

describe("IA opcional", () => {
  const aiReply = JSON.stringify({ concepts: [
    { title: "Mitosis", answer: "División del núcleo.", prompt: "¿Qué es la mitosis?", sourceExcerpt: "La mitosis es el proceso de división celular" },
    { title: "Dato inventado", answer: "No está en los apuntes.", sourceExcerpt: "esta cita no existe en el texto fuente" },
  ] });

  it("está apagada por defecto; activada, solo envía el texto tras confirmar y la clave no se guarda con los datos", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: aiReply } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    let accept = false;
    const confirmMock = vi.fn(() => accept);
    vi.stubGlobal("confirm", confirmMock);

    await click(button("Importar apuntes"));
    await act(async () => { setValue(document.querySelector<HTMLTextAreaElement>("#import-text")!, NOTES); });
    expect(() => button("Proponer con IA")).toThrow();
    await click(button("Cancelar"));

    await click(document.querySelector('button[aria-label="Abrir configuración"]')!);
    expect(document.querySelector("#ai-url")).toBeNull();
    const toggle = Array.from(document.querySelectorAll("label")).find((l) => l.textContent?.includes("Permitir propuestas con IA"))!.querySelector("input")!;
    await click(toggle);
    await act(async () => {
      setValue(document.querySelector<HTMLInputElement>("#ai-url")!, "https://ia.ejemplo/v1");
      setValue(document.querySelector<HTMLInputElement>("#ai-model")!, "modelo-prueba");
      setValue(document.querySelector<HTMLInputElement>("#ai-key")!, "clave-secreta");
    });

    // La ventana conserva el texto pegado antes de cerrarla.
    await click(button("Importar apuntes"));
    expect(document.querySelector<HTMLTextAreaElement>("#import-text")!.value).toBe(NOTES);

    // Sin confirmación no sale ninguna petición.
    await click(button("Proponer con IA"));
    await flush();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(String(confirmMock.mock.calls[0])).toContain("ia.ejemplo");
    expect(fetchMock).not.toHaveBeenCalled();

    accept = true;
    await click(button("Proponer con IA"));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ia.ejemplo/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer clave-secreta");
    expect(JSON.parse(String(init.body)).messages[1].content).toContain("La mitosis es el proceso");

    expect(draftTitles()).toEqual(["Mitosis", "Dato inventado"]);
    const flags = Array.from(document.querySelectorAll(".draft-item")).map((x) => x.textContent ?? "");
    expect(flags.every((t) => t.includes("Propuesto por IA"))).toBe(true);
    expect(flags[0]).not.toContain("Cita no encontrada");
    expect(flags[1]).toContain("Cita no encontrada en tu texto");

    // La dirección y el modelo se guardan; la clave solo vive en la sesión de la pestaña.
    expect(localStorage.getItem("forma.state.v3")).toContain("https://ia.ejemplo/v1");
    expect(localStorage.getItem("forma.state.v3")).not.toContain("clave-secreta");
    expect(sessionStorage.getItem("forma.ai.key")).toBe("clave-secreta");
    sessionStorage.clear();
  });

  it("un fallo del servicio se muestra como error y conserva los borradores anteriores", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    localStorage.setItem("forma.state.v3", JSON.stringify({ version: 3, subjects: [], concepts: [], reviews: [], settings: { aiMode: "optional", aiBaseUrl: "https://ia.ejemplo", aiModel: "m" } }));
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(<App />); });

    await click(button("Importar apuntes"));
    await act(async () => { setValue(document.querySelector<HTMLTextAreaElement>("#import-text")!, NOTES); });
    const before = draftTitles();
    await click(button("Proponer con IA"));
    await flush();
    expect(document.querySelector('.modal [role="alert"]')?.textContent).toMatch(/clave no es válida/);
    expect(draftTitles()).toEqual(before);
  });
});

describe("tiempo estimado", () => {
  it("guarda los minutos por repaso indicados al crear un concepto", async () => {
    await createSubject("Física");
    await click(button("Añadir concepto"));
    await act(async () => {
      setValue(document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!, "Ley de Ohm");
      setValue(document.querySelector<HTMLInputElement>('.modal input[type="number"]')!, "7");
    });
    await submitForm();
    expect(savedState().concepts[0]).toMatchObject({ title: "Ley de Ohm", estimatedMinutes: 7 });
  });
});

describe("plan de examen", () => {
  it("con fecha de examen muestra el plan y abre la tarjeta con la actividad que indica", async () => {
    const exam = new Date(Date.now() + 10 * 86400000);
    const iso = `${exam.getFullYear()}-${String(exam.getMonth() + 1).padStart(2, "0")}-${String(exam.getDate()).padStart(2, "0")}`;
    await click(button("Crear materia"));
    await act(async () => {
      setValue(document.querySelector<HTMLInputElement>('input[placeholder="Ej. Matemáticas"]')!, "Historia");
      setValue(document.querySelector<HTMLInputElement>('.modal input[type="date"]')!, iso);
    });
    await submitForm();
    await click(button("Añadir concepto"));
    await act(async () => { setValue(document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!, "Revolución francesa"); });
    await submitForm();

    expect(container.textContent).toContain("Plan viable");
    expect(container.textContent).toContain("10 días");
    await click(button("Siguiente: Revolución francesa"));
    expect(container.textContent).toContain("Concepto 1 de 1");
    // El plan empieza por recuerdo activo, y la tarjeta se abre con ese método ya elegido.
    expect(document.querySelector<HTMLSelectElement>(".method-select select")!.value).toBe("active-recall");
  });
});


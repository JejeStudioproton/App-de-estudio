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

    // Antes de ver la referencia no se puede valorar: primero hay que prever cuánto se sabe.
    expect(container.textContent).not.toContain("División celular que produce");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Con seguridad"))).toBe(false);
    await click(button("Seguro"));
    expect(container.textContent).toContain("División celular que produce dos células hijas.");
    // La valoración enseña cuándo volverá el concepto y, al elegirla, se guarda sin más pasos.
    expect(button("Con seguridad").textContent).toContain("Próximo repaso: mañana");
    await click(button("Con seguridad"));

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

/** Vuelve a arrancar la app con el estado indicado ya guardado en el navegador. */
async function remountWith(stateJson: unknown) {
  await act(async () => { root.unmount(); });
  localStorage.setItem("forma.state.v3", JSON.stringify(stateJson));
  root = createRoot(container);
  await act(async () => { root.render(<App />); });
}
async function key(k: string, target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}
async function addConcept(title: string, answer: string) {
  await click(button("Añadir concepto"));
  await act(async () => {
    setValue(document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!, title);
    setValue(document.querySelector<HTMLTextAreaElement>('textarea[placeholder="La explicación correcta que usarás para comprobar…"]')!, answer);
  });
  await submitForm();
}
/**
 * Instante a `hour` horas (entre 4 y 23) del día de estudio en curso, desplazado `days` días.
 * El día de estudio empieza a las 4:00, así que de madrugada «hoy» sigue siendo el día anterior.
 */
const iso = (days: number, hour = 12) => {
  const d = new Date(Date.now() - 4 * 3_600_000);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const seedConcept = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, subjectId: "s1", title, explanation: "", prompt: `¿Qué es ${title}?`, answer: `Respuesta de ${title}.`,
  applicationPrompt: "", applicationAnswer: "", tags: [], skillTargets: ["memory"], createdAt: iso(-5), updatedAt: iso(-5),
  mastery: 0.4, memory: 0.4, understanding: 0, application: 0, dueAt: iso(-1), intervalDays: 1, repetitions: 1, lapses: 0,
  lastReviewedAt: iso(-2), confidenceCalibration: 0, importance: 2, ...extra,
});
const seedState = (concepts: unknown[], extra: Record<string, unknown> = {}) => ({
  version: 3, subjects: [{ id: "s1", name: "Historia", description: "", color: "#6f8b7b", archived: false, createdAt: iso(-9), updatedAt: iso(-9) }],
  concepts, reviews: [], settings: {}, createdAt: iso(-9), updatedAt: iso(-9), ...extra,
});
const seedReview = (id: string, conceptId: string, at: string) => ({
  id, conceptId, subjectId: "s1", at, method: "active-recall", skill: "memory", rating: 3, confidence: 1,
  responseSeconds: 5, hintUsed: false, answerQuality: 0.95, errorTags: [],
});

describe("sesión de estudio", () => {
  it("lo que se falla vuelve a salir en la misma sesión y esa repetición no se registra", async () => {
    await createSubject("Historia");
    await addConcept("Alfa", "Respuesta de Alfa.");
    await addConcept("Beta", "Respuesta de Beta.");
    expect(container.textContent).toContain("2 repasos pendientes en esta materia");

    await click(button("Estudiar esta materia"));
    expect(container.textContent).toContain("Concepto 1 de 2");
    const first = document.querySelector(".practice-card h1")!.textContent!;

    await click(button("Poco"));
    expect(button("No lo recordé").textContent).toContain("Vuelve en esta sesión");
    await click(button("No lo recordé"));
    // Fallar pide (sin obligar) clasificar el error antes de seguir.
    expect(container.textContent).toContain("¿Qué crees que pasó?");
    await click(button("Entendí mal la idea"));

    expect(container.textContent).toContain("Concepto 2 de 3");
    expect(container.textContent).toContain("1 por repetir");
    await click(button("Bastante"));
    await click(button("Con dudas"));

    // Tercera tarjeta: la repetición del concepto fallado.
    expect(container.textContent).toContain("Concepto 3 de 3");
    expect(container.textContent).toContain("Segunda vuelta");
    expect(document.querySelector(".practice-card h1")!.textContent).toBe(first);
    expect(document.querySelector(".method-select")).toBeNull();
    await click(button("Mostrar respuesta"));
    await click(button("Ahora sí"));

    expect(container.textContent).toContain("Resumen de la sesión");
    expect(container.textContent).toContain("2 intentos registrados");
    expect(container.textContent).toContain("Repetido en esta sesión");
    expect(container.textContent).toContain("te salió al volver a intentarlo");
    expect(container.textContent).toContain("Hoy llevas 2 repasos");

    const saved = savedState();
    expect(saved.reviews).toHaveLength(2);
    expect(saved.reviews[0]).toMatchObject({ rating: 0, errorKind: "misconception" });
    expect(saved.reviews[0].confidence).toBeCloseTo(1 / 3);
    expect(saved.reviews[1]).toMatchObject({ rating: 2 });
    // El fallado queda para mañana aunque la repetición saliera bien.
    const failed = saved.concepts.find((c: { title: string }) => c.title === first);
    expect(failed).toMatchObject({ intervalDays: 1, repetitions: 0, lapses: 1 });
  });

  it("si la repetición tampoco sale, vuelve a preguntarse y después queda para mañana", async () => {
    await remountWith(seedState([seedConcept("c1", "Alfa")]));
    await click(button("Estudiar ahora"));
    await click(button("Nada"));
    await click(button("Solo en parte"));
    await click(button("Continuar sin clasificar"));

    expect(container.textContent).toContain("Concepto 2 de 2");
    await click(button("Mostrar respuesta"));
    expect(button("Todavía no").textContent).toContain("Vuelve a salir en esta sesión");
    await click(button("Todavía no"));

    expect(container.textContent).toContain("Concepto 3 de 3");
    await click(button("Mostrar respuesta"));
    expect(button("Todavía no").textContent).toContain("Queda para mañana");
    await click(button("Todavía no"));

    expect(container.textContent).toContain("Resumen de la sesión");
    expect(container.textContent).toContain("sin recuperar todavía");
    expect(savedState().reviews).toHaveLength(1);
  });

  it("se puede responder solo con el teclado: 1–4 para prever y para valorar", async () => {
    await remountWith(seedState([seedConcept("c1", "Alfa"), seedConcept("c2", "Beta")]));
    await click(button("Estudiar ahora"));
    expect(container.textContent).not.toContain("Respuesta de Alfa.");

    // Dentro del cuadro de texto los números se escriben, no responden.
    const field = document.querySelector<HTMLTextAreaElement>(".answer-field")!;
    await key("3", field);
    expect(container.textContent).not.toContain("Respuesta de Alfa.");

    await key("3");
    expect(container.textContent).toContain("Respuesta de Alfa.");
    await key("4");
    expect(container.textContent).toContain("Concepto 2 de 2");

    // Un fallo: 1 lo marca, y Intro continúa sin clasificar.
    await key("2");
    await key("1");
    expect(container.textContent).toContain("¿Qué crees que pasó?");
    await key("Enter");
    expect(container.textContent).toContain("Segunda vuelta");
    await key(" ");
    expect(container.textContent).toContain("Respuesta de Beta.");
    await key("2");

    expect(container.textContent).toContain("Resumen de la sesión");
    const saved = savedState();
    expect(saved.reviews.map((r: { rating: number }) => r.rating)).toEqual([3, 0]);
    expect(saved.reviews[0].confidence).toBeCloseTo(2 / 3);
    expect(saved.reviews[1].confidence).toBeCloseTo(1 / 3);
  });

  it("los atajos no actúan mientras hay una ventana abierta", async () => {
    await remountWith(seedState([seedConcept("c1", "Alfa")]));
    await click(button("Estudiar ahora"));
    await click(button("Editar"));
    expect(document.querySelector(".modal")).not.toBeNull();
    await key("3");
    await key("Escape", document);
    expect(document.querySelector(".modal")).toBeNull();
    expect(container.textContent).not.toContain("Respuesta de Alfa.");
  });

  it("«Deshacer» retira la última respuesta y devuelve el concepto a como estaba", async () => {
    const before = seedConcept("c1", "Alfa");
    await remountWith(seedState([before, seedConcept("c2", "Beta")]));
    await click(button("Estudiar ahora"));
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Deshacer"))).toBe(false);
    await click(button("Seguro"));
    await click(button("Con seguridad"));
    expect(container.textContent).toContain("Concepto 2 de 2");
    expect(savedState().reviews).toHaveLength(1);

    await click(button("Deshacer"));
    expect(container.textContent).toContain("Concepto 1 de 2");
    const saved = savedState();
    expect(saved.reviews).toHaveLength(0);
    expect(saved.concepts.find((c: { id: string }) => c.id === "c1")).toMatchObject({
      dueAt: before.dueAt, intervalDays: 1, repetitions: 1, mastery: 0.4, lastReviewedAt: before.lastReviewedAt,
    });
    // Solo se deshace un paso.
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Deshacer"))).toBe(false);
  });

  it("con «ver la respuesta sin escribir» desactivado, hay que escribir antes de ver la referencia", async () => {
    await remountWith(seedState([seedConcept("c1", "Alfa")], { settings: { showHints: false } }));
    await click(button("Estudiar ahora"));
    expect(button("Seguro").disabled).toBe(true);
    await key("4");
    expect(container.textContent).not.toContain("Respuesta de Alfa.");

    await act(async () => { setValue(document.querySelector<HTMLTextAreaElement>(".answer-field")!, "mi intento"); });
    expect(button("Seguro").disabled).toBe(false);
    await click(button("Seguro"));
    expect(container.textContent).toContain("Tu respuesta");
    expect(container.textContent).toContain("mi intento");
    await click(button("Con seguridad"));
    expect(savedState().reviews[0]).toMatchObject({ note: "mi intento", hintUsed: false });
  });

  it("acertar el mismo día no adelanta la fecha de repaso y la tarjeta lo avisa", async () => {
    const c = seedConcept("c1", "Alfa", { dueAt: iso(1, 4), lastReviewedAt: new Date().toISOString() });
    await remountWith(seedState([c], { reviews: [seedReview("r0", "c1", new Date().toISOString())] }));
    await click(button("Repaso extra"));
    await click(button("Seguro"));
    expect(button("Con seguridad").textContent).toContain("No cambia la fecha");
    await click(button("Con seguridad"));
    expect(savedState().concepts[0]).toMatchObject({ dueAt: c.dueAt, intervalDays: 1, repetitions: 1 });
  });
});

describe("inicio: lo que toca hoy", () => {
  it("la materia de ejemplo deja la app lista para estudiar en un paso", async () => {
    await click(button("Probar con un ejemplo"));
    const saved = savedState();
    expect(saved.subjects).toHaveLength(1);
    expect(saved.concepts.length).toBeGreaterThanOrEqual(5);
    expect(container.textContent).toContain(`Hoy te tocan ${saved.concepts.length} repasos.`);
    expect(container.textContent).toContain("Tu plan de hoy");
    await click(button("Estudiar ahora"));
    expect(container.textContent).toContain(`Concepto 1 de ${saved.concepts.length}`);
  });

  it("cuenta lo pendiente aunque venza más tarde hoy, lo hecho hoy y la racha", async () => {
    await remountWith(seedState(
      [seedConcept("c1", "Alfa", { dueAt: iso(0, 23) }), seedConcept("c2", "Beta", { dueAt: iso(3) })],
      { reviews: [seedReview("r1", "c2", iso(-1)), seedReview("r2", "c2", new Date().toISOString())] },
    ));
    expect(container.textContent).toContain("Hoy te toca 1 repaso.");
    expect(container.textContent).toContain("Hoy llevas 1 repaso hecho.");
    const cards = Array.from(document.querySelectorAll(".stat-card")).map((x) => x.textContent ?? "");
    expect(cards[0]).toContain("Para hoy1");
    expect(cards[1]).toContain("Hechos hoy1");
    expect(cards[2]).toContain("2 días");
    expect(document.querySelectorAll(".week-day")).toHaveLength(7);
    expect(document.querySelectorAll(".week-day.studied").length).toBe(2);
  });

  it("sin nada pendiente lo dice, indica el próximo repaso y ofrece un repaso extra", async () => {
    await remountWith(seedState(
      [seedConcept("c1", "Alfa", { dueAt: iso(1, 5) }), seedConcept("c2", "Beta", { dueAt: iso(1, 5) })],
      { reviews: [seedReview("r1", "c1", new Date().toISOString())] },
    ));
    expect(container.textContent).toContain("Hoy ya está todo repasado.");
    expect(container.textContent).toContain("El próximo repaso es mañana: 2 conceptos.");
    expect(container.textContent).toContain("Vas al día");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Estudiar ahora"))).toBe(false);
    await click(button("Empezar repaso extra"));
    expect(container.textContent).toContain("Concepto 1 de 2");
  });
});

describe("materia", () => {
  it("permite repasar la materia entera, más allá del tamaño normal de sesión", async () => {
    const many = Array.from({ length: 10 }, (_, i) => seedConcept(`c${i}`, `Tema ${i}`));
    await remountWith(seedState(many));
    await click(document.querySelector(".subject-mini")!);
    expect(container.textContent).toContain("10 repasos pendientes en esta materia");
    expect(container.textContent).toContain("toca hoy");
    await click(button("Estudiar esta materia"));
    expect(container.textContent).toContain("Concepto 1 de 8");
    await click(button("Salir de la sesión"));

    await click(document.querySelector(".subject-mini")!);
    await click(button("Repasarla entera (10)"));
    expect(container.textContent).toContain("Concepto 1 de 10");
  });

  it("«Guardar y añadir otro» deja el formulario listo para el siguiente concepto", async () => {
    await createSubject("Historia");
    await click(button("Añadir concepto"));
    const titleField = () => document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!;
    const answerField = () => document.querySelector<HTMLTextAreaElement>('textarea[placeholder="La explicación correcta que usarás para comprobar…"]')!;
    await act(async () => { setValue(titleField(), "Primero"); setValue(answerField(), "Uno."); });
    await click(button("Guardar y añadir otro"));

    expect(document.querySelector(".modal")).not.toBeNull();
    expect(titleField().value).toBe("");
    expect(answerField().value).toBe("");
    expect(savedState().concepts.map((c: { title: string }) => c.title)).toEqual(["Primero"]);

    // Sin nombre no se guarda nada.
    await click(button("Guardar y añadir otro"));
    expect(savedState().concepts).toHaveLength(1);

    await act(async () => { setValue(titleField(), "Segundo"); });
    await submitForm();
    expect(document.querySelector(".modal")).toBeNull();
    expect(savedState().concepts.map((c: { title: string }) => c.title).sort()).toEqual(["Primero", "Segundo"]);
  });
});


const choiceButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".choice-option"));
/** Respuesta de referencia del concepto que muestra la tarjeta (los sembrados usan «Respuesta de <título>.»). */
const cardAnswer = () => `Respuesta de ${document.querySelector(".practice-card h1")!.textContent}.`;
const subjectSeed = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, description: "", color: "#6f8b7b", archived: false, createdAt: iso(-9), updatedAt: iso(-9), ...extra,
});

describe("tipo test", () => {
  const four = () => ["Alfa", "Beta", "Gamma", "Delta"].map((t, i) => seedConcept(`c${i}`, t));

  it("corrige solo: acertar tras prever que se sabe cuenta como «Con seguridad» y la tarjeta siguiente vuelve al método normal", async () => {
    await remountWith(seedState(four()));
    await click(button("Estudiar ahora"));
    const select = document.querySelector<HTMLSelectElement>(".method-select select")!;
    expect(select.querySelector('option[value="multiple-choice"]')).not.toBeNull();
    await act(async () => { setSelect(select, "multiple-choice"); });

    // Primero se prevé; las opciones no se ven hasta entonces.
    expect(document.querySelector(".answer-field")).toBeNull();
    expect(choiceButtons()).toHaveLength(0);
    await click(button("Bastante"));
    const options = choiceButtons();
    expect(options).toHaveLength(4);
    expect(new Set(options.map((o) => o.textContent)).size).toBe(4);

    const answer = cardAnswer();
    await click(options.find((o) => o.textContent!.includes(answer))!);
    expect(container.textContent).toContain("Correcto.");
    expect(container.textContent).toContain("Cuenta como «Con seguridad».");
    expect(document.querySelectorAll(".choice-option.is-correct")).toHaveLength(1);
    expect(document.querySelectorAll(".choice-option.is-wrong")).toHaveLength(0);
    expect(choiceButtons().every((o) => o.disabled)).toBe(true);
    await click(button("Continuar"));

    const saved = savedState();
    expect(saved.reviews).toHaveLength(1);
    expect(saved.reviews[0]).toMatchObject({ method: "multiple-choice", rating: 3, hintUsed: false });
    expect(saved.reviews[0].confidence).toBeCloseTo(2 / 3);
    // El método elegido a mano vale para esa tarjeta: la siguiente vuelve a ser de recuerdo.
    expect(container.textContent).toContain("Concepto 2 de 4");
    expect(document.querySelector(".answer-field")).not.toBeNull();
  });

  it("un test de la materia pregunta todo con opciones; lo fallado se repite sin opciones", async () => {
    await remountWith(seedState(four()));
    await click(document.querySelector(".subject-mini")!);
    await click(button("Hacer un test"));
    expect(container.textContent).toContain("Concepto 1 de 4");
    expect(container.textContent).toContain("Tipo test");
    const failedTitle = document.querySelector(".practice-card h1")!.textContent!;

    // Primera: se elige una opción incorrecta.
    await click(button("Seguro"));
    const wrongAnswer = cardAnswer();
    await click(choiceButtons().find((o) => !o.textContent!.includes(wrongAnswer))!);
    expect(container.textContent).toContain("No era esa.");
    expect(document.querySelectorAll(".choice-option.is-correct")).toHaveLength(1);
    expect(document.querySelectorAll(".choice-option.is-wrong")).toHaveLength(1);
    // La referencia completa se muestra para corregirse.
    expect(document.querySelector(".reference-box")!.textContent).toContain(wrongAnswer);
    await click(button("Continuar sin clasificar"));

    // Las tres siguientes, con teclado: prever «Nada», elegir la correcta por su número e Intro.
    for (let n = 2; n <= 4; n++) {
      expect(container.textContent).toContain(`Concepto ${n} de 5`);
      await key("1");
      const answer = cardAnswer();
      const index = choiceButtons().findIndex((o) => o.textContent!.includes(answer));
      expect(index).toBeGreaterThanOrEqual(0);
      await key(String(index + 1));
      expect(container.textContent).toContain("cuenta como «Con dudas»");
      await key("Enter");
    }

    // La repetición del fallo es de recuerdo, sin opciones.
    expect(container.textContent).toContain("Segunda vuelta");
    expect(document.querySelector(".practice-card h1")!.textContent).toBe(failedTitle);
    expect(choiceButtons()).toHaveLength(0);
    await click(button("Mostrar respuesta"));
    await click(button("Ahora sí"));

    const saved = savedState();
    expect(saved.reviews.map((r: { rating: number }) => r.rating)).toEqual([0, 2, 2, 2]);
    expect(saved.reviews.every((r: { method: string }) => r.method === "multiple-choice")).toBe(true);
    expect(saved.reviews[0].confidence).toBe(1);
    expect(saved.reviews[1].confidence).toBe(0);
  });

  it("no se ofrece cuando la materia no tiene respuestas suficientes para hacer de opciones", async () => {
    await remountWith(seedState([seedConcept("c0", "Alfa"), seedConcept("c1", "Beta")]));
    await click(document.querySelector(".subject-mini")!);
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Hacer un test"))).toBe(false);
    await click(button("Estudiar esta materia"));
    expect(document.querySelector('.method-select option[value="multiple-choice"]')).toBeNull();
  });

  it("usa las respuestas incorrectas escritas en el concepto, aunque sea el único de la materia", async () => {
    await createSubject("Geografía");
    await click(button("Añadir concepto"));
    await act(async () => {
      setValue(document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!, "Capital de Francia");
      setValue(document.querySelector<HTMLTextAreaElement>('textarea[placeholder="La explicación correcta que usarás para comprobar…"]')!, "París");
      setValue(document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Una respuesta falsa"]')!, "Lyon\nMarsella\n\nlyon");
    });
    await submitForm();
    expect(savedState().concepts[0]).toMatchObject({ choices: ["París", "Lyon", "Marsella"], correctChoice: 0 });

    await click(button("Estudiar esta materia"));
    await act(async () => { setSelect(document.querySelector<HTMLSelectElement>(".method-select select")!, "multiple-choice"); });
    await click(button("Poco"));
    expect(choiceButtons().map((o) => o.textContent!.replace(/^\d/, "").trim()).sort()).toEqual(["Lyon", "Marsella", "París"]);
  });
});

describe("materias archivadas", () => {
  it("archivar retira la materia de los repasos sin borrar nada, y se puede recuperar", async () => {
    const state = seedState(
      [seedConcept("c0", "Alfa"), seedConcept("c1", "Beta"), seedConcept("c2", "Gamma", { subjectId: "s2" })],
      { subjects: [subjectSeed("s1", "Historia"), subjectSeed("s2", "Química")] },
    );
    await remountWith(state);
    expect(container.textContent).toContain("Hoy te tocan 3 repasos.");

    await click(Array.from(document.querySelectorAll(".subject-mini")).find((x) => x.textContent!.includes("Historia"))!);
    await click(button("Archivar materia"));
    expect(container.textContent).toContain("Materias archivadas (1)");
    expect(document.querySelectorAll(".subject-card")).toHaveLength(1);
    let saved = savedState();
    expect(saved.subjects.find((s: { id: string }) => s.id === "s1").archived).toBe(true);
    expect(saved.concepts).toHaveLength(3);

    await click(button("Inicio"));
    expect(container.textContent).toContain("Hoy te toca 1 repaso.");
    await click(button("Estudiar ahora"));
    expect(container.textContent).toContain("Concepto 1 de 1");
    expect(document.querySelector(".practice-card h1")!.textContent).toBe("Gamma");
    await click(button("Salir de la sesión"));

    await click(button("Materias"));
    await click(button("Recuperar"));
    expect(document.querySelectorAll(".subject-card")).toHaveLength(2);
    expect(container.textContent).not.toContain("Materias archivadas");
    saved = savedState();
    expect(saved.subjects.every((s: { archived: boolean }) => !s.archived)).toBe(true);
    await click(button("Inicio"));
    expect(container.textContent).toContain("Hoy te tocan 3 repasos.");
  });
});

describe("conceptos repetidos", () => {
  it("avisa al escribir un nombre que ya existe en la materia, sin impedir guardarlo", async () => {
    await createSubject("Biología");
    await addConcept("Mitosis", "División celular.");
    await click(button("Añadir concepto"));
    const title = document.querySelector<HTMLInputElement>('input[placeholder="Ej. Teorema de Pitágoras"]')!;
    await act(async () => { setValue(title, "  mitosis "); });
    expect(document.querySelector(".field-warning")!.textContent).toContain("Ya tienes un concepto llamado «Mitosis»");
    await act(async () => { setValue(title, "Meiosis"); });
    expect(document.querySelector(".field-warning")).toBeNull();

    // Al editar un concepto, su propio nombre no cuenta como repetido.
    await submitForm();
    await click(document.querySelector('[aria-label="Editar Mitosis"]')!);
    expect(document.querySelector(".field-warning")).toBeNull();
  });

  it("al importar señala los borradores que ya existen y permite desmarcarlos de una vez", async () => {
    await createSubject("Biología");
    await click(button("Importar"));
    await act(async () => { setValue(document.querySelector<HTMLTextAreaElement>("#import-text")!, NOTES); });
    const [first] = draftTitles();
    await click(button("Guardar 2 conceptos"));
    expect(savedState().concepts).toHaveLength(2);

    // Segunda importación del mismo texto en la misma materia.
    await click(button("Importar"));
    await act(async () => { setValue(document.querySelector<HTMLTextAreaElement>("#import-text")!, NOTES); });
    expect(draftTitles()[0]).toBe(first);
    expect(Array.from(document.querySelectorAll(".draft-flag")).filter((x) => x.textContent === "Ya existe en esta materia")).toHaveLength(2);
    expect(container.ownerDocument.body.textContent).toContain("2 borradores marcados repiten conceptos que ya tienes");
    await click(button("Desmarcar repetidos"));
    expect(document.querySelectorAll(".draft-item.draft-off")).toHaveLength(2);
    expect(document.querySelector(".duplicate-note")).toBeNull();
    expect(savedState().concepts).toHaveLength(2);
  });
});

describe("copia de seguridad y ajustes", () => {
  const ten = () => Array.from({ length: 10 }, (_, i) => seedConcept(`c${i}`, `Tema ${i}`));

  it("recuerda guardar una copia cuando hay trabajo acumulado y «Ahora no» lo pospone", async () => {
    await remountWith(seedState(ten()));
    expect(container.textContent).toContain("Guarda una copia de tus datos");
    expect(container.textContent).toContain("Todavía no has exportado ninguna copia.");
    await click(button("Ahora no"));
    expect(container.textContent).not.toContain("Guarda una copia de tus datos");
    expect(Date.parse(savedState().backupSnoozedUntil)).toBeGreaterThan(Date.now());
  });

  it("exportar anota la fecha de la copia y el recordatorio desaparece", async () => {
    const create = vi.fn(() => "blob:forma");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await remountWith(seedState(ten(), { lastBackupAt: iso(-30) }));
    expect(container.textContent).toContain("Tu última copia es de hace");
    await click(button("Exportar copia"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("Guarda una copia de tus datos");
    expect(Date.now() - Date.parse(savedState().lastBackupAt)).toBeLessThan(60_000);
    clickSpy.mockRestore();
  });

  it("con pocos datos no molesta", async () => {
    await remountWith(seedState([seedConcept("c0", "Alfa")]));
    expect(container.textContent).not.toContain("Guarda una copia de tus datos");
  });

  it("«Reducir animaciones» se guarda y se aplica a toda la app", async () => {
    await click(button("Configuración"));
    expect(document.querySelector(".app.reduce-motion")).toBeNull();
    const row = Array.from(document.querySelectorAll(".setting-row")).find((x) => x.textContent!.includes("Reducir animaciones"))!;
    await click(row.querySelector('input[type="checkbox"]')!);
    expect(document.querySelector(".app.reduce-motion")).not.toBeNull();
    expect(savedState().settings.reducedMotion).toBe(true);
  });
});

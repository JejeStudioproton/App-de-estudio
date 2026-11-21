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

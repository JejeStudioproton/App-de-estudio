import type { Concept } from "./domain";

/** Opciones que se muestran como máximo en una pregunta tipo test. */
export const MAX_OPTIONS = 4;
/** Con menos opciones que estas no se ofrece el tipo test. */
export const MIN_OPTIONS = 3;
/** Las respuestas largas se recortan a esta longitud, todas por igual, para que la longitud no delate la correcta. */
export const MAX_OPTION_CHARS = 220;
/** De entre cuántas respuestas parecidas se eligen al azar las incorrectas. */
const CANDIDATE_WINDOW = 6;

export type ChoiceSet = { options: string[]; correct: number };

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export function clipOption(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_OPTION_CHARS) return clean;
  const cut = clean.slice(0, MAX_OPTION_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_OPTION_CHARS * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

const correctText = (c: Concept) => clipOption(c.answer || c.explanation || "");

/** Respuestas incorrectas escritas por el estudiante para este concepto (las opciones guardadas menos la correcta). */
export function authoredDistractors(c: Concept): string[] {
  if (!Array.isArray(c.choices)) return [];
  const correct = key(correctText(c));
  const seen = new Set<string>([correct]);
  const out: string[] = [];
  c.choices.forEach((choice, i) => {
    if (typeof choice !== "string" || i === c.correctChoice) return;
    const text = clipOption(choice);
    const k = key(text);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(text);
  });
  return out;
}

/**
 * Respuestas de otros conceptos de la misma materia que pueden servir de opción incorrecta,
 * de la más parecida a la menos: primero las que comparten etiquetas, después las de longitud similar.
 */
function borrowedDistractors(c: Concept, pool: Concept[], exclude: Set<string>): { text: string; shared: number }[] {
  const correct = correctText(c);
  const tags = new Set(c.tags.map(key));
  const seen = new Set(exclude);
  return pool
    .filter((o) => o.id !== c.id && o.subjectId === c.subjectId)
    .map((o) => ({ id: o.id, text: correctText(o), shared: o.tags.filter((t) => tags.has(key(t))).length }))
    .filter((o) => {
      const k = key(o.text);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        Math.abs(a.text.length - correct.length) - Math.abs(b.text.length - correct.length) ||
        a.id.localeCompare(b.id),
    )
    .map(({ text, shared }) => ({ text, shared }));
}

function distractorPool(c: Concept, pool: Concept[]): { authored: string[]; borrowed: { text: string; shared: number }[] } {
  const authored = authoredDistractors(c);
  const exclude = new Set([key(correctText(c)), ...authored.map(key)]);
  return { authored, borrowed: borrowedDistractors(c, pool, exclude) };
}

/** ¿Se puede preguntar este concepto como tipo test? Hace falta una respuesta y al menos dos opciones incorrectas distintas. */
export function canBuildChoices(c: Concept, pool: Concept[]): boolean {
  if (!key(correctText(c))) return false;
  const { authored, borrowed } = distractorPool(c, pool);
  return authored.length + borrowed.length >= MIN_OPTIONS - 1;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Opciones de una pregunta tipo test: la respuesta del concepto y hasta tres incorrectas.
 * Las incorrectas son las que el estudiante escribió y, si faltan, respuestas de otros conceptos de la misma materia.
 */
export function buildChoices(c: Concept, pool: Concept[], rng: () => number = Math.random): ChoiceSet | null {
  if (!canBuildChoices(c, pool)) return null;
  const { authored, borrowed } = distractorPool(c, pool);
  const wanted = MAX_OPTIONS - 1;
  const own = authored.length > wanted ? shuffle(authored, rng).slice(0, wanted) : authored;
  const missing = wanted - own.length;
  // Si hay bastantes respuestas del mismo tema (mismas etiquetas), solo se usan esas: son las más fáciles de confundir.
  const sameTopic = borrowed.filter((o) => o.shared > 0);
  const candidates = (sameTopic.length >= missing ? sameTopic : borrowed).slice(0, CANDIDATE_WINDOW).map((o) => o.text);
  const extra = missing > 0 ? shuffle(candidates, rng).slice(0, missing) : [];
  const correct = correctText(c);
  const options = shuffle([correct, ...own, ...extra], rng);
  return { options, correct: options.indexOf(correct) };
}

/** Convierte lo escrito en el formulario (una respuesta incorrecta por línea) en las opciones que se guardan con el concepto. */
export function choicesFromForm(answer: string, wrongLines: string): Pick<Concept, "choices" | "correctChoice"> {
  const correct = answer.trim();
  const seen = new Set<string>([key(correct)]);
  const wrong: string[] = [];
  for (const line of wrongLines.split("\n")) {
    const text = line.trim();
    const k = key(text);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    wrong.push(text.slice(0, 400));
    if (wrong.length >= 8) break;
  }
  if (!correct || !wrong.length) return { choices: undefined, correctChoice: undefined };
  return { choices: [correct, ...wrong], correctChoice: 0 };
}

/** Texto para el campo del formulario a partir de las opciones guardadas. */
export function wrongLinesOf(c: Concept | undefined): string {
  if (!c || !Array.isArray(c.choices)) return "";
  return c.choices.filter((choice, i) => typeof choice === "string" && i !== c.correctChoice).join("\n");
}

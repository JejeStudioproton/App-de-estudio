import type { Concept } from "./domain";

export const MAX_TITLE = 120;
export type ConceptEdit = Partial<Pick<Concept, "subjectId" | "title" | "prompt" | "answer" | "applicationPrompt" | "applicationAnswer" | "importance" | "tags">>;
export type ConceptEditResult = { ok: true; concept: Concept } | { ok: false; error: string };

const cleanTags = (tags: string[]) => [...new Set(tags.map(t => t.trim()).filter(Boolean))];

/**
 * Aplica una edición a un concepto sin tocar su progreso (dominio, intervalos, repasos, fuente, fechas).
 * Si la «explicación» coincidía con la respuesta anterior (caso de los conceptos creados a mano), se mantiene sincronizada.
 */
export function applyConceptEdit(concept: Concept, edit: ConceptEdit, now: string = new Date().toISOString()): ConceptEditResult {
  const title = (edit.title ?? concept.title).trim();
  if (!title) return { ok: false, error: "El nombre del concepto no puede estar vacío." };
  if (title.length > MAX_TITLE) return { ok: false, error: `El nombre admite como máximo ${MAX_TITLE} caracteres.` };
  const subjectId = edit.subjectId ?? concept.subjectId;
  if (!subjectId) return { ok: false, error: "Elige una materia." };
  const answer = edit.answer ?? concept.answer;
  const explanationFollowsAnswer = concept.explanation === concept.answer;
  const importance = edit.importance === 1 || edit.importance === 2 || edit.importance === 3 ? edit.importance : concept.importance;
  return {
    ok: true,
    concept: {
      ...concept, subjectId, title, answer,
      prompt: edit.prompt ?? concept.prompt,
      applicationPrompt: edit.applicationPrompt ?? concept.applicationPrompt,
      applicationAnswer: edit.applicationAnswer ?? concept.applicationAnswer,
      explanation: explanationFollowsAnswer ? answer : concept.explanation,
      tags: edit.tags ? cleanTags(edit.tags) : concept.tags,
      importance, updatedAt: now
    }
  };
}

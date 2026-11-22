import type { Concept } from "./domain";

/** Forma comparable de un título: sin tildes, mayúsculas, signos ni espacios repetidos. */
export function titleKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Concepto de la misma materia con el mismo título (ignorando tildes, mayúsculas y signos), si lo hay. */
export function findDuplicate(title: string, subjectId: string, concepts: Concept[], exceptId?: string): Concept | undefined {
  const k = titleKey(title);
  if (!k || !subjectId) return undefined;
  return concepts.find((c) => c.subjectId === subjectId && c.id !== exceptId && titleKey(c.title) === k);
}

export type DraftDuplicate = "existing" | "repeated" | undefined;

/**
 * Para cada borrador de una importación: si ya existe un concepto con ese título en la materia de destino («existing»)
 * o si repite el título de un borrador marcado anterior de la misma lista («repeated»).
 */
export function draftDuplicates(drafts: { title: string; checked: boolean }[], subjectId: string, concepts: Concept[]): DraftDuplicate[] {
  const existing = new Set(concepts.filter((c) => c.subjectId === subjectId).map((c) => titleKey(c.title)));
  const seen = new Set<string>();
  return drafts.map((d) => {
    const k = titleKey(d.title);
    if (!k) return undefined;
    if (subjectId && existing.has(k)) return "existing";
    if (seen.has(k)) return "repeated";
    if (d.checked) seen.add(k);
    return undefined;
  });
}

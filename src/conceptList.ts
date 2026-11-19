import type { Concept } from "./domain";

export type ConceptSort = "default" | "mastery-asc" | "title" | "recent";

export const CONCEPT_SORT_LABELS: Record<ConceptSort, string> = {
  default: "Orden de creación",
  "mastery-asc": "Dominio más bajo primero",
  title: "Título A–Z",
  recent: "Repasados hace menos"
};

/** Minúsculas y sin tildes, para que «osmosis» encuentre «Ósmosis». */
export const normalizeText = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const haystack = (c: Concept): string => normalizeText([c.title, c.prompt, c.answer, c.explanation, ...(c.tags ?? [])].filter(Boolean).join(" "));

/**
 * Filtra por texto (todas las palabras deben aparecer) y ordena. Función pura: no modifica la entrada.
 * Los conceptos sin repasar van siempre al final en «recent» (no hay dato que ordenar).
 */
export function filterAndSortConcepts(concepts: Concept[], query: string, sort: ConceptSort = "default"): Concept[] {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  const list = words.length ? concepts.filter(c => { const h = haystack(c); return words.every(w => h.includes(w)); }) : [...concepts];
  switch (sort) {
    case "mastery-asc": return list.sort((a, b) => a.mastery - b.mastery);
    case "title": return list.sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }));
    case "recent": return list.sort((a, b) => {
      const ta = a.lastReviewedAt ? Date.parse(a.lastReviewedAt) : NaN, tb = b.lastReviewedAt ? Date.parse(b.lastReviewedAt) : NaN;
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return tb - ta;
    });
    default: return list;
  }
}

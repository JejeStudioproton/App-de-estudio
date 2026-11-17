import type { Concept, ErrorKind, Method, Rating, ReviewEvent, Skill } from "./domain";
import { createConcept } from "./engine";

let seq = 0;
/** Crea un intento de repaso para pruebas. `minute` ordena los eventos dentro del día base. */
export function ev(p: Partial<ReviewEvent> & { rating: Rating; day?: string; minute?: number }): ReviewEvent {
  const { day = "2026-03-01", minute = seq, ...rest } = p;
  seq++;
  const rating = p.rating;
  return {
    id: `r${seq}`, conceptId: "c1", subjectId: "s1", at: new Date(Date.parse(`${day}T10:00:00Z`) + minute * 60000).toISOString(),
    method: "active-recall" as Method, skill: "memory" as Skill, confidence: 0.5, responseSeconds: 0, hintUsed: false,
    answerQuality: rating === 0 ? 0.1 : rating === 1 ? 0.3 : rating === 2 ? 0.65 : 0.95, errorTags: [],
    ...rest, rating
  } as ReviewEvent;
}
export const withKind = (kind: ErrorKind) => ({ errorKind: kind });
export function concept(p: Partial<Concept> & { title: string }): Concept {
  return createConcept({ subjectId: "s1", ...p });
}

import type { Concept, Method, Skill } from "./domain";
import { SKILLS } from "./domain";

export function skillScore(c: Concept, skill: Skill): number {
  return skill === "memory" ? c.memory : skill === "understanding" ? c.understanding : c.application;
}

/** Habilidad con menor puntuación actual. Un 0 significa "aún sin medir" o "fallada", no necesariamente un mal resultado. */
export function selectSkill(c: Concept): Skill {
  return SKILLS.map(skill => ({ skill, score: skillScore(c, skill) })).sort((a, b) => a.score - b.score)[0].skill;
}

/**
 * Habilidad que ejercita cada método. Sirve para que la evidencia quede atribuida
 * a la habilidad realmente practicada cuando el estudiante cambia el método propuesto.
 * `worked-example` se agrupa con comprensión; `application` es la práctica aplicada.
 */
export function skillForMethod(method: Method): Skill {
  if (method === "active-recall" || method === "multiple-choice") return "memory";
  if (method === "explanation" || method === "worked-example") return "understanding";
  return "application";
}

/**
 * Resuelve la habilidad de un intento. Si el estudiante mantiene el método recomendado,
 * se conserva la habilidad objetivo del plan (que puede ser «aplicación» con un ejemplo
 * resuelto). Si elige otro método, la evidencia se atribuye a la habilidad de ese método
 * para no registrar, por ejemplo, «aplicación» como si fuera recuerdo.
 */
export function resolveReviewSkill(
  suggestedSkill: Skill | undefined,
  suggestedMethod: Method | undefined,
  chosenMethod: Method,
): Skill {
  if (chosenMethod !== suggestedMethod) return skillForMethod(chosenMethod);
  return suggestedSkill ?? skillForMethod(chosenMethod);
}

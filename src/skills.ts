import type { Concept, Skill } from "./domain";
import { SKILLS } from "./domain";

export function skillScore(c: Concept, skill: Skill): number {
  return skill === "memory" ? c.memory : skill === "understanding" ? c.understanding : c.application;
}

/** Habilidad con menor puntuación actual. Un 0 significa "aún sin medir" o "fallada", no necesariamente un mal resultado. */
export function selectSkill(c: Concept): Skill {
  return SKILLS.map(skill => ({ skill, score: skillScore(c, skill) })).sort((a, b) => a.score - b.score)[0].skill;
}

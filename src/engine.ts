import type { AppState, Concept, Method, MethodEvidence, Rating, ReviewEvent, Settings, Skill, StudyPlanItem, Subject } from "./domain";
import { METHODS, SKILLS } from "./domain";

export const DEFAULT_SETTINGS: Settings = { dailyMinutes: 25, sessionLength: 8, showHints: true, reducedMotion: false, aiMode: "off", theme: "light", sound: false };
export const COLORS = ["#6f8b7b", "#c18b65", "#7f8bb4", "#b57e91", "#7c9ba3", "#a69b6b"];
const nowISO = () => new Date().toISOString();
export const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;

export function createSubject(name: string, description = "", examDate?: string): Subject {
  const now = nowISO();
  return { id: uid("sub"), name: name.trim(), description: description.trim(), examDate, color: COLORS[Math.floor(Math.random()*COLORS.length)], createdAt: now, updatedAt: now, archived: false };
}
export function createConcept(input: Partial<Concept> & Pick<Concept,"subjectId"|"title">): Concept {
  const now = nowISO();
  return {
    id: input.id ?? uid("con"), subjectId: input.subjectId, title: input.title.trim(),
    explanation: input.explanation ?? "", prompt: input.prompt ?? `¿Qué recuerdas sobre «${input.title.trim()}»?`,
    answer: input.answer ?? input.explanation ?? "", applicationPrompt: input.applicationPrompt ?? `¿Cómo aplicarías «${input.title.trim()}» en un caso nuevo?`,
    applicationAnswer: input.applicationAnswer ?? "", choices: input.choices, correctChoice: input.correctChoice,
    source: input.source, tags: input.tags ?? [], skillTargets: input.skillTargets ?? ["memory","understanding"],
    createdAt: input.createdAt ?? now, updatedAt: now, mastery: input.mastery ?? 0, memory: input.memory ?? 0,
    understanding: input.understanding ?? 0, application: input.application ?? 0, dueAt: input.dueAt ?? now,
    intervalDays: input.intervalDays ?? 0, repetitions: input.repetitions ?? 0, lapses: input.lapses ?? 0,
    lastReviewedAt: input.lastReviewedAt, lastMethod: input.lastMethod, confidenceCalibration: input.confidenceCalibration ?? 0
  };
}
export function initialState(): AppState {
  const now = nowISO();
  return { version: 3, subjects: [], concepts: [], reviews: [], settings: { ...DEFAULT_SETTINGS }, createdAt: now, updatedAt: now };
}
export function normalizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") return initialState();
  const data = raw as Partial<AppState>;
  const subjects = Array.isArray(data.subjects) ? data.subjects.filter(s => s && typeof s.name === "string").map(s => ({ ...s, description: s.description ?? "", archived: !!s.archived, color: s.color || COLORS[0] })) : [];
  const concepts = Array.isArray(data.concepts) ? data.concepts.filter(c => c && typeof c.title === "string" && typeof c.subjectId === "string").map(c => createConcept(c)) : [];
  const reviews = Array.isArray(data.reviews) ? data.reviews.filter(r => r && typeof r.conceptId === "string" && typeof r.rating === "number") : [];
  return { version: 3, subjects, concepts, reviews, activeSubjectId: data.activeSubjectId, settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }, createdAt: data.createdAt ?? nowISO(), updatedAt: nowISO() };
}
export function dueCount(concepts: Concept[], now = Date.now()): number {
  return concepts.filter(c => Date.parse(c.dueAt) <= now).length;
}
export function daysUntil(date?: string, now = new Date()): number | undefined {
  if (!date) return undefined;
  return Math.ceil((new Date(`${date}T23:59:59`).getTime() - now.getTime()) / 86400000);
}
export function skillScore(c: Concept, skill: Skill): number {
  return skill === "memory" ? c.memory : skill === "understanding" ? c.understanding : c.application;
}
export function selectSkill(c: Concept): Skill {
  return SKILLS.map(skill => ({ skill, score: skillScore(c, skill) })).sort((a,b) => a.score-b.score)[0].skill;
}
export function methodFor(skill: Skill, concept: Concept, evidence: MethodEvidence[]): Method {
  const options: Method[] = skill === "memory" ? ["active-recall","multiple-choice"] :
    skill === "understanding" ? ["explanation","worked-example"] : ["application","worked-example"];
  const data = options.map(method => {
    const e = evidence.find(x => x.method === method && x.skill === skill);
    const score = e && e.observations >= 3 ? e.meanScore : 0.5;
    const confidencePenalty = e && e.observations >= 3 ? Math.max(0, e.confidenceGap) * 0.15 : 0;
    const familiarity = concept.lastMethod === method ? 0.06 : 0;
    return { method, value: score - confidencePenalty - familiarity };
  }).sort((a,b) => b.value-a.value);
  return data[0]?.method ?? options[0];
}
export function planSession(concepts: Concept[], reviews: ReviewEvent[], minutes = 25, now = Date.now()): StudyPlanItem[] {
  const active = concepts.filter(c => !!c.title.trim());
  const evidence = aggregateEvidence(reviews);
  const budget = Math.max(1, Math.floor(minutes / 3));
  return active.map(c => {
    const skill = selectSkill(c);
    const due = Date.parse(c.dueAt) <= now;
    const age = c.lastReviewedAt ? Math.max(0, (now - Date.parse(c.lastReviewedAt))/86400000) : 10;
    const weak = 1 - skillScore(c, skill);
    const urgency = due ? 1 : 0;
    const priority = urgency*4 + weak*2 + Math.min(age/7,1) + (c.lapses ? Math.min(c.lapses*0.08,0.5) : 0);
    return { conceptId: c.id, reason: due ? "Repaso pendiente" : skillScore(c,skill) < 0.5 ? `Refuerza ${skill}` : "Consolidación", priority, suggestedMethod: methodFor(skill,c,evidence), suggestedSkill: skill };
  }).sort((a,b) => b.priority-a.priority).slice(0,budget);
}
export function scheduleReview(c: Concept, rating: Rating, now = new Date()): Pick<Concept,"dueAt"|"intervalDays"|"repetitions"|"lapses"> {
  let interval = c.intervalDays, reps = c.repetitions, lapses = c.lapses;
  if (rating <= 1) { interval = 1; reps = 0; lapses += 1; }
  else if (rating === 2) { interval = Math.max(1, Math.round(interval * 1.35) || 1); reps += 1; }
  else { interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.min(180, Math.max(1, Math.round(interval * 2.15))); reps += 1; }
  const due = new Date(now); due.setDate(due.getDate()+interval);
  return { dueAt: due.toISOString(), intervalDays: interval, repetitions: reps, lapses };
}
export function applyReview(state: AppState, event: ReviewEvent): AppState {
  const concept = state.concepts.find(c => c.id === event.conceptId);
  if (!concept) return state;
  const sched = scheduleReview(concept,event.rating,new Date(event.at));
  const quality = Math.max(0,Math.min(1,event.answerQuality));
  const learning = event.rating <= 1 ? 0.18 : event.rating === 2 ? 0.48 : 0.82;
  const adjust = (old: number) => Math.max(0,Math.min(1,old*0.68 + quality*0.22 + learning*0.10));
  const updated: Concept = { ...concept, ...sched, mastery: adjust(concept.mastery), [event.skill]: adjust(concept[event.skill]), lastReviewedAt: event.at, lastMethod: event.method, confidenceCalibration: (concept.confidenceCalibration*concept.repetitions + Math.abs(event.confidence - quality))/(concept.repetitions+1), updatedAt: event.at };
  return { ...state, concepts: state.concepts.map(c => c.id === updated.id ? updated : c), reviews: [...state.reviews,event], updatedAt: event.at };
}
export function aggregateEvidence(reviews: ReviewEvent[]): MethodEvidence[] {
  const groups = new Map<string,ReviewEvent[]>();
  reviews.forEach(r => { const k = `${r.method}:${r.skill}`; groups.set(k,[...(groups.get(k) ?? []),r]); });
  return [...groups.entries()].map(([key,events]) => {
    const [method,skill] = key.split(":") as [Method,Skill];
    const avg = (fn:(e:ReviewEvent)=>number) => events.reduce((s,e)=>s+fn(e),0)/events.length;
    const scores = events.map(e => e.answerQuality);
    return { method, skill, observations: events.length, meanScore: avg(e=>e.answerQuality), meanConfidence: avg(e=>e.confidence), confidenceGap: avg(e=>e.confidence-e.answerQuality), meanSeconds: avg(e=>e.responseSeconds), lastAt: events.map(e=>e.at).sort().at(-1) };
  });
}
export function learningProfile(reviews: ReviewEvent[]): { evidence: MethodEvidence[]; sampleSize: number; strengths: string[]; needsWork: string[] } {
  const evidence = aggregateEvidence(reviews);
  const sampleSize = reviews.length;
  const bySkill = SKILLS.map(skill => {
    const rows = evidence.filter(e=>e.skill===skill && e.observations>=2);
    return { skill, score: rows.length ? rows.reduce((s,e)=>s+e.meanScore*e.observations,0)/rows.reduce((s,e)=>s+e.observations,0) : undefined };
  });
  return { evidence, sampleSize, strengths: bySkill.filter(x=>x.score!==undefined && x.score>=0.72).map(x=>x.skill), needsWork: bySkill.filter(x=>x.score!==undefined && x.score<0.55).map(x=>x.skill) };
}
export function recommendationText(state: AppState, now = new Date()): string {
  const pending = dueCount(state.concepts,now.getTime());
  if (!state.concepts.length) return "Añade una materia y un primer concepto para preparar tu primera sesión.";
  if (!pending) return "Vas al día — no hay nada urgente ahora mismo.";
  return `Tienes ${pending} ${pending===1?"concepto pendiente":"conceptos pendientes"}. Empieza por ellos y después refuerza el área que te cueste más.`;
}
export function exportState(state: AppState): string { return JSON.stringify({ format:"FORMA_BACKUP", exportedAt:nowISO(), data:state },null,2); }
export function importState(json: string): AppState {
  const parsed = JSON.parse(json);
  return normalizeState(parsed?.format === "FORMA_BACKUP" ? parsed.data : parsed);
}

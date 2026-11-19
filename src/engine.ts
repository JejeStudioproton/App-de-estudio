import type { AppState, Concept, ErrorKind, Method, MethodEvidence, Rating, ReviewEvent, Settings, Skill, StudyPlanItem, Subject } from "./domain";
import { METHODS, SKILLS } from "./domain";
import { daysUntil, parseDay } from "./dates";
import { prioritizeConcepts, selectForTime } from "./priority";
import { selectSkill, skillScore } from "./skills";

// Reexportado por compatibilidad con el código existente.
export { daysUntil, selectSkill, skillScore };

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
    createdAt: input.createdAt ?? now, updatedAt: input.updatedAt ?? now, mastery: input.mastery ?? 0, memory: input.memory ?? 0,
    understanding: input.understanding ?? 0, application: input.application ?? 0, dueAt: input.dueAt ?? now,
    intervalDays: input.intervalDays ?? 0, repetitions: input.repetitions ?? 0, lapses: input.lapses ?? 0,
    lastReviewedAt: input.lastReviewedAt, lastMethod: input.lastMethod, confidenceCalibration: input.confidenceCalibration ?? 0,
    progressResetAt: typeof input.progressResetAt === "string" && Number.isFinite(Date.parse(input.progressResetAt)) ? input.progressResetAt : undefined,
    importance: input.importance === 1 || input.importance === 2 || input.importance === 3 ? input.importance : 2,
    estimatedMinutes: typeof input.estimatedMinutes === "number" && Number.isFinite(input.estimatedMinutes) && input.estimatedMinutes >= 1 ? Math.min(60, Math.round(input.estimatedMinutes)) : undefined
  };
}
export function initialState(): AppState {
  const now = nowISO();
  return { version: 3, subjects: [], concepts: [], reviews: [], settings: { ...DEFAULT_SETTINGS }, createdAt: now, updatedAt: now };
}
const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const clamp = (x: unknown, min: number, max: number, fallback: number) => typeof x === "number" && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
const validISO = (x: unknown): x is string => typeof x === "string" && Number.isFinite(Date.parse(x));
const validDay = (x: unknown): x is string => typeof x === "string" && parseDay(x) !== undefined;
const ERROR_KINDS: ErrorKind[] = ["recall", "misconception", "careless"];

/**
 * Convierte datos guardados (de cualquier versión anterior) en un estado válido.
 * Descarta solo los registros estructuralmente inservibles y corrige valores fuera de rango,
 * sin eliminar el resto de la información.
 */
export function normalizeState(raw: unknown): AppState {
  if (!isObj(raw)) return initialState();
  const now = nowISO();
  const subjects = (Array.isArray(raw.subjects) ? raw.subjects : [])
    .filter((s: any) => isObj(s) && typeof s.id === "string" && s.id && typeof s.name === "string" && s.name.trim())
    .map((s: any): Subject => ({
      id: s.id, name: s.name, description: typeof s.description === "string" ? s.description : "", archived: !!s.archived,
      color: typeof s.color === "string" && s.color ? s.color : COLORS[0], examDate: validDay(s.examDate) ? s.examDate : undefined,
      createdAt: validISO(s.createdAt) ? s.createdAt : now, updatedAt: validISO(s.updatedAt) ? s.updatedAt : now
    }));
  const concepts = (Array.isArray(raw.concepts) ? raw.concepts : [])
    .filter((c: any) => isObj(c) && typeof c.title === "string" && c.title.trim() && typeof c.subjectId === "string")
    .map((c: any) => createConcept({
      ...c,
      mastery: clamp(c.mastery, 0, 1, 0), memory: clamp(c.memory, 0, 1, 0), understanding: clamp(c.understanding, 0, 1, 0), application: clamp(c.application, 0, 1, 0),
      dueAt: validISO(c.dueAt) ? c.dueAt : now, intervalDays: clamp(c.intervalDays, 0, 3650, 0), repetitions: Math.round(clamp(c.repetitions, 0, 10000, 0)), lapses: Math.round(clamp(c.lapses, 0, 10000, 0)),
      lastReviewedAt: validISO(c.lastReviewedAt) ? c.lastReviewedAt : undefined,
      lastMethod: METHODS.includes(c.lastMethod) ? c.lastMethod : undefined,
      tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === "string") : [],
      skillTargets: Array.isArray(c.skillTargets) ? c.skillTargets.filter((t: unknown) => SKILLS.includes(t as Skill)) : undefined,
      createdAt: validISO(c.createdAt) ? c.createdAt : undefined, updatedAt: validISO(c.updatedAt) ? c.updatedAt : undefined,
      confidenceCalibration: clamp(c.confidenceCalibration, 0, 1, 0)
    }));
  const reviews = (Array.isArray(raw.reviews) ? raw.reviews : [])
    .filter((r: any) => isObj(r) && typeof r.conceptId === "string" && [0, 1, 2, 3].includes(r.rating) && validISO(r.at) && METHODS.includes(r.method) && SKILLS.includes(r.skill))
    .map((r: any): ReviewEvent => ({
      ...r,
      id: typeof r.id === "string" && r.id ? r.id : uid("rev"),
      subjectId: typeof r.subjectId === "string" ? r.subjectId : "",
      confidence: clamp(r.confidence, 0, 1, 0.5), responseSeconds: clamp(r.responseSeconds, 0, 3600, 0), hintUsed: !!r.hintUsed,
      answerQuality: clamp(r.answerQuality, 0, 1, qualityFromRating(r.rating)),
      errorTags: Array.isArray(r.errorTags) ? r.errorTags.filter((t: unknown) => typeof t === "string") : [],
      errorKind: ERROR_KINDS.includes(r.errorKind) ? r.errorKind : undefined
    }));
  const rs = isObj(raw.settings) ? raw.settings : {};
  const settings: Settings = {
    ...DEFAULT_SETTINGS, ...rs,
    dailyMinutes: Math.round(clamp(rs.dailyMinutes, 5, 480, DEFAULT_SETTINGS.dailyMinutes)),
    sessionLength: Math.round(clamp(rs.sessionLength, 1, 100, DEFAULT_SETTINGS.sessionLength))
  };
  return {
    version: 3, subjects, concepts, reviews,
    activeSubjectId: typeof raw.activeSubjectId === "string" ? raw.activeSubjectId : undefined,
    settings, createdAt: validISO(raw.createdAt) ? raw.createdAt : now, updatedAt: now
  };
}
export function dueCount(concepts: Concept[], now = Date.now()): number {
  return concepts.filter(c => Date.parse(c.dueAt) <= now).length;
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
export type SessionPlanContext = { subjects?: Subject[]; sessionLength?: number };
/**
 * Plan de sesión: ordena por prioridad (examen, dominio, riesgo de olvido, dificultades, importancia)
 * y recorta según el tiempo disponible y la longitud máxima de sesión.
 */
export function planSession(concepts: Concept[], reviews: ReviewEvent[], minutes = 25, now = Date.now(), ctx: SessionPlanContext = {}): StudyPlanItem[] {
  const evidence = aggregateEvidence(reviews);
  const ranked = prioritizeConcepts(concepts, reviews, { subjects: ctx.subjects, now });
  const byId = new Map(concepts.map(c => [c.id, c]));
  const maxCount = ctx.sessionLength ?? Math.max(1, Math.floor(minutes / 3));
  return selectForTime(ranked, minutes, maxCount).map(item => ({
    conceptId: item.conceptId, reason: item.reason, priority: item.score,
    suggestedMethod: methodFor(item.suggestedSkill, byId.get(item.conceptId)!, evidence), suggestedSkill: item.suggestedSkill
  }));
}
/** Calidad 0-1 asignada a una autoevaluación. Es una estimación, no una corrección semántica. */
export function qualityFromRating(rating: Rating): number {
  return rating === 0 ? 0.1 : rating === 1 ? 0.3 : rating === 2 ? 0.65 : 0.95;
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
/**
 * Lee una copia de seguridad. Lanza un error si el contenido no es JSON válido o no parece
 * una copia de FORMA, para no reemplazar los datos actuales por un estado vacío por accidente.
 */
export function importState(json: string): AppState {
  const parsed = JSON.parse(json);
  const data = isObj(parsed) && parsed.format === "FORMA_BACKUP" ? parsed.data : parsed;
  if (!isObj(data) || !(Array.isArray(data.subjects) || Array.isArray(data.concepts) || Array.isArray(data.reviews))) {
    throw new Error("El archivo no contiene datos de FORMA.");
  }
  return normalizeState(data);
}

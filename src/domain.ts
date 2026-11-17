export type Skill = "memory" | "understanding" | "application";
export type Method = "active-recall" | "explanation" | "worked-example" | "multiple-choice" | "application";
export type Rating = 0 | 1 | 2 | 3;
export type SourceRef = { fileName: string; page?: number; excerpt: string; start?: number; end?: number };
export type ReviewEvent = {
  id: string; conceptId: string; subjectId: string; at: string; method: Method; skill: Skill;
  rating: Rating; confidence: number; responseSeconds: number; hintUsed: boolean;
  answerQuality: number; errorTags: string[]; note?: string; dueBefore?: string; dueAfter?: string;
};
export type Concept = {
  id: string; subjectId: string; title: string; explanation: string; prompt: string; answer: string;
  applicationPrompt: string; applicationAnswer: string; choices?: string[]; correctChoice?: number;
  source?: SourceRef; tags: string[]; skillTargets: Skill[]; createdAt: string; updatedAt: string;
  mastery: number; memory: number; understanding: number; application: number;
  dueAt: string; intervalDays: number; repetitions: number; lapses: number;
  lastReviewedAt?: string; lastMethod?: Method; confidenceCalibration: number;
};
export type Subject = {
  id: string; name: string; color: string; examDate?: string; createdAt: string; updatedAt: string;
  description: string; archived: boolean;
};
export type MethodEvidence = {
  method: Method; skill: Skill; observations: number; meanScore: number; delayedMean?: number;
  meanConfidence: number; confidenceGap: number; meanSeconds: number; lastAt?: string;
};
export type LearningProfile = {
  id: string; updatedAt: string; preferredMethods: Partial<Record<Skill, Method>>;
  evidence: MethodEvidence[]; strengths: string[]; needsWork: string[]; sampleSize: number;
};
export type StudyPlanItem = { conceptId: string; reason: string; priority: number; suggestedMethod: Method; suggestedSkill: Skill };
export type AppState = {
  version: 3; subjects: Subject[]; concepts: Concept[]; reviews: ReviewEvent[];
  activeSubjectId?: string; settings: Settings; createdAt: string; updatedAt: string;
};
export type Settings = {
  dailyMinutes: number; sessionLength: number; showHints: boolean; reducedMotion: boolean;
  aiMode: "off" | "optional"; theme: "light" | "dark" | "system"; sound: boolean;
};
export type SessionCard = { concept: Concept; method: Method; skill: Skill; reason: string };
export const METHODS: Method[] = ["active-recall", "explanation", "worked-example", "multiple-choice", "application"];
export const SKILLS: Skill[] = ["memory", "understanding", "application"];
export const METHOD_LABELS: Record<Method,string> = {
  "active-recall":"Recuerdo activo", explanation:"Explicarlo con tus palabras",
  "worked-example":"Ejemplo resuelto", "multiple-choice":"Opción múltiple", application:"Aplicación"
};
export const SKILL_LABELS: Record<Skill,string> = { memory:"Memoria", understanding:"Comprensión", application:"Aplicación" };

import type { ErrorKind, ReviewEvent } from "./domain";
import { evidenceLevel, EVIDENCE_THRESHOLDS } from "./evidence";

export type DiagnosisKind =
  | "recall-failure" | "misconception" | "application-difficulty"
  | "overconfidence" | "underconfidence" | "slow-retrieval" | "possible-careless";
export type DiagnosisStatus = "provisional" | "supported";

export type Diagnosis = {
  kind: DiagnosisKind;
  /** "supported" exige evidencia al menos moderada; si no, el diagnóstico es provisional. */
  status: DiagnosisStatus;
  observations: number;
  message: string;
  help: string;
};
export type DiagnosisResult = {
  conceptId?: string;
  observations: number;
  diagnoses: Diagnosis[];
  /** true cuando no hay datos suficientes para diagnosticar nada. */
  insufficient: boolean;
  message: string;
  /** Comprobación adicional recomendada para obtener evidencia. */
  check?: string;
};
export type DiagnosisOptions = {
  /** Mediana de segundos de las respuestas correctas con tiempo medido del usuario (todos los conceptos). */
  referenceSeconds?: number;
  referenceCount?: number;
};

/** Umbrales orientativos, no validados estadísticamente. */
export const DIAG = {
  minReviews: 3,
  failRating: 1,
  highConfidence: 0.67,
  confidenceGap: 0.25,
  weakApplication: 0.45,
  decentOther: 0.65,
  applicationGap: 0.2,
  slowFactor: 1.75,
  slowMinSeconds: 15,
  minTimedForSlow: 3,
  minReferenceTimed: 8,
  carelessMinReviews: 5,
  carelessStreak: 3
} as const;

export const DIAGNOSIS_LABELS: Record<DiagnosisKind, string> = {
  "recall-failure": "Fallos de recuerdo",
  "misconception": "Posible idea equivocada",
  "application-difficulty": "Dificultad para aplicar",
  "overconfidence": "Exceso de confianza",
  "underconfidence": "Falta de confianza",
  "slow-retrieval": "Recuperación lenta",
  "possible-careless": "Posible descuido"
};

const HELP: Record<DiagnosisKind, string> = {
  "recall-failure": "Practica recuerdo activo espaciado: responde sin mirar la referencia y repite en días distintos.",
  "misconception": "Explica el concepto con tus palabras, compáralo con la referencia y anota qué creías antes.",
  "application-difficulty": "Resuelve casos nuevos y ejemplos resueltos antes de volver a las definiciones.",
  "overconfidence": "Intenta responder por escrito antes de valorar tu seguridad y compara siempre con la referencia.",
  "underconfidence": "Apóyate en tus aciertos recientes: tu rendimiento es mejor de lo que crees. Sube la dificultad de las pruebas.",
  "slow-retrieval": "Repite el recuerdo activo con límite de tiempo suave hasta que la respuesta salga con fluidez.",
  "possible-careless": "Repite una pregunta equivalente para comprobar si fue un despiste o una laguna."
};

const successful = (r: ReviewEvent) => r.rating >= 2;
const failed = (r: ReviewEvent) => r.rating <= DIAG.failRating;
const mean = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const statusFor = (n: number): DiagnosisStatus => (evidenceLevel(n).level === "moderate" || evidenceLevel(n).level === "stronger") ? "supported" : "provisional";

/** Mediana de segundos de aciertos con tiempo medido: referencia para detectar recuperación lenta. */
export function referenceTiming(reviews: ReviewEvent[]): { referenceSeconds?: number; referenceCount: number } {
  const timed = reviews.filter(r => successful(r) && r.responseSeconds > 0).map(r => r.responseSeconds);
  return { referenceSeconds: timed.length >= DIAG.minReferenceTimed ? median(timed) : undefined, referenceCount: timed.length };
}

/**
 * Interpreta los intentos de UN concepto y propone qué tipo de ayuda conviene.
 * Solo emite un diagnóstico cuando hay evidencia mínima para ello; los marcados
 * como "provisional" deben presentarse como hipótesis, no como hechos.
 */
export function diagnoseConcept(input: ReviewEvent[], options: DiagnosisOptions = {}): DiagnosisResult {
  const reviews = [...input].filter(r => r && Number.isFinite(r.rating)).sort((a, b) => a.at.localeCompare(b.at));
  const n = reviews.length;
  const conceptId = reviews[0]?.conceptId;
  if (n === 0) {
    return { conceptId, observations: 0, diagnoses: [], insufficient: true, message: "Sin intentos todavía: no hay nada que diagnosticar.", check: "Haz una primera sesión de recuerdo activo con este concepto." };
  }
  const diagnoses: Diagnosis[] = [];

  if (n >= DIAG.minReviews) {
    const memory = reviews.filter(r => r.skill === "memory");
    const understanding = reviews.filter(r => r.skill === "understanding");
    const application = reviews.filter(r => r.skill === "application");

    // Idea equivocada: solo con señales repetidas (marcadas por el estudiante o fallos con alta confianza al comprender/aplicar).
    const misconceptionSignals = reviews.filter(r => failed(r) && (r.errorKind === "misconception" || (r.skill !== "memory" && r.confidence >= DIAG.highConfidence && r.errorKind !== "careless" && r.errorKind !== "recall")));
    if (misconceptionSignals.length >= 2) {
      const tagged = misconceptionSignals.filter(r => r.errorKind === "misconception").length;
      diagnoses.push({
        kind: "misconception", status: tagged >= 2 ? "supported" : "provisional", observations: misconceptionSignals.length,
        message: `${misconceptionSignals.length} fallos apuntan a una posible idea equivocada (${tagged} marcados por ti como "entendí mal").`,
        help: HELP.misconception
      });
    }

    // Fallos de recuerdo: fallos en memoria sin señales de malentendido.
    const memoryFails = memory.filter(r => failed(r) && r.errorKind !== "misconception" && r.errorKind !== "careless");
    if (memory.length >= DIAG.minReviews && memoryFails.length >= 2 && !diagnoses.some(d => d.kind === "misconception")) {
      diagnoses.push({
        kind: "recall-failure", status: statusFor(memory.length), observations: memory.length,
        message: `Has fallado ${memoryFails.length} de ${memory.length} intentos de recuerdo.`, help: HELP["recall-failure"]
      });
    }

    // Dificultad para aplicar: comprensión/recuerdo aceptables pero aplicación claramente peor.
    const other = [...memory, ...understanding];
    if (application.length >= 2 && other.length >= DIAG.minReviews) {
      const appMean = mean(application.map(r => r.answerQuality));
      const otherMean = mean(other.map(r => r.answerQuality));
      if (appMean <= DIAG.weakApplication && otherMean >= DIAG.decentOther && otherMean - appMean >= DIAG.applicationGap) {
        diagnoses.push({
          kind: "application-difficulty", status: statusFor(application.length), observations: application.length,
          message: `Recuerdas/comprendes con ${Math.round(otherMean * 100)} % pero aplicas con ${Math.round(appMean * 100)} %.`, help: HELP["application-difficulty"]
        });
      }
    }

    // Calibración de la confianza.
    const gaps = reviews.map(r => r.confidence - r.answerQuality);
    const gapMean = mean(gaps);
    if (gapMean >= DIAG.confidenceGap && gaps.filter(g => g >= DIAG.confidenceGap).length >= 2) {
      diagnoses.push({
        kind: "overconfidence", status: statusFor(n), observations: n,
        message: "Tu seguridad previa suele ser mayor que el resultado real en este concepto.", help: HELP.overconfidence
      });
    } else if (gapMean <= -DIAG.confidenceGap && mean(reviews.map(r => r.answerQuality)) >= DIAG.decentOther) {
      diagnoses.push({
        kind: "underconfidence", status: statusFor(n), observations: n,
        message: "Aciertas más de lo que esperabas antes de responder.", help: HELP.underconfidence
      });
    }

    // Recuperación lenta: solo con tiempos reales y una referencia propia suficiente.
    const timedCorrect = reviews.filter(r => successful(r) && r.responseSeconds > 0);
    if (options.referenceSeconds && timedCorrect.length >= DIAG.minTimedForSlow) {
      const med = median(timedCorrect.map(r => r.responseSeconds));
      if (med >= DIAG.slowMinSeconds && med >= options.referenceSeconds * DIAG.slowFactor) {
        diagnoses.push({
          kind: "slow-retrieval", status: "provisional", observations: timedCorrect.length,
          message: `Aciertas, pero tardas ${Math.round(med)} s de mediana (tu media general ronda ${Math.round(options.referenceSeconds)} s). Puede deberse también a que este concepto sea más largo.`,
          help: HELP["slow-retrieval"]
        });
      }
    }

    // Descuido: solo hipótesis provisional.
    const taggedCareless = reviews.filter(r => failed(r) && r.errorKind === "careless");
    let isolated = 0;
    if (n >= DIAG.carelessMinReviews) {
      for (let i = DIAG.carelessStreak; i < n; i++) {
        const streak = reviews.slice(i - DIAG.carelessStreak, i).every(successful);
        const next = reviews[i + 1];
        if (streak && failed(reviews[i]) && !reviews[i].errorKind && (!next || successful(next))) isolated++;
      }
    }
    if (taggedCareless.length + isolated > 0 && !diagnoses.some(d => d.kind === "misconception")) {
      diagnoses.push({
        kind: "possible-careless", status: "provisional", observations: taggedCareless.length + isolated,
        message: taggedCareless.length ? "Marcaste algún fallo como despiste; con tan pocos casos es solo una hipótesis." : "Un fallo aislado tras varios aciertos podría ser un despiste, pero no hay forma de confirmarlo aún.",
        help: HELP["possible-careless"]
      });
    }
  }

  diagnoses.sort((a, b) => (a.status === b.status ? b.observations - a.observations : a.status === "supported" ? -1 : 1));

  if (diagnoses.length) {
    return { conceptId, observations: n, diagnoses, insufficient: false, message: diagnoses[0].message };
  }
  if (n < DIAG.minReviews) {
    return { conceptId, observations: n, diagnoses, insufficient: true, message: `Evidencia insuficiente: ${n} de ${EVIDENCE_THRESHOLDS.initial} intentos mínimos.`, check: nextCheck(reviews) };
  }
  return { conceptId, observations: n, diagnoses, insufficient: false, message: "Con los datos actuales no se detecta ninguna dificultad concreta." };
}

/** Qué dato falta para poder diagnosticar mejor. */
function nextCheck(reviews: ReviewEvent[]): string {
  const skills = new Set(reviews.map(r => r.skill));
  if (!skills.has("understanding")) return "Explica el concepto con tus propias palabras para comprobar la comprensión.";
  if (!skills.has("application")) return "Resuelve un caso de aplicación nuevo para ver si sabes usarlo.";
  if (!skills.has("memory")) return "Haz un recuerdo activo sin mirar la referencia.";
  return "Repite el concepto otro día para obtener una medida más fiable.";
}

/** Agrupa los intentos por concepto y diagnostica todos con la misma referencia de tiempos. */
export function diagnoseAll(reviews: ReviewEvent[]): Map<string, DiagnosisResult> {
  const ref = referenceTiming(reviews);
  const groups = new Map<string, ReviewEvent[]>();
  for (const r of reviews) groups.set(r.conceptId, [...(groups.get(r.conceptId) ?? []), r]);
  const out = new Map<string, DiagnosisResult>();
  for (const [id, rows] of groups) out.set(id, diagnoseConcept(rows, ref));
  return out;
}

export function errorKindLabel(kind?: ErrorKind): string {
  return kind === "recall" ? "recuerdo" : kind === "misconception" ? "idea equivocada" : kind === "careless" ? "descuido" : "sin clasificar";
}

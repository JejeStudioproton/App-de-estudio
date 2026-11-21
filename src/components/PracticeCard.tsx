import { useEffect, useRef, useState } from "react";
import { BookOpen, RotateCcw } from "lucide-react";
import type { Concept, ErrorKind, Method, Rating } from "../domain";
import { ERROR_KIND_LABELS, METHOD_LABELS } from "../domain";
import { isEarlyReview, scheduleReview } from "../engine";
import { dueLabel } from "../today";

/** Lo que el estudiante ha indicado en una tarjeta que cuenta. Nada se rellena por él. */
export type PracticeResult = {
  rating: Rating;
  /** Seguridad declarada antes de ver la referencia, de 0 (nada) a 3 (seguro). */
  confidence: number;
  errorKind?: ErrorKind;
  answer: string;
  /** Segundos hasta mostrar la referencia. */
  responseSeconds: number;
  /** Vio la referencia sin haber escrito nada. */
  hintUsed: boolean;
};

const CONFIDENCE = ["Nada", "Poco", "Bastante", "Seguro"];
const RATINGS: { value: Rating; label: string; hint: string }[] = [
  { value: 0, label: "No lo recordé", hint: "En blanco o equivocado" },
  { value: 1, label: "Solo en parte", hint: "Me faltó lo esencial" },
  { value: 2, label: "Con dudas", hint: "Bien, pero inseguro" },
  { value: 3, label: "Con seguridad", hint: "Lo pude explicar" },
];
const ERROR_KINDS = Object.keys(ERROR_KIND_LABELS) as ErrorKind[];
/** Qué se pide hacer con cada método, además de la pregunta. */
const METHOD_INSTRUCTIONS: Partial<Record<Method, string>> = {
  explanation: "Explícalo con tus palabras, como si se lo contaras a alguien que no lo conoce.",
  "worked-example": "Pon un ejemplo concreto y resuélvelo paso a paso.",
};

type Props = {
  concept: Concept;
  subjectName: string;
  /** Método con el que se hace esta tarjeta. */
  method: Method;
  /** Valor del selector de método ("" = recomendado). */
  methodOverride: Method | "";
  onMethodChange: (method: Method | "") => void;
  /** Por qué se propone ahora este concepto. */
  reason?: string;
  /** 0 = intento que cuenta; 1 o más = repetición dentro de la sesión. */
  attempt: number;
  /** Si es true, no se puede ver la referencia sin haber escrito algo. */
  requireAnswer: boolean;
  /** Si se falla, ¿volverá a salir en esta sesión? */
  willRepeat: boolean;
  onRate: (result: PracticeResult) => void;
  onRelearn: (recalled: boolean) => void;
  onEdit: () => void;
};

/**
 * Una tarjeta de estudio en tres pasos: intentar recordar, prever cuánto se sabe (lo que muestra la referencia)
 * y valorar el resultado. Con teclado: 1–4 para prever y valorar; Esc sale del cuadro de texto.
 */
export function PracticeCard({
  concept,
  subjectName,
  method,
  methodOverride,
  onMethodChange,
  reason,
  attempt,
  requireAnswer,
  willRepeat,
  onRate,
  onRelearn,
  onEdit,
}: Props) {
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [failRating, setFailRating] = useState<Rating | null>(null);
  const shownAt = useRef(Date.now());
  const retrievalSeconds = useRef<number | undefined>(undefined);
  const sawWithoutWriting = useRef(false);
  const done = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const referenceRef = useRef<HTMLDivElement>(null);

  const isRetry = attempt > 0;
  const application = method === "application";
  const prompt = (application && concept.applicationPrompt) || concept.prompt || `¿Qué recuerdas sobre ${concept.title}?`;
  const reference = (application && concept.applicationAnswer) || concept.answer || concept.explanation || "";
  const instruction = METHOD_INSTRUCTIONS[method];
  const blocked = requireAnswer && !isRetry && !answer.trim();
  const now = new Date();
  const early = isEarlyReview(concept, now);

  // Al cambiar de tarjeta, el foco va al título: lo anuncia el lector de pantalla y el teclado queda listo.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  useEffect(() => {
    if (revealed) referenceRef.current?.focus();
  }, [revealed]);

  function reveal(value: number | null) {
    if (revealed || blocked) return;
    retrievalSeconds.current = Math.round((Date.now() - shownAt.current) / 1000);
    sawWithoutWriting.current = !answer.trim();
    if (value !== null) setConfidence(value);
    setRevealed(true);
  }
  function submit(rating: Rating, errorKind?: ErrorKind) {
    if (done.current || confidence === null) return;
    done.current = true;
    onRate({
      rating,
      confidence,
      errorKind: rating <= 1 ? errorKind : undefined,
      answer: answer.trim(),
      responseSeconds: Math.max(1, Math.min(3600, retrievalSeconds.current ?? Math.round((Date.now() - shownAt.current) / 1000))),
      hintUsed: sawWithoutWriting.current,
    });
  }
  function rate(rating: Rating) {
    if (!revealed) return;
    if (rating <= 1) setFailRating(rating);
    else submit(rating);
  }
  function relearn(recalled: boolean) {
    if (done.current || !revealed) return;
    done.current = true;
    onRelearn(recalled);
  }
  function nextReview(rating: Rating): string {
    if (rating <= 1) return willRepeat ? "Vuelve en esta sesión" : "Vuelve mañana";
    if (early) return "No cambia la fecha: aún no tocaba";
    return `Próximo repaso: ${dueLabel(scheduleReview(concept, rating, now).dueAt, now)}`;
  }

  // Atajos de teclado. Se guarda siempre la última versión para no trabajar con un estado antiguo.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => undefined);
  onKey.current = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    const tag = target?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || target?.isContentEditable) {
      if (e.key === "Escape" && tag === "TEXTAREA") target?.blur();
      return;
    }
    const digit = /^[1-4]$/.test(e.key) ? Number(e.key) : 0;
    // Enter y espacio ya activan el botón que tenga el foco: solo se usan como atajo fuera de un botón.
    const confirm = (e.key === "Enter" || e.key === " ") && tag !== "BUTTON" && tag !== "A";
    let handled = true;
    if (!revealed) {
      if (isRetry && confirm) reveal(null);
      else if (!isRetry && digit) reveal(digit - 1);
      else handled = false;
    } else if (isRetry) {
      if (digit === 1) relearn(false);
      else if (digit === 2) relearn(true);
      else handled = false;
    } else if (failRating !== null) {
      if (digit >= 1 && digit <= ERROR_KINDS.length) submit(failRating, ERROR_KINDS[digit - 1]);
      else if (confirm) submit(failRating);
      else handled = false;
    } else if (digit) rate((digit - 1) as Rating);
    else handled = false;
    if (handled) e.preventDefault();
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className={`practice-card ${isRetry ? "practice-retry" : ""}`}>
      <p className="eyebrow">
        {subjectName} · {isRetry ? "Segunda vuelta" : METHOD_LABELS[method]}
      </p>
      {isRetry ? (
        <p className="field-help why-now retry-note">
          <RotateCcw size={15} aria-hidden="true" /> Lo fallaste hace un momento. Inténtalo otra vez sin mirar: esta repetición no se
          registra ni cambia la fecha de repaso.
        </p>
      ) : (
        reason && <p className="field-help why-now">Por qué ahora: {reason}</p>
      )}
      <h1 ref={headingRef} tabIndex={-1}>
        {concept.title}
      </h1>
      <p className="practice-prompt">{prompt}</p>
      {instruction && <p className="practice-instruction">{instruction}</p>}

      {!revealed ? (
        <>
          <textarea
            className="answer-field"
            aria-label="Tu respuesta antes de consultar la referencia"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={
              requireAnswer && !isRetry
                ? "Escribe lo que recuerdes antes de ver la respuesta…"
                : "Escribe lo que recuerdes (opcional). Pensarlo o decirlo en voz alta también vale."
            }
            rows={4}
          />
          {isRetry ? (
            <div className="predict">
              <button className="button button-primary full" onClick={() => reveal(null)}>
                Mostrar respuesta
              </button>
            </div>
          ) : (
            <div className="predict">
              <p className="predict-label" id="predict-label">
                Antes de ver la respuesta, ¿cuánto crees que lo sabes?
              </p>
              <div className="predict-options" role="group" aria-labelledby="predict-label">
                {CONFIDENCE.map((label, value) => (
                  <button key={label} className="predict-option" disabled={blocked} onClick={() => reveal(value)}>
                    <kbd aria-hidden="true">{value + 1}</kbd>
                    {label}
                  </button>
                ))}
              </div>
              <p className="field-help predict-help" role={blocked ? "status" : undefined}>
                {blocked
                  ? "Escribe primero tu respuesta: en Configuración has pedido no ver la referencia sin responder."
                  : "Al elegir se muestra la respuesta. Tu previsión sirve para detectar si te fías de más o de menos."}
              </p>
            </div>
          )}
          {!isRetry && (
            <label className="method-select">
              Método
              <select value={methodOverride} onChange={(e) => onMethodChange(e.target.value as Method | "")}>
                <option value="">Recomendado</option>
                <option value="active-recall">Recuerdo activo</option>
                <option value="explanation">Explicación</option>
                <option value="worked-example">Ejemplo resuelto</option>
                <option value="application">Aplicación</option>
              </select>
            </label>
          )}
        </>
      ) : (
        <>
          {answer.trim() && (
            <div className="your-answer">
              <strong>Tu respuesta</strong>
              <p>{answer.trim()}</p>
            </div>
          )}
          <div className="reference-box" ref={referenceRef} tabIndex={-1}>
            <div className="reference-head">
              <BookOpen size={16} aria-hidden="true" />
              <strong>Referencia para comprobar</strong>
            </div>
            {reference ? (
              <p>{reference}</p>
            ) : (
              <p>
                Este concepto todavía no tiene respuesta de referencia.{" "}
                <button className="text-button" onClick={onEdit}>
                  Añadirla ahora
                </button>
              </p>
            )}
            {concept.source && (
              <small>
                Fuente: {concept.source.fileName}
                {concept.source.page ? ` · página ${concept.source.page}` : ""} — «{concept.source.excerpt}»
              </small>
            )}
          </div>
          {isRetry ? (
            <div className="self-assess">
              <div className="assess-heading">
                <h3 id="assess-label">¿Te ha salido ahora?</h3>
              </div>
              <div className="rating-options relearn-options" role="group" aria-labelledby="assess-label">
                <button className="rating-option" onClick={() => relearn(false)}>
                  <kbd aria-hidden="true">1</kbd>
                  <strong>Todavía no</strong>
                  <small>{willRepeat ? "Vuelve a salir en esta sesión" : "Queda para mañana"}</small>
                </button>
                <button className="rating-option" onClick={() => relearn(true)}>
                  <kbd aria-hidden="true">2</kbd>
                  <strong>Ahora sí</strong>
                  <small>Mañana se comprueba si se ha quedado</small>
                </button>
              </div>
            </div>
          ) : failRating === null ? (
            <div className="self-assess">
              <div className="assess-heading">
                <h3 id="assess-label">¿Cómo te ha salido?</h3>
                <span className="muted">Compara con la referencia y sé honesto: mejora el plan</span>
              </div>
              <div className="rating-options" role="group" aria-labelledby="assess-label">
                {RATINGS.map((r) => (
                  <button key={r.value} className="rating-option" onClick={() => rate(r.value)}>
                    <kbd aria-hidden="true">{r.value + 1}</kbd>
                    <strong>{r.label}</strong>
                    <small>{r.hint}</small>
                    <small className="rating-next">{nextReview(r.value)}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="self-assess fail-step">
              <div className="assess-heading">
                <h3 id="fail-label">¿Qué crees que pasó?</h3>
                <span className="muted">Opcional: FORMA no lo deduce por ti</span>
              </div>
              <div className="predict-options fail-options" role="group" aria-labelledby="fail-label">
                {ERROR_KINDS.map((kind, i) => (
                  <button key={kind} className="predict-option" onClick={() => submit(failRating, kind)}>
                    <kbd aria-hidden="true">{i + 1}</kbd>
                    {ERROR_KIND_LABELS[kind]}
                  </button>
                ))}
              </div>
              <div className="fail-actions">
                <button className="button button-primary" onClick={() => submit(failRating)}>
                  Continuar sin clasificar
                </button>
                <button className="text-button" onClick={() => setFailRating(null)}>
                  Cambiar valoración
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

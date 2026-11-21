import { ArrowRight, Check } from "lucide-react";
import type { SessionSummary } from "../sessionSummary";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lo ocurrido con los conceptos fallados que se volvieron a preguntar en la misma sesión (no se registra como evidencia). */
export type RelearnSummary = { recovered: string[]; pending: string[] };

type Props = {
  summary: SessionSummary;
  onDone: () => void;
  onContinue?: () => void;
  /** Texto del botón para seguir; depende de si quedan repasos pendientes. */
  continueLabel?: string;
  relearn?: RelearnSummary;
  /** Repasos hechos hoy y conceptos que aún tocan hoy. */
  today?: { reviews: number; due: number };
};

/** Presenta el resumen calculado por `summarizeSession`; cada bloque solo aparece si hay datos reales. */
export function SessionSummaryView({ summary, onDone, onContinue, continueLabel = "Seguir estudiando", relearn, today }: Props) {
  return (
    <div className="practice-complete panel summary-view">
      <div className="complete-mark">
        <Check size={26} aria-hidden="true" />
      </div>
      <p className="eyebrow">Resumen de la sesión</p>
      <h1>{plural(summary.totalEvents, "intento registrado", "intentos registrados")}</h1>
      {today && (
        <p className="summary-today">
          Hoy llevas {plural(today.reviews, "repaso", "repasos")}.{" "}
          {today.due > 0
            ? `Te ${today.due === 1 ? "queda" : "quedan"} ${plural(today.due, "concepto pendiente", "conceptos pendientes")} para hoy.`
            : "No te queda nada pendiente para hoy."}
        </p>
      )}
      {summary.averageSeconds !== undefined && (
        <p className="muted">Tiempo medio hasta tu respuesta: {summary.averageSeconds} s.</p>
      )}
      <div className="summary-grid">
        <section>
          <h3>Qué has estudiado</h3>
          <ul>
            {summary.studied.map((s) => (
              <li key={s.conceptId}>
                {s.title} <small>· {plural(s.attempts, "intento", "intentos")}</small>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Dominado con evidencias</h3>
          {summary.mastered.length ? (
            <ul>
              {summary.mastered.map((m) => (
                <li key={m.conceptId}>
                  {m.title} <small>· {m.evidence}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Todavía nada se da por dominado: hace falta repetir con éxito en días distintos.</p>
          )}
        </section>
        {summary.unconfirmed.length > 0 && (
          <section>
            <h3>Buen resultado, sin confirmar</h3>
            <ul>
              {summary.unconfirmed.map((u) => (
                <li key={u.conceptId}>
                  {u.title} <small>· {u.missing}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
        {summary.stillDifficult.length > 0 && (
          <section>
            <h3>Sigue siendo difícil</h3>
            <ul>
              {summary.stillDifficult.map((d) => (
                <li key={d.conceptId}>
                  {d.title} <small>· {d.why}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
        {relearn && relearn.recovered.length + relearn.pending.length > 0 && (
          <section>
            <h3>Repetido en esta sesión</h3>
            <ul>
              {relearn.recovered.map((title) => (
                <li key={`r-${title}`}>
                  {title} <small>· te salió al volver a intentarlo</small>
                </li>
              ))}
              {relearn.pending.map((title) => (
                <li key={`p-${title}`}>
                  {title} <small>· sin recuperar todavía</small>
                </li>
              ))}
            </ul>
            <p className="muted">Estas repeticiones no cuentan como evidencia: acababas de ver la respuesta. Se comprueban mañana.</p>
          </section>
        )}
        {summary.errorsToFix.length > 0 && (
          <section>
            <h3>Errores que conviene corregir</h3>
            <ul>
              {summary.errorsToFix.map((e) => (
                <li key={`${e.conceptId}-${e.kind}`}>
                  {e.title}{" "}
                  <small>
                    · {e.kind === "unclassified" ? "sin clasificar" : `indicado por ti: ${e.label}`}
                    {e.count > 1 ? ` (${e.count}×)` : ""}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
        {summary.reviewNext.length > 0 && (
          <section>
            <h3>Repasar próximamente</h3>
            <ul>
              {summary.reviewNext.map((r) => (
                <li key={r.conceptId}>
                  {r.title} <small>· {r.inDays === 0 ? "hoy" : `en ${plural(r.inDays, "día", "días")}`}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="next-activity">
        <p className="eyebrow">Siguiente actividad</p>
        <p>{summary.nextActivity}</p>
      </div>
      <div className="summary-actions">
        {onContinue && (
          <button className="button button-secondary" onClick={onContinue}>
            {continueLabel}
          </button>
        )}
        <button className="button button-primary" onClick={onDone}>
          Volver al inicio <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

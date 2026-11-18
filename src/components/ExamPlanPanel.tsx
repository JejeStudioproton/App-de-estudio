import { ArrowRight, CalendarDays, AlertTriangle } from "lucide-react";
import type { ExamPlan } from "../planner";
import { ACTIVITY_LABELS } from "../planner";

const STATUS_LABEL: Record<ExamPlan["status"], string> = {
  ok: "Plan viable",
  tight: "Plan ajustado",
  insufficient: "Tiempo insuficiente",
  "no-exam-date": "Sin fecha de examen",
  "exam-today": "El examen es hoy",
  "exam-passed": "Examen pasado",
  "no-concepts": "Sin conceptos",
  "invalid-budget": "Tiempo diario no válido"
};

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

/** Muestra el plan de examen calculado por `buildExamPlan`. No calcula nada: solo presenta el resultado. */
export function ExamPlanPanel({ plan, onStart, compact = false }: { plan: ExamPlan; onStart: (conceptId: string) => void; compact?: boolean }) {
  const risky = plan.status === "insufficient" || plan.status === "tight";
  const visibleDays = plan.days.filter(d => d.tasks.length > 0).slice(0, compact ? 0 : 5);
  return <div className="exam-plan">
    <div className="exam-plan-head">
      <span className={`status-chip status-${plan.status}`}>{risky && <AlertTriangle size={13} aria-hidden="true" />}{STATUS_LABEL[plan.status]}</span>
      {plan.daysLeft !== undefined && plan.daysLeft >= 0 && <span className="quiet-chip"><CalendarDays size={13} aria-hidden="true" /> {plan.daysLeft === 0 ? "hoy" : `${plan.daysLeft} ${plan.daysLeft === 1 ? "día" : "días"}`}</span>}
    </div>
    <p className="exam-plan-summary">{plan.summary}</p>
    {plan.requiredMinutes > 0 && plan.status !== "no-exam-date" && <p className="field-help">Necesario ≈ {plan.requiredMinutes} min · Planificado {plan.plannedMinutes} min · Disponible {plan.availableMinutes} min</p>}
    {plan.warnings.map((w, i) => <div className="warning-note" key={i} role="note">{w}</div>)}
    {plan.next && <button className="plan-row" onClick={() => onStart(plan.next!.task.conceptId)}>
      <span className="plan-main"><strong>Siguiente: {plan.next.task.title}</strong><small>{ACTIVITY_LABELS[plan.next.task.activity]} · {plan.next.task.minutes} min · {plan.next.why}</small></span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>}
    {visibleDays.length > 0 && <ol className="exam-days">{visibleDays.map(d => <li key={d.date}>
      <div className="exam-day-head"><strong>{dayLabel(d.date)}</strong><span>{d.minutes}/{d.capacity} min</span></div>
      <ul>{d.tasks.map((t, i) => <li key={`${t.conceptId}-${i}`}>{t.title} <small>· {ACTIVITY_LABELS[t.activity]} · {t.minutes} min</small></li>)}</ul>
    </li>)}</ol>}
    {plan.uncovered.length > 0 && <p className="field-help">Sin hueco en el plan: {plan.uncovered.slice(0, 4).map(u => u.title).join(", ")}{plan.uncovered.length > 4 ? ` y ${plan.uncovered.length - 4} más` : ""}.</p>}
  </div>;
}

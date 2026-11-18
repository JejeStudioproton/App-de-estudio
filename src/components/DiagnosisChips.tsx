import type { DiagnosisResult } from "../diagnosis";
import { DIAGNOSIS_LABELS } from "../diagnosis";

/** Chips de diagnóstico de un concepto. Los provisionales se rotulan como tales. */
export function DiagnosisChips({ result, max = 2 }: { result?: DiagnosisResult; max?: number }) {
  if (!result || result.insufficient || result.diagnoses.length === 0) return null;
  return <span className="diag-chips">{result.diagnoses.slice(0, max).map(d =>
    <span key={d.kind} className={`diag-chip ${d.status === "supported" ? "diag-supported" : "diag-provisional"}`} title={`${d.message} ${d.help}`}>
      {DIAGNOSIS_LABELS[d.kind]}{d.status === "provisional" ? " · provisional" : ""}
    </span>)}</span>;
}

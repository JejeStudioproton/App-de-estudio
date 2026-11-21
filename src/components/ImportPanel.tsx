import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Sparkles, Upload } from "lucide-react";
import type { Subject } from "../domain";
import { MAX_DRAFTS, PASTED_SOURCE_NAME, proposeDrafts, type DraftConcept, type ImportKind, type ImportedDocument } from "../importer";
import { AIError, MAX_AI_SOURCE_CHARS, aiHost, extractConceptsWithAI, validateAIConfig, type AIConfig } from "../ai";

export type EditableDraft = DraftConcept & { checked: boolean };
/** Estado de una importación en curso. Vive en la app para que cerrar la ventana por error no borre lo ya revisado. */
export type ImportSession = {
  fileName: string;
  text: string;
  warning: string;
  kind: ImportKind;
  drafts: EditableDraft[];
  truncated: boolean;
  /** El estudiante ha tocado algún borrador: ya no se vuelven a proponer solos al cambiar el texto. */
  edited: boolean;
  /** Materia de destino; NEW_SUBJECT para crear una con `newSubjectName`. */
  subjectId: string;
  newSubjectName: string;
};
export const NEW_SUBJECT = "__nueva__";
export const emptyImportSession = (): ImportSession => ({
  fileName: "",
  text: "",
  warning: "",
  kind: "text",
  drafts: [],
  truncated: false,
  edited: false,
  subjectId: "",
  newSubjectName: "",
});

const withChecks = (drafts: DraftConcept[]): EditableDraft[] => drafts.map((d) => ({ ...d, checked: true }));

/** Sustituye la fuente por un documento recién leído y propone sus borradores. Conserva la materia elegida. */
export function sessionFromDocument(doc: ImportedDocument, previous: ImportSession): ImportSession {
  const { drafts, truncated } = proposeDrafts(doc.text, doc.kind);
  return { ...previous, fileName: doc.fileName, text: doc.text, warning: doc.warning ?? "", kind: doc.kind, drafts: withChecks(drafts), truncated, edited: false };
}

type AIState = { status: "idle" | "loading" | "error" | "done"; message?: string };

export function ImportPanel({
  session,
  onChange,
  subjects,
  defaultSubjectId,
  ai,
  fileError,
  onPickFile,
  onSave,
  onCancel,
}: {
  session: ImportSession;
  onChange: Dispatch<SetStateAction<ImportSession>>;
  subjects: Subject[];
  defaultSubjectId: string;
  /** Configuración de IA solo si el estudiante la activó; `undefined` oculta todo lo relacionado. */
  ai?: AIConfig;
  fileError: string;
  onPickFile: () => void;
  onSave: (destination: { subjectId: string; newSubjectName: string }) => void;
  onCancel: () => void;
}) {
  const [aiState, setAiState] = useState<AIState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const known = subjects.some((s) => s.id === session.subjectId);
  const subjectId = session.subjectId === NEW_SUBJECT || known ? session.subjectId : subjects.some((s) => s.id === defaultSubjectId) ? defaultSubjectId : subjects.length === 1 ? subjects[0].id : subjects.length === 0 ? NEW_SUBJECT : "";
  const selected = session.drafts.filter((d) => d.checked);
  const untitled = selected.some((d) => !d.title.trim());
  const destinationReady = subjectId === NEW_SUBJECT ? session.newSubjectName.trim().length > 0 : subjectId !== "";
  const aiProblem = ai ? validateAIConfig(ai, typeof location !== "undefined" ? location.protocol : undefined) : undefined;

  function repropose(text: string, kind: ImportKind) {
    const { drafts, truncated } = proposeDrafts(text, kind);
    onChange((s) => ({ ...s, text, kind, drafts: withChecks(drafts), truncated, edited: false }));
  }
  function changeText(text: string) {
    // Al vaciar el texto se empieza de cero: lo que se pegue después ya no procede del archivo anterior.
    if (!text.trim()) onChange((s) => ({ ...s, text, fileName: "", warning: "", kind: "text", drafts: [], truncated: false, edited: false }));
    // Si ya se ha corregido algún borrador, cambiar el texto no los pisa: se vuelve a proponer a mano.
    else if (session.edited) onChange((s) => ({ ...s, text }));
    else repropose(text, session.kind);
  }
  function editDraft(index: number, patch: Partial<EditableDraft>, markEdited = true) {
    onChange((s) => ({ ...s, edited: s.edited || markEdited, drafts: s.drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)) }));
  }
  async function proposeWithAI() {
    if (!ai || aiProblem || !session.text.trim()) return;
    const host = aiHost(ai.baseUrl);
    const length = Math.min(session.text.trim().length, MAX_AI_SOURCE_CHARS);
    if (
      !window.confirm(
        `Se enviarán ${length.toLocaleString("es-ES")} caracteres del texto fuente a ${host} para que proponga conceptos.\n\nNo envíes documentos privados ni datos personales sin permiso. ¿Continuar?`,
      )
    )
      return;
    const controller = new AbortController();
    abortRef.current = controller;
    setAiState({ status: "loading", message: `Consultando a ${host}…` });
    try {
      const result = await extractConceptsWithAI(ai, session.text, controller.signal);
      if (controller.signal.aborted) return;
      onChange((s) => ({ ...s, drafts: withChecks(result.drafts), truncated: false, edited: false }));
      const unverified = result.drafts.filter((d) => d.unverified).length;
      setAiState({
        status: "done",
        message:
          `La IA propuso ${result.drafts.length} ${result.drafts.length === 1 ? "borrador" : "borradores"}. Revísalos: pueden contener errores.` +
          (unverified ? ` ${unverified} ${unverified === 1 ? "cita no aparece" : "citas no aparecen"} en tu texto.` : "") +
          (result.truncated ? ` Solo se envió el principio del texto (${MAX_AI_SOURCE_CHARS.toLocaleString("es-ES")} caracteres).` : ""),
      });
    } catch (e) {
      if (controller.signal.aborted) setAiState({ status: "idle" });
      else setAiState({ status: "error", message: e instanceof AIError ? e.message : "No se pudo obtener la propuesta de la IA." });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <div className="import-form">
      <p className="muted">
        Importa PDF con texto seleccionable, DOCX, TXT, Markdown o CSV, o pega tus apuntes. FORMA propone borradores; tú decides qué es un concepto y lo corriges antes
        de guardarlo.
      </p>
      <div className="import-toolbar">
        <button type="button" className="button button-secondary" onClick={onPickFile}>
          <Upload size={16} /> Elegir archivo
        </button>
        <span>{session.fileName || "Ningún archivo seleccionado"}</span>
      </div>
      {fileError && (
        <div className="error-note" role="alert">
          {fileError}
        </div>
      )}
      {session.warning && (
        <div className="warning-note" role="note">
          {session.warning}
        </div>
      )}
      <label className="field-label" htmlFor="import-text">
        Texto fuente (también puedes pegarlo aquí)
      </label>
      <textarea id="import-text" className="field" rows={5} value={session.text} onChange={(e) => changeText(e.target.value)} placeholder="Pega los apuntes aquí…" />
      {session.kind === "csv" && (
        <p className="field-help">
          CSV: una fila por concepto. Se reconocen las columnas «concepto», «pregunta», «respuesta», «aplicación», «respuesta de aplicación» y «etiquetas»; sin cabecera
          se leen por orden.
        </p>
      )}
      <label className="field-label" htmlFor="import-subject">
        Guardar en la materia
      </label>
      <select id="import-subject" className="field" value={subjectId} onChange={(e) => onChange((s) => ({ ...s, subjectId: e.target.value }))}>
        {subjects.length > 0 && <option value="">Elige materia…</option>}
        {subjects.map((s) => (
          <option value={s.id} key={s.id}>
            {s.name}
          </option>
        ))}
        <option value={NEW_SUBJECT}>Nueva materia…</option>
      </select>
      {subjectId === NEW_SUBJECT && (
        <>
          <label className="field-label" htmlFor="import-new-subject">
            Nombre de la nueva materia
          </label>
          <input
            id="import-new-subject"
            className="field"
            maxLength={80}
            value={session.newSubjectName}
            onChange={(e) => onChange((s) => ({ ...s, subjectId: NEW_SUBJECT, newSubjectName: e.target.value }))}
            placeholder="Ej. Biología"
          />
        </>
      )}
      <div className="draft-toolbar">
        <strong>
          Borradores propuestos ({selected.length} de {session.drafts.length} marcados)
        </strong>
        <div className="draft-tools">
          {session.drafts.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const all = selected.length === session.drafts.length;
                onChange((s) => ({ ...s, drafts: s.drafts.map((d) => ({ ...d, checked: !all })) }));
              }}
            >
              {selected.length === session.drafts.length ? "Desmarcar todos" : "Marcar todos"}
            </button>
          )}
          <button type="button" className="text-button" onClick={() => repropose(session.text, session.kind)} disabled={!session.text.trim()}>
            Volver a proponer
          </button>
          {ai && (
            <button
              type="button"
              className="button button-secondary small"
              onClick={proposeWithAI}
              disabled={!session.text.trim() || !!aiProblem || aiState.status === "loading"}
              title={aiProblem}
            >
              <Sparkles size={15} /> Proponer con IA
            </button>
          )}
        </div>
      </div>
      {ai && aiProblem && <p className="field-help">IA no disponible: {aiProblem} Revísalo en Configuración.</p>}
      {aiState.status === "loading" && (
        <div className="ai-status" role="status">
          <span>{aiState.message}</span>
          <button type="button" className="text-button" onClick={() => abortRef.current?.abort()}>
            Cancelar
          </button>
        </div>
      )}
      {aiState.status === "error" && (
        <div className="error-note" role="alert">
          {aiState.message}
        </div>
      )}
      {aiState.status === "done" && (
        <div className="warning-note" role="status">
          {aiState.message}
        </div>
      )}
      {session.truncated && (
        <p className="field-help">
          Se muestran los primeros {MAX_DRAFTS} borradores. Guarda estos y vuelve a importar el resto del texto por partes.
        </p>
      )}
      {session.text.trim() && session.drafts.length === 0 && (
        <p className="field-help">No se han encontrado fragmentos suficientemente largos para proponer conceptos. Añade más texto o crea los conceptos a mano.</p>
      )}
      <div className="draft-list">
        {session.drafts.map((d, i) => (
          <div className={`draft-item ${d.checked ? "" : "draft-off"}`} key={i}>
            <input type="checkbox" checked={d.checked} aria-label={`Incluir el borrador ${i + 1}: ${d.title}`} onChange={(e) => editDraft(i, { checked: e.target.checked }, false)} />
            <div className="draft-fields">
              <input
                className="field draft-title"
                value={d.title}
                maxLength={120}
                aria-label={`Nombre del concepto ${i + 1}`}
                aria-invalid={d.checked && !d.title.trim()}
                onChange={(e) => editDraft(i, { title: e.target.value })}
                placeholder="Nombre del concepto"
              />
              {d.prompt !== undefined && (
                <input className="field" value={d.prompt} aria-label={`Pregunta del concepto ${i + 1}`} onChange={(e) => editDraft(i, { prompt: e.target.value })} placeholder="Pregunta de recuerdo" />
              )}
              <textarea
                className="field"
                rows={2}
                value={d.explanation}
                aria-label={`Respuesta de referencia del concepto ${i + 1}`}
                onChange={(e) => editDraft(i, { explanation: e.target.value })}
                placeholder="Respuesta de referencia"
              />
              <p className="draft-meta">
                <span>
                  Fuente: {session.fileName || PASTED_SOURCE_NAME}
                  {d.page !== undefined ? ` · página ${d.page}` : ""}
                </span>
                {d.origin === "ai" && <span className="draft-flag">Propuesto por IA</span>}
                {d.unverified && <span className="draft-flag draft-flag-warn">Cita no encontrada en tu texto</span>}
              </p>
            </div>
          </div>
        ))}
      </div>
      {untitled && <p className="field-help">Hay borradores marcados sin nombre: escríbelo o desmárcalos.</p>}
      <div className="modal-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={() => onSave({ subjectId, newSubjectName: session.newSubjectName })}
          disabled={!selected.length || untitled || !destinationReady}
        >
          Guardar {selected.length || ""} {selected.length === 1 ? "concepto" : "conceptos"}
        </button>
      </div>
    </div>
  );
}

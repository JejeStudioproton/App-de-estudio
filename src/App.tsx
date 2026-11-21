import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Pencil,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileDown,
  FilePlus2,
  GraduationCap,
  Lightbulb,
  ListChecks,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type { AppState, Concept, Method, ReviewEvent, Skill, Subject } from "./domain";
import { METHOD_LABELS, SKILL_LABELS } from "./domain";
import {
  COLORS,
  applyReview,
  createConcept,
  createSubject,
  dueCount,
  exportState,
  importState,
  learningProfile,
  planSession,
  qualityFromRating,
  uid,
} from "./engine";
import { clearLocalState, loadState, saveState } from "./storage";
import { ImportError, draftToConceptInput, importDocument } from "./importer";
import { loadSessionKey, saveSessionKey, type AIConfig } from "./ai";
import { ImportPanel, NEW_SUBJECT, emptyImportSession, sessionFromDocument, type ImportSession } from "./components/ImportPanel";
import { AISettingsPanel } from "./components/AISettingsPanel";
import { analytics } from "./analytics";
import { buildExamPlan, type ActivityKind } from "./planner";
import { filterAndSortConcepts, CONCEPT_SORT_LABELS, type ConceptSort } from "./conceptList";
import { applyConceptEdit } from "./conceptEdit";
import { activeReviews, resetConceptProgress } from "./progress";
import { resolveReviewSkill } from "./skills";
import { diagnoseAll, DIAGNOSIS_LABELS } from "./diagnosis";
import { compareMethods, evidenceLevel } from "./evidence";
import { summarizeSession, type SessionSummary } from "./sessionSummary";
import { daysUntil, isDueToday, localDateString } from "./dates";
import { buildQueue, canRelearn, pendingRelearn, requeueAfterFail, type RelearnOutcome, type SessionItem } from "./session";
import { dueLabel, todaySummary } from "./today";
import { buildSample } from "./sample";
import { conceptMinutes } from "./priority";
import { canBuildChoices, choicesFromForm, wrongLinesOf } from "./choices";
import { findDuplicate } from "./duplicates";
import { backupReminder, snoozeUntil } from "./backup";
import { PracticeCard, type PracticeResult } from "./components/PracticeCard";
import { ExamPlanPanel } from "./components/ExamPlanPanel";
import { SessionSummaryView } from "./components/SessionSummaryView";
import { DiagnosisChips } from "./components/DiagnosisChips";

type Page = "home" | "subjects" | "subject" | "practice" | "insights" | "settings" | "library";
const fmt = (n: number) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Método con el que se abre la tarjeta cuando se empieza desde una actividad del plan de examen. */
const ACTIVITY_METHOD: Record<ActivityKind, Method> = {
  recall: "active-recall",
  explanation: "explanation",
  application: "application",
};
/** Valores opcionales de la instalación (.env). Sin ellos, la IA solo funciona si el estudiante escribe los suyos. */
const ENV_AI = {
  baseUrl: String(import.meta.env.VITE_FORMA_AI_BASE_URL ?? "").trim(),
  model: String(import.meta.env.VITE_FORMA_AI_MODEL ?? "").trim(),
};
/** Campos de un concepto que cambia un repaso; es lo que se restaura al deshacer. */
const REVIEW_FIELDS = [
  "mastery",
  "memory",
  "understanding",
  "application",
  "dueAt",
  "intervalDays",
  "repetitions",
  "lapses",
  "lastReviewedAt",
  "lastMethod",
  "confidenceCalibration",
  "updatedAt",
] as const satisfies readonly (keyof Concept)[];
type UndoStep = {
  queue: SessionItem[];
  index: number;
  relearn: Record<string, RelearnOutcome>;
  /** Solo si la tarjeta deshecha registró un repaso. */
  review?: { eventId: string; conceptId: string; before: Pick<Concept, (typeof REVIEW_FIELDS)[number]> };
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [page, setPage] = useState<Page>("home");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [search, setSearch] = useState("");
  const [conceptQuery, setConceptQuery] = useState("");
  const [conceptSort, setConceptSort] = useState<ConceptSort>("default");
  const [modal, setModal] = useState<"subject" | "concept" | "edit-concept" | "import" | "none">("none");
  const [toast, setToast] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  /** Tarjetas de la sesión en curso: cada concepto una vez y, si se falla, repeticiones más adelante. */
  const [queue, setQueue] = useState<SessionItem[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [methodOverride, setMethodOverride] = useState<Method | "">("");
  /** Método fijado para toda la sesión (por ejemplo, un test). El selector de la tarjeta lo cambia solo para esa tarjeta. */
  const [sessionMethod, setSessionMethod] = useState<Method | "">("");
  const [sessionEvents, setSessionEvents] = useState<ReviewEvent[]>([]);
  /** Qué pasó con los conceptos fallados al volver a preguntarlos en esta sesión. No se guarda con los datos. */
  const [relearn, setRelearn] = useState<Record<string, RelearnOutcome>>({});
  const [undo, setUndo] = useState<UndoStep | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [summaryRelearn, setSummaryRelearn] = useState<{ recovered: string[]; pending: string[] }>({
    recovered: [],
    pending: [],
  });
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [imp, setImp] = useState<ImportSession>(emptyImportSession);
  const [importError, setImportError] = useState("");
  /** Clave de la IA opcional: solo en memoria y en sessionStorage, nunca en `state` ni en las copias. */
  const [aiKey, setAiKeyState] = useState(() => loadSessionKey());
  function setAiKey(key: string) {
    setAiKeyState(key);
    saveSessionKey(key);
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      saveState(state);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Error al guardar");
    }
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), Math.min(10000, Math.max(3200, toast.length * 70)));
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!mobileMenu) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenu(false);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [mobileMenu]);
  const subject = state.subjects.find((s) => s.id === selectedSubject);
  /** Las materias archivadas conservan todo, pero sus conceptos no entran en los repasos ni en el inicio. */
  const archivedSubjects = useMemo(() => state.subjects.filter((s) => s.archived), [state.subjects]);
  const activeConcepts = useMemo(() => {
    if (!archivedSubjects.length) return state.concepts;
    const archived = new Set(archivedSubjects.map((s) => s.id));
    return state.concepts.filter((c) => !archived.has(c.subjectId));
  }, [state.concepts, archivedSubjects]);
  const concepts = useMemo(
    () => (selectedSubject ? state.concepts.filter((c) => c.subjectId === selectedSubject) : activeConcepts),
    [state.concepts, activeConcepts, selectedSubject],
  );
  const shownConcepts = useMemo(
    () => filterAndSortConcepts(concepts, conceptQuery, conceptSort),
    [concepts, conceptQuery, conceptSort],
  );
  const stats = useMemo(
    () => analytics({ ...state, concepts: activeConcepts, subjects: state.subjects.filter((s) => !s.archived) }),
    [state, activeConcepts],
  );
  const filteredSubjects = state.subjects.filter(
    (s) => !s.archived && `${s.name} ${s.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  /** Intentos que cuentan para el estado actual (excluye los anteriores al reinicio de cada concepto). El historial completo sigue en state.reviews. */
  const liveReviews = useMemo(() => activeReviews(state.concepts, state.reviews), [state.concepts, state.reviews]);
  /** Lo que toca hoy en el ámbito actual (toda la biblioteca o la materia abierta). */
  const dueConcepts = useMemo(() => concepts.filter((c) => isDueToday(c.dueAt)), [concepts]);
  /** Sin repasos pendientes, la sesión que se ofrece es un repaso extra y voluntario. */
  const extraPractice = concepts.length > 0 && dueConcepts.length === 0;
  const activePlan = useMemo(
    () =>
      planSession(dueConcepts.length ? dueConcepts : concepts, liveReviews, state.settings.dailyMinutes, Date.now(), {
        subjects: state.subjects,
        sessionLength: state.settings.sessionLength,
      }),
    [concepts, dueConcepts, liveReviews, state.subjects, state.settings.dailyMinutes, state.settings.sessionLength],
  );
  const planMinutes = activePlan.reduce((sum, p) => {
    const c = state.concepts.find((x) => x.id === p.conceptId);
    return sum + (c ? conceptMinutes(c) : 0);
  }, 0);
  const today = useMemo(() => todaySummary(activeConcepts, state.reviews), [activeConcepts, state.reviews]);
  const backupDue = useMemo(() => backupReminder(state), [state]);
  /** Método y habilidad recomendados para cualquier concepto (también los que se abren sueltos desde una materia). */
  const planById = useMemo(
    () =>
      new Map(
        planSession(state.concepts, liveReviews, 1e6, Date.now(), {
          subjects: state.subjects,
          sessionLength: state.concepts.length || 1,
        }).map((p) => [p.conceptId, p]),
      ),
    [state.concepts, liveReviews, state.subjects],
  );
  const diagnoses = useMemo(() => diagnoseAll(liveReviews), [liveReviews]);
  const comparisons = useMemo(() => compareMethods(state.reviews), [state.reviews]);
  const examPlan = useMemo(
    () =>
      subject
        ? buildExamPlan({
            subject,
            concepts: state.concepts.filter((c) => c.subjectId === subject.id),
            reviews: liveReviews,
            dailyMinutes: state.settings.dailyMinutes,
            today: localDateString(),
          })
        : undefined,
    [subject, state.concepts, liveReviews, state.settings.dailyMinutes],
  );
  const upcomingExams = useMemo(
    () =>
      state.subjects
        .filter((s) => !s.archived && s.examDate && (daysUntil(s.examDate) ?? -1) >= 0)
        .sort((a, b) => (daysUntil(a.examDate) ?? 0) - (daysUntil(b.examDate) ?? 0))
        .slice(0, 2)
        .map((s) => ({
          subject: s,
          plan: buildExamPlan({
            subject: s,
            concepts: state.concepts.filter((c) => c.subjectId === s.id),
            reviews: liveReviews,
            dailyMinutes: state.settings.dailyMinutes,
            today: localDateString(),
          }),
        })),
    [state.subjects, state.concepts, liveReviews, state.settings.dailyMinutes],
  );
  const currentItem: SessionItem | undefined = queue[sessionIndex];
  const currentConcept = currentItem ? state.concepts.find((c) => c.id === currentItem.conceptId) : undefined;
  const currentPlan = currentConcept ? planById.get(currentConcept.id) : undefined;
  /** Conceptos de la misma materia que la tarjeta actual: de ahí salen las opciones incorrectas del tipo test. */
  const currentPool = useMemo(
    () => (currentConcept ? state.concepts.filter((c) => c.subjectId === currentConcept.subjectId) : []),
    [state.concepts, currentConcept],
  );
  // Una repetición usa el mismo método con el que se falló; el resto, el elegido, el de la sesión o el recomendado.
  const wantedMethod: Method =
    (currentItem && currentItem.attempt > 0 && currentItem.method) ||
    methodOverride ||
    sessionMethod ||
    currentPlan?.suggestedMethod ||
    "active-recall";
  // El tipo test solo es posible si hay opciones que mostrar; si no, se pregunta de la forma recomendada.
  const activeMethod: Method =
    wantedMethod === "multiple-choice" && !(currentConcept && canBuildChoices(currentConcept, currentPool))
      ? currentPlan?.suggestedMethod && currentPlan.suggestedMethod !== "multiple-choice"
        ? currentPlan.suggestedMethod
        : "active-recall"
      : wantedMethod;
  /** Conceptos de la materia abierta que se pueden preguntar como tipo test. */
  const testableIds = useMemo(
    () => (subject ? concepts.filter((c) => canBuildChoices(c, concepts)).map((c) => c.id) : []),
    [subject, concepts],
  );
  const aiConfig: AIConfig = {
    baseUrl: state.settings.aiBaseUrl || ENV_AI.baseUrl,
    model: state.settings.aiModel || ENV_AI.model,
    apiKey: aiKey,
  };
  function notify(text: string) {
    setToast(text);
  }
  /** Primer paso útil: sesión si hay conceptos, concepto si hay materia, materia si no hay nada. */
  function startOrOnboard() {
    if (state.concepts.length) {
      startSession();
      return;
    }
    const first = state.subjects[0];
    if (first) {
      setSelectedSubject(first.id);
      setModal("concept");
    } else setModal("subject");
  }
  function downloadBackup() {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forma-copia-${localDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setState((s) => ({ ...s, lastBackupAt: new Date().toISOString(), backupSnoozedUntil: undefined }));
    notify("Copia exportada como archivo JSON. Guárdala fuera de este navegador.");
  }
  useEffect(() => {
    const section =
      page === "home"
        ? "Inicio"
        : page === "subjects"
          ? "Materias"
          : page === "subject"
            ? (subject?.name ?? "Materia")
            : page === "practice"
              ? "Sesión de estudio"
              : page === "insights"
                ? "Cómo aprendo"
                : page === "settings"
                  ? "Configuración"
                  : "Biblioteca";
    document.title = `${section} · FORMA`;
  }, [page, subject]);
  function go(next: Page) {
    setPage(next);
    setMobileMenu(false);
    if (next !== "practice") setSummary(null);
    if (next !== "subject" && next !== "practice") setSelectedSubject("");
  }
  const [editingId, setEditingId] = useState("");
  const editingConcept = state.concepts.find((c) => c.id === editingId);
  function saveEdit(input: Partial<Concept> & Pick<Concept, "subjectId" | "title">) {
    if (!editingConcept) return;
    const r = applyConceptEdit(editingConcept, input);
    if (!r.ok) {
      notify(r.error);
      return;
    }
    setState((s) => ({ ...s, concepts: s.concepts.map((c) => (c.id === r.concept.id ? r.concept : c)) }));
    setModal("none");
    setEditingId("");
    notify("Concepto actualizado. Tu progreso se ha conservado.");
  }
  function resetProgress() {
    if (!editingConcept) return;
    if (
      !window.confirm(
        `¿Reiniciar el progreso de «${editingConcept.title}»?\n\nEl dominio, los repasos programados y el diagnóstico de este concepto volverán a empezar. El contenido y el historial de intentos se conservan, pero los intentos anteriores dejarán de influir en tu plan.`,
      )
    )
      return;
    const reset = resetConceptProgress(editingConcept);
    setState((s) => ({ ...s, concepts: s.concepts.map((c) => (c.id === reset.id ? reset : c)) }));
    setModal("none");
    setEditingId("");
    notify("Progreso reiniciado. El concepto vuelve a aparecer como pendiente.");
  }
  function updateConcept(id: string, patch: Partial<Concept>) {
    setState((s) => ({
      ...s,
      concepts: s.concepts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c)),
    }));
  }
  function relearnTitles(log: Record<string, RelearnOutcome>, concepts: Concept[]) {
    const title = (id: string) => concepts.find((c) => c.id === id)?.title;
    const of = (outcome: RelearnOutcome) =>
      Object.keys(log)
        .filter((id) => log[id] === outcome)
        .map(title)
        .filter((t): t is string => !!t);
    return { recovered: of("recovered"), pending: of("pending") };
  }
  /** Cierra la sesión y muestra el resumen con lo registrado hasta ahora. */
  function showSummary(events: ReviewEvent[], next: AppState, log: Record<string, RelearnOutcome>) {
    setSummary(summarizeSession({ events, concepts: next.concepts, allReviews: activeReviews(next.concepts, next.reviews) }));
    setSummaryRelearn(relearnTitles(log, next.concepts));
    setQueue([]);
    setUndo(null);
  }
  function finishSession() {
    if (!sessionEvents.length) {
      setQueue([]);
      setUndo(null);
      go("home");
      return;
    }
    showSummary(sessionEvents, state, relearn);
  }
  function updateSubject(id: string, patch: Partial<Subject>) {
    setState((s) => ({
      ...s,
      subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: new Date().toISOString() } : x)),
    }));
  }
  function addSubject(name: string, description: string, examDate: string) {
    if (!name.trim()) {
      notify("Escribe el nombre de la materia.");
      return;
    }
    const s = createSubject(name, description, examDate || undefined);
    setState((old) => ({ ...old, subjects: [...old.subjects, s], activeSubjectId: s.id }));
    setSelectedSubject(s.id);
    setModal("none");
    setPage("subject");
    notify("Materia creada.");
  }
  /** Guarda un concepto nuevo. Con `another`, la ventana sigue abierta para escribir el siguiente. Devuelve si se guardó. */
  function addConcept(input: Partial<Concept> & Pick<Concept, "subjectId" | "title">, another = false): boolean {
    if (!input.title.trim()) {
      notify("Escribe un título para el concepto.");
      return false;
    }
    const c = createConcept(input);
    setState((s) => ({ ...s, concepts: [c, ...s.concepts] }));
    if (another) notify(`«${c.title}» guardado. Escribe el siguiente.`);
    else {
      setModal("none");
      notify("Concepto guardado.");
    }
    return true;
  }
  function openSubject(id: string) {
    setSelectedSubject(id);
    setConceptQuery("");
    setConceptSort("default");
    setPage("subject");
  }
  function startSession(ids?: string[], method?: Method, wholeSession: Method | "" = "") {
    const items = buildQueue((ids ?? activePlan.map((p) => p.conceptId)).filter((id) => state.concepts.some((c) => c.id === id)));
    if (!items.length) {
      notify("Añade conceptos para iniciar una sesión.");
      return;
    }
    setQueue(items);
    setSessionIndex(0);
    setSessionEvents([]);
    setRelearn({});
    setUndo(null);
    setSummary(null);
    // Desde el plan de examen la tarjeta se abre con la actividad que el plan indica (recuerdo, explicación o aplicación).
    setMethodOverride(method ?? "");
    setSessionMethod(wholeSession);
    setPage("practice");
  }
  /** Test de la materia abierta: lo más prioritario que se pueda preguntar con opciones, hasta el tamaño de sesión. */
  function startTest() {
    const ids = new Set(testableIds);
    startSession(
      [...planById.keys()].filter((id) => ids.has(id)).slice(0, state.settings.sessionLength),
      undefined,
      "multiple-choice",
    );
  }
  function archiveSubject(id: string, archived: boolean) {
    const name = state.subjects.find((x) => x.id === id)?.name ?? "La materia";
    updateSubject(id, { archived });
    if (archived) {
      setSelectedSubject("");
      setPage("subjects");
      notify(`«${name}» archivada. Sus conceptos ya no aparecen en los repasos; puedes recuperarla desde Materias.`);
    } else notify(`«${name}» recuperada. Sus repasos pendientes vuelven a contar.`);
  }
  /** Todos los conceptos de la materia abierta, por orden de prioridad: para repasarla entera antes de un examen. */
  function startFullReview() {
    const ids = new Set(concepts.map((c) => c.id));
    startSession([...planById.keys()].filter((id) => ids.has(id)));
  }
  /** Pasa a la tarjeta siguiente o, si no quedan, al resumen. */
  function advance(nextQueue: SessionItem[], events: ReviewEvent[], next: AppState, log: Record<string, RelearnOutcome>) {
    setMethodOverride("");
    if (sessionIndex + 1 < nextQueue.length) setSessionIndex(sessionIndex + 1);
    else showSummary(events, next, log);
  }
  /** Registra el intento que cuenta de la tarjeta actual. Si se falló, el concepto vuelve a salir más adelante en la sesión. */
  function recordReview(result: PracticeResult) {
    if (!currentConcept || !currentItem || currentItem.attempt > 0) return;
    const method = activeMethod;
    const failed = result.rating <= 1;
    const classified = failed ? result.errorKind : undefined;
    const event: ReviewEvent = {
      id: uid("rev"),
      conceptId: currentConcept.id,
      subjectId: currentConcept.subjectId,
      at: new Date().toISOString(),
      method,
      skill: resolveReviewSkill(currentPlan?.suggestedSkill, currentPlan?.suggestedMethod, method),
      rating: result.rating,
      confidence: result.confidence / 3,
      responseSeconds: result.responseSeconds,
      hintUsed: result.hintUsed,
      answerQuality: qualityFromRating(result.rating),
      errorTags: classified ? [classified] : [],
      errorKind: classified,
      note: result.answer || undefined,
      dueBefore: currentConcept.dueAt,
    };
    const next = applyReview(state, event);
    const events = [...sessionEvents, event];
    // Tras fallar un test, la repetición es sin opciones: reconocer la respuesta recién vista no demostraría nada.
    const nextQueue = failed
      ? requeueAfterFail(queue, sessionIndex, method === "multiple-choice" ? "active-recall" : method)
      : queue;
    const log: Record<string, RelearnOutcome> = nextQueue !== queue ? { ...relearn, [currentConcept.id]: "pending" } : relearn;
    const before = Object.fromEntries(REVIEW_FIELDS.map((k) => [k, currentConcept[k]])) as Pick<
      Concept,
      (typeof REVIEW_FIELDS)[number]
    >;
    setUndo({ queue, index: sessionIndex, relearn, review: { eventId: event.id, conceptId: currentConcept.id, before } });
    setState(next);
    setSessionEvents(events);
    setQueue(nextQueue);
    setRelearn(log);
    advance(nextQueue, events, next, log);
  }
  /** Respuesta a una repetición dentro de la sesión. No se registra como evidencia ni cambia la fecha de repaso. */
  function answerRelearn(recalled: boolean) {
    if (!currentConcept || !currentItem || currentItem.attempt === 0) return;
    const nextQueue = recalled ? queue : requeueAfterFail(queue, sessionIndex);
    const log: Record<string, RelearnOutcome> = { ...relearn, [currentConcept.id]: recalled ? "recovered" : "pending" };
    setUndo({ queue, index: sessionIndex, relearn });
    setQueue(nextQueue);
    setRelearn(log);
    advance(nextQueue, sessionEvents, state, log);
  }
  /** Deshace la última tarjeta respondida de la sesión (un solo paso). */
  function undoLast() {
    if (!undo) return;
    const { review } = undo;
    if (review) {
      setState((s) => ({
        ...s,
        concepts: s.concepts.map((c) => (c.id === review.conceptId ? { ...c, ...review.before } : c)),
        reviews: s.reviews.filter((r) => r.id !== review.eventId),
      }));
      setSessionEvents((events) => events.filter((e) => e.id !== review.eventId));
    }
    setQueue(undo.queue);
    setSessionIndex(undo.index);
    setRelearn(undo.relearn);
    setMethodOverride("");
    setUndo(null);
    notify("Última respuesta deshecha.");
  }
  /** Añade una materia de ejemplo para probar la app sin escribir nada. */
  function addSample() {
    const { subject: sample, concepts: sampleConcepts } = buildSample();
    setState((s) => ({ ...s, subjects: [...s.subjects, sample], concepts: [...sampleConcepts, ...s.concepts] }));
    notify(`Materia de ejemplo añadida con ${sampleConcepts.length} conceptos. Puedes borrarla cuando quieras.`);
  }
  function openImport() {
    setImportError("");
    setModal("import");
  }
  async function onFile(file?: File) {
    if (!file) return;
    try {
      const doc = await importDocument(file);
      setImp((prev) => sessionFromDocument(doc, prev));
      setImportError("");
      setModal("import");
    } catch (e) {
      const message = e instanceof ImportError ? e.message : "No se pudo leer el archivo.";
      // Con la ventana de importación abierta el error se muestra dentro; si no, como aviso.
      setImportError(message);
      if (modal !== "import") notify(message);
    }
  }
  function saveDrafts(destination: { subjectId: string; newSubjectName: string }) {
    const selected = imp.drafts.filter((d) => d.checked && d.title.trim());
    if (!selected.length) {
      notify("Marca al menos un borrador con nombre.");
      return;
    }
    let subjectId = destination.subjectId;
    let created: Subject | undefined;
    if (subjectId === NEW_SUBJECT) {
      const name = destination.newSubjectName.trim();
      if (!name) {
        notify("Escribe el nombre de la nueva materia.");
        return;
      }
      created = createSubject(name);
      subjectId = created.id;
    } else if (!state.subjects.some((s) => s.id === subjectId)) {
      notify("Elige una materia de destino válida.");
      return;
    }
    const added = selected.map((d) => createConcept(draftToConceptInput(d, subjectId, imp.fileName)));
    const subjectName = created?.name ?? state.subjects.find((s) => s.id === subjectId)?.name ?? "la materia";
    setState((s) => ({ ...s, subjects: created ? [...s.subjects, created] : s.subjects, concepts: [...added, ...s.concepts] }));
    setModal("none");
    setImp(emptyImportSession());
    setImportError("");
    // Lleva a la materia para ver lo importado, salvo que haya una sesión de estudio en curso.
    if (page !== "practice") {
      setSelectedSubject(subjectId);
      setConceptQuery("");
      setConceptSort("default");
      setPage("subject");
    }
    notify(
      `${added.length} ${added.length === 1 ? "concepto añadido" : "conceptos añadidos"} a «${subjectName}». Puedes seguir editándolos desde la materia.`,
    );
  }
  function restoreBackup(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importState(String(reader.result));
        if (confirm("Esto reemplazará los datos locales actuales. ¿Continuar?")) {
          // Lo restaurado acaba de salir de un archivo: esa copia existe.
          setState({ ...next, lastBackupAt: new Date().toISOString(), backupSnoozedUntil: undefined });
          setSelectedSubject("");
          setPage("home");
          setQueue([]);
          setUndo(null);
          setSummary(null);
          setModal("none");
          setEditingId("");
          notify("Copia restaurada.");
        }
      } catch {
        notify("El archivo no parece una copia válida de FORMA.");
      }
    };
    reader.readAsText(file);
  }
  function deleteConcept(id: string) {
    if (!confirm("¿Eliminar este concepto y sus repasos?")) return;
    setState((s) => ({
      ...s,
      concepts: s.concepts.filter((c) => c.id !== id),
      reviews: s.reviews.filter((r) => r.conceptId !== id),
    }));
  }
  function deleteSubject(id: string) {
    if (!confirm("Se eliminarán la materia, sus conceptos y sus repasos. ¿Continuar?")) return;
    const ids = state.concepts.filter((c) => c.subjectId === id).map((c) => c.id);
    setState((s) => ({
      ...s,
      subjects: s.subjects.filter((x) => x.id !== id),
      concepts: s.concepts.filter((c) => c.subjectId !== id),
      reviews: s.reviews.filter((r) => !ids.includes(r.conceptId)),
    }));
    setSelectedSubject("");
    setPage("subjects");
    notify("Materia eliminada.");
  }
  const nav = [
    { id: "home" as Page, label: "Inicio", icon: Activity },
    { id: "subjects" as Page, label: "Materias", icon: BookOpen },
    { id: "insights" as Page, label: "Cómo aprendo", icon: Brain },
  ];
  return (
    <div
      className={`app theme-${state.settings.theme === "system" ? (prefersDark ? "dark" : "light") : state.settings.theme}${state.settings.reducedMotion ? " reduce-motion" : ""}`}
    >
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">f.</div>
          <div>
            <strong>FORMA</strong>
            <span>Aprende con intención</span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú">
            <X size={18} />
          </button>
        </div>
        <div className="nav-label">Espacio de estudio</div>
        <nav id="main-nav" aria-label="Secciones">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id || ((page === "subject" || page === "library") && n.id === "subjects") ? "active" : ""}`}
              aria-current={
                page === n.id || ((page === "subject" || page === "library") && n.id === "subjects") ? "page" : undefined
              }
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "subjects" && <span className="nav-count">{state.subjects.filter((s) => !s.archived).length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-note">
            <Lightbulb size={17} />
            <p>La mejor técnica es la que demuestra funcionar para ti, no la que promete más.</p>
          </div>
          <button className="nav-item" onClick={() => go("settings")}>
            <Settings size={18} />
            <span>Configuración</span>
          </button>
          <div className="local-status">
            <span className="status-dot" />
            <span>Datos guardados en este dispositivo</span>
          </div>
        </div>
      </aside>
      {mobileMenu && <button className="scrim" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú" />}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileMenu(true)}
            aria-label="Abrir menú"
            aria-expanded={mobileMenu}
            aria-controls="main-nav"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <span>FORMA</span>
            <span>/</span>
            <strong>
              {page === "home"
                ? "Inicio"
                : page === "subjects"
                  ? "Materias"
                  : page === "subject"
                    ? (subject?.name ?? "Materia")
                    : page === "practice"
                      ? "Sesión de estudio"
                      : page === "insights"
                        ? "Cómo aprendo"
                        : page === "settings"
                          ? "Configuración"
                          : "Biblioteca"}
            </strong>
          </div>
          <div className="top-actions">
            <button className="button button-quiet small" onClick={downloadBackup}>
              <FileDown size={16} /> Exportar copia
            </button>
            <input
              ref={backupRef}
              hidden
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                restoreBackup(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
            <button className="avatar" onClick={() => go("settings")} aria-label="Abrir configuración" title="Configuración">
              <Settings size={17} />
            </button>
          </div>
        </header>
        <div className="content">
          {page === "home" && (
            <>
              {state.concepts.length === 0 ? (
                <section className="page-heading">
                  <div>
                    <p className="eyebrow">Tu espacio de aprendizaje</p>
                    <h1>
                      Aprender mejor empieza
                      <br className="desktop-only" /> por entender qué funciona.
                    </h1>
                    <p className="subheading">Un plan de estudio basado en lo que recuerdas, comprendes y sabes aplicar.</p>
                  </div>
                  <div className="heading-actions">
                    <button className="button button-secondary" onClick={addSample}>
                      <Sparkles size={17} /> Probar con un ejemplo
                    </button>
                    <button className="button button-primary" onClick={startOrOnboard}>
                      <Plus size={17} /> {state.subjects.length ? "Añadir concepto" : "Crear materia"}
                    </button>
                  </div>
                </section>
              ) : (
                <section className="page-heading">
                  <div>
                    <p className="eyebrow today-date">
                      {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <h1>
                      {today.due > 0
                        ? `Hoy te ${today.due === 1 ? "toca" : "tocan"} ${plural(today.due, "repaso", "repasos")}.`
                        : today.studiedToday
                          ? "Hoy ya está todo repasado."
                          : "Hoy no te toca ningún repaso."}
                    </h1>
                    <p className="subheading">
                      {today.due > 0
                        ? `Unos ${today.dueMinutes} min en total.${today.reviewsToday ? ` Hoy llevas ${plural(today.reviewsToday, "repaso hecho", "repasos hechos")}.` : ""}`
                        : today.next
                          ? `El próximo repaso es ${today.next.inDays === 1 ? "mañana" : `dentro de ${today.next.inDays} días`}: ${plural(today.next.count, "concepto", "conceptos")}. Si quieres seguir hoy, puedes hacer un repaso extra.`
                          : "Si quieres seguir hoy, puedes hacer un repaso extra."}
                    </p>
                  </div>
                  <button
                    className={`button ${today.due > 0 ? "button-primary" : "button-secondary"}`}
                    onClick={() => startSession()}
                  >
                    {today.due > 0 ? (
                      <>
                        <Zap size={17} /> Estudiar ahora <ArrowRight size={16} />
                      </>
                    ) : (
                      <>
                        <Sparkles size={17} /> Repaso extra
                      </>
                    )}
                  </button>
                </section>
              )}
              {backupDue && (
                <div className="panel backup-banner" role="status">
                  <div>
                    <strong>Guarda una copia de tus datos</strong>
                    <p className="muted">
                      Todo lo que estudias está solo en este navegador: si se borran sus datos, se pierde.{" "}
                      {backupDue.daysSince === undefined
                        ? "Todavía no has exportado ninguna copia."
                        : `Tu última copia es de hace ${backupDue.daysSince} días.`}
                    </p>
                  </div>
                  <div className="study-bar-actions">
                    <button className="button button-secondary" onClick={downloadBackup}>
                      <FileDown size={16} /> Exportar copia
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setState((s) => ({ ...s, backupSnoozedUntil: snoozeUntil() }))}
                    >
                      Ahora no
                    </button>
                  </div>
                </div>
              )}
              <div className="stat-grid">
                <Stat
                  label="Para hoy"
                  value={fmt(today.due)}
                  note={
                    today.due ? `Unos ${today.dueMinutes} min` : state.concepts.length ? "Vas al día" : "Sin conceptos todavía"
                  }
                  icon={<Clock3 />}
                />
                <Stat
                  label="Hechos hoy"
                  value={fmt(today.reviewsToday)}
                  note={
                    today.reviewsToday
                      ? plural(today.conceptsToday, "concepto distinto", "conceptos distintos")
                      : "Todavía ninguno"
                  }
                  icon={<Target />}
                />
                <Stat
                  label="Racha"
                  value={plural(today.streak, "día", "días")}
                  note={
                    today.studiedToday
                      ? "Hoy ya cuenta"
                      : today.streak > 0
                        ? "Estudia hoy para mantenerla"
                        : "Empieza hoy una nueva"
                  }
                  icon={<Activity />}
                >
                  <div className="week-strip" role="img" aria-label={`Días con estudio en los últimos siete: ${today.weekDays}`}>
                    {today.week.map((d) => (
                      <span key={d.day} className={`week-day ${d.studied ? "studied" : ""} ${d.isToday ? "is-today" : ""}`}>
                        {d.label}
                      </span>
                    ))}
                  </div>
                </Stat>
              </div>
              <section className="home-grid">
                <div className="panel plan-panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Siguiente paso</p>
                      <h2>{extraPractice ? "Repaso extra" : "Tu plan de hoy"}</h2>
                    </div>
                    <span className="quiet-chip">
                      {activePlan.length
                        ? `${plural(activePlan.length, "concepto", "conceptos")} · ${planMinutes} min`
                        : `${state.settings.dailyMinutes} min`}
                    </span>
                  </div>
                  <p className="panel-intro">
                    {!state.concepts.length
                      ? "Añade una materia y un primer concepto para preparar tu primera sesión."
                      : extraPractice
                        ? "No tienes repasos pendientes. Si quieres seguir, esto es lo que más te conviene reforzar. Acertar antes de tiempo no alarga los intervalos."
                        : `Esta sesión tiene ${plural(activePlan.length, "concepto", "conceptos")} (unos ${planMinutes} min). ${
                            today.due > activePlan.length
                              ? `Al terminar te ${today.due - activePlan.length === 1 ? "quedará" : "quedarán"} ${today.due - activePlan.length} más para hoy.`
                              : "Con ella terminas lo de hoy."
                          }`}
                  </p>
                  {activePlan.length === 0 ? (
                    <Empty
                      title={state.subjects.length ? "Añade tu primer concepto" : "Tu plan empieza aquí"}
                      text={
                        state.subjects.length
                          ? "Ya tienes una materia. Añade un concepto para que FORMA pueda planificar el primer repaso."
                          : "Crea una materia y añade algunos conceptos para que FORMA pueda organizar los repasos."
                      }
                      action={state.subjects.length ? "Añadir concepto" : "Crear materia"}
                      onClick={startOrOnboard}
                    />
                  ) : (
                    <div className="plan-list">
                      {activePlan.slice(0, 5).map((p, i) => {
                        const c = state.concepts.find((x) => x.id === p.conceptId)!;
                        const s = state.subjects.find((x) => x.id === c.subjectId);
                        return (
                          <button className="plan-row" key={c.id} onClick={() => startSession([c.id])}>
                            <span className="plan-number">{String(i + 1).padStart(2, "0")}</span>
                            <span className="plan-main">
                              <strong>{c.title}</strong>
                              <small>
                                {s?.name ?? "Materia"} · {p.reason}
                              </small>
                            </span>
                            <span className="plan-method">
                              {p.suggestedMethod === "active-recall"
                                ? "Recuerdo"
                                : p.suggestedMethod === "explanation"
                                  ? "Explicación"
                                  : p.suggestedMethod === "application"
                                    ? "Aplicación"
                                    : p.suggestedMethod === "worked-example"
                                      ? "Ejemplo"
                                      : "Test"}
                            </span>
                            <ArrowRight size={16} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="panel-footer">
                    <button
                      className={`button ${extraPractice ? "button-secondary" : "button-primary"}`}
                      onClick={() => startSession()}
                      disabled={!activePlan.length}
                    >
                      {extraPractice ? "Empezar repaso extra" : "Iniciar plan"} <ArrowRight size={16} />
                    </button>
                    <button className="text-button" onClick={() => go("insights")}>
                      Ver mi progreso
                    </button>
                  </div>
                </div>
                <div className="right-stack">
                  {upcomingExams.length > 0 && (
                    <div className="panel">
                      <p className="eyebrow">Exámenes próximos</p>
                      {upcomingExams.map(({ subject: s, plan }) => (
                        <div className="exam-home" key={s.id}>
                          <button className="text-button exam-home-title" onClick={() => openSubject(s.id)}>
                            <span className="subject-dot" style={{ background: s.color }} /> {s.name} <ArrowRight size={14} />
                          </button>
                          <ExamPlanPanel
                            plan={plan}
                            compact
                            onStart={(id, activity) => startSession([id], ACTIVITY_METHOD[activity])}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="panel">
                    <div className="panel-head">
                      <div>
                        <p className="eyebrow">Visión general</p>
                        <h2>Tus materias</h2>
                      </div>
                      <button className="icon-button" onClick={() => go("subjects")} aria-label="Ver materias">
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    {state.subjects.filter((s) => !s.archived).length === 0 ? (
                      <p className="muted">Todavía no hay materias.</p>
                    ) : (
                      state.subjects
                        .filter((s) => !s.archived)
                        .slice(0, 4)
                        .map((s) => {
                          const cs = state.concepts.filter((c) => c.subjectId === s.id);
                          const avg = cs.length ? cs.reduce((sum, c) => sum + c.mastery, 0) / cs.length : 0;
                          return (
                            <button className="subject-mini" key={s.id} onClick={() => openSubject(s.id)}>
                              <span className="subject-dot" style={{ background: s.color }} />
                              <span className="subject-mini-main">
                                <strong>{s.name}</strong>
                                <small>{cs.length} conceptos</small>
                                <span className="progress">
                                  <i style={{ width: `${avg * 100}%`, background: s.color }} />
                                </span>
                              </span>
                              <span className="percent">{pct(avg)}</span>
                            </button>
                          );
                        })
                    )}
                    <button className="button button-secondary full" onClick={() => setModal("subject")}>
                      <Plus size={16} /> Nueva materia
                    </button>
                  </div>
                  <div className="panel insight-callout">
                    <div className="callout-icon">
                      <Brain size={20} />
                    </div>
                    <div>
                      <p className="eyebrow">Cómo aprendo</p>
                      <h3>Descubre tus patrones</h3>
                      <p>Compara tus resultados por técnica y tipo de aprendizaje, sin sacar conclusiones con pocos datos.</p>
                      <button className="text-button" onClick={() => go("insights")}>
                        Ver análisis <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
          {page === "subjects" && (
            <>
              <section className="page-heading compact">
                <div>
                  <p className="eyebrow">Organiza tu contenido</p>
                  <h1>Materias</h1>
                  <p className="subheading">Cada materia reúne conceptos, fuentes y progreso.</p>
                </div>
                <button className="button button-primary" onClick={() => setModal("subject")}>
                  <Plus size={17} /> Nueva materia
                </button>
              </section>
              <div className="toolbar">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Buscar materias"
                    placeholder="Buscar materia…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button className="button button-secondary" onClick={openImport}>
                  <Upload size={16} /> Importar contenido
                </button>
              </div>
              {filteredSubjects.length === 0 ? (
                <Empty
                  title={search ? "No hay resultados" : "Todavía no tienes materias"}
                  text={
                    search
                      ? "Prueba con otro término."
                      : "Crea tu primera materia y añade conceptos manualmente o importa apuntes."
                  }
                  action="Crear materia"
                  onClick={() => setModal("subject")}
                />
              ) : (
                <div className="subject-grid">
                  {filteredSubjects.map((s) => {
                    const cs = state.concepts.filter((c) => c.subjectId === s.id);
                    const avg = cs.length ? cs.reduce((sum, c) => sum + c.mastery, 0) / cs.length : 0;
                    return (
                      <button className="subject-card" key={s.id} onClick={() => openSubject(s.id)}>
                        <div className="subject-card-top">
                          <span className="subject-color" style={{ background: s.color }} />
                          <span className="subject-open">
                            <ArrowRight size={18} />
                          </span>
                        </div>
                        <h2>{s.name}</h2>
                        <p>{s.description || "Sin descripción"}</p>
                        <div className="subject-card-meta">
                          <span>{cs.length} conceptos</span>
                          {s.examDate && (
                            <span>
                              <CalendarDays size={14} />
                              {new Date(`${s.examDate}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                        <div className="progress">
                          <i style={{ width: `${avg * 100}%`, background: s.color }} />
                        </div>
                        <div className="subject-card-bottom">
                          <span>Dominio estimado</span>
                          <strong>{pct(avg)}</strong>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {archivedSubjects.length > 0 && (
                <details className="panel archived-list">
                  <summary>Materias archivadas ({archivedSubjects.length})</summary>
                  <p className="field-help">
                    No aparecen en los repasos ni en el inicio. Su contenido y su historial se conservan.
                  </p>
                  <ul>
                    {archivedSubjects.map((s) => (
                      <li key={s.id}>
                        <span>
                          <span className="heading-dot" style={{ background: s.color }} />
                          <strong>{s.name}</strong>
                          <small className="muted">
                            {" "}
                            · {plural(state.concepts.filter((c) => c.subjectId === s.id).length, "concepto", "conceptos")}
                          </small>
                        </span>
                        <button className="button button-secondary" onClick={() => archiveSubject(s.id, false)}>
                          <ArchiveRestore size={16} /> Recuperar
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {page === "subject" && subject && (
            <>
              <button className="back-link" onClick={() => go("subjects")}>
                <ArrowLeft size={16} /> Todas las materias
              </button>
              <section className="page-heading compact subject-heading">
                <div>
                  <p className="eyebrow">Materia</p>
                  <h1>
                    <span className="heading-dot" style={{ background: subject.color }} />
                    {subject.name}
                  </h1>
                  <p className="subheading">
                    {subject.description || "Construye una biblioteca de conceptos que puedas recordar y aplicar."}
                  </p>
                </div>
                <div className="heading-actions">
                  <button className="button button-secondary" onClick={openImport}>
                    <Upload size={16} /> Importar
                  </button>
                  <button
                    className={`button ${concepts.length ? "button-secondary" : "button-primary"}`}
                    onClick={() => setModal("concept")}
                  >
                    <Plus size={17} /> Añadir concepto
                  </button>
                </div>
              </section>
              {concepts.length > 0 && (
                <div className="panel study-bar">
                  <div>
                    <strong>
                      {dueConcepts.length
                        ? `${plural(dueConcepts.length, "repaso pendiente", "repasos pendientes")} en esta materia`
                        : "Esta materia está al día"}
                    </strong>
                    <p className="muted">
                      {dueConcepts.length
                        ? `La sesión empieza por lo más urgente: ${plural(activePlan.length, "concepto", "conceptos")}, unos ${planMinutes} min.`
                        : "Puedes hacer un repaso extra o repasarla entera, por ejemplo antes de un examen. Acertar antes de tiempo no alarga los intervalos."}
                    </p>
                  </div>
                  <div className="study-bar-actions">
                    <button
                      className={`button ${dueConcepts.length ? "button-primary" : "button-secondary"}`}
                      onClick={() => startSession()}
                    >
                      <Zap size={17} /> {dueConcepts.length ? "Estudiar esta materia" : "Repaso extra"}
                    </button>
                    {concepts.length > activePlan.length && (
                      <button className="button button-secondary" onClick={startFullReview}>
                        Repasarla entera ({concepts.length})
                      </button>
                    )}
                    {testableIds.length >= 3 && (
                      <button className="button button-secondary" onClick={startTest}>
                        <ListChecks size={17} /> Hacer un test
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="subject-detail-grid">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Biblioteca</p>
                      <h2>Conceptos de la materia</h2>
                    </div>
                    <span className="quiet-chip">{concepts.length} total</span>
                  </div>
                  {concepts.length === 0 ? (
                    <Empty
                      title="Aún no hay conceptos"
                      text="Añádelos manualmente o importa tus apuntes. Los borradores importados se revisan antes de guardarse."
                      action="Añadir concepto"
                      onClick={() => setModal("concept")}
                    />
                  ) : (
                    <>
                      {concepts.length >= 2 && (
                        <div className="concept-toolbar">
                          <input
                            className="field"
                            type="search"
                            value={conceptQuery}
                            onChange={(e) => setConceptQuery(e.target.value)}
                            placeholder="Buscar en esta materia…"
                            aria-label="Buscar conceptos en esta materia"
                          />
                          <select
                            className="field"
                            value={conceptSort}
                            onChange={(e) => setConceptSort(e.target.value as ConceptSort)}
                            aria-label="Ordenar conceptos"
                          >
                            {(Object.keys(CONCEPT_SORT_LABELS) as ConceptSort[]).map((k) => (
                              <option key={k} value={k}>
                                {CONCEPT_SORT_LABELS[k]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {conceptQuery && shownConcepts.length === 0 && (
                        <p className="muted no-results">Ningún concepto coincide con «{conceptQuery}».</p>
                      )}
                      <div className="concept-list">
                        {shownConcepts.map((c) => (
                          <div className="concept-row" key={c.id}>
                            <button className="concept-open" onClick={() => startSession([c.id])}>
                              <span className="concept-glyph">
                                <BookOpen size={17} />
                              </span>
                              <span className="concept-info">
                                <strong>{c.title}</strong>
                                <small>
                                  {c.source ? `${c.source.fileName} · ` : ""}
                                  {c.lastReviewedAt
                                    ? `Último repaso ${new Date(c.lastReviewedAt).toLocaleDateString("es-ES")}`
                                    : "Sin repasar"}
                                  {isDueToday(c.dueAt) ? " · toca hoy" : ` · próximo repaso ${dueLabel(c.dueAt)}`}
                                </small>
                                <DiagnosisChips result={diagnoses.get(c.id)} />
                                <span className="progress">
                                  <i style={{ width: `${c.mastery * 100}%` }} />
                                </span>
                              </span>
                              <span className="percent">{pct(c.mastery)}</span>
                              <ArrowRight size={16} />
                            </button>
                            <div className="concept-actions">
                              <button
                                className="icon-button"
                                onClick={() => {
                                  setEditingId(c.id);
                                  setModal("edit-concept");
                                }}
                                aria-label={`Editar ${c.title}`}
                              >
                                <Pencil size={15} />
                              </button>
                              <select
                                className="importance-select"
                                aria-label={`Importancia de ${c.title}`}
                                value={c.importance ?? 2}
                                onChange={(e) => updateConcept(c.id, { importance: Number(e.target.value) as 1 | 2 | 3 })}
                              >
                                <option value={1}>Menor</option>
                                <option value={2}>Normal</option>
                                <option value={3}>Clave</option>
                              </select>
                              <button
                                className="icon-button danger-icon"
                                onClick={() => deleteConcept(c.id)}
                                aria-label={`Eliminar ${c.title}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="right-stack">
                  <div className="panel">
                    <p className="eyebrow">Materia</p>
                    <h2>Nombre y color</h2>
                    <label className="field-label" htmlFor="subject-name">
                      Nombre
                    </label>
                    <input
                      id="subject-name"
                      className="field"
                      key={subject.id + subject.name}
                      defaultValue={subject.name}
                      maxLength={80}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) updateSubject(subject.id, { name: v });
                        else e.target.value = subject.name;
                      }}
                    />
                    <div className="color-row" role="group" aria-label="Color de la materia">
                      {COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          className={`color-swatch ${subject.color === col ? "chosen" : ""}`}
                          style={{ background: col }}
                          aria-label={`Color ${col}`}
                          aria-pressed={subject.color === col}
                          onClick={() => updateSubject(subject.id, { color: col })}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="panel">
                    <p className="eyebrow">Examen</p>
                    <h2>Fecha importante</h2>
                    <input
                      className="field"
                      type="date"
                      value={subject.examDate ?? ""}
                      onChange={(e) => updateSubject(subject.id, { examDate: e.target.value || undefined })}
                    />
                    <p className="field-help">
                      La fecha ayuda a ordenar prioridades, pero no sustituye la evidencia de aprendizaje.
                    </p>
                    <label className="field-label">Descripción</label>
                    <textarea
                      className="field"
                      rows={3}
                      value={subject.description}
                      onChange={(e) => updateSubject(subject.id, { description: e.target.value })}
                      placeholder="Temas, unidades o notas…"
                    />
                  </div>
                  {examPlan && (
                    <div className="panel">
                      <p className="eyebrow">Plan de examen</p>
                      <h2>Qué hacer hasta la fecha</h2>
                      <ExamPlanPanel plan={examPlan} onStart={(id, activity) => startSession([id], ACTIVITY_METHOD[activity])} />
                    </div>
                  )}
                  <div className="panel">
                    <p className="eyebrow">Progreso</p>
                    <h2>Dominio estimado</h2>
                    <div className="big-progress">
                      {pct(stats.subjects.find((x) => x.subject.id === subject.id)?.mastery ?? 0)}
                    </div>
                    <div className="progress">
                      <i
                        style={{
                          width: `${(stats.subjects.find((x) => x.subject.id === subject.id)?.mastery ?? 0) * 100}%`,
                          background: subject.color,
                        }}
                      />
                    </div>
                    <p className="field-help">
                      Estimación interna basada en autoevaluaciones. No es una nota ni una medición independiente.
                    </p>
                  </div>
                  <div className="panel">
                    <p className="eyebrow">Cuando termines</p>
                    <h2>Archivar o eliminar</h2>
                    <p className="field-help">
                      Archivar retira la materia de los repasos y del inicio sin borrar nada: útil cuando ya ha pasado el examen.
                      Puedes recuperarla desde Materias.
                    </p>
                    <div className="settings-actions">
                      <button className="button button-secondary" onClick={() => archiveSubject(subject.id, true)}>
                        <Archive size={16} /> Archivar materia
                      </button>
                      <button className="button button-danger" onClick={() => deleteSubject(subject.id)}>
                        <Trash2 size={16} /> Eliminar materia
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          {page === "practice" && (
            <>
              {!currentConcept || !currentItem ? (
                summary ? (
                  <SessionSummaryView
                    summary={summary}
                    relearn={summaryRelearn}
                    today={{ reviews: today.reviewsToday, due: today.due }}
                    onDone={() => go("home")}
                    onContinue={activePlan.length ? () => startSession() : undefined}
                    continueLabel={
                      extraPractice
                        ? "Hacer un repaso extra"
                        : `Seguir: ${plural(dueConcepts.length, "pendiente", "pendientes")}${subject ? " en esta materia" : ""}`
                    }
                  />
                ) : (
                  <div className="practice-complete panel">
                    <div className="complete-mark">
                      <Check size={26} />
                    </div>
                    <p className="eyebrow">Sin sesión activa</p>
                    <h1>No hay una sesión en curso.</h1>
                    <p>Vuelve al inicio para empezar una con los conceptos que FORMA te proponga.</p>
                    <button className="button button-primary" onClick={() => go("home")}>
                      Volver al inicio <ArrowRight size={16} />
                    </button>
                  </div>
                )
              ) : (
                <div className="practice-shell">
                  <div className="practice-top">
                    <button className="back-link" onClick={finishSession}>
                      <X size={16} /> {sessionEvents.length ? "Terminar y ver resumen" : "Salir de la sesión"}
                    </button>
                    <div className="practice-tools">
                      {undo && (
                        <button className="text-button" onClick={undoLast}>
                          <Undo2 size={15} /> Deshacer
                        </button>
                      )}
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditingId(currentConcept.id);
                          setModal("edit-concept");
                        }}
                      >
                        <Pencil size={15} /> Editar
                      </button>
                      <span className="session-counter">
                        Concepto {sessionIndex + 1} de {queue.length}
                        {pendingRelearn(queue, sessionIndex) > 0 && ` · ${pendingRelearn(queue, sessionIndex)} por repetir`}
                      </span>
                    </div>
                  </div>
                  <div
                    className="session-progress"
                    role="progressbar"
                    aria-label="Avance de la sesión"
                    aria-valuemin={0}
                    aria-valuemax={queue.length}
                    aria-valuenow={sessionIndex}
                  >
                    <i style={{ width: `${(sessionIndex / queue.length) * 100}%` }} />
                  </div>
                  <PracticeCard
                    key={`${sessionIndex}:${currentItem.conceptId}:${currentItem.attempt}`}
                    concept={currentConcept}
                    subjectName={state.subjects.find((s) => s.id === currentConcept.subjectId)?.name ?? "Estudio"}
                    method={activeMethod}
                    methodOverride={methodOverride || sessionMethod}
                    onMethodChange={(m) => {
                      setMethodOverride(m);
                      // Volver a «Recomendado» también saca a la sesión del modo test.
                      if (!m) setSessionMethod("");
                    }}
                    pool={currentPool}
                    reason={currentPlan?.reason}
                    attempt={currentItem.attempt}
                    requireAnswer={!state.settings.showHints}
                    willRepeat={canRelearn(queue, sessionIndex)}
                    onRate={recordReview}
                    onRelearn={answerRelearn}
                    onEdit={() => {
                      setEditingId(currentConcept.id);
                      setModal("edit-concept");
                    }}
                  />
                  <p className="field-help shortcut-help">
                    Con teclado: <kbd>1</kbd>–<kbd>4</kbd> para responder y <kbd>Esc</kbd> para salir del cuadro de texto.
                  </p>
                </div>
              )}
            </>
          )}
          {page === "insights" && (
            <>
              <section className="page-heading compact">
                <div>
                  <p className="eyebrow">Evidencia, no suposiciones</p>
                  <h1>Cómo aprendes</h1>
                  <p className="subheading">
                    Los patrones se muestran cuando hay suficientes observaciones. FORMA no declara una técnica ganadora con dos
                    respuestas.
                  </p>
                </div>
              </section>
              <div className="insight-summary-grid">
                <div className="panel">
                  <p className="eyebrow">Datos reunidos</p>
                  <div className="big-progress">{stats.totalReviews}</div>
                  <p className="muted">evaluaciones registradas</p>
                </div>
                <div className="panel">
                  <p className="eyebrow">Calidad de evidencia</p>
                  <div className="big-progress evidence-level">{evidenceLevel(stats.totalReviews).label}</div>
                  <p className="muted">
                    {evidenceLevel(stats.totalReviews).description} Orientativo: no es una garantía estadística.
                  </p>
                </div>
                <div className="panel">
                  <p className="eyebrow">Conceptos pendientes</p>
                  <div className="big-progress">{stats.due}</div>
                  <p className="muted">Con repaso previsto para hoy o antes.</p>
                </div>
              </div>
              <div className="insight-columns">
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <p className="eyebrow">Tipos de aprendizaje</p>
                      <h2>Resultados por habilidad</h2>
                    </div>
                  </div>
                  {stats.bySkill.map((x) => (
                    <div className="skill-row" key={x.skill}>
                      <div className="skill-row-head">
                        <strong>
                          {x.skill === "memory" ? "Memoria" : x.skill === "understanding" ? "Comprensión" : "Aplicación"}
                        </strong>
                        <span>{x.score === undefined ? "Datos insuficientes" : pct(x.score)}</span>
                      </div>
                      <div className="progress">
                        <i style={{ width: `${(x.score ?? 0) * 100}%` }} />
                      </div>
                      <small>
                        {x.count === 0
                          ? "Sin observaciones."
                          : `${x.count} ${x.count === 1 ? "evaluación" : "evaluaciones"} · ${evidenceLevel(x.count).label}. Se basa en tu autoevaluación.`}
                      </small>
                    </div>
                  ))}
                </div>
                <div className="panel">
                  <p className="eyebrow">Técnicas</p>
                  <h2>Comparación de métodos</h2>
                  {comparisons.every((c) => c.methods.length === 0) ? (
                    <p className="muted">Todavía no hay sesiones registradas. Cada evaluación añadirá evidencia.</p>
                  ) : (
                    comparisons
                      .filter((c) => c.methods.length > 0)
                      .map((c) => (
                        <div className="method-evidence method-group" key={c.skill}>
                          <div className="method-group-head">
                            <strong>{SKILL_LABELS[c.skill]}</strong>
                            <span className={`evidence-badge ${c.comparable ? "evidence-ok" : ""}`}>
                              {c.comparable ? "Comparable" : "Aún no comparable"}
                            </span>
                          </div>
                          {c.methods.map((m) => (
                            <div className="method-line" key={m.method}>
                              <span>{METHOD_LABELS[m.method]}</span>
                              <span>
                                {m.observations} obs. · {evidenceLevel(m.observations).label}
                                {m.observations >= 3 ? ` · ${pct(m.mean)}` : ""}
                              </span>
                            </div>
                          ))}
                          <p className="field-help">{c.statement}</p>
                        </div>
                      ))
                  )}
                  <p className="field-help">
                    Referencia orientativa: menos de 3 observaciones es insuficiente, de 3 a 6 inicial, de 7 a 14 moderada y 15 o
                    más más sólida. No son garantías estadísticas, y todo se basa en autoevaluaciones. Este MVP no mide retención
                    demorada de forma independiente.
                  </p>
                </div>
              </div>
              <div className="panel diag-panel">
                <p className="eyebrow">Diagnóstico por concepto</p>
                <h2>Dónde conviene ayudarte</h2>
                {(() => {
                  const rows = activeConcepts
                    .map((c) => ({ c, d: diagnoses.get(c.id) }))
                    .filter((x) => x.d && !x.d.insufficient && x.d.diagnoses.length > 0)
                    .sort(
                      (a, b) =>
                        Number(b.d!.diagnoses.some((x) => x.status === "supported")) -
                        Number(a.d!.diagnoses.some((x) => x.status === "supported")),
                    );
                  if (!rows.length)
                    return (
                      <p className="muted">
                        Todavía no hay evidencia suficiente para diagnosticar dificultades (hacen falta al menos 3 intentos por
                        concepto). Lo que no se puede medir, FORMA no lo supone.
                      </p>
                    );
                  return (
                    <div className="diag-list">
                      {rows.slice(0, 8).map(({ c, d }) => (
                        <div className="diag-row" key={c.id}>
                          <div className="diag-row-head">
                            <strong>{c.title}</strong>
                            <DiagnosisChips result={d} max={3} />
                          </div>
                          {d!.diagnoses.slice(0, 2).map((x) => (
                            <p key={x.kind} className="diag-text">
                              <span>{DIAGNOSIS_LABELS[x.kind]}:</span> {x.message} <em>{x.help}</em>
                            </p>
                          ))}
                          {d!.check && <p className="field-help">Comprobación sugerida: {d!.check}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="panel profile-note">
                <Brain size={20} />
                <div>
                  <h3>Qué sabemos y qué no</h3>
                  <p>
                    FORMA registra tus respuestas, método elegido, confianza y autoevaluación. La calidad de respuesta sigue
                    siendo una estimación tuya. Para medir retención real habría que comprobar de nuevo los conceptos días después
                    y comparar resultados equivalentes.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <section className="page-heading compact">
                <div>
                  <p className="eyebrow">Preferencias</p>
                  <h1>Configuración</h1>
                  <p className="subheading">Controla el tiempo de estudio y tus datos.</p>
                </div>
              </section>
              <div className="settings-layout">
                <div className="panel settings-panel">
                  <h2>Plan de estudio</h2>
                  <label className="setting-row">
                    <span>
                      <strong>Tiempo diario disponible</strong>
                      <small>El plan se ajusta a este presupuesto aproximado.</small>
                    </span>
                    <select
                      value={state.settings.dailyMinutes}
                      onChange={(e) =>
                        setState((s) => ({ ...s, settings: { ...s.settings, dailyMinutes: Number(e.target.value) } }))
                      }
                    >
                      <option value={10}>10 minutos</option>
                      <option value={15}>15 minutos</option>
                      <option value={25}>25 minutos</option>
                      <option value={40}>40 minutos</option>
                      <option value={60}>60 minutos</option>
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>Longitud de sesión</strong>
                      <small>Cuántos conceptos como máximo incluir. Los que falles se repiten dentro de la misma sesión.</small>
                    </span>
                    <select
                      value={state.settings.sessionLength}
                      onChange={(e) =>
                        setState((s) => ({ ...s, settings: { ...s.settings, sessionLength: Number(e.target.value) } }))
                      }
                    >
                      <option value={5}>5 conceptos</option>
                      <option value={8}>8 conceptos</option>
                      <option value={12}>12 conceptos</option>
                      <option value={20}>20 conceptos</option>
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>Ver la respuesta sin escribir</strong>
                      <small>Si lo desactivas, tendrás que escribir tu respuesta antes de poder ver la referencia.</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={state.settings.showHints}
                      onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, showHints: e.target.checked } }))}
                    />
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>Aspecto</strong>
                      <small>Preferencia visual.</small>
                    </span>
                    <select
                      value={state.settings.theme}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          settings: { ...s.settings, theme: e.target.value as AppState["settings"]["theme"] },
                        }))
                      }
                    >
                      <option value="light">Claro</option>
                      <option value="dark">Oscuro</option>
                      <option value="system">Sistema</option>
                    </select>
                  </label>
                  <label className="setting-row">
                    <span>
                      <strong>Reducir animaciones</strong>
                      <small>
                        Quita las transiciones. Si tu dispositivo ya lo pide, se respeta aunque esto esté desactivado.
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={state.settings.reducedMotion}
                      onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, reducedMotion: e.target.checked } }))}
                    />
                  </label>
                </div>
                <div className="panel settings-panel">
                  <h2>Tus datos</h2>
                  <p className="muted">
                    Esta versión guarda los datos en el almacenamiento local del navegador. No hay cuenta, sincronización entre
                    dispositivos ni servidor propio.
                  </p>
                  <p className="field-help">
                    {state.lastBackupAt
                      ? `Última copia exportada: ${new Date(state.lastBackupAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}.`
                      : "Todavía no has exportado ninguna copia desde este navegador."}
                  </p>
                  <div className="settings-actions">
                    <button className="button button-secondary" onClick={downloadBackup}>
                      <FileDown size={16} /> Exportar datos
                    </button>
                    <button className="button button-secondary" onClick={() => backupRef.current?.click()}>
                      <Upload size={16} /> Restaurar copia
                    </button>
                    <button
                      className="button button-danger"
                      onClick={() => {
                        if (confirm("Esto borrará todos los datos locales de FORMA en este navegador. ¿Continuar?")) {
                          clearLocalState();
                          setAiKey("");
                          setState({
                            version: 3,
                            subjects: [],
                            concepts: [],
                            reviews: [],
                            settings: state.settings,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                          });
                          notify("Datos locales eliminados.");
                        }
                      }}
                    >
                      <Trash2 size={16} /> Borrar todos los datos
                    </button>
                  </div>
                </div>
                <AISettingsPanel
                  settings={state.settings}
                  onChange={(patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }))}
                  apiKey={aiKey}
                  onApiKey={setAiKey}
                  config={aiConfig}
                  defaults={ENV_AI}
                />
                <div className="panel settings-panel">
                  <h2>Acerca de FORMA</h2>
                  <p>Versión 0.6.0 · MVP local de aprendizaje adaptativo.</p>
                  <p className="muted">
                    Las puntuaciones de dominio son estimaciones heurísticas. No equivalen a una calificación escolar ni a una
                    medición validada de aprendizaje.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
        <footer className="footer">
          <span>FORMA · Aprende con intención</span>
          <span>Privacidad local por defecto</span>
          <button className="text-button" onClick={openImport}>
            <Upload size={14} /> Importar apuntes
          </button>
        </footer>
      </main>
      {modal === "subject" && (
        <Modal title="Crear materia" onClose={() => setModal("none")}>
          <SubjectForm onCancel={() => setModal("none")} onSave={addSubject} />
        </Modal>
      )}
      {modal === "edit-concept" && editingConcept && (
        <Modal
          title="Editar concepto"
          onClose={() => {
            setModal("none");
            setEditingId("");
          }}
        >
          <ConceptForm
            initial={editingConcept}
            subjects={state.subjects.filter((s) => !s.archived)}
            defaultSubject={editingConcept.subjectId}
            existing={state.concepts}
            onCancel={() => {
              setModal("none");
              setEditingId("");
            }}
            onSave={saveEdit}
            onReset={resetProgress}
          />
        </Modal>
      )}
      {modal === "concept" && (
        <Modal title="Añadir concepto" onClose={() => setModal("none")}>
          <ConceptForm
            subjects={state.subjects.filter((s) => !s.archived)}
            defaultSubject={selectedSubject || subject?.id || state.subjects.find((s) => !s.archived)?.id || ""}
            existing={state.concepts}
            onCancel={() => setModal("none")}
            onSave={(input) => {
              addConcept(input);
            }}
            onSaveAndNew={(input) => addConcept(input, true)}
          />
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="Importar y revisar contenido" wide onClose={() => setModal("none")}>
          <ImportPanel
            session={imp}
            onChange={setImp}
            subjects={state.subjects.filter((s) => !s.archived)}
            existing={state.concepts}
            defaultSubjectId={selectedSubject}
            ai={state.settings.aiMode === "optional" ? aiConfig : undefined}
            fileError={importError}
            onPickFile={() => fileRef.current?.click()}
            onSave={saveDrafts}
            onCancel={() => setModal("none")}
          />
        </Modal>
      )}
      {/* Un solo selector de archivo para toda la app: así sigue disponible al cerrar la ventana de importación. */}
      <input
        ref={fileRef}
        hidden
        type="file"
        accept=".pdf,.docx,.txt,.md,.markdown,.csv"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
  children,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
      {children}
    </div>
  );
}
function Empty({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <BookOpen size={22} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="button button-secondary" onClick={onClick}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Se captura durante el render, antes de que `autoFocus` mueva el foco al formulario.
  const [previousFocus] = useState<HTMLElement | null>(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(() => {
    const panel = panelRef.current;
    const focusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'button:not([disabled]),[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];
    const initial =
      (panel
        ? Array.from(panel.querySelectorAll<HTMLElement>("[autofocus],input,textarea,select")).find(
            (el) => el.offsetParent !== null,
          )
        : undefined) ?? panel;
    initial?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = focusable();
      if (!items.length) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function SubjectForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (name: string, description: string, date: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, description, date);
      }}
      className="form-stack"
    >
      <label className="field-label">
        Nombre de la materia
        <input
          className="field"
          autoFocus
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Matemáticas"
        />
      </label>
      <label className="field-label">
        Descripción (opcional)
        <textarea
          className="field"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Unidades, temas o notas…"
        />
      </label>
      <label className="field-label">
        Fecha del examen (opcional)
        <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="modal-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button button-primary" type="submit">
          Crear materia
        </button>
      </div>
    </form>
  );
}
function ConceptForm({
  initial,
  subjects,
  existing,
  defaultSubject,
  onCancel,
  onSave,
  onSaveAndNew,
  onReset,
}: {
  initial?: Concept;
  onReset?: () => void;
  subjects: Subject[];
  /** Conceptos ya guardados, para avisar si el nombre se repite en la materia. */
  existing: Concept[];
  defaultSubject: string;
  onCancel: () => void;
  onSave: (input: Partial<Concept> & Pick<Concept, "subjectId" | "title">) => void;
  /** Guarda y deja el formulario listo para el siguiente concepto. Devuelve si se guardó. */
  onSaveAndNew?: (input: Partial<Concept> & Pick<Concept, "subjectId" | "title">) => boolean;
}) {
  const [subjectId, setSubjectId] = useState(defaultSubject);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [applicationPrompt, setApplicationPrompt] = useState(initial?.applicationPrompt ?? "");
  const [applicationAnswer, setApplicationAnswer] = useState(initial?.applicationAnswer ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [importance, setImportance] = useState<1 | 2 | 3>(initial?.importance ?? 2);
  const [minutes, setMinutes] = useState(initial?.estimatedMinutes ? String(initial.estimatedMinutes) : "");
  const [wrong, setWrong] = useState(() => wrongLinesOf(initial));
  const duplicate = findDuplicate(title, subjectId, existing, initial?.id);
  /** Qué botón de guardar se pulsó: el normal o «guardar y añadir otro». */
  const another = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        const keepOpen = another.current && !!onSaveAndNew;
        another.current = false;
        const input = {
          subjectId,
          title,
          prompt,
          answer,
          ...(initial ? {} : { explanation: answer }),
          applicationPrompt,
          applicationAnswer,
          importance,
          estimatedMinutes: minutes.trim() ? Number(minutes) : undefined,
          ...choicesFromForm(answer, wrong),
          tags: tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        };
        if (!keepOpen) {
          onSave(input);
          return;
        }
        if (!onSaveAndNew!(input)) return;
        // Se conservan la materia, la importancia y las etiquetas: suelen repetirse al escribir varios seguidos.
        setTitle("");
        setPrompt("");
        setAnswer("");
        setApplicationPrompt("");
        setApplicationAnswer("");
        setMinutes("");
        setWrong("");
        titleRef.current?.focus();
      }}
    >
      <label className="field-label">
        Materia
        <select className="field" required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Nombre del concepto
        <input
          className="field"
          ref={titleRef}
          required
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Teorema de Pitágoras"
        />
      </label>
      {duplicate && (
        <p className="field-help field-warning" role="status">
          Ya tienes un concepto llamado «{duplicate.title}» en esta materia. Puedes guardarlo igualmente, pero lo repasarías dos
          veces.
        </p>
      )}
      <label className="field-label">
        Pregunta de recuerdo
        <textarea
          className="field"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="¿Qué es…? ¿Cómo funciona…?"
        />
      </label>
      <label className="field-label">
        Respuesta de referencia
        <textarea
          className="field"
          rows={4}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="La explicación correcta que usarás para comprobar…"
        />
      </label>
      {!initial && (
        <p className="field-help">
          Una buena tarjeta pregunta una sola cosa y tiene una respuesta que puedas comprobar de un vistazo. Si la respuesta es
          larga, divídela en varios conceptos.
        </p>
      )}
      <details className="more-options" open={!!initial}>
        <summary>Más opciones: aplicación, tipo test, importancia, tiempo y etiquetas</summary>
        <label className="field-label">
          Pregunta de aplicación (opcional)
          <textarea
            className="field"
            rows={2}
            value={applicationPrompt}
            onChange={(e) => setApplicationPrompt(e.target.value)}
            placeholder="¿Cómo lo aplicarías en un caso nuevo?"
          />
        </label>
        <label className="field-label">
          Respuesta de aplicación (opcional)
          <textarea className="field" rows={2} value={applicationAnswer} onChange={(e) => setApplicationAnswer(e.target.value)} />
        </label>
        <label className="field-label">
          Respuestas incorrectas para el tipo test (opcional, una por línea)
          <textarea
            className="field"
            rows={3}
            value={wrong}
            onChange={(e) => setWrong(e.target.value)}
            placeholder={"Una respuesta falsa pero creíble\nOtra respuesta falsa"}
          />
        </label>
        <p className="field-help">
          Si no escribes ninguna, el tipo test usa como opciones falsas las respuestas de otros conceptos de la materia.
        </p>
        <label className="field-label">
          Importancia para el examen
          <select className="field" value={importance} onChange={(e) => setImportance(Number(e.target.value) as 1 | 2 | 3)}>
            <option value={1}>Menor</option>
            <option value={2}>Normal</option>
            <option value={3}>Clave</option>
          </select>
        </label>
        <label className="field-label">
          Minutos por repaso (opcional)
          <input
            className="field"
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="3"
          />
        </label>
        <p className="field-help">
          Entre 1 y 60. Si lo dejas vacío, FORMA cuenta 3 minutos. Con este dato decide cuántos conceptos caben en tu tiempo
          diario y en el plan de examen.
        </p>
        <label className="field-label">
          Etiquetas separadas por comas
          <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="definición, unidad 2" />
        </label>
      </details>
      {initial?.source && (
        <p className="field-help source-note">
          Fuente conservada: {initial.source.fileName}
          {initial.source.page ? ` · página ${initial.source.page}` : ""} — «{initial.source.excerpt}»
        </p>
      )}
      {initial && onReset && (
        <div className="reset-box">
          <strong>Progreso actual: {Math.round(initial.mastery * 100)}%</strong>
          <p className="field-help">
            Si has cambiado el concepto por completo, el progreso anterior ya no es fiable. Reiniciarlo conserva el contenido y el
            historial, pero el concepto vuelve a empezar de cero.
            {initial.progressResetAt ? ` Último reinicio: ${new Date(initial.progressResetAt).toLocaleDateString("es-ES")}.` : ""}
          </p>
          <button type="button" className="button button-secondary" onClick={onReset}>
            Reiniciar progreso
          </button>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancelar
        </button>
        {!initial && onSaveAndNew && (
          <button
            type="button"
            className="button button-secondary"
            disabled={!subjects.length}
            onClick={(e) => {
              // No es el botón por defecto del formulario: Intro en un campo sigue siendo «Guardar».
              const form = e.currentTarget.form;
              if (!form || !form.reportValidity()) return;
              another.current = true;
              if (typeof form.requestSubmit === "function") form.requestSubmit();
              else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            }}
          >
            Guardar y añadir otro
          </button>
        )}
        <button type="submit" className="button button-primary" disabled={!subjects.length}>
          {initial ? "Guardar cambios" : "Guardar"}
        </button>
      </div>
      {!subjects.length && <p className="field-help">Primero crea una materia.</p>}
    </form>
  );
}
export default App;

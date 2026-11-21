import { describe, expect, it } from "vitest";
import { applyReview, createConcept, createSubject, exportState, importState, initialState, normalizeState } from "./engine";
import { CORRUPT_KEY, LEGACY_KEY, STORAGE_KEY, clearLocalState, hasCorruptBackup, loadState, saveState, type KeyValueStorage } from "./storage";
import { ev } from "./test-helpers";

function memoryStorage(initial: Record<string, string> = {}, opts: { failSet?: boolean } = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { if (opts.failSet) throw new Error("QuotaExceededError"); data[k] = v; },
    removeItem: k => { delete data[k]; }
  };
}
function sampleState() {
  const subject = { ...createSubject("Biología", "", "2026-06-01"), id: "s1" };
  const c = createConcept({ id: "c1", subjectId: "s1", title: "Célula", importance: 3, estimatedMinutes: 5 });
  return applyReview({ ...initialState(), subjects: [subject], concepts: [c] }, ev({ rating: 3, conceptId: "c1", confidence: 0.7, responseSeconds: 12, errorKind: undefined }));
}

describe("persistencia y recuperación de datos", () => {
  it("guarda y vuelve a cargar el progreso sin pérdidas", () => {
    const storage = memoryStorage();
    const state = sampleState();
    saveState(state, storage);
    const loaded = loadState(storage);
    expect(loaded.subjects).toEqual(state.subjects);
    expect(loaded.concepts[0].title).toBe("Célula");
    expect(loaded.concepts[0].importance).toBe(3);
    expect(loaded.concepts[0].estimatedMinutes).toBe(5);
    expect(loaded.concepts[0].dueAt).toBe(state.concepts[0].dueAt);
    expect(loaded.reviews).toHaveLength(1);
    expect(loaded.reviews[0].responseSeconds).toBe(12);
  });
  it("sin datos guardados arranca vacío; sin almacenamiento disponible no rompe", () => {
    expect(loadState(memoryStorage()).subjects).toEqual([]);
    expect(loadState(undefined).subjects).toEqual([]);
    expect(() => saveState(sampleState(), undefined)).not.toThrow();
  });
  it("migra datos de la versión 2 sin perderlos", () => {
    const v2 = JSON.stringify({ subjects: [{ id: "s", name: "Mate" }], concepts: [{ id: "c", subjectId: "s", title: "Límite" }], reviews: [] });
    const storage = memoryStorage({ [LEGACY_KEY]: v2 });
    const s = loadState(storage);
    expect(s.subjects[0].name).toBe("Mate");
    expect(s.concepts[0].title).toBe("Límite");
    expect(storage.data[STORAGE_KEY]).toBeDefined();
  });
  it("datos antiguos sin los campos nuevos reciben valores por defecto", () => {
    const s = normalizeState({ subjects: [{ id: "s", name: "A" }], concepts: [{ id: "c", subjectId: "s", title: "T" }], reviews: [{ conceptId: "c", rating: 2, at: "2026-01-01T10:00:00Z", method: "active-recall", skill: "memory", confidence: 0.5 }] });
    expect(s.concepts[0].importance).toBe(2);
    expect(s.concepts[0].estimatedMinutes).toBeUndefined();
    expect(s.reviews[0].responseSeconds).toBe(0);
    expect(s.reviews[0].errorKind).toBeUndefined();
  });
  it("JSON dañado no se pierde: se conserva una copia bruta y la app arranca vacía", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{esto no es json" });
    expect(loadState(storage).concepts).toEqual([]);
    expect(storage.data[CORRUPT_KEY]).toBe("{esto no es json");
    expect(hasCorruptBackup(storage)).toBe(true);
  });
  it("un fallo de almacenamiento lleno se notifica con un mensaje claro", () => {
    expect(() => saveState(sampleState(), memoryStorage({}, { failSet: true }))).toThrow(/No se pudo guardar/);
  });
  it("borrar los datos elimina estado, versión antigua y copia dañada", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{}", [LEGACY_KEY]: "{}", [CORRUPT_KEY]: "x" });
    clearLocalState(storage);
    expect(Object.keys(storage.data)).toHaveLength(0);
  });
  it("exportar e importar una copia de seguridad conserva el contenido", () => {
    const state = sampleState();
    const restored = importState(exportState(state));
    expect(restored.subjects).toEqual(state.subjects);
    expect(restored.concepts.map(c => [c.id, c.title, c.mastery, c.dueAt])).toEqual(state.concepts.map(c => [c.id, c.title, c.mastery, c.dueAt]));
    expect(restored.reviews).toEqual(state.reviews);
    expect(restored.settings).toEqual(state.settings);
  });
  it("también acepta el JSON de estado sin la envoltura de copia", () => {
    expect(importState(JSON.stringify(sampleState())).concepts).toHaveLength(1);
  });
  it("rechaza archivos que no son copias de FORMA en lugar de vaciar los datos", () => {
    for (const bad of ["{}", "[]", "123", "null", '{"hello":"world"}', '{"format":"FORMA_BACKUP","data":null}']) {
      expect(() => importState(bad), bad).toThrow();
    }
    expect(() => importState("no es json")).toThrow();
  });
  it("descarta registros inservibles y corrige valores fuera de rango sin tirar el resto", () => {
    const s = normalizeState({
      subjects: [{ id: "s", name: "ok", examDate: "2026-02-31" }, { name: "sin id" }, { id: "x", name: "  " }, null],
      concepts: [{ id: "c", subjectId: "s", title: "t", mastery: 7, memory: -3, dueAt: "basura", intervalDays: -4, importance: 9, estimatedMinutes: -2 }, { title: "sin materia" }],
      reviews: [
        { conceptId: "c", rating: 5, at: "2026-01-01T10:00:00Z", method: "active-recall", skill: "memory" },
        { conceptId: "c", rating: 2, at: "no-fecha", method: "active-recall", skill: "memory" },
        { conceptId: "c", rating: 2, at: "2026-01-01T10:00:00Z", method: "magia", skill: "memory" },
        { conceptId: "c", rating: 2, at: "2026-01-01T10:00:00Z", method: "active-recall", skill: "memory", confidence: 9, responseSeconds: -5, answerQuality: 4, errorKind: "inventado" }
      ],
      settings: { dailyMinutes: -1, sessionLength: "muchas" }
    });
    expect(s.subjects).toHaveLength(1);
    expect(s.subjects[0].examDate).toBeUndefined();
    expect(s.concepts).toHaveLength(1);
    expect(s.concepts[0].mastery).toBe(1);
    expect(s.concepts[0].memory).toBe(0);
    expect(Number.isFinite(Date.parse(s.concepts[0].dueAt))).toBe(true);
    expect(s.concepts[0].intervalDays).toBe(0);
    expect(s.concepts[0].importance).toBe(2);
    expect(s.concepts[0].estimatedMinutes).toBeUndefined();
    expect(s.reviews).toHaveLength(1);
    expect(s.reviews[0].confidence).toBe(1);
    expect(s.reviews[0].responseSeconds).toBe(0);
    expect(s.reviews[0].answerQuality).toBe(1);
    expect(s.reviews[0].errorKind).toBeUndefined();
    expect(s.settings.dailyMinutes).toBeGreaterThanOrEqual(5);
    expect(s.settings.sessionLength).toBeGreaterThanOrEqual(1);
  });
  it("normalizar es idempotente", () => {
    const once = normalizeState(JSON.parse(JSON.stringify(sampleState())));
    const twice = normalizeState(JSON.parse(JSON.stringify(once)));
    expect({ ...twice, updatedAt: "" }).toEqual({ ...once, updatedAt: "" });
  });
  it("la IA solo queda activa si se activó expresamente; dirección y modelo se conservan y la clave nunca se guarda", () => {
    expect(normalizeState({ settings: {} }).settings).toMatchObject({ aiMode: "off", aiBaseUrl: "", aiModel: "" });
    expect(normalizeState({ settings: { aiMode: "on", aiBaseUrl: 7, aiModel: null, theme: "rosa", showHints: "sí" } }).settings).toMatchObject({ aiMode: "off", aiBaseUrl: "", aiModel: "", theme: "system", showHints: true });
    const kept = normalizeState({ settings: { aiMode: "optional", aiBaseUrl: " https://ia.ejemplo/v1 ", aiModel: " modelo " } });
    expect(kept.settings).toMatchObject({ aiMode: "optional", aiBaseUrl: "https://ia.ejemplo/v1", aiModel: "modelo" });
    expect(exportState(kept)).not.toMatch(/apiKey|Bearer/);
  });
});

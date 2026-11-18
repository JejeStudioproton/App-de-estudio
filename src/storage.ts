import type { AppState } from "./domain";
import { initialState, normalizeState } from "./engine";

export const STORAGE_KEY = "forma.state.v3";
export const LEGACY_KEY = "forma.state.v2";
export const CORRUPT_KEY = "forma.state.v3.corrupt";
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): KeyValueStorage | undefined {
  try { return typeof localStorage !== "undefined" ? localStorage : undefined; } catch { return undefined; }
}

/**
 * Carga el estado guardado. Si los datos están dañados NO se descartan: se conserva una copia
 * bruta en CORRUPT_KEY antes de arrancar con un estado vacío, para que el guardado automático
 * no sobrescriba lo único que permitiría recuperarlos.
 */
export function loadState(storage: KeyValueStorage | undefined = defaultStorage()): AppState {
  if (!storage) return initialState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try { return normalizeState(JSON.parse(raw)); }
      catch { try { storage.setItem(CORRUPT_KEY, raw); } catch { /* sin espacio: no se puede conservar */ } return initialState(); }
    }
    const old = storage.getItem(LEGACY_KEY);
    if (old) { const migrated = normalizeState(JSON.parse(old)); saveState(migrated, storage); return migrated; }
  } catch { /* unos datos ilegibles no deben impedir que la app arranque */ }
  return initialState();
}
export function saveState(state: AppState, storage: KeyValueStorage | undefined = defaultStorage()): void {
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { throw new Error("No se pudo guardar. Exporta una copia y libera espacio del navegador."); }
}
export function hasCorruptBackup(storage: KeyValueStorage | undefined = defaultStorage()): boolean {
  try { return !!storage?.getItem(CORRUPT_KEY); } catch { return false; }
}
export function clearLocalState(storage: KeyValueStorage | undefined = defaultStorage()): void {
  storage?.removeItem(STORAGE_KEY); storage?.removeItem(LEGACY_KEY); storage?.removeItem(CORRUPT_KEY);
}

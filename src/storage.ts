import type { AppState } from "./domain";
import { initialState, normalizeState } from "./engine";
const KEY = "forma.state.v3";
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalizeState(JSON.parse(raw));
    const old = localStorage.getItem("forma.state.v2");
    if (old) { const migrated = normalizeState(JSON.parse(old)); saveState(migrated); return migrated; }
  } catch { /* corrupted local data should not prevent app startup */ }
  return initialState();
}
export function saveState(state: AppState): void {
  try { localStorage.setItem(KEY,JSON.stringify(state)); } catch { throw new Error("No se pudo guardar. Exporta una copia y libera espacio del navegador."); }
}
export function clearLocalState(): void { localStorage.removeItem(KEY); }

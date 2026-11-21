import { useEffect, useRef, useState } from "react";
import type { Settings } from "../domain";
import { AIError, aiHost, testAIConnection, validateAIConfig, type AIConfig } from "../ai";

type TestState = { status: "idle" | "loading" | "ok" | "error"; message?: string };

/**
 * Configuración de la IA opcional. Está apagada por defecto; al apagarla no se envía nada a ningún servidor.
 * La clave se recibe y se devuelve aparte de `settings` porque nunca se guarda con los datos de la app.
 */
export function AISettingsPanel({
  settings,
  onChange,
  apiKey,
  onApiKey,
  config,
  defaults,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  apiKey: string;
  onApiKey: (key: string) => void;
  /** Configuración efectiva (lo escrito por el estudiante o, si está vacío, el valor de la instalación). */
  config: AIConfig;
  /** Valores de la instalación (`VITE_FORMA_AI_BASE_URL` y `VITE_FORMA_AI_MODEL`), si existen. */
  defaults: { baseUrl: string; model: string };
}) {
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const enabled = settings.aiMode === "optional";
  const problem = validateAIConfig(config, typeof location !== "undefined" ? location.protocol : undefined);

  async function runTest() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setTest({ status: "loading", message: "Probando la conexión…" });
    try {
      await testAIConnection(config, controller.signal);
      if (!controller.signal.aborted) setTest({ status: "ok", message: `Conexión correcta con ${aiHost(config.baseUrl)}.` });
    } catch (e) {
      if (!controller.signal.aborted) setTest({ status: "error", message: e instanceof AIError ? e.message : "No se pudo completar la prueba." });
    }
  }
  const reset = () => setTest({ status: "idle" });

  return (
    <div className="panel settings-panel">
      <h2>IA opcional</h2>
      <p className="muted">
        Desactivada por defecto. Si la activas, al importar apuntes podrás pedir a un servicio compatible con la API de OpenAI que proponga borradores de conceptos.
        FORMA solo envía el texto fuente cuando pulsas «Proponer con IA» y lo confirmas; el resto de tus datos no sale de este dispositivo.
      </p>
      <label className="setting-row">
        <span>
          <strong>Permitir propuestas con IA</strong>
          <small>Añade el botón «Proponer con IA» a la ventana de importación.</small>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            onChange({ aiMode: e.target.checked ? "optional" : "off" });
            reset();
          }}
        />
      </label>
      {enabled && (
        <div className="ai-fields">
          <label className="field-label" htmlFor="ai-url">
            Dirección del servicio
          </label>
          <input
            id="ai-url"
            className="field"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={settings.aiBaseUrl}
            onChange={(e) => {
              onChange({ aiBaseUrl: e.target.value });
              reset();
            }}
            placeholder={defaults.baseUrl || "https://servicio.ejemplo/v1"}
          />
          <label className="field-label" htmlFor="ai-model">
            Modelo
          </label>
          <input
            id="ai-model"
            className="field"
            autoComplete="off"
            spellCheck={false}
            value={settings.aiModel}
            onChange={(e) => {
              onChange({ aiModel: e.target.value });
              reset();
            }}
            placeholder={defaults.model || "nombre-del-modelo"}
          />
          <label className="field-label" htmlFor="ai-key">
            Clave (si el servicio la pide)
          </label>
          <input
            id="ai-key"
            className="field"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => {
              onApiKey(e.target.value);
              reset();
            }}
          />
          <p className="field-help">
            La clave se conserva solo mientras esta pestaña siga abierta. No se guarda con tus datos ni se incluye en las copias exportadas. La dirección y el modelo sí
            se guardan en este dispositivo.
          </p>
          <div className="warning-note" role="note">
            No envíes apuntes con datos personales ni documentos del centro sin permiso. Lo que envíes queda sujeto a las condiciones del servicio que elijas, y sus
            propuestas pueden contener errores: revísalas siempre.
          </div>
          <div className="settings-actions">
            <button type="button" className="button button-secondary" onClick={runTest} disabled={!!problem || test.status === "loading"}>
              Probar conexión
            </button>
          </div>
          <p className={`field-help ai-test ai-test-${test.status}`} role="status">
            {test.status === "idle" ? (problem ?? "La prueba envía una sola palabra, nada de tu contenido.") : test.message}
          </p>
        </div>
      )}
    </div>
  );
}

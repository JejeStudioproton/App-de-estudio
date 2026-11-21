import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // `host` y `allowedHosts` permiten abrir el servidor de desarrollo en el móvil/iPad
  // o a través del proxy del entorno de trabajo, sin dejar de aceptar localhost.
  server: { port: 5173, host: "0.0.0.0", allowedHosts: [".e2b.app"] },
  preview: { port: 4173, host: "0.0.0.0", allowedHosts: [".e2b.app"] },
  test: { environment: "node" }
});

# Estado de validación

Última verificación: rama `mejora/motor-adaptativo`, Node 22, Chromium (Playwright).

## Comprobado y ejecutado
| Comprobación | Resultado |
|---|---|
| `npm test` (Vitest) | 139 pruebas en 11 archivos, todas pasan |
| `npm run check` (`tsc --noEmit`) | sin errores |
| `npm run build` (`tsc -b && vite build`) | compila |
| Flujo completo en navegador (Chromium, 820×1180, táctil): crear materia con fecha de examen → 4 conceptos → plan de examen visible → sesión de 4 tarjetas → resumen → recarga con persistencia → pantalla «Cómo aprendes» → exportar JSON → borrar datos → restaurar → rechazo de copia inválida | todas las comprobaciones pasan, sin errores de consola |
| Importación con archivos reales: PDF de 2 páginas, PDF sin texto, PDF con contraseña, DOCX, DOCX dañado, `.doc`, TXT en Latin-1, Markdown, archivo vacío, archivo de 16 MB | cada caso produce el borrador o el mensaje de error esperado; las páginas de origen (1, 1, 2) se guardan en los conceptos |
| Edición de un concepto con progreso (iPad emulado): precarga del formulario, cambio de título/respuesta, sin duplicados, progreso y repasos intactos, título en blanco rechazado, persistencia tras recargar | todas las comprobaciones pasan |
| Reinicio de progreso (iPad emulado, historial sembrado con 5 fallos): el diagnóstico desaparece, el progreso queda a cero, el historial se conserva, cancelar la confirmación no cambia nada y todo persiste tras recargar | todas las comprobaciones pasan |
| Objetivos táctiles y tamaño de fuente (emulación iPad, puntero táctil) | ningún botón/selector < 44 px ni control de formulario < 16 px en inicio, materia y práctica |

## Qué cubren las pruebas automáticas
Evidencia por niveles (<3, 3–6, 7–14, ≥15), diagnóstico de dificultades (incluido «datos insuficientes» y diagnósticos provisionales), priorización de conceptos, planificador de examen (fechas inválidas, examen hoy/pasado, tiempo insuficiente), resumen de sesión, persistencia y migración de datos antiguos, fechas y validación/segmentación de importación.

## NO comprobado (no afirmar lo contrario)
- **Safari/WebKit real o un iPad físico.** Solo se probó Chromium con emulación de iPad; pueden existir diferencias de renderizado o de comportamiento táctil.
- **Modo offline / PWA** tras la primera carga (el service worker se bloqueó en las pruebas).
- **Navegación por teclado, lector de pantalla y trampa de foco en modales.** No se auditó con tecnología de apoyo.
- **Contraste del tema oscuro** (solo se ajustaron las variables de texto secundario).
- **Importación de PDF con diseño complejo** (columnas, tablas, fórmulas): la extracción es texto plano en orden de lectura del PDF y no se garantiza la interpretación correcta. Solo se verificó con PDF sencillos generados para la prueba.
- **Rendimiento con bibliotecas grandes** (cientos de conceptos / miles de intentos).

## Limitaciones conocidas del producto
- La calidad de cada respuesta es la **autoevaluación** del estudiante, no una corrección semántica.
- El tipo de error (recuerdo / idea equivocada / descuido) lo indica el estudiante; FORMA nunca lo deduce. Si no lo indica, el error queda «sin clasificar».
- El tiempo de respuesta es el tiempo hasta consultar la referencia (o hasta guardar); si el estudiante se distrae, el dato se infla. El diagnóstico usa la mediana para reducir ese efecto.
- Los niveles de evidencia (3 / 7 / 15) son referencias orientativas, no garantías estadísticas. No hay medición independiente de retención demorada.
- Al editar un concepto se conserva su progreso; FORMA no avisa de que el contenido cambió. El estudiante puede reiniciarlo manualmente («Reiniciar progreso»): se conservan contenido e historial, pero los intentos anteriores dejan de influir en diagnóstico, plan y resumen (no en la comparación global de métodos).
- El adaptador de IA existe como módulo, sin interfaz ni proxy de servidor.
- Los ZIP de versiones anteriores se eliminaron del árbol; siguen recuperables en el historial de git (commit `5de4deb`).

# Estado de validación

Última verificación: 21 de noviembre de 2026, Node 22. Las comprobaciones de interfaz se hicieron en Chromium (Playwright) sobre el rediseño; las de publicación, con un servidor estático en la subcarpeta `/App-de-estudio/`.

## Comprobado y ejecutado
| Comprobación | Resultado |
|---|---|
| `npm test` (Vitest) | 149 pruebas en 13 archivos, todas pasan |
| `npm run check` (`tsc --noEmit`) | sin errores |
| `npm run build` (`tsc -b && vite build`) | compila |
| Flujo completo en navegador (Chromium, 820×1180, táctil): crear materia con fecha de examen → 4 conceptos → plan de examen visible → sesión de 4 tarjetas → resumen → recarga con persistencia → pantalla «Cómo aprendes» → exportar JSON → borrar datos → restaurar → rechazo de copia inválida | todas las comprobaciones pasan, sin errores de consola |
| Importación con archivos reales: PDF de 2 páginas, PDF sin texto, PDF con contraseña, DOCX, DOCX dañado, `.doc`, TXT en Latin-1, Markdown, archivo vacío, archivo de 16 MB | cada caso produce el borrador o el mensaje de error esperado; las páginas de origen (1, 1, 2) se guardan en los conceptos |
| Edición de un concepto con progreso (iPad emulado): precarga del formulario, cambio de título/respuesta, sin duplicados, progreso y repasos intactos, título en blanco rechazado, persistencia tras recargar | todas las comprobaciones pasan |
| Reinicio de progreso (iPad emulado, historial sembrado con 5 fallos): el diagnóstico desaparece, el progreso queda a cero, el historial se conserva, cancelar la confirmación no cambia nada y todo persiste tras recargar | todas las comprobaciones pasan |
| Autoevaluación obligatoria (iPad emulado, 12 comprobaciones): la tarjeta se abre sin valoración ni seguridad previa elegidas, «Guardar» está desactivado hasta elegir ambas, el intento guardado contiene exactamente lo elegido, la tarjeta siguiente vuelve a empezar vacía, el método «Aplicación» muestra su enunciado propio | todas las comprobaciones pasan, sin errores de consola |
| Biblioteca de la materia (iPad y móvil emulados, 24 comprobaciones): búsqueda sin tildes ni mayúsculas, mensaje sin resultados, orden A–Z y por dominio, renombrar materia (un nombre vacío se rechaza y se restaura), cambiar color, persistencia tras recargar, ningún botón/selector < 44 px | todas pasan, sin errores de consola |
| Contraste de texto (medido por código en Chromium, 820×1180): inicio, materias, materia, «Cómo aprendo», configuración y sesión de práctica, en tema claro y oscuro (12 combinaciones); umbral 4,5:1 (3:1 en texto grande) | 0 textos por debajo del umbral tras el rediseño (antes: 106). Ver límites abajo |
| Objetivos táctiles y tamaño de fuente (emulación iPad, puntero táctil) | ningún botón/selector < 44 px ni control de formulario < 16 px en inicio, materia y práctica |
| Compilación para GitHub Pages (`npm run build:pages`) servida en `/App-de-estudio/` con un servidor estático | HTML, manifiesto, `sw.js` y recursos con hash responden 200; el HTML y el registro del worker usan rutas relativas (`./assets/…`, `./sw.js`, `scope: "./"`) |
| Atribución de habilidad al cambiar de método (`src/skills.test.ts`) | 6 pruebas: el método recomendado conserva la habilidad objetivo y un método elegido a mano se registra con su propia habilidad |

## Qué cubren las pruebas automáticas
Evidencia por niveles (<3, 3–6, 7–14, ≥15), diagnóstico de dificultades (incluido «datos insuficientes» y diagnósticos provisionales), priorización de conceptos, planificador de examen (fechas inválidas, examen hoy/pasado, tiempo insuficiente), resumen de sesión, persistencia y migración de datos antiguos, fechas y validación/segmentación de importación.

## NO comprobado (no afirmar lo contrario)
- **Safari/WebKit real o un iPad físico.** Solo se probó Chromium con emulación de iPad; pueden existir diferencias de renderizado o de comportamiento táctil.
- **Modo offline / PWA** tras la primera carga: el service worker se bloqueó en las pruebas de navegador. Solo se verificó que la compilación publicable sirve `sw.js` y usa rutas relativas; no se ha probado la instalación, la actualización de caché ni la navegación sin conexión en un navegador real.
- **Navegación por teclado, lector de pantalla y trampa de foco en modales.** Se implementaron Escape, foco inicial, trampa de Tab y restauración del foco, pero no se auditaron con lector de pantalla ni en Safari.
- **Contraste en ventanas modales, estados de foco, iconos y textos sobre degradados/imágenes:** la medición automática solo cubre texto visible de las 6 pantallas principales, con el fondo efectivo calculado capa a capa.
- **Fuentes:** Atkinson Hyperlegible y Bricolage Grotesque van incluidas en la app (sin llamadas a Google); se vieron cargadas en Chromium, no en Safari.
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

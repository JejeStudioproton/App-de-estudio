# Estado de validación

Última verificación: 21 de noviembre de 2026, Node 22. Las comprobaciones de interfaz de las versiones anteriores se hicieron en Chromium (Playwright) sobre el rediseño; las de publicación, con un servidor estático en la subcarpeta `/App-de-estudio/`.

Lo añadido en la versión 0.4.0 (borradores editables, CSV, IA opcional, minutos por repaso) se comprobó solo con pruebas automáticas sobre un DOM simulado (jsdom), no en un navegador real.

La versión 0.5.0 cambia la tarjeta de práctica, el inicio, la pantalla de materia y el formulario de concepto. **Nada de la 0.5.0 se ha visto en un navegador real**: se comprobó con pruebas automáticas sobre jsdom, comprobación de tipos y compilación. Las filas de abajo que citan Chromium o un iPad emulado describen versiones anteriores de esas pantallas y no se han repetido; donde la pantalla ha cambiado se indica.

## Comprobado y ejecutado
| Comprobación | Resultado |
|---|---|
| `npm test` (Vitest) | 233 pruebas en 18 archivos, todas pasan. Ejecutadas también con `TZ` = UTC, Europe/Madrid, Asia/Kolkata, America/Los_Angeles, Pacific/Auckland, Pacific/Kiritimati, Etc/GMT+9 y Etc/GMT+12 (es decir, también de madrugada, antes de las 4:00 locales) |
| `npm run check` (`tsc --noEmit`) | sin errores |
| `npm run build` (`tsc -b && vite build`) | compila |
| Flujo completo en navegador (Chromium, 820×1180, táctil): crear materia con fecha de examen → 4 conceptos → plan de examen visible → sesión de 4 tarjetas → resumen → recarga con persistencia → pantalla «Cómo aprendes» → exportar JSON → borrar datos → restaurar → rechazo de copia inválida | todas las comprobaciones pasan, sin errores de consola |
| Importación con archivos reales: PDF de 2 páginas, PDF sin texto, PDF con contraseña, DOCX, DOCX dañado, `.doc`, TXT en Latin-1, Markdown, archivo vacío, archivo de 16 MB | cada caso produce el borrador o el mensaje de error esperado; las páginas de origen (1, 1, 2) se guardan en los conceptos |
| Edición de un concepto con progreso (iPad emulado): precarga del formulario, cambio de título/respuesta, sin duplicados, progreso y repasos intactos, título en blanco rechazado, persistencia tras recargar | todas las comprobaciones pasan |
| Reinicio de progreso (iPad emulado, historial sembrado con 5 fallos): el diagnóstico desaparece, el progreso queda a cero, el historial se conserva, cancelar la confirmación no cambia nada y todo persiste tras recargar | todas las comprobaciones pasan |
| Autoevaluación obligatoria (iPad emulado, versión anterior) | **Ya no aplica**: esa tarjeta (selector de seguridad y botón «Guardar evaluación») se sustituyó en la 0.5.0. El flujo nuevo solo está cubierto por las pruebas jsdom de más abajo |
| Biblioteca de la materia (iPad y móvil emulados, 24 comprobaciones): búsqueda sin tildes ni mayúsculas, mensaje sin resultados, orden A–Z y por dominio, renombrar materia (un nombre vacío se rechaza y se restaura), cambiar color, persistencia tras recargar, ningún botón/selector < 44 px | todas pasan, sin errores de consola |
| Contraste de texto (medido por código en Chromium, 820×1180): inicio, materias, materia, «Cómo aprendo», configuración y sesión de práctica, en tema claro y oscuro (12 combinaciones); umbral 4,5:1 (3:1 en texto grande) | 0 textos por debajo del umbral tras el rediseño (antes: 106). Ver límites abajo. Medido antes de la 0.5.0; los elementos nuevos usan las mismas variables de color pero no se han medido |
| Objetivos táctiles y tamaño de fuente (emulación iPad, puntero táctil) | ningún botón/selector < 44 px ni control de formulario < 16 px en inicio, materia y práctica. Medido antes de la 0.5.0; los botones nuevos de la tarjeta de práctica no se han medido |
| Compilación para GitHub Pages (`npm run build:pages`) servida en `/App-de-estudio/` con un servidor estático | HTML, manifiesto, `sw.js` y recursos con hash responden 200; el HTML y el registro del worker usan rutas relativas (`./assets/…`, `./sw.js`, `scope: "./"`) |
| Atribución de habilidad al cambiar de método (`src/skills.test.ts`) | 6 pruebas: el método recomendado conserva la habilidad objetivo y un método elegido a mano se registra con su propia habilidad |
| Flujo principal con DOM real (`src/App.smoke.test.tsx`, jsdom) | crea materia → crea concepto → abre la sesión → la referencia no se ve ni se puede valorar hasta indicar cuánto se cree saber → se valora con un toque y queda guardado; el intento y el concepto quedan en `localStorage` con la valoración y la seguridad elegidas |
| Repetición de fallos en la sesión (jsdom y `src/session.test.ts`) | lo fallado vuelve como «Segunda vuelta» con la misma pregunta; si tampoco sale, vuelve una vez más y después queda para mañana; las repeticiones no añaden intentos al historial y el concepto fallado queda con intervalo de 1 día aunque la repetición salga bien |
| Teclado en la sesión (jsdom) | `1`–`4` prevén y valoran, Intro continúa sin clasificar un fallo, espacio muestra la respuesta en la segunda vuelta; los números escritos en el cuadro de respuesta no responden y los atajos no actúan con una ventana abierta |
| «Deshacer» (jsdom) | retira el último intento y devuelve fecha, intervalo, repeticiones y dominio del concepto a como estaban; solo un paso |
| Escribir antes de ver la respuesta (jsdom) | con «Ver la respuesta sin escribir» desactivado, las opciones están deshabilitadas hasta escribir; lo escrito se muestra junto a la referencia y se guarda con el intento |
| Calendario de repasos (`src/engine.test.ts`) | intervalos crecientes con tope de 180 días; un fallo vuelve al día siguiente; acertar un repaso adelantado no cambia la fecha (también comprobado en la interfaz, que lo avisa en el botón) |
| Día de estudio (`src/dates.test.ts`, `src/today.test.ts`) | el día cambia a las 4:00; lo que vence a cualquier hora de hoy cuenta como pendiente hoy; racha y tira de 7 días |
| Inicio (jsdom) | «Probar con un ejemplo» crea una materia con conceptos pendientes y «Estudiar ahora» abre la sesión; con datos sembrados muestra lo pendiente, lo hecho hoy y la racha; sin nada pendiente lo dice, indica el próximo repaso y ofrece un repaso extra |
| Materia (jsdom) | la barra de estudio cuenta los pendientes de la materia; «Estudiar esta materia» respeta el tamaño de sesión (8) y «Repasarla entera» abre los 10 conceptos de la prueba |
| «Guardar y añadir otro» (jsdom) | guarda, deja la ventana abierta con el formulario vacío, no guarda nada sin nombre y el guardado normal cierra la ventana |
| Teclado en modales (`src/App.smoke.test.tsx`) | Escape cierra el modal y el foco vuelve al botón que lo abrió |
| Importación de texto pegado (`src/App.smoke.test.tsx`, jsdom) | se proponen borradores; se corrige el nombre y la respuesta de uno, se descarta otro, se crea la materia de destino desde la misma ventana y el concepto guardado conserva el fragmento original y la fuente «Texto pegado»; tocar el texto fuente no pisa lo ya corregido |
| Importación de CSV (`src/App.smoke.test.tsx` y `src/importer.test.ts`) | un archivo `.csv` con cabecera crea un borrador por fila con su pregunta y respuesta, en la materia abierta; separadores `,` `;` y tabulador, comillas, cabeceras sin tildes o en inglés y archivos sin cabecera |
| Selector de archivo tras cerrar la ventana de importación | sigue existiendo un único selector y «Elegir archivo» lo abre (antes dejaba de responder después de la primera importación) |
| Errores de importación | un archivo no compatible se explica dentro de la ventana de importación |
| IA opcional (`src/ai.test.ts` y `src/App.smoke.test.tsx`, con un servidor simulado) | apagada por defecto y sin botón en la importación; activada, no sale ninguna petición sin aceptar la confirmación; la petición va a la dirección configurada con la clave como `Bearer`; las propuestas se rotulan como de IA y la cita que no está en el texto se marca; un error 401 se muestra y deja los borradores como estaban; la clave no aparece en `localStorage` |
| Minutos por repaso | el valor escrito al crear un concepto se guarda; al editar se acota entre 1 y 60 y se borra si se deja vacío |
| Plan de examen en la interfaz | con fecha a 10 días aparece «Plan viable» y «Siguiente» abre la tarjeta con el método que indica el plan |
| Compatibilidad con Safari anterior a 16.4 | el archivo principal publicado contenía una expresión regular con «lookbehind», que esas versiones no admiten; la compilación nueva no contiene ninguna (comprobado buscando en `dist`). No se ha abierto en Safari |

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
- **IA opcional con un proveedor real.** Solo se ha probado contra un servidor simulado: no se ha comprobado ningún servicio concreto, su política de CORS ni la calidad de sus propuestas.
- **Ventana de importación nueva en un navegador real**, ni su aspecto en móvil o iPad. La lectura de PDF y DOCX no ha cambiado, pero no se volvió a ejecutar con archivos reales en esta versión.
- **Todo lo nuevo de la 0.5.0 en un navegador real**: aspecto y disposición de la tarjeta de práctica, el inicio, la barra de estudio de la materia y el formulario de concepto en escritorio, iPad y móvil; tamaño de los objetivos táctiles nuevos; contraste; foco y anuncios con lector de pantalla al pasar de una tarjeta a otra. La ocultación de los atajos en pantallas táctiles depende de una regla CSS (`pointer: coarse`) que jsdom no evalúa.
- **Que el calendario de repasos mejore la retención.** Las pruebas comprueban que los intervalos se calculan como está escrito, no que sean los adecuados para una persona concreta.
- **El cambio de día a las 4:00 con el reloj real** (una sesión que cruza la medianoche o las 4:00 con la app abierta): solo está probado con fechas fijadas en las pruebas.

## Limitaciones conocidas del producto
- La calidad de cada respuesta es la **autoevaluación** del estudiante, no una corrección semántica.
- El tipo de error (recuerdo / idea equivocada / descuido) lo indica el estudiante; FORMA nunca lo deduce. Si no lo indica, el error queda «sin clasificar».
- El tiempo de respuesta es el tiempo desde que aparece la tarjeta hasta que se muestra la referencia; si el estudiante se distrae, el dato se infla. El diagnóstico usa la mediana para reducir ese efecto.
- La seguridad que se guarda es la que el estudiante indica antes de ver la referencia, en cuatro niveles. Los intentos anteriores a la 0.5.0 la registraron después de verla, así que la calibración mezcla ambos tipos de dato.
- La repetición de un fallo en la misma sesión no se registra: sirve para volver a intentarlo, pero no deja rastro en el historial ni en «Cómo aprendo» más allá del resumen de esa sesión.
- «Deshacer» solo retira la última respuesta de la sesión en curso; al salir de la sesión ya no se puede deshacer.
- La racha cuenta días con al menos un intento registrado. Indica constancia, no aprendizaje.
- Las preguntas de opción múltiple, archivar materias y los ajustes de movimiento reducido y sonido están previstos en los datos pero no tienen interfaz.
- Los niveles de evidencia (3 / 7 / 15) son referencias orientativas, no garantías estadísticas. No hay medición independiente de retención demorada.
- Al editar un concepto se conserva su progreso; FORMA no avisa de que el contenido cambió. El estudiante puede reiniciarlo manualmente («Reiniciar progreso»): se conservan contenido e historial, pero los intentos anteriores dejan de influir en diagnóstico, plan y resumen (no en la comparación global de métodos).
- La IA opcional llama al servicio directamente desde el navegador, sin proxy propio: el servicio debe aceptar peticiones del navegador (CORS) y la clave queda al alcance de quien use ese navegador mientras la pestaña siga abierta. Se envían como máximo los primeros 12 000 caracteres del texto fuente.
- La importación revisa hasta 60 borradores a la vez; el resto del texto hay que importarlo por partes. No se detectan conceptos duplicados.
- Los ZIP de versiones anteriores se eliminaron del árbol; siguen recuperables en el historial de git (commit `5de4deb`).

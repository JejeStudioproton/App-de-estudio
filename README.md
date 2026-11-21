# FORMA — Adaptive Learning (v0.4.0)

FORMA is a Spanish-language responsive learning PWA prototype focused on concepts, deliberate practice, review scheduling, and cautious summaries of a learner's self-reported evidence.

## Features in this package
- Professional, responsive interface for desktop, tablet and mobile with its own visual identity (cool paper, navy ink, cobalt actions, yellow highlighter) and locally bundled Atkinson Hyperlegible / Bricolage Grotesque fonts, so the app makes no request to Google Fonts.
- Subject and concept library (create, search, sort, edit, delete), exam dates and basic mastery estimates. Each concept has an importance level and an optional estimate of minutes per review.
- Practice session with recall prompt, reference reveal, confidence rating and self-evaluation. Response time and hint use are measured; the learner may (optionally) classify a failure as recall / misconception / careless.
- A simple spaced-review heuristic and concept prioritisation combining exam urgency, demonstrated mastery, forgetting risk, detected difficulties, importance and estimated time (3 minutes per review unless the learner sets another value on the concept).
- Exam planner (`src/planner.ts`): spreads active-recall, explanation and application work over the days left, never overloads a day, warns when time is insufficient and recalculates after every review. Starting the plan's next task opens the practice card with the activity the plan names.
- Difficulty diagnosis (`src/diagnosis.ts`): recall failure, misconception, application difficulty, over/under-confidence, slow retrieval, possible carelessness. Labelled *provisional* until at least moderate evidence exists.
- Evidence levels (`src/evidence.ts`): <3 insufficient, 3–6 initial, 7–14 moderate, ≥15 stronger. Orientative thresholds, not statistical guarantees; no method is declared superior on thin data.
- Session summary (`src/sessionSummary.ts`): studied, mastered *with evidence*, still difficult, errors to fix, what to review next and a concrete next activity.
- Import PDF with selectable text, DOCX, TXT, Markdown and CSV, or paste notes, as editable draft concepts: the name, question and reference answer of every proposed draft can be corrected, unticked or proposed again before saving, into an existing subject or a new one. Up to 60 drafts are reviewed at a time.
- CSV files are read one row per concept. Recognised header names: `concepto`, `pregunta`, `respuesta`, `aplicación`, `respuesta de aplicación`, `etiquetas` (accents optional, English equivalents accepted, `,` `;` or tab as separator). Without a header, two columns mean concept and answer, and three mean concept, question and answer.
- Source filename, PDF page and original excerpt are retained for imported concepts, even if the draft is edited. They are shown with the reference during practice and in the edit form; pasted text is labelled «Texto pegado».
- Local JSON backup and restore.
- Local-first storage, light/dark/system theme, basic PWA shell/offline fallback with a service worker whose scope and cache are relative to its folder (works on GitHub Pages project sites).
- Optional OpenAI-compatible adapter, off by default and with no API key included. When the learner enables it in Configuración (service address, model and, if required, a key), the import window gains «Proponer con IA»: it asks for confirmation naming the server, sends the source text and returns drafts to review. Each quoted excerpt is checked against the source text and flagged when it is not found there.
- Vitest unit tests for scheduling, state, import (including CSV) and the AI adapter (with a mocked server), plus jsdom tests of the interface: main study flow, import of pasted text and CSV, the optional AI flow, exam plan and modal Escape/focus restoration.

## Run locally
Requires Node.js 20+ recommended.

```bash
npm install
npm run check
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. To deploy, publish the generated `dist/` directory on any static host; the app has no client-side routes, so no rewrite rule is needed.

## Publish on GitHub Pages

GitHub Pages serves this repository from a subfolder (`/App-de-estudio/`), so the build must use relative asset paths:

```bash
npm run build:pages
```

Publishing is automatic: `.github/workflows/deploy.yml` runs on every push to `main` (and can be started by hand from the Actions tab), runs the type check and tests, builds with `npm run build:pages` and commits the contents of `dist/` to the `gh-pages` branch, which GitHub Pages serves. Nothing is published if the check or the tests fail. The app uses no client-side routes, so no SPA rewrite is needed. The manifest, icon and service worker are all referenced relatively; the service worker is registered with `import.meta.env.BASE_URL`, which is `./` in this build and `/` for a build served from a domain root (`npm run build`). The worker's shell cache is also relative, and it only deletes caches whose names start with `forma-`, because `github.io` shares its origin with other projects.

After changing the worker's cache strategy, bump `CACHE` in `public/sw.js` so clients replace the old cache.

## Privacy and AI
The app stores learning data in `localStorage` in the browser. It has no login, server database, cross-device synchronisation, analytics beacon or cloud backup. Clearing browser data can erase the only copy; export backups regularly.

The AI adapter is off by default, and with it off the app sends nothing to any server. When it is on:

- Text is sent only when the learner presses «Proponer con IA» in the import window and accepts the confirmation, which names the destination server.
- Only the source text in that window is sent (the first 12,000 characters). Subjects, saved concepts and review history are never sent.
- The service address and model are saved with the settings, so they are included in exported backups. The key is kept in `sessionStorage` until the tab is closed; it is never written to the app state or to backups.
- Requests go straight from the browser to the configured server, which must therefore accept browser (CORS) requests. `http://` addresses are accepted only for `localhost`.
- A key typed into a browser can be read by anyone with access to that browser profile. For a shared deployment, put a proxy you control in front of the provider instead of handing out keys.
- `VITE_FORMA_AI_BASE_URL` and `VITE_FORMA_AI_MODEL` (see `.env.example`) set the default address and model of a build. Never put a key in `.env`: `VITE_` variables are public in the bundle.

Only use a trusted server, and only send content you are allowed to share.

## Important limitations
- This is a prototype, not a production-ready education platform.
- There is no authentication, cloud sync, multi-user isolation, backend API, payments or account management.
- PDF import requires selectable text. Scanned PDFs and handwriting need OCR, not included here.
- Imported fragments are heuristics, not validated concept extraction. Review and edit every proposed concept.
- AI proposals are not validated either and can be wrong or invented; the «cita no encontrada» flag only shows that a quote is absent from the source, not that the rest is correct. The adapter has been tested against a mocked server only, not against a real provider.
- Self-evaluation is subjective. Mastery values are heuristics and must not be treated as grades.
- Scheduling is a small custom heuristic, not FSRS and not a scientifically validated memory model.
- There is no independent delayed-retention experiment yet. Comparing methods is exploratory and must not be presented as proof of causality.
- PWA offline support is a basic shell cache; full browser/iPad testing is still required.
- See `VALIDATION.md` for exactly what has and has not been verified (e.g. real Safari/iPad, offline mode and screen-reader use are not yet verified).

## Repository layout
- `src/App.tsx`: app UI and interaction flow.
- `src/App.smoke.test.tsx`: DOM smoke test of the main study flow and modal keyboard behaviour.
- `src/domain.ts`: domain types.
- `src/engine.ts`: scheduling, state transforms and evidence aggregation.
- `src/evidence.ts`, `src/diagnosis.ts`, `src/priority.ts`, `src/planner.ts`, `src/sessionSummary.ts`, `src/dates.ts`: pure learning-engine modules (no UI), each with its own `*.test.ts`.
- `src/components/`: components for the exam plan, session summary, diagnosis chips, the import window (`ImportPanel.tsx`) and the optional AI settings (`AISettingsPanel.tsx`).
- `src/importer.ts`: file validation (format, empty, 15 MB limit), document extraction with clear errors, draft splitting with source page, CSV parsing and conversion of reviewed drafts into concepts.
- `src/analytics.ts`: aggregated summaries.
- `src/storage.ts`: local persistence and migration.
- `src/ai.ts`: optional OpenAI-compatible adapter: configuration checks, request, parsing of proposed concepts and verification of their quotes.
- `src/engine.test.ts`: unit tests.
- `supabase/schema.sql`: optional future backend schema only; the current app does not call it.

## Next engineering steps
1. Run install, check, test and build in CI (already configured in `.github/workflows/ci.yml`).
2. Validate on iPad Safari and extend the interface tests to PDF and DOCX files.
3. Add a backend with authentication, per-user data isolation and migrations before any cloud sync.
4. Add concept-level skill-target setup, duplicate detection on import, and warn the learner when an edit changes a concept's content substantially.
5. Replace the heuristic schedule with a well-tested FSRS implementation and migration.
6. Add delayed checks to compare short-term confidence with later recall.
7. Extend keyboard/screen-reader testing, import progress and richer source-page mapping.

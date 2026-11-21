# FORMA — Adaptive Learning (v0.3.0)

FORMA is a Spanish-language responsive learning PWA prototype focused on concepts, deliberate practice, review scheduling, and cautious summaries of a learner's self-reported evidence.

## Features in this package
- Professional, responsive interface for desktop, tablet and mobile with its own visual identity (cool paper, navy ink, cobalt actions, yellow highlighter) and locally bundled Atkinson Hyperlegible / Bricolage Grotesque fonts, so the app makes no request to Google Fonts.
- Subject and concept library, exam dates and basic mastery estimates.
- Practice session with recall prompt, reference reveal, confidence rating and self-evaluation. Response time and hint use are measured; the learner may (optionally) classify a failure as recall / misconception / careless.
- A simple spaced-review heuristic and concept prioritisation combining exam urgency, demonstrated mastery, forgetting risk, detected difficulties, importance and estimated time.
- Exam planner (`src/planner.ts`): spreads active-recall, explanation and application work over the days left, never overloads a day, warns when time is insufficient and recalculates after every review.
- Difficulty diagnosis (`src/diagnosis.ts`): recall failure, misconception, application difficulty, over/under-confidence, slow retrieval, possible carelessness. Labelled *provisional* until at least moderate evidence exists.
- Evidence levels (`src/evidence.ts`): <3 insufficient, 3–6 initial, 7–14 moderate, ≥15 stronger. Orientative thresholds, not statistical guarantees; no method is declared superior on thin data.
- Session summary (`src/sessionSummary.ts`): studied, mastered *with evidence*, still difficult, errors to fix, what to review next and a concrete next activity.
- Import PDF with selectable text, DOCX, TXT, Markdown and CSV as editable draft concepts.
- Source filename and excerpt are retained for imported drafts.
- Local JSON backup and restore.
- Local-first storage, light/dark/system theme, basic PWA shell/offline fallback with a service worker whose scope and cache are relative to its folder (works on GitHub Pages project sites).
- Optional OpenAI-compatible adapter with no API key included.
- Vitest unit tests for scheduling and state operations, plus a jsdom smoke test that creates a subject, adds a concept, completes a practice review and checks modal Escape/focus restoration.

## Run locally
Requires Node.js 20+ recommended.

```bash
npm install
npm run check
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. To deploy, publish the generated `dist/` directory on a static host that supports SPA fallback.

## Publish on GitHub Pages

GitHub Pages serves this repository from a subfolder (`/App-de-estudio/`), so the build must use relative asset paths:

```bash
npm run build:pages
```

Publishing is automatic: `.github/workflows/deploy.yml` runs on every push to `main` (and can be started by hand from the Actions tab), runs the type check and tests, builds with `npm run build:pages` and commits the contents of `dist/` to the `gh-pages` branch, which GitHub Pages serves. Nothing is published if the check or the tests fail. The app uses no client-side routes, so no SPA rewrite is needed. The manifest, icon and service worker are all referenced relatively; the service worker is registered with `import.meta.env.BASE_URL`, which is `./` in this build and `/` for a build served from a domain root (`npm run build`). The worker's shell cache is also relative, and it only deletes caches whose names start with `forma-`, because `github.io` shares its origin with other projects.

After changing the worker's cache strategy, bump `CACHE` in `public/sw.js` so clients replace the old cache.

## Privacy and AI
The app currently stores learning data in `localStorage` in the browser. It has no login, server database, cross-device synchronisation, analytics beacon or cloud backup. Clearing browser data can erase the only copy; export backups regularly. The optional AI adapter is not connected to the UI by default and should only be enabled with a trusted endpoint and permission to share the content.

## Important limitations
- This is a prototype, not a production-ready education platform.
- There is no authentication, cloud sync, multi-user isolation, backend API, payments or account management.
- PDF import requires selectable text. Scanned PDFs and handwriting need OCR, not included here.
- Imported fragments are heuristics, not validated concept extraction. Review and edit every proposed concept.
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
- `src/components/`: presentational components for the exam plan, session summary and diagnosis chips.
- `src/importer.ts`: file validation (format, empty, 15 MB limit), document extraction with clear errors, draft splitting with source page.
- `src/analytics.ts`: aggregated summaries.
- `src/storage.ts`: local persistence and migration.
- `src/ai.ts`: optional OpenAI-compatible adapter.
- `src/engine.test.ts`: unit tests.
- `supabase/schema.sql`: optional future backend schema only; the current app does not call it.

## Next engineering steps
1. Run install, check, test and build in CI (already configured in `.github/workflows/ci.yml`).
2. Add component/integration tests and validate iPad Safari.
3. Add a backend with authentication, per-user data isolation and migrations before any cloud sync.
4. Add concept-level skill-target setup and warn the learner when an edit changes a concept's content substantially.
5. Replace the heuristic schedule with a well-tested FSRS implementation and migration.
6. Add delayed checks to compare short-term confidence with later recall.
7. Extend keyboard/screen-reader testing, import progress and richer source-page mapping.

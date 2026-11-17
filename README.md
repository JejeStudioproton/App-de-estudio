# FORMA — Adaptive Learning (v0.3.0)

FORMA is a Spanish-language responsive learning PWA prototype focused on concepts, deliberate practice, review scheduling, and cautious summaries of a learner's self-reported evidence.

## Features in this package
- Responsive interface for desktop, tablet and mobile.
- Subject and concept library, exam dates and basic mastery estimates.
- Practice session with recall prompt, reference reveal, confidence rating and self-evaluation.
- A simple spaced-review heuristic, prioritisation by due date, weak skill and review age.
- Evidence aggregation by method and skill; suppresses winner claims when observations are sparse.
- Import PDF with selectable text, DOCX, TXT, Markdown and CSV as editable draft concepts.
- Source filename and excerpt are retained for imported drafts.
- Local JSON backup and restore.
- Local-first storage, settings, basic PWA shell/offline fallback.
- Optional OpenAI-compatible adapter with no API key included.
- Vitest tests for important scheduling and state operations.

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
- Full build and browser test results depend on installing dependencies in your environment.

## Repository layout
- `src/App.tsx`: app UI and interaction flow.
- `src/domain.ts`: domain types.
- `src/engine.ts`: scheduling, state transforms and evidence aggregation.
- `src/importer.ts`: document extraction and draft splitting.
- `src/analytics.ts`: aggregated summaries.
- `src/storage.ts`: local persistence and migration.
- `src/ai.ts`: optional OpenAI-compatible adapter.
- `src/engine.test.ts`: unit tests.
- `supabase/schema.sql`: optional future backend schema only; the current app does not call it.

## Next engineering steps
1. Run install, check, test and build in CI.
2. Add component/integration tests and validate iPad Safari.
3. Add a backend with authentication, per-user data isolation and migrations before any cloud sync.
4. Add explicit editing for existing concepts and concept-level skill-target setup.
5. Replace the heuristic schedule with a well-tested FSRS implementation and migration.
6. Add delayed checks to compare short-term confidence with later recall.
7. Add accessible keyboard navigation, import progress, and richer source-page mapping.

# Validation status

This package was assembled as a source bundle. Do not claim a successful production build until the following commands run successfully in an environment with network access and Node installed:

- `npm install`
- `npm run check`
- `npm test`
- `npm run build`

Manual acceptance checks:
- Create a subject and concept, reload the page and confirm local persistence.
- Run a session, reveal the reference, record an evaluation and check that the next due date changes.
- Import a selectable-text PDF, DOCX and TXT; review the proposed concepts and source trace.
- Export JSON, clear data, restore JSON and compare the content.
- Test at 320px, 768px and 1024px widths and on iPad Safari.
- Test offline launch after the first successful online load.
- Verify keyboard focus, screen reader labels, modal focus trapping and contrast.

Known implementation gaps:
- Existing concept editing is not yet implemented.
- Session length setting is stored but not yet used as a separate cap from the time-budget heuristic.
- Review response time is currently recorded as zero; instrumenting reliable elapsed time remains work.
- The app currently logs self-evaluation as quality; it is not semantic grading.
- AI adapter exists as a module but has no UI or server-side proxy.
- Import source page is not assigned to each extracted fragment yet.

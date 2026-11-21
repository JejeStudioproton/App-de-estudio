# FORMA roadmap

## Phase 0 — prototype (this bundle)
- [x] Local subject/concept library
- [x] Practice loop and self-assessment
- [x] Heuristic spaced review
- [x] Evidence grouping by method and skill
- [x] Text-based file import and JSON backup
- [x] Responsive layout and PWA shell
- [x] CI build, tests and automatic publication to GitHub Pages
- [ ] Validation on real devices (iPad Safari)

## Phase 1 — reliability
- [x] Editing of concepts (content, importance, minutes per review, progress reset)
- [ ] Duplicate detection for concepts
- [ ] Source page/paragraph offsets and source viewer
- [x] Extraction review UI: every draft can be edited or unticked before saving
- [ ] FSRS integration with tests and migration
- [ ] Delayed retention sessions and objective scoring rubrics
- [ ] Accessibility audit and iPad Safari QA
- [x] Automated GitHub Actions build/test

## Phase 2 — private sync
- [ ] Authenticated backend
- [ ] Per-user row-level security and data export/delete
- [ ] Sync conflict resolution and offline queue
- [ ] Server-side secrets and rate limits
- [ ] Privacy policy and threat model

## Phase 3 — adaptive content generation
- [x] Optional AI provider (any OpenAI-compatible server) with confirmation before each request
- [x] Structured extraction with source citations, each checked against the source text
- [ ] Generated question quality checks
- [ ] Semantic grading with rubric and source-grounding checks
- [ ] Cost controls and local model support

## Phase 4 — evidence-based personalisation
- [ ] Controlled comparison of methods
- [ ] Delayed recall metrics
- [ ] Confidence calibration
- [ ] Recommendations with uncertainty
- [x] Student-facing explanations for why each task is recommended

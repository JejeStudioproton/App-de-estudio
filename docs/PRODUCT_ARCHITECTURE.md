# Product architecture and learning model

## Core loop
1. Collect learner material.
2. Extract candidate concepts while retaining source provenance.
3. Learner reviews the candidates before saving.
4. A session asks for recall or application before revealing the reference.
5. Learner reports confidence and performance.
6. The engine updates skill estimates, review schedule and method evidence.
7. The plan prioritises overdue concepts and weaker skills.

## Evidence policy
A self-rating is not objective grading. Keep raw review events so future versions can recompute aggregate metrics. Do not claim that a method works better for a learner until the comparison has enough observations, similar concepts, and ideally delayed-retention outcomes. Correlation does not establish causation.

## Future method experiment
- Randomise comparable concepts to candidate methods where appropriate.
- Keep subject, difficulty, content size and initial mastery as covariates.
- Measure immediate performance and delayed recall (for example, 2–7 days later).
- Record time-on-task and confidence calibration.
- Report uncertainty and sample size, and allow a method to vary by skill and content type.
- Never infer stable learning styles or fixed student identities from sparse data.

## Data ownership
Local-first prototype. Backups are explicit user actions. A future cloud backend must use authenticated user identity, server-side authorisation, row-level security and migration scripts. Do not place service-role credentials in a browser bundle.

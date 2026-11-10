# 16 Initial implementation status

Implemented 2026-11-09 as the first fixture-backed build. The roadmap in `12` remains the full acceptance target.

## Working now
- npm workspaces, React/Vite, Tailwind, shadcn-style Radix components, Fastify, SQLite and Zod.
- Contract 0.2 schemas and relationship/coverage validation; legacy adapter preserves missing/synthetic provenance.
- Bundled immutable screenshot assets. No runtime reads from the engine repository.
- Seeded Popfly workspace: 70 errors, 10 pages, 3 provisional templates, 10 groups.
- Persistent status actions, Not an issue with atomic false-positive note/review, notes, reviews, group removal, immutable observations/history and feedback export.
- Overview, all five lists and detail types, URL filters, pagination, nested source navigation, traces and historical evidence.
- Simulated full/verify jobs, subsets, mixed source references, idempotent requests, persisted jobs, recovery and transactional ingest.
- Frozen scan Changes, revision guards against newer manual actions, explicit unavailable coverage/PDF states.
- Loopback bindings, host/origin validation, mutation tokens, site-scoped access and local mode separation.
- Incremental Git history and GitHub Actions for tests, build and browser checks.

## Validation
Unit/integration tests cover contracts, fixture jobs, persistence/API and frontend filtering/navigation/token recovery. Browser tests exercise all initial list/detail screens and their tabs with axe, 320 CSS px reflow, dismissal/reload, list return state, declare/verify, evidence preservation, skip-link operation and dialog keyboard focus.

Automated checks do not establish full accessibility conformance. Manual screen-reader checks, text zoom inspection and engine dogfooding remain required before declaring the accessibility phase complete.

## Remaining roadmap work
- Live engine service and HttpEngine, including production stable identity. Current keys are explicitly provisional fixture identities.
- Site scan-settings form and persistence of configurable live scan options.
- Complete abandonment/recovery UI for failed imports and broader failure-state scenarios.
- Genuine PDF fixture and report generation integration; current UI truthfully reports no PDF available.
- Bbox overlays and a synthetic boxed capture; current screenshots have no recorded boxes.
- Additional real coverage/timing examples and synthetic new-group/new-template scenarios from `15`.
- Full manual accessibility and engine dogfood gate.
- Performance work and stricter typed record models before scaling beyond the current bounded local workspace.

The app can record other site entries, but sample mode refuses to scan them. No new website scans, external model calls or engine modifications occurred in this build.

## Persistence implementation note
The initial SQLite implementation stores immutable/transactional records with relational identity/index columns and JSON payloads. It enforces uniqueness, site ownership and immutable-history triggers. It does not reproduce every proposed SQL column/view from `03`; denormalized projections currently derive in application code. Keep this explicit when adding migrations or optimizing queries.

## Run and backup
Use the commands in README. Stop both local services before copying `.data/fixture` for a consistent sample-workspace backup. For future live mode, app data and corresponding engine evidence must be backed up together. Do not remove live data to reset a sample walkthrough.

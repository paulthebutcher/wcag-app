# 01 Product

## User (v1)
One user: Paul, doing accessibility work for clients. He adds sites, runs scans, reads results, coordinates or implements fixes, declares fixes, verifies them with a scan, and leaves feedback when the engine is wrong. The app should look polished when shown in interviews. It is an internal tool, with no separate demo workflow or hosted public access.

Later users (out of scope for v1, keep the model compatible): a client Head of IT who reviews progress, a client developer who fixes and reports back, and an operator view for labeling and eval.

## Jobs
1. See every accessibility error on a site, individually, with criterion, page, element, last captured time and the element in context.
2. Work the largest fixes first: errors that one code change clears (a component, or something global).
3. Work page by page, because that is how this work is done today.
4. Declare fixes in bulk, then run one verify scan that confirms or flags them.
5. Keep a record: nothing is deleted, fixed items stay visible as fixed, every status change is in history.
6. Improve the engine: read the trace and evidence, leave typed notes. Notes never change original scan data.

## Requirements
- Entities: Site, Error, Observation, Components & Global (group), Page, Template, Scan, Note, Review.
- Error relationships: error belongs to one page; a page may belong to one template; an error may belong to one Components & Global group.
- Statuses: has error, in progress, fixed, not an issue (rules in `05`).
- Entity lists filter by status, criterion and reviewed; Scans has the scan-specific filters in `07`. Pagination at 50 rows. No search in v1.
- Engine labels shown as read-only pills. Not filterable, not used for ranking.
- Full scans and verify scans are stored and exportable (PDF from the engine).
- Desktop-first, modern light-mode shadcn UI. The shell and ordinary content reflow at narrow widths; only tables and necessary evidence surfaces scroll horizontally. No narrow-screen warning.

## Out of scope for v1
- Client logins/views, auth, hosting, and automated retention/deletion policies. Local backup guidance is in scope.
- Creating, merging, renaming or adding to groups. Only "remove from group" exists.
- Search.
- Full-site discovery and scans over 50 pages.
- Automatic migration between incompatible identity namespaces. Such scans are blocked from ingest instead of silently recreating errors.
- Any conformance claim. No "WCAG AA compliant" language anywhere.
- A separate mobile-specific experience. Accessible reflow of the same interface remains required.

## Development and interview data
- Build and design against Popfly scans (permission given). Sample fixture in `contract/fixtures/popfly-sample/`.
- Use the Popfly fixture workspace for interviews; client work remains in the live workspace. A visible data-mode label distinguishes them. No demo reset may touch live data.
- Existing scans and the additional fixture scenarios are inventoried in `15-data-readiness.md`.
- No additional client data or live scans are required to start implementation.

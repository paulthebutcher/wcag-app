# 12 Build plan

This is future implementation work. The current request changes documentation only. Each UI phase ends with relevant logic checks, axe on new screens and keyboard checks. Engine dogfood runs in Phase 8 once the app is runnable; it is not a prerequisite for scaffolding.

## Phase 0: Scaffold, contract and fixtures
- npm workspaces: apps/web, apps/server, packages/contract; selected stack in CLAUDE.md.
- Implement target 0.2 schemas from `04`, including envelopes, coverage, snapshots and mixed-source target references. Preserve legacy files and adapt them explicitly.
- FixtureEngine with deterministic request-aware jobs, progress, subset verification, errors and immutable asset serving. Bundle fixture screenshots; prepare additional data per `15`.

Accept: both original fixtures parse through the adapter; unavailable/derived provenance is preserved. Target schema rejects dangling references, missing outcomes and incompatible versions. No fixture runtime access to engine folders. Replayed request_id returns the same job. The engine service is not needed.

## Phase 1: Database, ingest and statuses
- Implement `03`, `05`, `09` revisions and `14` frozen Changes.
- Seed Popfly baseline into fixture-only app data.

Accept: 10 pages, 3 provisional templates, 4 static pages, 10 groups, 70 errors, 10 ungrouped, all has_error. Test the full status matrix, coverage gating, persistent dismissal, mixed sources, newer manual actions, immutable evidence, removal history, transactional rollback and idempotent ingest. No missing finding alone closes an error.

## Phase 2: Shell, visual system and navigation
- Apply light-mode shadcn tokens and layout from `11`. No Figma dependency.
- Routes, sidebar/site switcher, Add site, filter URLs, back/previous/next and shared table/filter patterns.

Accept: context/focus restoration works across pagination and changed list membership; tabs replace history; sidebar collapses and ordinary content reflows at 320 CSS px. Check a populated and empty list visually.

## Phase 3: Lists
Implement the five lists in `07`, including derived no_issues and review revisions.

Accept: filter combinations obey same-member semantics, URLs round-trip, rank is deterministic and engine labels never influence filter/rank. Test empty entities and unknown template totals.

## Phase 4: Details and evidence
Implement `08`, historical capture selection, traces, loading/unavailable/error states.

Accept: entity-name links and explicit actions work without clickable rows; matching snapshot/evidence is used; inherited notes retain source; raw traces remain inert text; missing source metadata is disclosed.

## Phase 5: Actions and feedback
Status changes, Declare fixed, Not an issue, Reviewed, typed notes, group removal and site feedback export.

Accept: no manual Fixed action; Not an issue atomically records decision, note and review; repeated detections stay on the same dismissed row. Reversals and feedback provenance survive export. No generic review becomes a positive training label. Ordinary notes do not auto-review. No edit/delete routes for notes/history.

## Phase 6: Jobs, scan results and reports
Full first scan, verify, full rescan, site scan settings, polling/recovery, queue/read indicators and engine PDF download.

Accept: original 70-target fixture scenario yields 15 detected, 18 not_detected, 37 not_checked and corresponding statuses. Subset verify, third-scan reopening, source mixing, failed/partial coverage, restarts, idempotency, newer actions, import retry and PDF failure all follow `14` and `15`. Frozen Changes and counts agree after later edits. Local-only is default.

## Phase 7: Overview
Implement `10`, distinguishing latest full coverage from latest scan result.

Accept: counts link to matching filters, narrow verify does not replace site-wide coverage, empty/failed/disconnected states remain usable.

## Phase 8: Accessibility and dogfood
- Keyboard and screen-reader checks, 200% text zoom, 320 CSS px reflow, contrast and local table scrolling.
- Review the actual visual result at desktop and narrow sizes; refine spacing/type/action hierarchy without changing scope.
- Run the existing engine against the local app in local-only mode when configured, review findings and fix or record explanations.

Accept: axe clean on all screens, manual accessibility checklist completed, engine findings reviewed. No implied conformance proof from automated scans alone.

## Phase 9: Live engine service
Implement HttpEngine after the engine delivers `13` required items, including the full 0.2 contract and identity tests.

Accept: the same contract/status suite runs against controlled HTTP-service fixtures. Validate a real service scan separately without expecting historic Popfly counts. Recovery, media delivery, mixed-source verification, local-only behavior and persistent same-subject dismissal work end to end. Identity incompatibility fails closed before ingest.

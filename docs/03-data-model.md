# 03 Data model (app database)

SQLite app.db belongs to apps/server. This is a target schema specification, not a migration implementation. Enable foreign keys, use transactions, and validate cross-site relationships server-side. UTC timestamps, UUID app IDs, opaque engine IDs. Use a schema migrations table when building.

## Core entities

| Table | Required columns and constraints |
|---|---|
| sites | id PK, name, normalized URL UNIQUE, platform, identity_version nullable until first ingest, model_mode default local_only, scan_options JSON, created_at |
| scans | id PK (also engine request_id), site_id FK, engine_job_id UNIQUE nullable, engine_scan_id UNIQUE nullable, kind, scope, state, ingest_state, request_payload JSON immutable, retry_of_scan_id nullable FK, source_scan_ids JSON, metadata JSON, progress JSON, failure_stage/code/message nullable, engine_version, identity_version, requested_at, started_at, engine_completed_at, ingested_at, completed_at, summary JSON immutable after ingest, read_at |
| templates | id PK, site_id FK, template_key, name, known_pages nullable, discovery_metadata JSON, content_revision; UNIQUE(site_id, template_key) |
| pages | id PK, site_id FK, page_key, url, title, template_id nullable FK, latest_snapshot_id nullable FK, content_revision; UNIQUE(site_id, page_key) |
| components | id PK, site_id FK, component_key, name, scope, remediation JSON, content_revision; UNIQUE(site_id, component_key) |
| errors | id PK, site_id FK, identity_version, error_key, element_key, page_id FK, component_id nullable FK, criterion, level, failure_type, name, status, status_revision, content_revision, status_changed_at, first_seen_scan_id FK, last_detected_observation_id nullable FK, last_captured_at; UNIQUE(site_id, identity_version, error_key) |

Latest pointers and labels are projections. They do not replace historical records. errors.status is one of has_error, in_progress, fixed, not_an_issue. Derived no_issues is never stored on an error.

scans.state: queued, running, completed, failed. ingest_state: pending, importing, imported, failed. The app shows completed only after successful ingest; a completed engine job being imported is displayed as running / "Importing results". Transport outages are a connectivity indicator, not an invented engine failure.

One queued/running/importing scan per site, enforced transactionally. A failed import retains its engine result ID for retry and blocks a new scan for that site until imported or explicitly abandoned. Abandoning records a history event and keeps the row; it never deletes results.

## Immutable scan records

| Table | Required columns and constraints |
|---|---|
| page_snapshots | id PK, site_id FK, page_id FK, scan_id FK, engine_snapshot_id, captured_at, url, title, template_key nullable, screenshot reference/dimensions, viewport JSON, HTTP status nullable, render_health, warnings JSON, raw_payload JSON; UNIQUE(scan_id, engine_snapshot_id) |
| scan_error_revisions | scan_id FK, error_id FK, status_at_request, status_revision_at_request; PK(scan_id, error_id); snapshot all known site errors, including incidental-result subjects |
| scan_targets | scan_id FK, error_id FK, engine error_key, source_observation_id FK, source_engine_scan_id, source_engine_finding_id, status_at_request, status_revision_at_request; PK(scan_id, error_id) |
| observations | id PK, error_id FK, scan_id FK, snapshot_id nullable FK, outcome, reason nullable, engine_finding_id nullable, evaluated_at, captured_at nullable, engine_version, identity_version, labels JSON, evidence JSON, analysis JSON, remediation JSON, raw_finding JSON; UNIQUE(error_id, scan_id) |
| scan_changes | scan_id FK, error_id FK, observation_id FK, category, status_before, status_after, status_application; PK(scan_id, error_id) |
| scan_payloads | scan_id PK/FK, validated contract metadata, coverage, templates, components and provenance JSON; immutable after successful import |

Observed outcomes are detected, not_detected, not_checked. A failed capture has no invented captured_at or snapshot. detected requires finding ID and snapshot; not_detected requires successful capture and coverage; not_checked requires a reason. Keep the original source observation when a check could not run.

Error evidence defaults to its latest detected observation and matching snapshot, even after a later scan no longer detects it. History can select another observation and its own snapshot. Page overview shows its latest snapshot. Never pair historical element HTML/bbox with the latest page image by accident.

scan_changes categories and precedence are in `14`. Keep before/after values and the frozen classification so future status edits do not rewrite old scan counts.

## Actions and feedback

| Table | Required columns and constraints |
|---|---|
| notes | id PK, site_id FK, entity_type, entity_id, type, optional text, source_observation_id nullable FK, action_id, created_at; append-only |
| reviews | id PK, site_id FK, entity_type, entity_id, optional note, reviewed_content_revision, source_observation_id nullable FK, action_id, created_at; append-only |
| decisions | id PK, site_id FK, error_id FK, kind (not_an_issue or reverted), source_observation_id FK, note_id/review_id nullable FKs, supersedes_decision_id nullable FK, action_id UNIQUE, created_at; append-only |
| group_removals | error_id FK, component_id FK, action_id, created_at; UNIQUE(error_id, component_id); append-only |
| events | integer id PK, site_id FK, entity_type, entity_id, kind (status_changed, observed, reviewed, note_added, removed_from_group, first_seen, membership_changed, import_abandoned), from_status/to_status nullable, scan_id nullable FK, action_id nullable, detail JSON, created_at; append-only |
| action_requests | id PK, request_hash, result JSON, created_at; records mutation idempotency |

Polymorphic references in notes/reviews/events must resolve to an entity in the same site. Normal entity reviews include error, component, page, template and scan, not site. Decisions attach to exact errors. Notes/reviews capture the observation judged where available so future eval export can identify its evidence and engine version.

Keep all removed group associations. Ingest never restores a rejected `(error, component)` association, even after the engine proposes other groups. A different incoming group may be assigned; each rejected association remains separately recorded. Inherited notes follow current memberships, while history retains the old relationship events.

## Ingest
1. Fetch all pages of the engine response, coverage and metadata. Validate versions, identity namespace, references, target completeness and outcome consistency before mutating app entities. Snapshot every known site error's status/revision at request time, separately from comparison targets, so incidental findings also respect newer manual actions.
2. In one transaction, upsert template/page/component projections, insert immutable scan snapshots and raw payloads, and map findings by engine identity.
3. Apply group_removals before updating memberships. New subjects get has_error and first_seen. Existing dismissed subjects keep the same error row and decision.
4. Insert one observation per error/scan, combining detected outcomes with their findings. For full scans, use only explicit engine comparison outcomes; no inference from absence. Unattempted pages produce no observation.
5. Apply the status matrix and request-revision guard in `05`, record events, then freeze scan_changes and summary. Update content revisions using `09`.
6. Mark imported/completed, set read_at null and commit. Any failure rolls back this entire ingest transaction. Store the import error separately for retry.

Re-ingesting a completed engine_scan_id is a no-op and does not reset read_at or duplicate events. Unique constraints backstop retry behavior. Full scan result sets must be fetched completely before absence is ever acted on. Missing legacy fields use explicit unavailable values only where the target schema permits them.

## Derived values
- Roll-ups, open counts and spread: SQL views over current members, with rules in `05`.
- Last captured: latest actual detected capture for errors; latest snapshot for pages; maximum member capture for groups/templates.
- Latest reviewed tag and changed_since_review: compare content_revision with the latest review's reviewed_content_revision.
- Parent content revisions propagate child evidence/status/membership changes; old and new parents both change on moves/removals.
- Template pages scanned: distinct current member pages with snapshots. Fully scanned requires a known total and snapshots for every known page; historical coverage dates remain visible. Unknown totals are a separate coverage state.
- Inherited notes: current group/page/template notes, shown once with source. Has notes includes inherited notes.

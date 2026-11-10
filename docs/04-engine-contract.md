# 04 Engine contract

Target contract: `0.2.0`, specified but not implemented. The existing `contract/types.ts`, sample JSON and generator describe legacy `0.1` fixtures. During Phase 0, create target schemas and an explicit fixture adapter. Preserve original files and identify derived fields. No app identity algorithm.

## Transport and compatibility
- JSON response: `{ contract_version, data }`. Collections: `{ contract_version, data: { items, next_cursor } }`, including empty collections. Errors: `{ contract_version, error: { code, message, retryable, details? } }`.
- Cursor pagination is stable within an immutable completed scan. Default page size 100, maximum 500. `next_cursor: null` ends iteration. Read every page before ingest.
- While pre-1.0, accept only matching major/minor (`0.2.x`); validate schemas and required capabilities. Unknown additive fields may be retained. Missing required data fails import.
- Images and PDFs use their actual media types and `X-Contract-Version`; do not wrap binary content in JSON. JSON error bodies use the same error envelope.
- IDs are opaque strings; dates are UTC ISO 8601. Nullable fields carry null plus a reason where needed, never fabricated values.
- 400 invalid request; 404 missing resource; 409 conflicting idempotency key/site job or incompatible identity; 422 invalid target/scope; 503 service unavailable. Include useful structured error codes.

## Identity
The engine owns `page_key`, `element_key`, `error_key`, `component_key`, `template_key`, and `identity_version`.

- Page identity uses the normalized effective URL: normalize scheme/host case and default ports, remove fragments, retain meaningful query parameters and path case. Redirect aliases are recorded by the engine, not guessed by the UI. Do not globally strip trailing slashes or query parameters.
- Element identity is page-local and independent of grouping, severity, text display names, measurements, and the latest raw selector. Persist the engine's resolved element registry across scans.
- Error identity is the page + resolved element + stable failure/check subject. Distinct failures sharing a criterion remain distinct. Multiple detectors of the same subject produce one contract finding with supporting evidence preserved.
- Group identity is separate. Fixing contrast, changing classes or regrouping must not automatically create a new error identity for a still-identifiable subject.
- Normalize engine findings folded across pages into one contract finding per identified page/element/error. Count-only historical occurrences cannot be invented as exact errors; retain them as coverage limitations.
- Preserve identities across compatible engine releases. Emit `identity_version` on health and scan metadata. The app rejects a namespace it cannot map; it does not silently duplicate dismissed errors.
- For genuinely ambiguous element matches, do not transfer a dismissal to another element. Report uncertainty; existing targets become not_checked if their absence cannot be established. A distinguishable new subject can have a new key.

Engine acceptance examples: unchanged rescans; DOM sibling insertion; changed class/style/contrast; changed group assignment; repeated identical elements on one page; identical elements on different pages; different failures on one element; removed/reintroduced identifiable element; redirects; incompatible identity version. Each specifies whether keys must persist or differ. These are required before live integration.

## Endpoints
All list endpoints use the collection envelope above.

| Endpoint | Data |
|---|---|
| GET /health | engine_version, contract_version, identity_version, capabilities |
| POST /jobs | job_id and persisted initial state |
| GET /jobs/:job_id | job_id, request_id, state, queue_position, progress, scan_id, error, timestamps |
| GET /jobs/by-request/:request_id | Recover an accepted request when its POST response was lost |
| GET /scans/:scan_id | ScanSession |
| GET /scans/:scan_id/pages | PageSnapshot items |
| GET /scans/:scan_id/templates | Template items |
| GET /scans/:scan_id/components | Component items |
| GET /scans/:scan_id/findings | Finding items |
| GET /scans/:scan_id/outcomes | ComparisonOutcome items, for full and verify scans |
| GET /scans/:scan_id/coverage | Coverage |
| GET /scans/:scan_id/report.pdf | Engine evidence report |
| GET /screenshots/:asset_id | Captured image addressed by engine-issued opaque asset ID |

Read APIs expose only committed results. Failed-job artifacts are diagnostic and never returned as a completed comparison. All lookup and asset paths are constrained to engine-owned records; no arbitrary filesystem paths.

## Job requests
Every request contains `request_id` (app scan UUID), `site_id` (opaque app site ID), `site_url`, and `expected_identity_version`. An identical replay returns the original job; reuse with a different payload returns 409.

A target reference is `{ error_key, source_scan_id, source_finding_id }`. IDs here are engine IDs, not app observation IDs. The engine validates subject, site and source consistency.

Full scan:
```
{ request_id, site_id, site_url, expected_identity_version,
  kind: "full", pages?: string[], comparison_refs: TargetRef[],
  options: { max_pages: 50, tiers: number[], model_mode: "local_only" | "assisted",
             platform: "auto" | "webflow" | "wordpress" } }
```
`pages` absent means bounded discovery. Explicit pages means exactly that list, subject to robots/capture restrictions and no additional crawl. The app freezes references for all existing errors, including fixed/dismissed ones, using their latest detected observation. Return outcomes for references on attempted pages, including failed captures. Errors outside attempted scope get no outcome. First scan has no references. Reject more than 50 supplied URLs; never silently truncate an explicit set.

Verify scan:
```
{ request_id, site_id, site_url, expected_identity_version,
  kind: "verify", targets: TargetRef[],
  options: { max_pages: 50, model_mode: "local_only" | "assisted",
             platform: "auto" | "webflow" | "wordpress" } }
```
Use each target's source to identify checks and pages. Group execution by page/check so multiple sources do not cause duplicate work. No single mandatory baseline. Retain a source_scan_ids array in scan metadata. Existing CLI baseline behavior can remain; the service adapts to this target-based contract.

Return exactly one outcome per requested verify target. New findings from checks that ran are returned normally, with any referenced page/template/component records. Incidental detections of existing errors are observations too; absent non-target errors are not inferred fixed.

## Required records

### ScanSession
scan_id, site_url, platform, kind, source_scan_ids, requested/started/completed timestamps, engine_version, identity_version, detection_manifest, resolved_options, requested_urls (null for discovery), attempted_urls, captured_urls, excluded_urls, discovery summary, timings, model_usage, report availability.

Detection manifest includes axe version, enabled tiers, enabled/disabled check IDs, model mode and model IDs. Discovery includes sitemap count and budget; unknown historic values are null with an explanation. Timings include phase durations; model usage includes calls/input/output tokens and model IDs when recorded. Do not infer missing historical values from current configuration.

### PageSnapshot
snapshot_id, page_key, requested_url, url, title, captured_at, template_key, screenshot_asset_id/url (nullable), screenshot dimensions/content hash (nullable for legacy), DOM content hash (nullable for legacy), viewport dimensions/device scale, HTTP status (nullable), render_health (`healthy|degraded|failed|unknown`), capture warnings. All screenshot metadata refers to the same immutable capture. Missing legacy metadata is shown as not recorded.

### Template and Component
Template: template_key, name, page_keys, known_pages (nullable), discovery scope/time. Component: component_key, label, scope (`component|global`), criteria, remediation. Both collections are available on full and verify scans, including newly discovered references. Unknown known_pages displays "N scanned; total unknown".

### Finding
Retain all evidence/analysis/remediation/labels from the legacy shape. Add name, element_key, snapshot_id, check_ids and supporting detector evidence if merged. Keep criterion, level, failure_type, page_key, error_key, nullable component_key and finding_id. The engine supplies a plain display name, falling back to criterion short name + failure label, never a raw model paragraph. The app does not reconstruct identity from any display field.

Evidence bbox is nullable and measured in CSS pixels relative to the captured page, with screenshot scale derived from the recorded dimensions. Historical captures without boxes display the full screenshot. Model traces include formatted structured output where available, prompt/input/raw response, model and token metadata. Null or truncated source values are disclosed. Raw markup/model text is rendered as text, never executable HTML.

### ComparisonOutcome
`{ error_key, source_scan_id, source_finding_id, outcome, reason, check_ids, evaluated_at, snapshot_id, finding_id }`.
- detected: matching finding_id and snapshot_id required.
- not_detected: no finding_id; matching successful capture and complete relevant check coverage required.
- not_checked: reason required; snapshot_id nullable when no capture exists.

An outcome and finding for the same error produce one observation. Conflicting outcomes, dangling references or missing requested outcomes fail import. Missing findings alone never establish absence.

### Coverage
scan_id, requested/attempted/captured URLs, crawl failures, render failures, exclusions with reasons, per-page/check entries (`ran|partial|failed|skipped|not_recorded` plus reason), discovery counts and budget. A selected target whose relevant check was not completely executed is not_checked. Emit all known limitations. Never treat an unrecorded old check as ran.

## Rescanning and export
"Rescan previous pages" uses the frozen requested page set of the latest successfully imported full scan (or attempted URL set for bounded discovery), including previously failed attempts, maximum 50. Verify never replaces this baseline. Preserve the previous full scan's model/tiers/platform settings unless Paul explicitly changes them before starting.

PDF is the engine's scan evidence report, not an app status/review report. If unavailable, show its actual availability/error and allow retry. Do not silently generate a fake report. Fixture mode uses a bundled labeled fixture PDF or a truthful unavailable state.

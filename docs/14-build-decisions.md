# 14 Build decisions and operational rules

Updated 2026-11-09. This file records delegated decisions for implementation. It does not authorize building during the documentation update.

## Authority and scope
[observed] Paul confirmed: this is his internal client-work tool; use modern light-mode shadcn without waiting for Figma; Not an issue persists for the specific element/error pair and counts as human review/engine feedback. He delegated closure of the other gaps.

The remaining choices below are selected implementation defaults. Existing exclusions remain: one user, loopback only, maximum 50 pages per scan, no hosted client access, search, group editing or automatic identity migration. A separate interview/demo product is not required.

## Status and scan Changes
Use the full matrix in `05`. The following classifications are frozen at ingest from the outcome and actual status transition, in order:

| Category | Definition |
|---|---|
| not_an_issue | Error is currently dismissed; preserve that status regardless of outcome |
| not_checked | Target has no sufficient result; reason required |
| new | New error row created by detection in this scan |
| reopened | Previously fixed error actually changed to has_error |
| fixed | Previously has_error/in_progress error actually changed to fixed |
| still_detected | Detected existing error not classified above, including a declared fix still detected |
| no_change | Remaining results, such as an already fixed error still absent or a transition skipped because a newer manual action won |

Every observation belongs to exactly one category. Retain its independent detected/not_detected/not_checked outcome and status_application flag. Category counts sum to observations, not all site errors. Summary.new/fixed/reopened are actual changes; summary.not_checked counts the category, while Coverage shows all check gaps, including those affecting dismissed errors. Dismissed detections do not inflate new/reopened/open counts. A disclosure in Changes explains this separation.

A skipped transition says "Result recorded; a newer status action was kept". An older pending scan cannot confirm a fix declared after its request. The user can verify again. Persist summary and scan_changes once; do not recalculate them from current error status.

## Scan configuration
- First scan: site URL, platform auto, maximum 50 pages, local_only, tiers 1,2,4,5. The engine reports any selected checks that still require models as skipped. A missing API key never becomes a successful model check.
- Site options expose Local-only / Model-assisted and platform Auto/Webflow/WordPress. Advanced options expose tiers. Model-assisted is an explicit choice, with short copy that selected page content/images go to the configured provider. Keys remain in engine environment configuration.
- Verify uses the source finding's check IDs and the current site's chosen model mode. It does not expand to unrelated checks. If its required model check is disabled/unavailable, return not_checked with the reason.
- Full rescan preserves the previous full request's settings unless explicitly changed. Snapshot resolved options on every request and result.
- The engine's required contact URL is deployment configuration (`WCAG_CONTACT_URL`); surface a clear setup error if absent. Do not ask the user to type secrets into the app.
- Enforce the 50-page cap in server and engine, including resolved verify targets. Explicit lists over the cap fail without truncation. Discovery may know more URLs than it scans; show exclusions/limits.
- No cancellation UI in v1. Queue/running state and failures remain inspectable; do not add resumable crawling.

## Job submission and recovery
1. Persist the app scan row, immutable request, target references and all known site-error status revisions before POST. Use its UUID as request_id. Disable duplicate local submissions transactionally.
2. Engine persists jobs and idempotency mappings before acknowledging. Same ID/body returns the original job; changed body returns conflict.
3. Lost POST response: recover by request_id, or replay exactly the same POST. Do not allocate another scan ID. An engine outage leaves the app request queued with a connection message.
4. Engine queues across sites FIFO and executes one global job, sharing the existing CLI/eval gate lock. Queue progress distinguishes waiting for worker from waiting for lock. Per-site duplicate active jobs are rejected.
5. App restart resumes polling persisted queued/running jobs. Poll every 5 seconds while healthy; back off outages to 30 seconds, reset after recovery. Saved data and annotations remain usable.
6. Engine restart retains queued jobs. A previously running job whose worker is confirmed gone becomes failed/interrupted; do not resume or ingest partial output. Already completed immutable results remain available. Never launch a second worker while an existing one is still live.
7. Engine completion triggers validated transactional ingest. Local import failure shows "Import failed" with Retry import, preserving the engine result and all previous app state. Retry import does not rescan. New scans for that site remain blocked until import succeeds or is explicitly abandoned.
8. A terminal scan failure offers Retry scan, which creates a new app request, freezes current targets/status revisions, and links to the failed request. Preserve all old jobs. A first full-scan retry keeps its explicit settings and scope; a verify retry uses the current declared-fix list, showing its count.
9. Persist failures by stage: submission, engine, contract validation, ingest, report. Contract/identity mismatch requires a compatible service/configuration before retry. A PDF failure does not turn an already imported scan into a failed scan.

Read state applies only to completed imported scans. Opening a queued page does not pre-mark its future result read; when it completes while open, mark read only after the result loads successfully. Mark all read affects currently completed scans only.

## Local runtime and data
- Default addresses: web 127.0.0.1:5173, app API 127.0.0.1:4310, engine 127.0.0.1:4311; configurable, with clear port-conflict errors. Web dev server proxies app API; the browser does not fetch engine data directly.
- Provide one documented command to start web+app server; the engine has its own startup command in its repo. Startup verifies config without launching scans.
- `ENGINE_MODE=fixture|http`, `ENGINE_URL`, and `APP_DATA_DIR` configure the app. Use separate default app data directories for fixture and live modes, recording mode in database metadata and rejecting accidental cross-mode reuse. Keep live data in a git-ignored local directory.
- Fixture mode has a visible "Sample data" label. Seeding is idempotent. Reset is a development-only command constrained to the fixture directory, unavailable against live mode. Nothing in normal live use deletes entities/history.
- Bind all services to loopback, allow only configured local origins/hosts, and protect mutations with origin validation plus a local session token. Escape captured HTML/model output. Keep screenshot proxying limited to engine-issued asset IDs and configured engine origin.
- Document consistent local backups: stop app and engine, then copy app data plus engine database/assets together. Live app restore requires its associated engine evidence. There is no automated deletion/retention policy in v1.

## App HTTP behavior
Use the documented site-scoped routes for resources and dedicated mutation actions. Enforce site ownership in every lookup. Validate writes server-side, return field errors without clearing the form, and return 409 for stale status_revision updates rather than losing newer edits. Mutation request IDs make retries idempotent; reusing an ID with a changed body is an error.

Use read APIs for current projections and frozen scan results separately. Never expose raw database paths. Download feedback from a site-scoped export route; JSON carries schema version, export time, and the records defined in `09`.

## Decision boundaries
- App feedback is exportable input for engine evaluation/training. Actual training/import automation is a later engine task.
- Engine PDF remains an evidence report and does not promise to reflect app dismissals, workflow statuses or notes. The UI explains this beside export.
- Legacy engine audit reviews are separate. No silent import, writeback or precedence rules between the two review systems in v1.
- Existing engine scans can supply fixture exports during development. A general historical-scan import screen is out of scope; live integration creates scans through the service, and a later explicit import feature can be planned separately.
- Keep data gaps honest: null/unknown/unavailable is valid when documented. Never infer check success, a precise element identity or a full-page inventory from absent metadata.

## Remaining implementation prerequisites
There are no unanswered product questions blocking the fixture-backed build. Before live integration the engine must implement and validate the `04` contract, stable identity and mixed-source verification. Fixture enrichment and regression scenarios in `15` are build work, not additional decisions required from Paul.

# 15 Data readiness and fixture plan

Read-only inventory performed 2026-11-09. No scans were run, fixture data regenerated, assets copied, or engine files modified during this documentation update.

## Existing data
[observed] The pack already contains two real source scans, not just one:

| Fixture | Source engine scan | Contents |
|---|---|---|
| scan-baseline.json | e779c8b0-03f2-44fd-87cc-b960bc230785 | 10 pages, 3 provisional templates, 10 groups, 70 errors, including 10 ungrouped |
| scan-verify.json | 69271047-f1b0-4813-9cdb-32ff79817d0c | 10 pages; 15 detected, 18 not_detected, 37 not_checked |

Both fixtures have unique error keys within each finding list. Their referenced screenshots currently exist in the engine data folder. They have not been bundled into the UI pack.

[observed] The source baseline has timings.json but no coverage.json. The verify source has both. The sample generator derives outcomes using global checks_run and provisional keys; this is not an authoritative per-page/per-check identity or coverage contract. The trimmed sample therefore supports UI and scenario testing but cannot prove the new live-engine identity/absence rules.

[observed] The engine database contains 51 scan sessions in total. Later completed Popfly scans with 50 pages, coverage.json and timings.json include:
- dd3aabde-6a88-4f73-b5ff-f4a8b4e826ec
- 08178f58-f881-4a5d-8f38-b7abe1d3876f
- 179118b6-2642-4fba-acd8-544b4d3ce9a9

These are candidates for richer fixture exports. Existence was checked; their content has not been certified as a known fix/reopen sequence. None of these three scan directories contains a PDF at its top level; this does not establish whether reports exist elsewhere.

## What we need from Paul
Nothing further to start implementation. Existing Popfly data is sufficient for real content, screenshots, trace layout and realistic list density. No additional client data or new live scan is required now.

Later, a known before/fix/verify sequence is useful to validate real identity behavior if existing exports cannot supply it. Prefer a controlled local fixture site with known changes. A second site's authorized scan is optional for platform/copy variety; site switching and isolation can first use synthetic data. Do not run a new client scan merely to obtain an edge case that can be modeled locally.

## Fixture work during implementation
1. Preserve original JSON and generator output. Add a documented legacy-to-target adapter plus provenance for every derived field. The app runtime consumes only target contract records through FixtureEngine.
2. Bundle the referenced screenshots under fixture-owned assets with a manifest and content hashes. Use an explicit offline export/preparation step; FixtureEngine never reads the engine database/data directory. Exporting evidence for fixtures is distinct from runtime access.
3. Add real coverage/timing payloads from a later completed Popfly scan. Preserve unavailable metadata on older scans rather than backfilling from unrelated scans.
4. Provide one engine PDF asset for download-path testing, clearly tied to its source scan, or model report_unavailable truthfully until export is prepared. Do not generate a fake evidence report.
5. Preserve raw trace truncation metadata: the current generator trims strings. The UI must not claim that a shortened prompt/response is complete.
6. Add at least one bbox-enabled synthetic capture to test overlay scaling. Label synthetic data; absence of real boxes does not block full-page evidence display.
7. Add a later real full scan for density/coverage testing. Do not derive true fix/reopen labels merely by comparing provisional keys across historic scans.

The original 70-error scenario keeps its documented 15/18/37 result as a labeled fixture scenario. Its absence outcomes are simulated contract outcomes with explicit synthetic coverage provenance, not a claim that missing historical coverage was recovered.

## Required deterministic scenarios
| Scenario | Expected behavior |
|---|---|
| Original 70 declared fixes | 15 has_error, 18 fixed, 37 in_progress; no duplicated observations |
| Verify a subset of those errors | Only requested outcomes plus deliberately included incidental detections; no automatic 70-error update |
| New error and new group/template during verify | All new references included and ingested atomically |
| Third scan re-detects a previously fixed error | Same error row reopened with history retained |
| Dismiss exact element/error then rescan | Same row remains not_an_issue and reviewed; new observation, no duplicate or new/reopened count |
| Different failure on same element; same failure on another element | Distinct errors remain actionable |
| Mixed source scans | One verify job resolves each target's own source and deduplicates execution |
| Full scan with skipped/failed/partial/unrecorded check or failed page | Affected existing errors remain unchanged and get not_checked |
| Page not in attempted full-scan scope | No new observation or status change |
| Status action while job runs | Newer manual action retained; result and warning recorded |
| Repeated delivery / response lost / app restart | Single engine job and single ingest; no duplicate history, feedback or unread reset |
| Engine restart / import failure / report failure | Correct distinct recovery path; no partial status changes |
| Changed evidence and inherited note | Correct review revisions and parent propagation; dismissal remains effective |
| Group removal then repeat ingest and regroup | Rejected associations stay removed; history remains |
| Historical evidence after subsequent captures | Original screenshot/HTML pair selected correctly |
| Empty group/page/template, unknown totals | Honest no_issues and coverage presentation; no vacuous Not an issue |
| Incompatible contract or identity | Import blocked; current errors/decisions untouched |
| Two sites, more than 50 rows, long names, no screenshot/model trace | Isolation, pagination, focus return and unavailable states work |

FixtureEngine respects request options and target selection. Each simulated new scan receives a distinct synthetic job/scan ID and preserves source provenance; retrying an identical request returns the same IDs. It does not mutate original source files or silently use full baseline coverage for a subset verify.

## Live-engine acceptance
Deterministic engine tests must establish stable identity and sufficient coverage on controlled pages before the HTTP switch. A real Popfly service run then validates contract transport, metadata and media delivery; do not assert the historical 70-error totals against a changing live website. No fresh paid/model-assisted/client scan is required by this documentation task.

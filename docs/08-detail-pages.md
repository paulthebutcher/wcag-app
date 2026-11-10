# 08 Detail pages

Every entity page has a header, an action row, and tabs. The Overview tab holds everything that is not a list, plus one summary line per other tab that opens it. Tabs reuse the columns of the matching list, minus the column that would repeat the parent. Tables in tabs paginate at 50.

```
Components & Global   Overview · Errors · Pages · Templates · Notes · History
Templates             Overview · Pages · Components & Global · Errors · Notes · History
Pages                 Overview · Components & Global · Errors · Notes · History
Errors                Overview · Trace · Notes · History
Scans                 Overview · Changes · Coverage
```

## Components & Global
- Header: name, scope, status with counts, criteria, spread, last captured, reviewed.
- Actions: Declare fixed (applies to has_error members), Reviewed, Add note. No group-wide Not an issue action.
- Overview: remediation (plain-language fix, platform steps, effort), example element with selector and HTML, label ranges across members (confidence, triage bucket, severity, source), last scan result. Summaries for each tab.
- Errors tab: member errors. Each row has "Remove from group".
- Pages tab, Templates tab: affected, with roll-up status.
- Severity range lives here, not in the list.

## Templates
- Header: name, status with counts, criteria, pages scanned / total, last captured, reviewed.
- Actions: Reviewed, Add note.
- Pages tab: scanned pages. Unscanned pages show as a count.
- Components & Global tab: groups present on the template's pages, once each.
- Errors tab: all errors on the template's pages, with Page and Components & Global columns.

## Pages
- Header: name, URL with "Open live page ↗", status with counts, criteria, template or "Static", last captured, reviewed.
- Actions: Reviewed, Add note.
- Overview: full-page screenshot with error locations marked (when `bbox` exists), capture info (render health, HTTP status, viewport).
- Components & Global tab: groups present on this page.
- Errors tab: all errors on this page, with a Components & Global column (dash when ungrouped). No Page column.

## Errors
- Header: name, status dropdown, criterion number and short name with level, first seen, last captured, reviewed.
- Actions: status dropdown, Reviewed, Add note, Remove from group (when grouped).
- Overview:
  - Location: page, template, Components & Global (or "Ungrouped").
  - Evidence: element in context (screenshot with highlight when `bbox` exists, else full-page screenshot), selector, HTML, measured values, ARIA attributes, keyboard sequence.
  - Engine labels as pills: confidence (tier, score, basis), triage bucket, severity, source, false-positive risk.
  - Impact: who is affected and how.
  - Remediation.
- Trace tab: engine reasoning, confidence basis, engine version. For model checks: formatted model output, with a "Show raw" toggle for the prompt and raw response, plus model and tokens.
- Notes tab: own notes and inherited notes (marked with source).
- History tab: observations per scan (detected, not detected, not checked with reason, engine version), status changes, reviews, removals.

## Scans
- Header: date, kind, scope, duration, engine version, reviewed, unread state.
- Actions: Export engine PDF, Reviewed. Opening a completed scan marks it read. PDF helper text: "Engine scan evidence; excludes app statuses, notes and reviews." Failed scans show stage/reason and the appropriate retry action.
- Overview: what ran (engine and axe versions, tiers, checks, model layer on or off), timing per phase and model usage. Summaries for Changes and Coverage.
- Changes tab: frozen categories new, fixed, reopened, still detected, not checked, not an issue, no change. Filter by category; counts and precedence are defined in `14`. Outcome and any newer-action warning are visible per row.
- Coverage tab: pages covered, per check ran or skipped with reason, excluded URLs with reasons, sitemap count and page budget. Excluded URLs are external links only (they have no page entity).
- Scans have no History tab and no notes.

## Evidence and unavailable data
Error detail uses the snapshot belonging to the displayed detected observation. A later page image never replaces that evidence. History offers "View evidence" for a selected observation. not_checked without a capture shows its reason and a separately labeled link to prior evidence.

Absent HTTP status, viewport, coverage, timings or model usage displays "Not recorded in this scan". Missing screenshot shows an inline unavailable state beside selector/HTML. Missing model trace says "No model trace recorded". Missing bbox is expected and is not an error. Do not fabricate zero usage or successful coverage.

Scan pages remain available while queued/running/failed. Results and review become available only after ingest completes. Historical scan metadata and Changes stay frozen; links open the current persistent entity.

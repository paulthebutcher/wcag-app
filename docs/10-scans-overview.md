# 10 Scans and Overview

## Scan kinds
| Kind | Scope | What it does |
|---|---|---|
| verify | declared_fixes | Default. Sends every `in_progress` error key with its latest detected source scan/finding reference to the engine's verify. Re-runs only the checks that found them, on their pages |
| full | previous_pages | Re-scans the same pages as the last full scan |
| full | url | First scan of a new site, local-only checks by default, 50 page cap |

Full-site discovery and scans over 50 pages are out of scope for v1.

Known limit to state in the UI near the verify button: verify only re-runs the checks that found the declared errors. Other problems introduced on those pages show on the next full rescan.

## Running state
- Starting a scan transactionally freezes a request and target/status revisions in a queued scans row, then submits it with that row ID as the engine idempotency key.
- The server polls the engine job (every 5 s while any job is active) and updates `state` and `progress`.
- The Scans nav label shows a running indicator while any scan is queued or running. Overview and scan detail show the latest activity and page counts when supplied by the engine.
- One active scan request per site. The engine queues jobs across sites and runs one globally. Show queue position and waiting-for-engine-lock state.
- Import completion, outages, restart and retry behavior follow `14`. A failed job never updates error statuses. A successful job with skipped checks can complete with not_checked outcomes.
- Status actions remain usable while a scan runs; newer manual status actions win over the pending result. Notes and reviews remain usable.

## Read state
- A completed scan is unread (`read_at` null). Its row shows a dot; the Scans nav label shows a dot while any scan is unread.
- Opening a scan page marks it read.
- "Mark all read" on the Scans list.

## Export
Download scan PDF uses `/scans/:id/report.pdf`. Label it as scan evidence excluding app statuses, notes and reviews. Report redesign is later. Export feedback is a separate JSON action in the site overflow menu.

## Fix briefs and receipts

Create a fix brief from the Errors or Components & Global table. A group adds its exact findings in Has error. The brief saves up to 500 unique findings with their source observations and status revisions. Each finding gets a reference scoped to the brief. The Markdown download includes captured evidence and the JSON receipt format.

Paste the receipt back into either table. Preview resolves references only against the matching brief and site, shows exact finding links, and flags unknown references or findings that changed or closed since export. Select the eligible findings to mark In progress. Confirm rechecks all selected rows together and keeps the optional receipt notes in history. Scan declared fixes remains a separate action that verifies all In progress findings for the current site.

## Overview page
In order:
1. Site header: URL, last scan date and time, engine version, pages covered.
2. Declared fixes waiting: "14 errors declared fixed, not yet scanned", with "Scan declared fixes".
3. Last scan result: new, fixed, reopened, not checked. Each count links to that scan's Changes tab filtered by outcome.
4. Status by entity: counts per status for Components & Global, Templates, Pages and Errors. Each count links to the list with that status filter.
5. Start here: top five open Components & Global by the default rank.
6. Coverage gaps: pages excluded and checks skipped in the last scan, linking to the scan's Coverage tab.

No severity or confidence breakdowns. No trend chart.

## Empty states
- No sites: Add site.
- Site with no scans: "Run first scan".
- Scan running for the first time: Overview shows site identity, progress, scope and queue state; result sections appear after import.

## Coverage context
Overview uses the latest completed full scan for site-wide pages/coverage and the latest completed scan of any kind for Last scan result. Label both dates and kinds. A narrow verify scan must not make the site look reduced to its target pages. With no full scan, show the available verify coverage as limited scope.

## Additional states
- No declared fixes: disable verify with "Declare a fix first".
- No prior full scan: hide Rescan previous pages and offer Run first scan.
- Empty filtered list: explain no matches and offer Clear filters.
- Failed first scan: show the reason and retry, keeping the site usable.
- Engine unavailable: keep saved data/actions available and show reconnect status. Do not start duplicate jobs.
- Missing historical evidence: show Not recorded or Unavailable locally on the affected panel.

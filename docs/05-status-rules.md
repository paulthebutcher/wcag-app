# 05 Status rules

## Error statuses
| Value | Display | Set by |
|---|---|---|
| `has_error` | Has error | First detection, continued detection, reopening, or manual undo |
| `in_progress` | In progress | Paul: declare fixed |
| `fixed` | Fixed | A sufficiently covered scan only |
| `not_an_issue` | Not an issue | Paul: persistent dismissal of this exact element/error pair |

## Manual transitions
| From | To | Action |
|---|---|---|
| has_error | in_progress | Declare fixed |
| in_progress | has_error | Undo declaration |
| has_error, in_progress, fixed | not_an_issue | Record decision, false-positive note and human review in one transaction |
| not_an_issue | has_error | Revert decision; preserve prior review, note and decision history |

Not an issue needs no prerequisite clicks. Its form offers optional text and explains that it also records human review. The server creates the typed `false_positive` note, review, decision reference and status event together. Replaying the same action request creates nothing twice.

The decision applies to `(site, identity_version, error_key)`, representing a specific page, element and failure, not an entire component, selector family or criterion. Subsequent detections append observations to the existing Error and leave it Not an issue. Changed evidence, changed grouping and compatible engine-version updates do not revoke it. Only Paul can revert it. New errors on that element, or the same error on different elements/pages, are separate subjects. Identity compatibility is required by `04`; do not hide uncertainty with broad matching.

## Scan transitions
The engine returns an explicit outcome for each comparison target. Absence from a findings list alone never implies a fix.

| Current status | detected | not_detected | not_checked |
|---|---|---|---|
| has_error | has_error | fixed | has_error |
| in_progress | has_error | fixed | in_progress |
| fixed | has_error | fixed | fixed |
| not_an_issue | not_an_issue | not_an_issue | not_an_issue |

New detected subjects start as has_error. `not_detected` is valid only when the relevant check fully ran on a successfully captured page and can establish absence for that subject. Failed, partial, skipped, unrecorded, unsupported or ambiguous comparisons are `not_checked`, with a reason. Pages outside a full scan's attempted scope get no observation. A failed job applies no result transitions.

Freeze requested target IDs and the status revisions of all known site errors at request time, including errors that could be incidentally detected. Use scan_error_revisions for the newer-action guard and scan_targets for requested comparison scope. If Paul changes an error's status after that point, store the result but skip its status transition, mark it `status_application=skipped_newer_action`, and retain the newer action. Notes and reviews alone do not block scan transitions. Not an issue always takes precedence.

Every actual transition writes an event with old/new status, source scan or action ID, and time. Every observation is recorded even when status does not change.

## Status dropdown
- From has error: In progress, Not an issue.
- From in progress: Has error, Not an issue.
- From fixed: Not an issue.
- From not an issue: Has error.
- Fixed is shown disabled with the description "set by scan".
- No group dismissal. Group action is explicitly labeled "Declare fixed" and affects only has_error members.

## Roll-ups
For components, pages and templates, evaluate current member errors:
1. No members: display-only `no_issues` ("No issues detected"). Never call a never-observed empty entity Fixed or Not an issue.
2. Any in_progress: in_progress.
3. Any has_error: has_error.
4. All not_an_issue: not_an_issue.
5. Otherwise: fixed (one or more fixed, possibly with not_an_issue members).

No issues detected describes stored findings only. Coverage appears beside it; unscanned templates say "Not scanned" in their coverage metadata. `no_issues` is a derived list filter, not a fifth editable Error status.

Counts name every status rather than using an unlabeled string of numbers. Pages and templates have no declare-fixed action. Group removals can leave an empty group; preserve it.

## Declared fixes
All current in_progress errors form the waiting list. A verify request freezes that set and each error's latest detected source observation. One job may use multiple source scans. An empty set disables the action with a reason. More than 50 distinct target pages is rejected without truncation.

## Engine version
Keep engine and identity versions with every observation. Compatible engine version changes do not reset decisions. An unsupported identity version blocks ingest until the engine supplies a reviewed migration; v1 does not auto-migrate identities.

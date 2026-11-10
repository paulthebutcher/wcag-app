# 09 Notes and review

Ordinary notes and human review are separate. Adding a note alone never sets the tag. The explicit Not an issue action intentionally creates a false-positive note and review together with its persistent decision.

## Notes
- On errors, Components & Global, pages and templates.
- Append-only. No edit, no delete.
- Type is required. Text is optional. The text field is visible with the hint "Choose a type first" and submit stays disabled until a type is chosen. Do not use the `disabled` attribute on the text field (it removes it from keyboard focus); block submit instead.
- Notes never change engine labels. Notes, explicit decisions and grouping-removal events preserve feedback for later eval/training use.

| Entity | Types |
|---|---|
| Error | False positive, Wrong severity, Wrong criterion, Wrong element, Duplicate, Other |
| Components & Global | Error types + Wrong grouping, Should be split, Should be merged, Wrong remediation |
| Page | Error types + Missed error, Capture problem |
| Template | Error types + Wrong page membership, Missed error |

Stored type values: `false_positive`, `wrong_severity`, `wrong_criterion`, `wrong_element`, `duplicate`, `other`, `wrong_grouping`, `should_split`, `should_merge`, `wrong_remediation`, `missed_error`, `capture_problem`, `wrong_page_membership`.

### Inheritance
A note on a group, page or template shows on each member error's Notes tab, marked "From Components & Global: Navigation contrast" (or page or template). It is stored once. For engine accuracy it counts as one judgment.

### Remove from group
Logged as a `removed_from_group` event. It is a grouping signal for the engine and needs no note.

## Human-reviewed tag
- On errors, components, pages, templates and completed scans. Sites have no review action.
- One click, with an optional note in the same small form.
- Shows date/time and "Changed since review" when content_revision exceeds the revision covered by the latest review. Merely receiving another identical observation does not make a review stale.
- Not cleared when the entity changes.
- Created atomically by Not an issue. No prior reviewed tag or note is required. Repeated detections preserve both the decision and the reviewed classification; Changed since review is informational and never reopens the error.

## Measured precision (tooltip only)
Shown only as a tooltip on the Confidence pill: "Right in 17 of 20 labeled" or "Too few labels" (under 10). Not shown elsewhere in v1. Data comes from the engine's eval labels later; until then the tooltip says "No labels yet".

## Review revisions
Meaningful changes increment content_revision: status, evidence content, labels/analysis/remediation, page capture content/health, membership, or new notes. Compare normalized content excluding scan IDs and timestamps so an identical recapture is not a change. Engine asset content hashes can establish identical images; absent such evidence, a new image is treated as changed.

Propagate relevant child changes to current page/group/template parents and both old/new parents for membership changes. Ordinary reviews, read state and polling progress do not increment revisions. Inherited note additions affect the currently related errors and their parents. A completed scan is immutable, so marking it read never makes its review stale.

Review covers the post-action revision. Not an issue inserts its note and status change first, then records the review covering that resulting revision, all atomically. Use revision counters rather than timestamp equality.

## Feedback for the engine
Export an append-only JSON record set from the site's Export feedback action. Include schema version, stable feedback/action ID, site/error/element identity, source scan/finding/observation IDs, engine/identity versions, typed judgment, optional text, time, and any superseded decision. Include standalone typed notes and group-removal judgments with their own IDs and source references.

This is a training/eval input, not automatic training. Generic Reviewed does not imply a true-positive label. A false-positive note alone does not suppress an error; only the explicit decision does. Group/page/template notes remain one judgment each and are not multiplied by inherited displays. Consumers deduplicate by feedback ID and apply decision reversals in order. Export never changes engine labels or the engine's existing audit reviews.

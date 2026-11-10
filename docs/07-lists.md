# 07 Lists

## Shared
Columns: Name, Status, Criteria, Open errors, Last captured, Reviewed.\
Filters: Status (multi), Criterion (multi, grouped by WCAG principle, shown with names), Reviewed (reviewed, not reviewed, changed since review).\
Pagination: 50 rows. No search.

- Status on roll-ups shows the roll-up plus labeled counts, e.g. "12 has error · 3 in progress · 40 fixed". Empty entities display No issues detected with coverage context.
- Criteria shows one number, or the top two plus "+n". Numbers have a tooltip with the short name.
- Status alone matches the displayed entity roll-up. Criterion alone requires a matching member error. With both filters, require the entity roll-up to match a selected status AND a single member error to match a selected criterion and selected status. Thus "1.4.3 + Has error" means an overall Has error page with a has_error 1.4.3 member. Choose both open statuses to include In progress pages/errors.
- OR within one filter, AND across filters. Counts/roll-ups remain for all members, not just filtered matching children. Errors apply all filters to the same error.
- Reviewed includes all tagged entities, including changed ones. Not reviewed means no review. Changed since review means a tag exists and content_revision is newer.
- Criteria are sorted numerically; show the first two plus +n. Has notes includes own and currently inherited notes.

## Default rank (Components & Global, Templates, Pages)
1. Status group: in progress, has error, fixed, not an issue, no issues detected.
2. Within in progress and has error: open errors, high to low.
3. Within fixed: most recently fixed first.
4. Ties: pages affected descending, name ascending, then immutable ID ascending. Not an issue and no issues detected sort by name/ID. A page has spread 1. Most recently fixed uses the latest member transition to fixed.

Severity and confidence are never used to rank or filter.

## Components & Global
| Column | Notes |
|---|---|
| Name | Engine label, e.g. "Navigation: text contrast #2d2f31" |
| Scope | Component or Global |
| Status | Roll-up with counts |
| Criteria | |
| Open errors | |
| Spread | "48 pages · 3 templates" |
| Last captured | |
| Reviewed | |

Extra filter: Scope.

## Templates
Columns: Name, Status, Criteria, Open errors, Pages scanned / total ("5 of 214"), Last captured, Reviewed.\
Extra filter: Not scanned, sampled, fully scanned, or total unknown. Not scanned means zero captured members. Sampled requires at least one captured member and a known total greater than distinct captured pages; never invent a total from the selected fixture subset.

## Pages
Columns: Name (page title, URL as secondary text), Status, Criteria, Open errors, Last captured, Reviewed.\
No extra filters.

## Errors
| Column | Notes |
|---|---|
| Name | Display name |
| Page | Link |
| Status | Dropdown is on the detail page; list shows the value |
| Criterion | |
| Confidence | Pill, read-only. Tooltip shows measured precision when available |
| Triage bucket | Pill, read-only |
| Severity | Pill, read-only |
| Last captured | |
| Reviewed | |

Extra filters: Grouped or ungrouped, Has notes or no notes.\
Default order: status group, then page URL ascending, numeric criterion ascending, name ascending, immutable ID ascending.

## Scans
Columns: Date, Kind (full or verify), Scope (declared fixes, previous pages, site), Pages covered, New / Fixed / Reopened / Not checked, Engine version, Reviewed, unread dot.\
Filters: Kind, Scope, Outcome (had new, had fixed, had reopened, had not checked), Date range, Reviewed.\
Default order: newest first.\
List action: Mark all read. Primary actions: Scan declared fixes, Rescan previous pages.

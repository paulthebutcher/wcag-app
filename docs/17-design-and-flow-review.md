# Design and workflow review

2026-11-15

## Scope
Paul requested a design pass using the Apple design skill and his supplied palette, plus verification of all existing flows. Changes are in the app repository. Engine code, contracts, production configuration and saved client data are unchanged.

The design source was read at [Apple design, Emil Kowalski](https://www.ui-skills.com/skills/emilkowalski/apple-design). Its relevant principles are applied in `11-ui-conventions.md`. No global skill install or new runtime animation dependency was needed.

## Completed changes
- Charcoal sidebar, mint canvas, cyan actions and coral issue accents, using darker semantic variants for text contrast.
- Relative system typography, consistent table and panel spacing, segmented detail tabs, restrained dialog motion and accessible preference fallbacks.
- Correct section highlighting, distinct mobile site-picker IDs, contextual mobile heading and visible save confirmations.
- Error selectors in lists, page-wide eligible brief selection, selection context across filters/pages, and a three-step receipt dialog.
- Element/full-page evidence switching with matching highlights and recoverable image failures.
- PDF response validation and actionable inline failures.
- Initial connection recovery and protection against delayed responses loading a previous site.

## Verification
[observed] `npm test`: 46 passing contract, store, API, engine-adapter and frontend tests.

[observed] `npm run test:e2e`: 16 passing browser workflows. Tests use a temporary fixture database and deterministic network responses for failure paths. The preview uses a different temporary fixture directory. Neither uses the live app database.

| Flow | Checked |
|---|---|
| Navigation | Overview, five lists, five detail types, every detail tab, active section, list return and pagination |
| Site setup | Duplicate input retained, create site, empty overview, site switching, sample-mode scan restriction |
| Filters and selection | Status, empty results, clear filters, Escape focus return, select visible eligible rows across pages |
| Finding decisions | In progress, verification to Fixed, Not an issue with review/feedback, reload persistence and retained evidence |
| Group work | Declare member fixes, inherited notes, remove membership, retained history and feedback export |
| Notes and reviews | Required type, save confirmation, note display, review tag, inherited context |
| Fix briefs | Real Markdown download with exact finding references |
| Receipt review | Invalid JSON, fenced JSON, unknown references, deselection, no status change before confirmation, stale findings rejected |
| Scans | Full rescan, declared-fix verification, frozen Changes, Coverage, mark read |
| Evidence | Matching crop and overlay, full-page toggle, historical capture pairing, failed load and retry |
| PDF export | Service failure, non-PDF response rejection, PDF transport/download with a minimal test-only response |
| Connection recovery | First site-list request fails, Reconnect restores the workspace |
| Accessibility | axe on screens and tabs, mobile navigation and receipt dialog, keyboard skip link, dialog focus return, reduced motion |
| Reflow | All 12 screen types at 320 CSS px and 200% root text size; tables retain local scrolling |

[observed] Production build, TypeScript and formatting checks pass. Desktop overview, component table, finding detail, receipt dialog and mobile navigation were also inspected in the local browser.

## Boundaries
These results establish the tested app behavior with recorded fixture data. No new production client scan, model request, live engine PDF generation, Railway deployment or database migration was run for this pass. The engine's existing service integration remains covered by the app's adapter tests. VoiceOver testing and a fresh live-engine scan are outside this recorded validation, so this is not a claim of full accessibility conformance or production end-to-end verification.

The screenshot in `screenshots/apple-design-overview.png` is from the isolated sample workspace. Existing screenshots remain available.

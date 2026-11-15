# 11 UI conventions and visual direction

## Direction
Updated 2026-11-15. Paul requested the [Apple design skill](https://www.ui-skills.com/skills/emilkowalski/apple-design) and supplied a charcoal, cyan, mint and coral palette. Keep the existing light-mode internal workbench and Radix/shadcn-style components. No Figma dependency.

Apply the skill through restrained hierarchy, system typography, immediate press feedback, consistent dialog motion and functional translucency. This app has no gesture-driven surfaces requiring springs. Keep menus, tables and native form controls familiar. Avoid motion on route changes or data refreshes.

## Visual tokens
| Role | Value |
|---|---|
| Canvas / supplied mint | #F7FFF7 |
| Sidebar and main text / supplied charcoal | #292F36 |
| Primary action and selected navigation / supplied cyan | #4ECDC4, with charcoal text |
| Issue accent / supplied coral | #FF6B6B |
| Panels | #FFFFFF |
| Secondary text | #58645E |
| Decorative separators | #DCE5DF |
| Essential control boundaries | #7B8982 |
| Links and light-surface focus ring | #176B65 |
| Sidebar focus ring | #4ECDC4 |
| Has error | #A23232 on #FFF0EE, coral dot |
| In progress | #176B65 on #E6F7F3 |
| Fixed | #29624D on #EAF6EE |
| Not an issue / no issues detected | Neutral text/background with explicit words |

Bright cyan and coral are accents. Darker related tones provide legible text and control edges on light surfaces. Keep text labels on every workflow status. Engine confidence, triage and severity remain neutral read-only pills.

- Use the platform system sans-serif with relative text sizing. Metadata starts at 12px, table text at 13px, controls at 13px, and large headings at 32px. Headings use tighter tracking. Counts and dates use tabular numerals.
- Main gutters are 24-36px. Controls use 8-10px radii, panels 16px, and dialogs 20px. Shadows are subtle on panels and stronger on overlays.
- Use the charcoal sidebar for orientation, a mint canvas, and white content surfaces. Cyan identifies the selected section and primary actions. Group overview metrics into one surface.
- Top-level lists begin with their controls. The sidebar names the current section; no duplicate visible page headings or breadcrumbs above tables. Preserve semantic hidden h1 headings. Narrow screens show the current section beside the navigation button.
- Keep genuine tables, explicit entity links and local horizontal scrolling. Show recorded element selectors beneath error names and observed classes or selectors beneath component names.
- Give press feedback immediately. Dialog entry and exit follow the same short path. Do not delay input for animations. Respect reduced motion, reduced transparency and increased contrast.

## Components and interaction
Use shadcn Sidebar/Sheet, Button, Table, Tabs, Select or Native Select, Popover/Checkbox filters, Dialog, Tooltip, Skeleton and Alert patterns as needed. Use real tables and links. Component choice does not replace keyboard and screen-reader verification.

Loading keeps the page structure stable with skeletons. Action errors appear beside the action and preserve inputs. Status changes show a dismissible confirmation and announce a concise polite live message. Notifications clear after six seconds. Dialogs have a heading, focus management and return focus. Do not announce every polling tick. Respect reduced motion; use brief transitions only.

## Wording
| Avoid | Use |
|---|---|
| Passed, passes | No issues detected |
| Compliant, conformant, certified | No equivalent claim |
| Fixed as a conformance claim | Tooltip: "No longer detected by the last sufficiently covered check" |
| Fix groups | Components & Global |

Keep labels literal, including Not an issue. Read-only engine labels never masquerade as editable workflow status.

## Dates, criteria and tooltips
- Store UTC; display in the browser machine's local timezone, using uppercase month text: `JAN 04 2027 - 12:34:56 MST`. Resolve daylight saving at the timestamp; if no abbreviation is available use the UTC offset.
- Use `<time datetime="2027-01-04T19:34:56Z">JAN 04 2027 - 12:34:56 MST</time>`. Never uppercase only through CSS.
- Criteria in lists use number plus a focus/hover tooltip with short name. Detail and filters show short names, and error details show level.
- Tooltips open on keyboard focus and hover and dismiss with Escape. They cannot be the only way to obtain essential action instructions.

## Reflow and accessibility
Target WCAG 2.1 AA. Design at 1280px and wider, but allow the shell, forms, headings, text and controls to reflow down to 320 CSS px. Collapse the sidebar to a labeled Sheet trigger; stack action rows and evidence columns. No narrow-screen warning or loss of functionality.

Tables may scroll in individually labeled keyboard-accessible containers; cell text wraps. Necessary screenshot/code surfaces may have local scrolling with accessible controls. Do not impose a 1280px page-wide minimum. [W3C reflow guidance](https://www.w3.org/WAI/WCAG21/Understanding/reflow.html) explains the 320 CSS px requirement and scoped two-dimensional exceptions.

Acceptance: keyboard-only operation, visible unobscured focus, logical order, 200% text zoom, 400% browser zoom from a 1280px viewport (320 CSS px equivalent), labeled table headers/captions, focus return, screen-reader checks for forms/dialogs/scan updates, and contrast in actual rendered states. Run axe on each new screen; run the engine during the accessibility/dogfood phase once the app is runnable. Automated checks complement manual checks.

## Evidence
Selector/HTML remains readable primary evidence; render captured HTML as text. One immutable compressed image per page per scan. Draw bbox overlays only on the matching capture with known scale; otherwise show the full image. Do not ship images from engine filesystem paths in the UI runtime.

## Workflow refinements
- Filters close on Escape or an outside pointer action. Escape returns focus to the filter trigger.
- Brief selection supports selecting eligible rows on the visible page. The count explicitly includes selections on other pages and behind filters.
- Receipts show Paste receipt, Review findings and Verify changes as distinct steps. Preview never changes findings. Confirmation still rechecks eligibility on the server.
- Matching boxed evidence offers Element and Full page views. Missing coordinates continue to show full-page evidence. Failed image loads show an explanation and retry.
- PDF downloads validate both the response type and PDF signature. Engine errors stay in the app and leave the scan available for review.
- Reconnect reloads the site index as well as current evidence. Delayed requests for a previous site cannot replace the currently selected workspace.

Verification details are recorded in `17-design-and-flow-review.md`.

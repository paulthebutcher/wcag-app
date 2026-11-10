# 11 UI conventions and visual direction

## Direction
Paul selected a modern light-mode shadcn UI for a useful internal client-work tool that is polished enough to show in interviews. No Figma dependency and no separate demo design.

Use shadcn/ui components with Tailwind and semantic CSS variables. Start from its neutral light palette, then apply the project tokens below. Pin compatible package versions when scaffolding; no dependency install is part of this documentation update. [Official shadcn theming reference](https://ui.shadcn.com/docs/theming).

## Visual tokens (selected starting values)
| Role | Value |
|---|---|
| Canvas | #F8FAFC |
| Surfaces / popovers | #FFFFFF |
| Main text | #0F172A |
| Secondary text | #475569 |
| Decorative separators | #E2E8F0 |
| Essential input boundaries | #64748B |
| Primary action / selected accent | #1D4ED8 with white text |
| Focus ring | #2563EB, visible offset from the surface |
| Has error | #991B1B text on #FEF2F2 |
| In progress | #92400E text on #FFFBEB |
| Fixed | #166534 text on #F0FDF4 |
| Not an issue / no issues detected | Neutral text/background; distinguish with explicit words |

These are design inputs, not a claim that every combination passes contrast. Verify actual text, controls, focus and hover states during the build. Decorative borders must not be the only identifying boundary for controls.

- System sans-serif font stack, 14px table/control text, 16px prose, 24-28px page headings. Code uses a system monospace stack. No remote font dependency.
- 4px spacing scale; 24-32px page gutters, 16-24px section gaps. 8px control radius, 12px panel radius. Restrained shadows for overlays only.
- Sidebar about 240px on wide screens. Main content uses available width; keep prose around 75 characters per line. Repeated list headers and action positions stay consistent.
- Calm white tables, clear header contrast, subtle row hover and compact labeled status counts. Do not wrap every number in a card or use decorative gradients.
- Use a consistent outline icon family. Icon-only actions need an accessible name and tooltip. Primary action is visually distinct; secondary actions do not compete with it.
- Engine labels remain neutral read-only pills. Reserve semantic color for workflow statuses and actual feedback messages.

## Components and interaction
Use shadcn Sidebar/Sheet, Button, Table, Tabs, Select or Native Select, Popover/Checkbox filters, Dialog, Tooltip, Skeleton and Alert patterns as needed. Use real tables and links. Component choice does not replace keyboard and screen-reader verification.

Loading keeps the page structure stable with skeletons. Action errors appear beside the action and preserve inputs. Status changes announce a concise polite live message. Dialogs have a heading, focus management and return focus. Do not announce every polling tick. Respect reduced motion; use brief transitions only.

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

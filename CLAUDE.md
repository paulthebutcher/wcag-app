# Build rules

## Context
- Read `README.md` and the files in `docs/` before writing code. They are the spec.
- Visual design uses shadcn/ui in light mode, with the modern workbench direction in `docs/11-ui-conventions.md`. No Figma files or design approval are prerequisites.
- The engine is a separate repo at `~/Developer/WCAG Scanner`. Do not modify it from this repo. Engine changes are listed in `docs/13-engine-work.md` for a separate thread.

## Stack (selected for v1)
- npm workspaces: `apps/web`, `apps/server`, `packages/contract`.
- `apps/web`: Vite, React, TypeScript, React Router, Tailwind CSS and shadcn/ui. URL is the source of truth for list state.
- `apps/server`: Node, Fastify, better-sqlite3, zod. Owns the app database and talks to the engine.
- `packages/contract`: zod schemas and TypeScript types for the engine contract (target in `docs/04-engine-contract.md`; `contract/types.ts` is legacy input, not the complete target).
- Tests: Vitest for logic, Playwright for end to end, axe-core on every screen.

## Hard rules
1. The app never reads the engine's SQLite database or data folder directly. It goes through the engine contract (`EngineClient`).
2. Build against `FixtureEngine` first (reads `contract/fixtures/`). `HttpEngine` comes when the engine service exists.
3. Engine labels (confidence, triage bucket, severity, source) are stored as received and never edited. They are never used to filter or rank.
4. Only a scan can set an error to `fixed`. See `docs/05-status-rules.md`.
5. Nothing is deleted: errors, pages, templates, groups, scans, notes, reviews and history persist.
6. Entity names in lists and references link to their pages. Rows are not clickable. Explicit actions, navigation, linked counts and external URLs are allowed; current-page headings need not self-link.
7. UI copy never says "compliant", "conformant", "passes" or "certified". Use "no issues detected" and "no longer detected".
8. The app must itself meet WCAG 2.1 AA. Keyboard, focus, 200% text zoom and reflow at 320 CSS px are acceptance criteria. Tables may scroll within their own containers.
9. Dates display as `JAN 04 2027 - 12:34:56 MST` inside a `<time datetime="...">` element. Month is uppercase in the text itself, not via CSS.
10. Bind to 127.0.0.1 only. No auth yet, so nothing may be exposed beyond localhost.
11. Not an issue is a persistent per-site, per-element, per-error decision. The action records review and false-positive feedback atomically. Scans append evidence but never reopen or duplicate that same error.
12. Implementation is authorized by Paul following the documentation pass. Build within this app repository; engine implementation remains a separate task.

## Writing style for UI copy and docs
Plain, short, declarative. No em dashes.

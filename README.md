# WCAG UI: build pack

Planning pack for the WCAG Engine internal client-work app. Written and revised 2026-11-09. Documentation only; nothing here is built yet.

The app is a local internal web app for Paul to do client accessibility work: run scans, work through errors, declare fixes and verify them, and leave feedback for engine improvement. It should also be polished enough to show in interviews; there is no separate demo product or public deployment. It talks to the WCAG Engine, which lives in its own repo (`~/Developer/WCAG Scanner`) and will run as its own service.

## Read in this order

| File | What it settles |
|---|---|
| `CLAUDE.md` | Rules for whoever builds this (agent or human) |
| `docs/01-product.md` | User, scope, out of scope, requirements |
| `docs/02-architecture.md` | Engine service vs. app, who owns what |
| `docs/03-data-model.md` | App entities and SQLite schema |
| `docs/04-engine-contract.md` | API between app and engine, `error_key` |
| `docs/05-status-rules.md` | Status machine, roll-ups, verify semantics |
| `docs/06-navigation.md` | Routes, link rule, back, previous / next |
| `docs/07-lists.md` | Columns, filters, sort, pagination per list |
| `docs/08-detail-pages.md` | Tabs and contents per entity |
| `docs/09-notes-review.md` | Notes, note types, human-reviewed tag |
| `docs/10-scans-overview.md` | Scan types, indicator, read state, Overview |
| `docs/11-ui-conventions.md` | Dates, wording, labels vs. status, accessibility |
| `docs/12-build-plan.md` | Phases with acceptance criteria |
| `docs/13-engine-work.md` | What the engine repo must add (separate thread) |
| `docs/14-build-decisions.md` | Resolved behavior, job recovery, feedback, and implementation defaults |
| `docs/15-data-readiness.md` | Available scans, missing fixture assets, and the scenario matrix |
| `contract/` | Legacy sample types and real Popfly fixtures; see the migration note |

## Status of decisions

Paul confirmed the internal-tool scope, light-mode shadcn direction, and persistent Not an issue behavior on 2026-11-09. Remaining implementation decisions were delegated to the agent and are documented in `docs/14-build-decisions.md`. They are selected defaults, not claims of individual approval by Paul.

No Figma prerequisite. `docs/11-ui-conventions.md` defines the visual direction. The documented target contract is `0.2.0`; existing `contract/types.ts` and JSON fixtures remain legacy `0.1` inputs until the build phase adapts them. Read the documents as the target specification; do not implement directly from the old types alone.

The case study decision log lives in Notion: paulb.pro > "WCAG Engine UI: case study decision log".

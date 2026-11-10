# WCAG Workspace

Accessibility workbench built with React, Fastify and SQLite. It records sites and tracks findings, fixes and verification results. The WCAG Engine lives in a separate repository. Connect the app to the engine to run scans and verify fixes.

## Run locally

Requires Node.js 22 or newer (developed and tested on Node 24).

```sh
npm ci
npm run dev
```

Open [the local workspace](http://127.0.0.1:5173). The web and API bind to loopback. The workspace starts empty and saves sites in `.data/workspace/app.db`. For local development with recorded Popfly evidence, run `ENGINE_MODE=fixture npm run dev`. That mode uses a separate database in `.data/fixture`.

```sh
npm test             # contract, fixture engine, persistence and API tests
npm run build        # TypeScript checks and production web build
npx playwright install chromium
npm run test:e2e     # isolated browser workflow and accessibility tests
```

Use `PORT` to change the API port, `WEB_PORT` for Vite, `API_URL` for Vite's API proxy, and `WEB_ORIGIN` to trust a changed web origin. `APP_DATA_DIR` overrides the database directory. Configuration is read from process environment; `.env.example` documents it and is not automatically loaded.

## Deploy to Railway

In the `production` environment, connect one service to the repository root on `main`. The root Dockerfile builds the web UI and serves it from Fastify. Railway provides `PORT` and the generated domain. For a custom domain, set `WEB_ORIGIN` to its HTTPS origin. The repository sets the healthcheck to `/api/health`.

Production starts with an empty workspace. To persist changes across deploys, mount a volume at `/data` and set `APP_DATA_DIR=/data/workspace` and `RAILWAY_RUN_UID=0`. Keep the existing data directory when enabling scans. Attaching a new volume to a service that used ephemeral storage starts a fresh workspace.

### Connect live scanning

In the same Railway project and `production` environment, add a private service named `engine` from the scanner repository's `main` branch. Use its root Dockerfile, mount a volume at `/data`, and set `PORT=4311`, `WCAG_DATA_DIR=/data`, `WCAG_CONTACT_URL` to the operator's public contact page, and `WCAG_ENGINE_TOKEN` to a generated secret of at least 32 characters. Check that the engine is healthy at `/health` before enabling it in the app.

| App variable | Value |
|---|---|
| `ENGINE_MODE` | `http` |
| `ENGINE_URL` | `http://${{engine.RAILWAY_PRIVATE_DOMAIN}}:4311` |
| `ENGINE_TOKEN` | `${{engine.WCAG_ENGINE_TOKEN}}` |
| `APP_OPERATOR_AUTH` | `username:password` with a password of at least 16 characters |

The app requires operator sign-in for the workspace and evidence when live scanning is enabled. Railway's healthcheck stays available. After signing in, add the site's canonical HTTPS URL and choose **Run first scan**.

Version control: [paulthebutcher/wcag-app](https://github.com/paulthebutcher/wcag-app). Changes are committed incrementally; GitHub Actions runs checks and browser tests.

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
| `docs/16-build-status.md` | Implemented behavior, verification and remaining roadmap work |
| `contract/` | Legacy sample types and real Popfly fixtures; see the migration note |

## Status of decisions

Paul confirmed the internal-tool scope, light-mode shadcn direction, and persistent Not an issue behavior on 2026-11-09. Remaining implementation decisions were delegated to the agent and are documented in `docs/14-build-decisions.md`. They are selected defaults, not claims of individual approval by Paul.

No Figma prerequisite. `docs/11-ui-conventions.md` defines the visual direction. The documented target contract is `0.2.0`; existing `contract/types.ts` and JSON fixtures remain legacy `0.1` inputs until the build phase adapts them. Read the documents as the target specification; do not implement directly from the old types alone.

The case study decision log lives in Notion: paulb.pro > "WCAG Engine UI: case study decision log".

# 02 Architecture

```
┌──────────────────────────── App (this repo) ────────────────────────────┐
│  apps/web (React)  ──HTTP──>  apps/server (Fastify + SQLite app.db)       │
│                                   │                                       │
│                                   │ EngineClient (FixtureEngine | Http)   │
└───────────────────────────────────┼───────────────────────────────────────┘
                                    │ HTTP, contract in docs/04
┌───────────────────────────────────┴──── Engine (WCAG Scanner repo) ───────┐
│  engine service: job runner + read API                                     │
│  existing engine: crawl, checks, evidence, clustering, verify, PDF report  │
│  wcag.db + data folder (screenshots, DOM)                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

## Ownership

| Owned by the engine (evidence, immutable) | Owned by the app (tracking, changes per action) |
|---|---|
| Scans, page snapshots, findings | Sites |
| Traces (reasoning, model input and output) | Persistent errors and their observations |
| Screenshots, DOM | Status and status history |
| Confidence, severity, triage bucket, remediation | Declared fixes (status in progress) |
| Grouping (component_key, scope) | Group removals |
| Error, element, page, component and template identity keys | Notes, reviews, scan read state |
| Coverage, exclusions, timings | Roll-up status and counts |
| PDF report | Pagination, filters, URLs |

Why: the engine's design rule is that evidence is never edited. Status and notes change on every click and belong to the product, not the evidence. Keeping them out of the engine also keeps the engine reusable for the eval harness and for sale on its own.

## The one shared responsibility: identity
The engine decides which finding is the same error across scans and returns it as `error_key`. The app maps `error_key` to its persistent Error and applies status rules. The app never computes identity itself, because identity depends on selectors and hashes that change with the engine.

## Runtime
- Both services run on the Mac mini, bound to 127.0.0.1.
- Scans are long jobs (minutes to hours, single process, not resumable). The app starts jobs and polls their status.
- Screenshots and PDFs are served by engine endpoints and proxied by the app server. It never reads engine files. Fixture mode serves only bundled fixture assets.
- The engine executes one scan globally at a time and persists a FIFO queue across sites. The app permits one active request per site. The service shares the existing engine gate lock with CLI/eval work.
- Local-only checks are the default. Model-assisted scans are an explicit per-site setting; local app hosting does not imply local model processing. See `14`.

## EngineClient
`apps/server` defines one interface with two implementations:
- `FixtureEngine`: reads `contract/fixtures/`, simulates job progress with timers. Used for all early phases and tests.
- `HttpEngine`: calls the engine service once it exists.

Swapping is a config change (`ENGINE_MODE=fixture|http`, `ENGINE_URL`).

## Contract versioning
The target is `0.2.0`, with one JSON envelope and version headers for binary responses. While the contract is pre-1.0, major and minor must match; patch differences are accepted. Schema validation remains mandatory. Identity has its own version. Mismatches stop ingest and appear on Scans without changing tracked errors. See `04` and `14`.

## Source of truth
App reviews, notes and suppression decisions belong to app.db. Existing engine audit/CLI reviews are not automatically imported, merged or overwritten. Engine PDF reports remain engine evidence reports and do not include app workflow decisions. Label the export accordingly. App feedback can be exported for later eval/training ingestion; no automatic model training or engine review synchronization is promised in v1.

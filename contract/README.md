# Contract and legacy fixtures

## Target versus current files
The target contract is `0.2.0` in `../docs/04-engine-contract.md`. It is specified, not implemented. This documentation update deliberately leaves types.ts, JSON fixtures and the generator unchanged.

- types.ts: legacy 0.1 response/fixture shapes. Use only as input to the Phase 0 adapter; not the complete target API.
- fixtures/popfly-sample/scan-baseline.json: trimmed real Popfly scan e779c8b0, 10 pages, 3 provisional templates, 4 static pages, 10 groups, 70 findings including 10 ungrouped and 10 model findings.
- fixtures/popfly-sample/scan-verify.json: trimmed verify source 69271047, with 15 detected, 18 not_detected, 37 not_checked scenario outcomes.

Keys and template membership were computed using provisional rules in tools/make_sample_fixture.py. Verify outcomes were derived using those keys and checks_run. They do not validate production identity or per-page coverage. Original timestamps and source IDs remain provenance; new simulated jobs get distinct synthetic IDs with source references.

## Assets and data boundaries
Screenshot URLs currently reference assets in the engine data folder. Before building evidence screens, prepare a fixture-owned asset bundle and manifest through an explicit export step. FixtureEngine serves only those bundled assets. It never reads engine data folders or the engine database at runtime.

The existing generator is an offline preparation tool that reads the engine database read-only. It is not part of the app runtime and must not become the app's identity implementation. Replacing it with an authoritative engine exporter is planned separately.

See ../docs/15-data-readiness.md for missing coverage/timing/PDF metadata, available later scans and required scenarios. Missing historical coverage remains unknown. Synthetic scenario outcomes must be marked as synthetic, not historical proof.

## Original regeneration command (legacy format only)
```
ENGINE_DATA_DIR="/Users/paulbutcher/Developer/WCAG Scanner/wcag-data" python3 tools/make_sample_fixture.py
```
Running this does not produce the target 0.2 contract or bundle its media. Do not run it as part of the documentation update.

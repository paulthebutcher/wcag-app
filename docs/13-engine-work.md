# 13 Engine work (separate thread, engine repo)

Target specification only. No engine implementation is authorized by this documentation update. `04` defines the service contract; `14` defines lifecycle behavior.

## Required before live integration
1. **Service and durable jobs.** Implement 0.2 envelopes/endpoints, idempotent request IDs and recovery lookup, durable FIFO queue, loopback binding, one worker, shared CLI/eval gate lock, interruption handling and structured errors. Completed results remain immutable.
2. **Stable subject identity.** Own page/element/error/group/template keys and identity_version. Maintain the subject registry and implement the change/ambiguity tests in `04`. Group signatures alone are insufficient for per-element error identity. Normalize folded findings only where exact occurrences are known.
3. **Mixed-source verification.** Accept a source scan/finding per target. Deduplicate page/check execution. Return exact per-key outcomes and all newly referenced records. Existing CLI baseline workflow can remain a wrapper.
4. **Coverage-qualified full comparisons.** Full scans also accept existing error references and return explicit outcomes for attempted pages. Failed, partial, skipped or unknown checks never imply fixed. No outcome for unattempted pages.
5. **Complete read model.** Supply immutable page snapshots, capture metadata, finding display names/check IDs, coverage, discovery limits, resolved detection options, timings/model usage with unknown values explicit, and paginated references. Media endpoints use opaque asset IDs and contract version headers.
6. **Fixture export.** Export contract-shaped scan records and allowed assets, including source provenance. Preserve unknown historical fields. This replaces the provisional generator as the source of authoritative fixtures.
7. **Client-work settings.** Honor local-only versus model-assisted explicitly, preserve request options, enforce the 50-page UI cap, and report missing contact/configuration clearly. API defaults must not silently enable model calls.

These replace the earlier three-item handoff. A reachable HTTP wrapper alone is insufficient for Phase 9.

## Follow-up enhancements, not blockers
- Element bounding boxes and capture scale for screenshot overlays. Full-page evidence is acceptable without them.
- Smaller immutable screenshots. Compress at capture/export while retaining source dimensions and provenance; do not overwrite historic evidence.
- Template detection beyond CMS collections. Unknown/static pages remain usable.
- Better component labels. Provide a readable fallback now; advanced naming can follow.
- Feedback import into eval/training. App exports exact-source judgments and reversals; engine pipeline integration is a separate future task. Do not claim model training has occurred merely because feedback was saved.

## Existing limitations
- Do not use criterion_results.evidence_summary as authoritative UI copy where it contradicts its status.
- Some model reasoning is boilerplate; preserve formatted model output and raw source when available.
- Existing engine audit/CLI reviews remain separate from app-owned decisions. Engine PDFs do not include app annotations/statuses in v1.
- Engine version changes must not silently reset identity or dismissals. Compatible versions preserve identity; incompatible namespaces block app ingest until an explicit migration exists.

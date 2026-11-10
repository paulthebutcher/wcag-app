import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  adaptLegacy,
  CONTRACT_VERSION,
  FIXTURE_IDENTITY_VERSION,
  JobRequestSchema,
  validateBundle,
  type JobRequest,
  type ScanBundle,
  type TargetRef,
  type ComparisonOutcome,
} from '../../../packages/contract/src/index.js';

export interface Job {
  job_id: string;
  request_id: string;
  state: 'queued' | 'running' | 'completed' | 'failed';
  queue_position: number;
  progress: { phase: string; pages_done: number; pages_total: number };
  scan_id: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
}
export interface EngineClient {
  submit(request: JobRequest): Job;
  getJob(jobId: string): Job;
  getJobByRequest(requestId: string): Job | null;
  getResult(scanId: string): ScanBundle;
}
export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 422,
  ) {
    super(message);
  }
}

export function loadFixtures(root: string): { baseline: ScanBundle; verify: ScanBundle } {
  const directory = join(root, 'contract/fixtures/popfly-sample');
  const baselineRaw: unknown = JSON.parse(
    readFileSync(join(directory, 'scan-baseline.json'), 'utf8'),
  );
  const verifyRaw: unknown = JSON.parse(readFileSync(join(directory, 'scan-verify.json'), 'utf8'));
  const bundles = {
    baseline: adaptLegacy(baselineRaw),
    verify: adaptLegacy(baselineRaw, verifyRaw),
  };
  const manifestPath = join(directory, 'assets/manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      { asset_id: string; width?: number; height?: number; sha256?: string }
    >;
    for (const b of Object.values(bundles))
      for (const p of b.pages) {
        const asset = Object.values(manifest).find((a) => a.asset_id === p.screenshot_asset_id);
        if (asset?.width && asset.height)
          p.screenshot_dimensions = { width: asset.width, height: asset.height };
        p.screenshot_hash = asset?.sha256 ?? null;
      }
  }
  return bundles;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function hash(request: JobRequest): string {
  return createHash('sha256').update(canonical(request)).digest('hex');
}
interface JobRecord {
  request: JobRequest;
  hash: string;
  id: string;
  scanId: string;
  queued: number;
  start: number;
  end: number;
  result: ScanBundle;
}

/** Deterministic sample jobs. Never accesses live engine storage or scans a network URL. */
export class FixtureEngine implements EngineClient {
  readonly baseline: ScanBundle;
  readonly verify: ScanBundle;
  private records: JobRecord[] = [];
  private readonly now: () => number;
  private readonly duration: number;
  private readonly persistPath?: string;
  constructor(options: {
    root: string;
    durationMs?: number;
    now?: () => number;
    persistPath?: string;
  }) {
    const fixtures = loadFixtures(options.root);
    this.baseline = fixtures.baseline;
    this.verify = fixtures.verify;
    this.now = options.now ?? Date.now;
    this.duration = options.durationMs ?? 2000;
    this.persistPath = options.persistPath;
    if (this.persistPath && existsSync(this.persistPath)) {
      const stored = JSON.parse(readFileSync(this.persistPath, 'utf8')) as {
        mode: string;
        records: JobRecord[];
      };
      if (stored.mode !== 'fixture') throw new Error('Refusing non-fixture job state');
      this.records = stored.records.map((r) => ({
        ...r,
        request: JobRequestSchema.parse(r.request),
        result: validateBundle(r.result, { expectedIdentityVersion: FIXTURE_IDENTITY_VERSION }),
      }));
    }
  }
  get health() {
    return {
      contract_version: CONTRACT_VERSION,
      engine_version: 'fixture-0.2.0',
      identity_version: FIXTURE_IDENTITY_VERSION,
      capabilities: ['fixture', 'target_verify', 'comparison_outcomes'],
    };
  }
  private persist() {
    if (!this.persistPath) return;
    mkdirSync(dirname(this.persistPath), { recursive: true });
    writeFileSync(
      `${this.persistPath}.tmp`,
      JSON.stringify({ mode: 'fixture', records: this.records }),
    );
    renameSync(`${this.persistPath}.tmp`, this.persistPath);
  }
  submit(input: JobRequest): Job {
    const request = JobRequestSchema.parse(input);
    const digest = hash(request);
    const existing = this.records.find((r) => r.request.request_id === request.request_id);
    if (existing) {
      if (existing.hash !== digest)
        throw new EngineError(
          'request_conflict',
          'This request ID was used with different scan options.',
          409,
        );
      return this.getJob(existing.id);
    }
    if (request.expected_identity_version !== FIXTURE_IDENTITY_VERSION)
      throw new EngineError(
        'identity_mismatch',
        'Fixture identity is incompatible with this site.',
        409,
      );
    if (new URL(request.site_url).origin !== new URL(this.baseline.scan.site_url).origin)
      throw new EngineError(
        'fixture_site_unavailable',
        'Sample mode only contains Popfly. No live scan was started.',
      );
    if (this.records.some((r) => r.request.site_id === request.site_id && r.end > this.now()))
      throw new EngineError('site_busy', 'This site already has an active scan.', 409);
    const refs = request.kind === 'verify' ? request.targets : request.comparison_refs;
    if (new Set(refs.map((r) => r.error_key)).size !== refs.length)
      throw new EngineError('duplicate_target', 'Each error may be requested once.');
    const targetSources = refs.map((ref) => this.source(ref));
    if (new Set(targetSources.map((f) => f.page_key)).size > request.options.max_pages)
      throw new EngineError('page_limit', 'The target pages exceed the scan page limit.');
    if (
      request.kind === 'full' &&
      request.pages &&
      request.pages.some((url) => !this.baseline.pages.some((p) => p.url === url))
    )
      throw new EngineError(
        'fixture_page_unavailable',
        'Sample mode does not contain every requested page.',
      );
    const now = this.now();
    const start = Math.max(now + 100, ...this.records.map((r) => r.end));
    const end = start + this.duration;
    const id = `fixture-job-${randomUUID()}`;
    const scanId = `fixture-scan-${randomUUID()}`;
    const result = this.buildResult(request, scanId, start, end);
    this.records.push({ request, hash: digest, id, scanId, queued: now, start, end, result });
    this.persist();
    return this.getJob(id);
  }
  getJobByRequest(requestId: string): Job | null {
    const r = this.records.find((r) => r.request.request_id === requestId);
    return r ? this.getJob(r.id) : null;
  }
  getJob(jobId: string): Job {
    const r = this.records.find((r) => r.id === jobId);
    if (!r) throw new EngineError('job_not_found', 'Scan job was not found.', 404);
    const now = this.now();
    const state = now < r.start ? 'queued' : now < r.end ? 'running' : 'completed';
    const total = r.result.pages.length;
    return {
      job_id: r.id,
      request_id: r.request.request_id,
      state,
      queue_position:
        state === 'queued'
          ? this.records.filter((p) => p.end > now && p.start < r.start).length + 1
          : 0,
      progress: {
        phase:
          state === 'queued'
            ? 'Waiting for sample worker'
            : state === 'running'
              ? 'Replaying sample observations'
              : 'Completed',
        pages_done:
          state === 'completed'
            ? total
            : state === 'queued'
              ? 0
              : Math.min(total, Math.floor((total * (now - r.start)) / this.duration)),
        pages_total: total,
      },
      scan_id: state === 'completed' ? r.scanId : null,
      error: null,
      requested_at: new Date(r.queued).toISOString(),
      started_at: state === 'queued' ? null : new Date(r.start).toISOString(),
      completed_at: state === 'completed' ? new Date(r.end).toISOString() : null,
    };
  }
  getResult(scanId: string): ScanBundle {
    if (scanId === this.baseline.scan.scan_id) return structuredClone(this.baseline);
    if (scanId === this.verify.scan.scan_id) return structuredClone(this.verify);
    const r = this.records.find((r) => r.scanId === scanId);
    if (!r) throw new EngineError('scan_not_found', 'Scan result was not found.', 404);
    if (this.now() < r.end)
      throw new EngineError('scan_incomplete', 'Scan results are not yet available.', 409);
    return structuredClone(r.result);
  }
  private source(ref: TargetRef) {
    const source = this.getResult(ref.source_scan_id);
    const f = source.findings.find(
      (f) => f.finding_id === ref.source_finding_id && f.error_key === ref.error_key,
    );
    if (!f)
      throw new EngineError(
        'invalid_target',
        'Target source does not contain that exact error and finding.',
      );
    return f;
  }
  private buildResult(request: JobRequest, sid: string, start: number, end: number): ScanBundle {
    const b = structuredClone(request.kind === 'verify' ? this.verify : this.baseline);
    const refs = request.kind === 'verify' ? request.targets : request.comparison_refs;
    const sourceByKey = new Map(refs.map((r) => [r.error_key, this.source(r)]));
    const pageKeys =
      request.kind === 'verify'
        ? new Set([...sourceByKey.values()].map((f) => f.page_key))
        : new Set(
            this.baseline.pages
              .filter((p) => !request.pages || request.pages.includes(p.url))
              .slice(0, request.options.max_pages)
              .map((p) => p.page_key),
          );
    const referenceKeys = new Set(refs.map((r) => r.error_key));
    b.pages = b.pages.filter((p) => pageKeys.has(p.page_key));
    const snapshots = new Map(b.pages.map((p) => [p.snapshot_id, `${sid}:${p.page_key}`]));
    b.pages = b.pages.map((p) => ({
      ...p,
      snapshot_id: snapshots.get(p.snapshot_id)!,
      render_health: 'healthy',
      warnings: [
        ...p.warnings,
        'Simulated scan replay; screenshot remains the original source capture.',
      ],
    }));
    b.findings = b.findings
      .filter(
        (f) =>
          pageKeys.has(f.page_key) &&
          (request.kind === 'full' || referenceKeys.has(f.error_key)) &&
          (request.options.model_mode === 'assisted' || f.detected_by !== 'claude_api'),
      )
      .map((f) => ({
        ...f,
        finding_id: `${sid}:${f.error_key}`,
        snapshot_id: snapshots.get(f.snapshot_id)!,
      }));
    const pageMap = new Map(b.pages.map((p) => [p.page_key, p]));
    b.outcomes = refs
      .filter(
        (r) => request.kind === 'verify' || pageKeys.has(sourceByKey.get(r.error_key)!.page_key),
      )
      .map((ref) => {
        const source = sourceByKey.get(ref.error_key)!;
        const page = pageMap.get(source.page_key);
        const found = b.findings.find((f) => f.error_key === ref.error_key);
        const scripted = this.verify.outcomes.find((o) => o.error_key === ref.error_key);
        let outcome: ComparisonOutcome['outcome'] = found
          ? 'detected'
          : request.kind === 'verify' && scripted
            ? scripted.outcome
            : 'not_checked';
        let reason =
          outcome === 'not_checked'
            ? (scripted?.reason ?? 'This sample cannot establish absence for the selected check.')
            : null;
        if (!found && outcome === 'detected') {
          outcome = 'not_checked';
          reason = 'Model-assisted check is disabled in local-only mode.';
        }
        if (request.options.model_mode === 'local_only' && source.detected_by === 'claude_api') {
          outcome = 'not_checked';
          reason = 'Model-assisted check is disabled in local-only mode.';
        }
        if (!page) {
          outcome = 'not_checked';
          reason = 'The sample has no capture for this target page.';
        }
        return {
          ...ref,
          outcome,
          reason,
          check_ids: source.check_ids,
          evaluated_at: new Date(end).toISOString(),
          snapshot_id: page?.snapshot_id ?? null,
          finding_id: outcome === 'detected' ? found!.finding_id : null,
        };
      });
    const urls = b.pages.map((p) => p.url);
    b.templates = this.baseline.templates
      .filter((t) => b.pages.some((p) => p.template_key === t.template_key))
      .map((t) => ({ ...t, page_keys: t.page_keys.filter((k) => pageKeys.has(k)) }));
    b.components = this.baseline.components.filter((c) =>
      b.findings.some((f) => f.component_key === c.component_key),
    );
    b.scan = {
      ...b.scan,
      scan_id: sid,
      site_url: request.site_url,
      source_scan_ids: [...new Set(refs.map((r) => r.source_scan_id))],
      requested_at: new Date(start - 100).toISOString(),
      started_at: new Date(start).toISOString(),
      completed_at: new Date(end).toISOString(),
      resolved_options: request.options,
      requested_urls: request.kind === 'full' ? (request.pages ?? null) : urls,
      attempted_urls: urls,
      captured_urls: urls,
      excluded_urls: [],
      engine_version: 'fixture-0.2.0',
    };
    b.coverage = {
      ...b.coverage,
      scan_id: sid,
      requested_urls: b.scan.requested_urls,
      attempted_urls: urls,
      captured_urls: urls,
      exclusions: [],
      entries: b.outcomes.flatMap((o) => {
        const source = sourceByKey.get(o.error_key)!;
        const page = pageMap.get(source.page_key);
        if (!page) return [];
        return o.check_ids.map((check) => ({
          page_key: page.page_key,
          page_url: page.url,
          check,
          status: o.outcome === 'not_checked' ? ('skipped' as const) : ('ran' as const),
          reason: o.reason ?? 'Synthetic coverage for a sample replay.',
        }));
      }),
    };
    b.provenance = {
      kind: 'synthetic_fixture',
      source_scan_ids: [
        request.kind === 'verify' ? this.verify.scan.scan_id : this.baseline.scan.scan_id,
      ],
      notes: [
        ...b.provenance.notes,
        'No network scan occurred. Only supplied sample targets and pages are replayed. Source image capture dates remain unchanged.',
      ],
      synthetic_fields: [
        'scan',
        'outcomes',
        'coverage',
        'pages.snapshot_id',
        'pages.render_health',
        'findings.finding_id',
      ],
    };
    return validateBundle(b, {
      expectedIdentityVersion: request.expected_identity_version,
      targets: request.kind === 'verify' ? request.targets : undefined,
    });
  }
}

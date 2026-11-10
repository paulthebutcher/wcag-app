import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { FixtureEngine } from './engine.js';
import { type JobRequest } from '../../../packages/contract/src/index.js';
const root = resolve(import.meta.dirname, '../../..');
function setup() {
  let time = 100000;
  const engine = new FixtureEngine({ root, durationMs: 100, now: () => time });
  const request: JobRequest = {
    request_id: 'request-1',
    site_id: 'site-1',
    site_url: engine.baseline.scan.site_url,
    expected_identity_version: engine.baseline.scan.identity_version,
    kind: 'verify',
    targets: engine.baseline.findings.map((f) => ({
      error_key: f.error_key,
      source_scan_id: engine.baseline.scan.scan_id,
      source_finding_id: f.finding_id,
    })),
    options: { max_pages: 50, model_mode: 'local_only', platform: 'auto' },
  };
  return {
    engine,
    request,
    advance: () => {
      time += 10000;
    },
  };
}
describe('request-aware fixture engine', () => {
  it('executes original 70-target scenario with isolated copies', () => {
    const { engine, request, advance } = setup();
    const j = engine.submit(request);
    expect(j.state).toBe('queued');
    advance();
    const done = engine.getJob(j.job_id);
    expect(done.state).toBe('completed');
    const b = engine.getResult(done.scan_id!);
    expect(b.outcomes.filter((o) => o.outcome === 'detected')).toHaveLength(15);
    expect(b.outcomes.filter((o) => o.outcome === 'not_detected')).toHaveLength(18);
    expect(b.outcomes.filter((o) => o.outcome === 'not_checked')).toHaveLength(37);
    b.findings.length = 0;
    expect(engine.getResult(done.scan_id!).findings).toHaveLength(15);
    expect(engine.baseline.findings).toHaveLength(70);
  });
  it('verifies only supplied targets and keeps absence scope bounded', () => {
    const { engine, request, advance } = setup();
    if (request.kind !== 'verify') throw new Error();
    request.targets = request.targets.slice(0, 3);
    const j = engine.submit(request);
    advance();
    const b = engine.getResult(engine.getJob(j.job_id).scan_id!);
    expect(b.outcomes).toHaveLength(3);
    expect(b.findings.every((f) => request.targets.some((t) => t.error_key === f.error_key))).toBe(
      true,
    );
  });
  it('replays idempotently and rejects changed payloads', () => {
    const { engine, request, advance } = setup();
    const j = engine.submit(request);
    expect(engine.submit({ ...request })).toEqual(j);
    expect(engine.getJobByRequest(request.request_id)?.job_id).toBe(j.job_id);
    expect(() =>
      engine.submit({ ...request, options: { ...request.options, max_pages: 49 } }),
    ).toThrow(/different/);
    advance();
    expect(engine.submit(request).job_id).toBe(j.job_id);
  });
  it('rejects unknown source findings, identity versions and unsupported sites', () => {
    const { engine, request } = setup();
    if (request.kind !== 'verify') throw new Error();
    expect(() =>
      engine.submit({
        ...request,
        targets: [{ ...request.targets[0], source_finding_id: 'wrong' }],
      }),
    ).toThrow(/exact/);
    expect(() => engine.submit({ ...request, expected_identity_version: 'unknown' })).toThrow(
      /identity/,
    );
    expect(() => engine.submit({ ...request, site_url: 'https://other.example' })).toThrow(
      /only contains Popfly/,
    );
  });
  it('resolves target sources from multiple completed scans', () => {
    const { engine, request, advance } = setup();
    if (request.kind !== 'verify') throw new Error();
    const j = engine.submit(request);
    advance();
    const result = engine.getResult(engine.getJob(j.job_id).scan_id!);
    const detected = result.findings[0];
    const original = request.targets.find((t) => t.error_key !== detected.error_key)!;
    const next = engine.submit({
      ...request,
      request_id: 'mixed',
      targets: [
        original,
        {
          error_key: detected.error_key,
          source_scan_id: result.scan.scan_id,
          source_finding_id: detected.finding_id,
        },
      ],
    });
    advance();
    const mixed = engine.getResult(engine.getJob(next.job_id).scan_id!);
    expect(mixed.scan.source_scan_ids).toHaveLength(2);
    expect(mixed.outcomes).toHaveLength(2);
  });
  it('queues across sites and rejects a duplicate active site', () => {
    const { engine, request } = setup();
    const first = engine.submit(request);
    const second = engine.submit({ ...request, request_id: 'second', site_id: 'site-2' });
    expect(second.queue_position).toBe(2);
    expect(() => engine.submit({ ...request, request_id: 'third' })).toThrow(/active scan/);
    expect(first.scan_id).toBeNull();
  });
  it('restores persisted sample requests without creating another job', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcag-fixture-'));
    try {
      const opts = { root, persistPath: join(dir, 'jobs.json'), now: () => 1000, durationMs: 100 };
      const e = new FixtureEngine(opts);
      const { request } = setup();
      const j = e.submit(request);
      const restored = new FixtureEngine(opts);
      expect(restored.submit(request).job_id).toBe(j.job_id);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

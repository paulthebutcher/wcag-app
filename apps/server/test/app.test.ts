import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createApp } from '../src/app.js';
const apps: ReturnType<typeof createApp>[] = [];
const root = resolve(import.meta.dirname, '../../..');
function fresh() {
  const a = createApp({ root, dbPath: ':memory:', durationMs: 1, engineMode: 'fixture' });
  apps.push(a);
  return a;
}
afterEach(async () => {
  for (const a of apps.splice(0)) await a.app.close();
});
const headers = { host: '127.0.0.1:4310' };
describe('local API', () => {
  it('opens an empty workspace without fixture files and creates no simulated scans', async () => {
    const workspace = createApp({
      root: resolve(root, 'missing-fixture-root'),
      dbPath: ':memory:',
      engineMode: 'disabled',
    });
    apps.push(workspace);
    const { app, store } = workspace;
    expect((await app.inject({ url: '/api/sites', headers })).json()).toEqual([]);
    const token = (await app.inject({ url: '/api/session', headers })).json().token;
    const mutationHeaders = { ...headers, 'x-session-token': token };
    const created = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers: mutationHeaders,
      payload: { name: 'Production site', url: 'https://example.test' },
    });
    expect(created.statusCode).toBe(201);
    const attempted = await app.inject({
      method: 'POST',
      url: `/api/sites/${created.json().id}/scans`,
      headers: mutationHeaders,
      payload: { kind: 'full' },
    });
    expect(attempted.statusCode).toBe(503);
    expect(store.all('scans')).toEqual([]);
  });

  it('seeds the workspace and enforces local origin/token on writes', async () => {
    const { app } = fresh();
    const w = await app.inject({ url: '/api/sites/popfly/workspace', headers });
    expect(w.statusCode).toBe(200);
    expect(w.json().errors).toHaveLength(70);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/sites',
      headers,
      payload: { name: 'Other', url: 'https://other.test' },
    });
    expect(bad.statusCode).toBe(403);
    const session = await app.inject({ url: '/api/session', headers });
    const token = session.json().token;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sites',
          headers: { ...headers, 'x-session-token': token, origin: 'https://evil.test' },
          payload: { name: 'Other', url: 'https://other.test' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/session', headers: { host: 'evil.test' } })).statusCode,
    ).toBe(403);
  });
  it('enforces site ownership and mutation revision checks', async () => {
    const { app, store } = fresh();
    const token = (await app.inject({ url: '/api/session', headers })).json().token;
    const h = { ...headers, 'x-session-token': token };
    const e = store.all('errors')[0]!;
    store.createSite('Other', 'https://other.test', 'other');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/sites/other/errors/${e.id}/status`,
          headers: h,
          payload: { status: 'not_an_issue' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/sites/popfly/errors/${e.id}/status`,
          headers: h,
          payload: { status: 'not_an_issue', status_revision: 999 },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/sites/popfly/errors/${e.id}/status`,
          headers: h,
          payload: { status: 'fixed' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('resolves receipt references within a frozen brief and only applies eligible selected rows', async () => {
    const { app, store } = fresh();
    const token = (await app.inject({ url: '/api/session', headers })).json().token;
    const mutation = { ...headers, 'x-session-token': token };
    const post = (path: string, payload: object, site = 'popfly') =>
      app.inject({ method: 'POST', url: '/api/sites/' + site + path, headers: mutation, payload });
    const [first, second] = store.all('errors', 'popfly');
    const group = first.component_id;
    expect(group).toBeTruthy();
    const expectedCount = new Set([
      first.id,
      second.id,
      ...store
        .all('errors', 'popfly')
        .filter((error) => error.component_id === group)
        .map((error) => error.id),
    ]).size;
    const made = await post('/fix-briefs', {
      error_ids: [first.id, second.id, first.id],
      component_ids: [group],
    });
    expect(made.statusCode).toBe(201);
    const brief = made.json();
    expect(brief.count).toBe(expectedCount);
    const path = '/fix-briefs/' + brief.id + '/download';
    const file = await app.inject({ url: '/api/sites/popfly' + path, headers });
    expect(file.headers['content-type']).toContain('text/markdown');
    expect(file.body).toContain('## F-002');
    expect(file.body).toContain(brief.id);
    store.createSite('Other', 'https://other.test', 'other');
    expect((await app.inject({ url: '/api/sites/other' + path, headers })).statusCode).toBe(404);

    const receipt = {
      brief_id: brief.id,
      addressed: [
        { id: 'F-001', note: 'Updated the shared component' },
        { id: 'F-002' },
        { id: 'F-999' },
      ],
    };
    expect((await post('/fix-receipts/preview', { receipt }, 'other')).statusCode).toBe(404);
    const preview = await post('/fix-receipts/preview', { receipt });
    const rows = preview.json().rows;
    expect(rows.map((row: any) => [row.state, row.finding?.id])).toEqual([
      ['ready', first.id],
      ['ready', second.id],
      ['unknown', undefined],
    ]);
    expect(store.get('errors', first.id)?.status).toBe('has_error');
    expect(
      (await post('/fix-receipts/confirm', { receipt, selected: ['F-001', 'F-999'] })).statusCode,
    ).toBe(409);
    expect(store.get('errors', first.id)?.status).toBe('has_error');

    store.setStatus('popfly', second.id, 'in_progress');
    store.setStatus('popfly', second.id, 'has_error');
    expect((await post('/fix-receipts/preview', { receipt })).json().rows[1].state).toBe('changed');
    const stale = await post('/fix-receipts/confirm', { receipt, selected: ['F-001', 'F-002'] });
    expect(stale.statusCode).toBe(409);
    expect(store.get('errors', first.id)?.status).toBe('has_error');

    const confirmation = { receipt, selected: ['F-001'], request_id: 'fix-receipt-test' };
    expect((await post('/fix-receipts/confirm', confirmation)).json()).toEqual({ count: 1 });
    expect((await post('/fix-receipts/confirm', confirmation)).json()).toEqual({ count: 1 });
    expect(store.get('errors', first.id)?.status).toBe('in_progress');
    expect(store.get('errors', second.id)?.status).toBe('has_error');
    expect(
      store.all('events', 'popfly').filter((event) => event.kind === 'fix_receipt_confirmed'),
    ).toMatchObject([{ entity_id: first.id, note: 'Updated the shared component' }]);
    expect(store.all('scans', 'popfly')).toHaveLength(1);
    const verify = await post('/scans', { kind: 'verify' });
    expect(verify.json().request_payload.targets.map((target: any) => target.error_key)).toEqual([
      first.error_key,
    ]);
  });
  it('runs request-aware verification and refuses simulated scans for other sites', async () => {
    const { app, store, pump } = fresh();
    const token = (await app.inject({ url: '/api/session', headers })).json().token;
    const h = { ...headers, 'x-session-token': token };
    const e = store.all('errors')[0]!;
    store.setStatus('popfly', e.id, 'in_progress');
    const response = await app.inject({
      method: 'POST',
      url: '/api/sites/popfly/scans',
      headers: h,
      payload: { kind: 'verify', request_id: 'verify-subset' },
    });
    expect(response.statusCode, response.body).toBe(200);
    await new Promise((r) => setTimeout(r, 125));
    await pump();
    const s = store.get('scans', 'verify-subset');
    expect(s?.state, JSON.stringify(s)).toBe('completed');
    expect(store.all('scan_changes').filter((c) => c.scan_id === 'verify-subset')).toHaveLength(1);
    const events = store.all('events').length;
    const replay = await app.inject({
      method: 'POST',
      url: '/api/sites/popfly/scans',
      headers: h,
      payload: { kind: 'verify', request_id: 'verify-subset' },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().state).toBe('completed');
    expect(store.all('events')).toHaveLength(events);
    store.createSite('Other', 'https://other.test', 'other');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/sites/other/scans',
          headers: h,
          payload: { kind: 'full' },
        })
      ).statusCode,
    ).toBe(422);
  });
  it('recovers a persisted queued request that was never submitted', async () => {
    const { store, engine, pump } = fresh();
    const e = store.all('errors')[0]!;
    store.setStatus('popfly', e.id, 'in_progress');
    const scan = store.prepareScan('popfly', 'verify', 'crash-before-post');
    expect(engine.getJobByRequest(scan.id)).toBeNull();
    await pump();
    expect(engine.getJobByRequest(scan.id)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 125));
    await pump();
    expect(store.get('scans', scan.id)?.state).toBe('completed');
  });
});

it('requires operator sign-in for the hosted live workspace', async () => {
  const hostedRoot = mkdtempSync(resolve(tmpdir(), 'wcag-hosted-app-'));
  try {
    const webDist = resolve(hostedRoot, 'apps/web/dist');
    mkdirSync(webDist, { recursive: true });
    writeFileSync(resolve(webDist, 'index.html'), '<title>Workspace</title>');
    vi.stubEnv('HOSTED_MODE', '1');
    vi.stubEnv('WEB_ORIGIN', 'https://workspace.example.test');
    vi.stubEnv('ENGINE_URL', 'http://engine.railway.internal:4311');
    vi.stubEnv('ENGINE_TOKEN', 'test-token-test-token-test-token-test-token');
    vi.stubEnv('APP_OPERATOR_AUTH', undefined);
    const options = { root: hostedRoot, dbPath: ':memory:', engineMode: 'http' as const };
    expect(() => createApp(options)).toThrow('Hosted scans require APP_OPERATOR_AUTH.');
    const credential = 'operator:test-password-for-hosted-workspace';
    vi.stubEnv('APP_OPERATOR_AUTH', credential);
    const workspace = createApp(options);
    apps.push(workspace);
    const host = { host: 'workspace.example.test' };
    for (const url of ['/', '/api/session', '/api/sites', '/api/assets/private']) {
      const response = await workspace.app.inject({ url, headers: host });
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toMatch(/^Basic /);
    }
    const authorized = {
      ...host,
      authorization: 'Basic ' + Buffer.from(credential).toString('base64'),
    };
    expect((await workspace.app.inject({ url: '/', headers: authorized })).statusCode).toBe(200);
    expect(
      (await workspace.app.inject({ url: '/api/session', headers: authorized })).statusCode,
    ).toBe(200);
    const health = await workspace.app.inject({
      url: '/api/health',
      headers: { host: 'healthcheck.railway.app' },
    });
    expect(health.statusCode).toBe(200);
    expect(health.json().mode).toBe('http');
  } finally {
    vi.unstubAllEnvs();
    rmSync(hostedRoot, { recursive: true, force: true });
  }
});

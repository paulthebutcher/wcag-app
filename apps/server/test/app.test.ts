import { describe, it, expect, afterEach } from 'vitest';
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
    pump();
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
    pump();
    expect(engine.getJobByRequest(scan.id)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 125));
    pump();
    expect(store.get('scans', scan.id)?.state).toBe('completed');
  });
});

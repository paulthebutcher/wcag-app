import Fastify from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { Store, AppError, type Row, type Status } from './store.js';
import { EngineError, FixtureEngine } from './engine.js';
import { HttpEngine } from './http-engine.js';
import { hostedMode } from './hosted.js';
import {
  confirmFixReceipt,
  createFixBrief,
  previewFixReceipt,
  receiptSchema,
  renderFixBrief,
  selectionSchema,
} from './fix-brief.js';

export type AppOptions = {
  root: string;
  dbPath?: string;
  durationMs?: number;
  enginePersistPath?: string;
  seed?: boolean;
  engineMode?: 'disabled' | 'fixture' | 'http';
  pollMs?: number;
};
export function createApp(options: AppOptions) {
  const root = resolve(options.root);
  const mode = options.engineMode ?? process.env.ENGINE_MODE ?? 'disabled';
  if (mode !== 'disabled' && mode !== 'fixture' && mode !== 'http')
    throw new Error('Unsupported ENGINE_MODE.');
  const hosted = process.env.HOSTED_MODE === '1';
  if (hosted && mode === 'fixture') throw new Error('Fixture mode is available only locally.');
  if (hosted && mode === 'http' && !process.env.APP_OPERATOR_AUTH)
    throw new Error('Hosted scans require APP_OPERATOR_AUTH.');
  const liveEngine =
    mode === 'http'
      ? new HttpEngine(process.env.ENGINE_URL ?? '', process.env.ENGINE_TOKEN ?? '', hosted)
      : undefined;
  const dataMode = mode === 'fixture' ? 'fixture' : 'workspace';
  const dataDir = resolve(process.env.APP_DATA_DIR ?? join(root, '.data', dataMode));
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  if (hosted) hostedMode(app, root);
  const store = new Store(options.dbPath ?? join(dataDir, 'app.db'), dataMode);
  const fixtureEngine =
    mode === 'fixture'
      ? new FixtureEngine({
          root,
          durationMs: options.durationMs ?? Number(process.env.FIXTURE_DURATION_MS ?? 2500),
          persistPath:
            options.enginePersistPath ??
            (options.dbPath ? undefined : join(dataDir, 'engine-jobs.json')),
        })
      : undefined;
  const engine = liveEngine ?? fixtureEngine;
  if (fixtureEngine && options.seed !== false) store.seed(fixtureEngine.baseline);
  const token = randomUUID();
  const trustedHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const trustedOrigins = new Set([
    ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:4310',
    'http://localhost:4310',
  ]);
  app.addHook('onRequest', async (req, reply) => {
    if (!hosted) {
      const hostname = (req.headers.host ?? '').replace(/:\d+$/, '');
      if (!trustedHosts.has(hostname))
        return reply.code(403).send({ error: { message: 'Untrusted host' } });
      if (req.headers.origin && !trustedOrigins.has(req.headers.origin))
        return reply.code(403).send({ error: { message: 'Untrusted origin' } });
    }
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const header = req.headers['x-session-token'];
      const supplied = typeof header === 'string' ? Buffer.from(header) : undefined;
      if (
        !supplied ||
        supplied.length !== token.length ||
        !timingSafeEqual(supplied, Buffer.from(token))
      )
        return reply
          .code(403)
          .send({ error: { message: 'Missing or invalid local session token' } });
      if (!req.headers['content-type']?.startsWith('application/json'))
        return reply.code(415).send({ error: { message: 'Use application/json' } });
    }
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({
        error: { message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      });
    const status = err instanceof EngineError ? err.statusCode : ((err as any).statusCode ?? 400);
    reply.code(status).send({ error: { message: (err as Error).message } });
  });
  const params = (req: any) => req.params as Record<string, string>;
  const body = (req: any) => z.record(z.unknown()).parse(req.body ?? {});
  const requestId = (b: Row) => (typeof b.request_id === 'string' ? b.request_id : undefined);
  const action = (siteId: string, b: Row, key: string, fn: () => any) =>
    store.action(siteId, requestId(b), { key, ...b }, fn);
  app.get('/api/health', async () => ({ ok: true, mode, contract_version: '0.2.0' }));
  app.get('/api/session', async () => ({ token }));
  app.get('/api/sites', async () => store.all('sites'));
  app.post('/api/sites', async (req, reply) => {
    const b = z
      .object({
        name: z.string().trim().min(1).max(200),
        url: z.string().url(),
        request_id: z.string().optional(),
      })
      .parse(req.body);
    const site = store.action('new', b.request_id, b, () => store.createSite(b.name, b.url));
    return reply.code(201).send(site);
  });
  app.get('/api/sites/:id/workspace', async (req) => {
    if (fixtureEngine) await pump();
    return store.workspace(params(req).id!);
  });
  app.post('/api/sites/:id/errors/:errorId/status', async (req) => {
    const { id, errorId } = params(req);
    const b = z
      .object({
        status: z.enum(['has_error', 'in_progress', 'fixed', 'not_an_issue']),
        status_revision: z.number().int().optional(),
        text: z.string().max(10000).optional(),
        request_id: z.string().optional(),
      })
      .parse(req.body);
    return action(id!, b, `status:${errorId}`, () =>
      store.setStatus(id!, errorId!, b.status, b.status_revision, b.text),
    );
  });
  app.post('/api/sites/:id/components/:componentId/declare-fixed', async (req) => {
    const { id, componentId } = params(req);
    const b = body(req);
    return action(id!, b, `declare-group:${componentId}`, () =>
      store.declareGroup(id!, componentId!),
    );
  });
  app.post('/api/sites/:id/notes', async (req) => {
    const { id } = params(req);
    const b = z
      .object({
        entity_type: z.enum(['error', 'component', 'page', 'template']),
        entity_id: z.string(),
        type: z.string(),
        text: z.string().max(10000).optional(),
        request_id: z.string().optional(),
      })
      .parse(req.body);
    return action(id!, b, 'note', () =>
      store.addNote(id!, b.entity_type, b.entity_id, b.type, b.text),
    );
  });
  app.post('/api/sites/:id/reviews', async (req) => {
    const { id } = params(req);
    const b = z
      .object({
        entity_type: z.enum(['error', 'component', 'page', 'template', 'scan']),
        entity_id: z.string(),
        note: z.string().max(10000).optional(),
        request_id: z.string().optional(),
      })
      .parse(req.body);
    return action(id!, b, 'review', () => store.review(id!, b.entity_type, b.entity_id, b.note));
  });
  app.post('/api/sites/:id/errors/:errorId/remove-group', async (req) => {
    const { id, errorId } = params(req);
    const b = body(req);
    return action(id!, b, `remove-group:${errorId}`, () => store.removeGroup(id!, errorId!));
  });
  app.post('/api/sites/:id/scans', async (req) => {
    const { id } = params(req);
    const b = z
      .object({ kind: z.enum(['full', 'verify']), request_id: z.string().optional() })
      .parse(req.body);
    const site = store.site(id!);
    if (!engine) throw new AppError('Scanning is currently unavailable.', 503);
    if (fixtureEngine && site.url !== fixtureEngine.baseline.scan.site_url.replace(/\/$/, ''))
      throw new AppError(
        'Sample mode only scans the bundled Popfly site. Live scanning requires HttpEngine.',
        422,
      );
    const prior = b.request_id ? store.get('scans', b.request_id) : undefined;
    const health = liveEngine && !prior ? await liveEngine.health() : undefined;
    if (health && site.identity_version && site.identity_version !== health.identity_version)
      throw new AppError('The scan engine uses an incompatible identity version.', 409);
    const saved = action(id!, b, 'scan', () =>
      store.prepareScan(id!, b.kind, b.request_id, health?.identity_version),
    );
    if (fixtureEngine) await pump();
    else void pump().catch((error) => app.log.error(error));
    return store.get('scans', saved.id);
  });
  app.post('/api/sites/:id/scans/:scanId/read', async (req) => {
    const { id, scanId } = params(req);
    const scan = store.entity(id!, 'scan', scanId!);
    if (scan.state === 'completed' && !scan.read_at) {
      scan.read_at = new Date().toISOString();
      store.put('scans', scan);
    }
    return { ok: true };
  });
  app.post('/api/sites/:id/scans/read-all', async (req) => {
    store.site(params(req).id!);
    for (const s of store.all('scans', params(req).id!))
      if (s.state === 'completed' && !s.read_at) {
        s.read_at = new Date().toISOString();
        store.put('scans', s);
      }
    return { ok: true };
  });
  app.post('/api/sites/:id/scans/:scanId/retry-import', async (req) => {
    const { id, scanId } = params(req);
    const scan = store.entity(id!, 'scan', scanId!);
    if (!engine) throw new AppError('Scan import is currently unavailable.', 503);
    if (scan.ingest_state !== 'failed' || !scan.engine_scan_id)
      throw new AppError('This scan has no failed import to retry');
    return store.ingest(id!, await engine.getResult(scan.engine_scan_id), scan.id);
  });
  app.post('/api/sites/:id/fix-briefs', async (req, reply) => {
    const { id } = params(req);
    const b = selectionSchema.parse(req.body);
    return reply.code(201).send(action(id!, b, 'fix-brief', () => createFixBrief(store, id!, b)));
  });
  app.get('/api/sites/:id/fix-briefs/:briefId/download', async (req, reply) => {
    const { id, briefId } = params(req);
    const safeId = z.string().uuid().parse(briefId);
    const markdown = renderFixBrief(store, id!, safeId);
    return reply
      .type('text/markdown; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="fix-brief-' + safeId + '.md"')
      .send(markdown);
  });
  app.post('/api/sites/:id/fix-receipts/preview', async (req) => {
    const { id } = params(req);
    const b = z.object({ receipt: receiptSchema }).parse(req.body);
    return { rows: previewFixReceipt(store, id!, b.receipt) };
  });
  app.post('/api/sites/:id/fix-receipts/confirm', async (req) => {
    const { id } = params(req);
    const b = z
      .object({
        receipt: receiptSchema,
        selected: z.array(z.string().min(1).max(40)).min(1).max(500),
        request_id: z.string().optional(),
      })
      .parse(req.body);
    return action(id!, b, 'fix-receipt', () =>
      confirmFixReceipt(store, id!, b.receipt, b.selected),
    );
  });
  app.get('/api/sites/:id/feedback', async (req, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="wcag-feedback.json"');
    return store.feedback(params(req).id!);
  });
  app.get('/api/sites/:id/scans/:scanId/report.pdf', async (req, reply) => {
    const { id, scanId } = params(req);
    const scan = store.entity(id!, 'scan', scanId!);
    if (!liveEngine || scan.state !== 'completed' || !scan.engine_scan_id)
      throw new AppError('No PDF is available for this scan', 404);
    const media = await liveEngine.report(scan.engine_scan_id);
    return reply.type(media.type).send(media.stream);
  });
  if (liveEngine) {
    app.get('/api/assets/:assetId', async (req, reply) => {
      const id = params(req).assetId!;
      if (!store.all('page_snapshots').some((snapshot) => snapshot.screenshot_asset_id === id))
        throw new AppError('Screenshot not found', 404);
      const media = await liveEngine.screenshot(id);
      return reply
        .type(media.type)
        .header('Cache-Control', 'private, max-age=31536000, immutable')
        .send(media.stream);
    });
  }
  if (fixtureEngine) {
    const assetDir = join(root, 'contract', 'fixtures', 'popfly-sample', 'assets');
    const manifestPath = join(assetDir, 'manifest.json');
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, Row>)
      : {};
    app.get('/api/assets/:assetId', async (req, reply) => {
      const asset = Object.values(manifest).find((a) => a.asset_id === params(req).assetId);
      if (!asset || typeof asset.file !== 'string') throw new AppError('Screenshot not found', 404);
      const path = resolve(assetDir, asset.file);
      if (!path.startsWith(assetDir + '/')) throw new AppError('Invalid asset path', 400);
      reply.type('image/png').header('Cache-Control', 'private, max-age=31536000, immutable');
      return readFileSync(path);
    });
  }
  async function runPump() {
    if (!engine) return;
    for (const scan of store.all('scans').filter((s) => ['queued', 'running'].includes(s.state))) {
      try {
        const job = scan.engine_job_id
          ? await engine.getJob(scan.engine_job_id)
          : ((await engine.getJobByRequest(scan.id)) ??
            (await engine.submit(scan.request_payload)));
        if (job.request_id !== scan.id)
          throw new AppError('The engine returned a job for a different request.', 502);
        scan.engine_job_id = job.job_id;
        scan.progress = job.progress;
        scan.queue_position = job.queue_position;
        scan.state = job.state;
        scan.started_at = job.started_at ?? scan.started_at;
        if (job.state === 'completed') {
          if (!job.scan_id) throw new AppError('The completed engine job has no scan ID.', 502);
          scan.engine_scan_id = job.scan_id;
          scan.state = 'running';
          scan.ingest_state = 'importing';
          store.put('scans', scan);
          try {
            store.ingest(scan.site_id, await engine.getResult(job.scan_id), scan.id);
          } catch (error) {
            if (error instanceof EngineError && error.retryable) throw error;
            scan.state = 'failed';
            scan.ingest_state = 'failed';
            scan.failure_stage = 'ingest';
            scan.failure_message = (error as Error).message;
            store.put('scans', scan);
          }
        } else {
          if (job.state === 'failed') {
            scan.failure_stage = 'engine';
            scan.failure_message = job.error?.message ?? 'The scan failed.';
          }
          store.put('scans', scan);
        }
      } catch (error) {
        if (error instanceof EngineError && error.retryable) {
          scan.progress = { phase: 'Waiting for the scan engine' };
        } else {
          scan.state = 'failed';
          scan.failure_stage = scan.engine_job_id ? 'engine' : 'submission';
          scan.failure_message = (error as Error).message;
        }
        store.put('scans', scan);
      }
    }
  }
  let activePump: Promise<void> | undefined;
  function pump() {
    return (activePump ??= runPump().finally(() => {
      activePump = undefined;
    }));
  }
  const timer = engine
    ? setInterval(
        () => void pump().catch((error) => app.log.error(error)),
        options.pollMs ?? (liveEngine ? 2000 : 500),
      )
    : undefined;
  timer?.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    await activePump;
    store.close();
  });
  return { app, store, engine, pump };
}

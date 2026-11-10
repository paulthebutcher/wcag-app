import Fastify from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { Store, AppError, type Row, type Status } from './store.js';
import { FixtureEngine } from './engine.js';

export type AppOptions = {
  root: string;
  dbPath?: string;
  durationMs?: number;
  enginePersistPath?: string;
  seed?: boolean;
  pollMs?: number;
};
export function createApp(options: AppOptions) {
  const root = resolve(options.root);
  const dataDir = resolve(process.env.APP_DATA_DIR ?? join(root, '.data', 'fixture'));
  if (process.env.ENGINE_MODE && process.env.ENGINE_MODE !== 'fixture')
    throw new Error('Only fixture mode is implemented. HttpEngine is a later milestone.');
  const store = new Store(options.dbPath ?? join(dataDir, 'app.db'));
  const engine = new FixtureEngine({
    root,
    durationMs: options.durationMs ?? Number(process.env.FIXTURE_DURATION_MS ?? 2500),
    persistPath: options.enginePersistPath,
  });
  if (options.seed !== false) store.seed(engine.baseline);
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
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
    const hostname = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!trustedHosts.has(hostname))
      return reply.code(403).send({ error: { message: 'Untrusted host' } });
    if (req.headers.origin && !trustedOrigins.has(req.headers.origin))
      return reply.code(403).send({ error: { message: 'Untrusted origin' } });
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const supplied = req.headers['x-session-token'];
      if (
        typeof supplied !== 'string' ||
        supplied.length !== token.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
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
    const status = (err as any).statusCode ?? 400;
    reply.code(status).send({ error: { message: (err as Error).message } });
  });
  const params = (req: any) => req.params as Record<string, string>;
  const body = (req: any) => z.record(z.unknown()).parse(req.body ?? {});
  const requestId = (b: Row) => (typeof b.request_id === 'string' ? b.request_id : undefined);
  const action = (siteId: string, b: Row, key: string, fn: () => any) =>
    store.action(siteId, requestId(b), { key, ...b }, fn);
  app.get('/api/health', async () => ({ ok: true, mode: 'fixture', contract_version: '0.2.0' }));
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
    pump();
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
    if (site.url !== engine.baseline.scan.site_url.replace(/\/$/, ''))
      throw new AppError(
        'Sample mode only scans the bundled Popfly site. Live scanning requires HttpEngine.',
        422,
      );
    const saved = action(id!, b, 'scan', () => store.prepareScan(id!, b.kind, b.request_id));
    const scan = store.get('scans', saved.id)!;
    if (!scan.engine_job_id && scan.state === 'queued') {
      try {
        const job = engine.submit(scan.request_payload as any);
        scan.engine_job_id = job.job_id;
        store.put('scans', scan);
      } catch (error) {
        scan.state = 'failed';
        scan.failure_stage = 'submission';
        scan.failure_message = (error as Error).message;
        store.put('scans', scan);
        throw error;
      }
    }
    pump();
    return store.get('scans', scan.id);
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
    if (scan.ingest_state !== 'failed' || !scan.engine_scan_id)
      throw new AppError('This scan has no failed import to retry');
    return store.ingest(id!, engine.getResult(scan.engine_scan_id), scan.id);
  });
  app.get('/api/sites/:id/feedback', async (req, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="wcag-feedback.json"');
    return store.feedback(params(req).id!);
  });
  app.get('/api/sites/:id/scans/:scanId/report.pdf', async (req) => {
    const { id, scanId } = params(req);
    store.entity(id!, 'scan', scanId!);
    throw new AppError('No PDF is bundled for this fixture scan', 404);
  });
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
  function pump() {
    for (const scan of store.all('scans').filter((s) => ['queued', 'running'].includes(s.state))) {
      try {
        const job = scan.engine_job_id
          ? engine.getJob(scan.engine_job_id)
          : (engine.getJobByRequest(scan.id) ?? engine.submit(scan.request_payload));
        if (!job) continue;
        scan.engine_job_id = job.job_id;
        scan.progress = job.progress;
        scan.state = job.state;
        scan.started_at = (job as any).started_at ?? scan.started_at;
        if (job.state === 'completed' && job.scan_id) {
          scan.engine_scan_id = job.scan_id;
          scan.state = 'running';
          scan.ingest_state = 'importing';
          store.put('scans', scan);
          try {
            store.ingest(scan.site_id, engine.getResult(job.scan_id), scan.id);
          } catch (error) {
            scan.state = 'failed';
            scan.ingest_state = 'failed';
            scan.failure_stage = 'ingest';
            scan.failure_message = (error as Error).message;
            store.put('scans', scan);
          }
        } else {
          if (job.state === 'failed') {
            scan.failure_stage = 'engine';
            scan.failure_message =
              typeof job.error === 'string' ? job.error : JSON.stringify(job.error);
          }
          store.put('scans', scan);
        }
      } catch (error) {
        scan.state = 'failed';
        scan.failure_stage = 'engine';
        scan.failure_message = (error as Error).message;
        store.put('scans', scan);
      }
    }
  }
  const timer = setInterval(pump, options.pollMs ?? 500);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    store.close();
  });
  return { app, store, engine, pump };
}

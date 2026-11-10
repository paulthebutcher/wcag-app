import Database from 'better-sqlite3';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateBundle, type ScanBundle } from '../../../packages/contract/src/index.js';

export type Row = Record<string, any>;
export type Status = 'has_error' | 'in_progress' | 'fixed' | 'not_an_issue';
const now = () => new Date().toISOString();
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
export const states: Status[] = ['has_error', 'in_progress', 'fixed', 'not_an_issue'];
const tables: Record<string, string> = {
  error: 'errors',
  page: 'pages',
  component: 'components',
  template: 'templates',
  scan: 'scans',
};
const noteTypes: Record<string, string[]> = {
  error: [
    'false_positive',
    'wrong_severity',
    'wrong_criterion',
    'wrong_element',
    'duplicate',
    'other',
  ],
  component: [
    'false_positive',
    'wrong_severity',
    'wrong_criterion',
    'wrong_element',
    'duplicate',
    'other',
    'wrong_grouping',
    'should_split',
    'should_merge',
    'wrong_remediation',
  ],
  page: [
    'false_positive',
    'wrong_severity',
    'wrong_criterion',
    'wrong_element',
    'duplicate',
    'other',
    'missed_error',
    'capture_problem',
  ],
  template: [
    'false_positive',
    'wrong_severity',
    'wrong_criterion',
    'wrong_element',
    'duplicate',
    'other',
    'wrong_page_membership',
    'missed_error',
  ],
};
export function nextStatus(current: Status, outcome: string): Status {
  if (current === 'not_an_issue' || outcome === 'not_checked') return current;
  return outcome === 'detected' ? 'has_error' : 'fixed';
}
export function rollup(errors: Row[]): string {
  if (!errors.length) return 'no_issues';
  if (errors.some((e) => e.status === 'in_progress')) return 'in_progress';
  if (errors.some((e) => e.status === 'has_error')) return 'has_error';
  return errors.every((e) => e.status === 'not_an_issue') ? 'not_an_issue' : 'fixed';
}
function stable(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function findingContent(f: Row) {
  const { finding_id, snapshot_id, ...content } = f;
  return stable(content);
}

export class Store {
  db: Database.Database;
  constructor(path: string, dataMode: 'fixture' | 'workspace' = 'workspace') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_migrations VALUES(1);
   CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sites(id TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),engine_scan_id TEXT UNIQUE,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS action_requests(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,result TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS group_removals(error_id TEXT,component_id TEXT,site_id TEXT NOT NULL REFERENCES sites(id),payload TEXT NOT NULL,PRIMARY KEY(error_id,component_id));
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,site_id TEXT NOT NULL REFERENCES sites(id),payload TEXT NOT NULL);`);
    for (const table of ['pages', 'templates', 'components', 'errors'])
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),entity_key TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(site_id,entity_key));`,
      );
    for (const table of ['notes', 'reviews', 'decisions'])
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),payload TEXT NOT NULL);`,
      );
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS page_snapshots(id TEXT PRIMARY KEY,site_id TEXT NOT NULL REFERENCES sites(id),scan_id TEXT NOT NULL REFERENCES scans(id),engine_snapshot_id TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(scan_id,engine_snapshot_id));
   CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,error_id TEXT NOT NULL REFERENCES errors(id),scan_id TEXT NOT NULL REFERENCES scans(id),site_id TEXT NOT NULL REFERENCES sites(id),payload TEXT NOT NULL,UNIQUE(error_id,scan_id));
   CREATE TABLE IF NOT EXISTS scan_changes(scan_id TEXT NOT NULL REFERENCES scans(id),error_id TEXT NOT NULL REFERENCES errors(id),site_id TEXT NOT NULL REFERENCES sites(id),payload TEXT NOT NULL,PRIMARY KEY(scan_id,error_id));`);
    for (const table of [
      'notes',
      'reviews',
      'decisions',
      'events',
      'observations',
      'page_snapshots',
      'scan_changes',
    ]) {
      this.db.exec(
        `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable record'); END; CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable record'); END;`,
      );
    }
    const mode = this.db.prepare('SELECT value FROM settings WHERE key=?').get('mode') as
      | Row
      | undefined;
    if (mode && mode.value !== dataMode) {
      this.db.close();
      throw new AppError('Database belongs to a different workspace mode', 409);
    }
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('mode', dataMode);
  }
  close() {
    this.db.close();
  }
  all(table: string, siteId?: string): Row[] {
    return (
      this.db
        .prepare(`SELECT * FROM ${table}${siteId ? ' WHERE site_id=?' : ''}`)
        .all(...(siteId ? [siteId] : [])) as Row[]
    ).map((r) => ({ ...JSON.parse(r.payload), ...(table === 'events' ? { id: r.id } : {}) }));
  }
  get(table: string, id: string): Row | undefined {
    const r = this.db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id) as Row | undefined;
    return r ? JSON.parse(r.payload) : undefined;
  }
  put(table: string, row: Row) {
    if (table === 'sites')
      this.db
        .prepare(
          'INSERT INTO sites(id,url,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,payload=excluded.payload',
        )
        .run(row.id, row.url, JSON.stringify(row));
    else if (table === 'scans')
      this.db
        .prepare(
          'INSERT INTO scans(id,site_id,engine_scan_id,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET engine_scan_id=excluded.engine_scan_id,payload=excluded.payload',
        )
        .run(row.id, row.site_id, row.engine_scan_id ?? null, JSON.stringify(row));
    else
      this.db
        .prepare(
          `INSERT INTO ${table}(id,site_id,entity_key,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
        )
        .run(
          row.id,
          row.site_id,
          row.error_key ?? row.page_key ?? row.component_key ?? row.template_key,
          JSON.stringify(row),
        );
  }
  site(id: string) {
    const s = this.get('sites', id);
    if (!s) throw new AppError('Site not found', 404);
    return s;
  }
  entity(siteId: string, type: string, id: string) {
    if (!tables[type]) throw new AppError('Unsupported entity type');
    const e = this.get(tables[type], id);
    if (!e || e.site_id !== siteId) throw new AppError('Entity not found', 404);
    return e;
  }
  createSite(name: string, url: string, id: string = randomUUID()): Row {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) throw new AppError('Use an HTTP or HTTPS URL');
    u.hash = '';
    const normalized = u.href.replace(/\/$/, '');
    if (this.all('sites').some((s) => s.url === normalized))
      throw new AppError('This site is already added', 409);
    const site = {
      id,
      name: name.trim(),
      url: normalized,
      platform: 'unknown',
      identity_version: null,
      model_mode: 'local_only',
      scan_options: { max_pages: 50, tiers: [1, 2, 4, 5] },
      created_at: now(),
    };
    if (!site.name) throw new AppError('Site name is required');
    this.put('sites', site);
    return site;
  }
  event(siteId: string, type: string, id: string, kind: string, extra: Row = {}) {
    this.db.prepare('INSERT INTO events(site_id,payload) VALUES(?,?)').run(
      siteId,
      JSON.stringify({
        site_id: siteId,
        entity_type: type,
        entity_id: id,
        kind,
        created_at: now(),
        ...extra,
      }),
    );
  }
  action(siteId: string, requestId: string | undefined, body: Row, fn: () => any) {
    const id = requestId ?? randomUUID();
    const hash = createHash('sha256').update(stable({ siteId, body })).digest('hex');
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT * FROM action_requests WHERE id=?').get(id) as
        | Row
        | undefined;
      if (prior) {
        if (prior.request_hash !== hash)
          throw new AppError('Request ID already used for a different action', 409);
        return JSON.parse(prior.result);
      }
      const result = fn() ?? { ok: true };
      this.db
        .prepare('INSERT INTO action_requests VALUES(?,?,?)')
        .run(id, hash, JSON.stringify(result));
      return result;
    })();
  }
  bump(siteId: string, type: string, id: string) {
    const e = this.entity(siteId, type, id);
    e.content_revision = (e.content_revision ?? 0) + 1;
    this.put(tables[type], e);
  }
  bumpParents(e: Row) {
    const page = this.get('pages', e.page_id);
    if (page) {
      this.bump(e.site_id, 'page', page.id);
      if (page.template_id) this.bump(e.site_id, 'template', page.template_id);
    }
    if (e.component_id) this.bump(e.site_id, 'component', e.component_id);
  }
  addNote(siteId: string, type: string, id: string, noteType: string, text = ''): Row {
    const e = this.entity(siteId, type, id);
    if (!noteTypes[type]?.includes(noteType))
      throw new AppError('Invalid note type for this entity');
    const n = {
      id: randomUUID(),
      site_id: siteId,
      entity_type: type,
      entity_id: id,
      type: noteType,
      text,
      source_observation_id: e.last_detected_observation_id ?? null,
      created_at: now(),
    };
    this.db.prepare('INSERT INTO notes VALUES(?,?,?)').run(n.id, siteId, JSON.stringify(n));
    this.bump(siteId, type, id);
    this.event(siteId, type, id, 'note_added', { note_id: n.id });
    if (type === 'error') this.bumpParents(e);
    else {
      for (const error of this.all('errors', siteId)) {
        const p = this.get('pages', error.page_id);
        if (
          (type === 'component' && error.component_id === id) ||
          (type === 'page' && error.page_id === id) ||
          (type === 'template' && p?.template_id === id)
        ) {
          this.bump(siteId, 'error', error.id);
          this.bumpParents(error);
        }
      }
    }
    return n;
  }
  review(siteId: string, type: string, id: string, note = ''): Row {
    const e = this.entity(siteId, type, id);
    if (type === 'scan' && e.state !== 'completed')
      throw new AppError('Review is available after scan completion');
    const r = {
      id: randomUUID(),
      site_id: siteId,
      entity_type: type,
      entity_id: id,
      note,
      reviewed_content_revision: e.content_revision ?? 1,
      source_observation_id: e.last_detected_observation_id ?? null,
      created_at: now(),
    };
    this.db.prepare('INSERT INTO reviews VALUES(?,?,?)').run(r.id, siteId, JSON.stringify(r));
    this.event(siteId, type, id, 'reviewed', { review_id: r.id });
    return r;
  }
  setStatus(siteId: string, id: string, status: Status, revision?: number, text = ''): Row {
    return this.db.transaction(() => {
      const e = this.entity(siteId, 'error', id);
      if (revision !== undefined && revision !== e.status_revision)
        throw new AppError('This error changed. Refresh before updating its status.', 409);
      const legal: Record<string, string[]> = {
        has_error: ['in_progress', 'not_an_issue'],
        in_progress: ['has_error', 'not_an_issue'],
        fixed: ['not_an_issue'],
        not_an_issue: ['has_error'],
      };
      if (!legal[e.status]?.includes(status))
        throw new AppError('That status transition is not allowed');
      const before = e.status;
      e.status = status;
      e.status_revision++;
      e.content_revision++;
      e.status_changed_at = now();
      this.put('errors', e);
      this.bumpParents(e);
      this.event(siteId, 'error', id, 'status_changed', { from_status: before, to_status: status });
      if (status === 'not_an_issue' || before === 'not_an_issue') {
        const n =
          status === 'not_an_issue'
            ? this.addNote(siteId, 'error', id, 'false_positive', text)
            : null;
        const r = status === 'not_an_issue' ? this.review(siteId, 'error', id, text) : null;
        const previous = this.all('decisions', siteId)
          .filter((d) => d.error_id === id)
          .at(-1);
        const d = {
          id: randomUUID(),
          site_id: siteId,
          error_id: id,
          kind: status === 'not_an_issue' ? 'not_an_issue' : 'reverted',
          source_observation_id: e.last_detected_observation_id,
          note_id: n?.id ?? null,
          review_id: r?.id ?? null,
          supersedes_decision_id: previous?.id ?? null,
          created_at: now(),
        };
        this.db.prepare('INSERT INTO decisions VALUES(?,?,?)').run(d.id, siteId, JSON.stringify(d));
      }
      return this.get('errors', id)!;
    })();
  }
  removeGroup(siteId: string, id: string) {
    const e = this.entity(siteId, 'error', id);
    if (!e.component_id) return { ok: true };
    const group = e.component_id;
    this.bumpParents(e);
    this.db.prepare('INSERT OR IGNORE INTO group_removals VALUES(?,?,?,?)').run(
      id,
      group,
      siteId,
      JSON.stringify({
        id: randomUUID(),
        error_id: id,
        component_id: group,
        site_id: siteId,
        source_observation_id: e.last_detected_observation_id,
        created_at: now(),
      }),
    );
    e.component_id = null;
    e.content_revision++;
    this.put('errors', e);
    this.event(siteId, 'error', id, 'removed_from_group', { component_id: group });
    return { ok: true };
  }
  declareGroup(siteId: string, id: string) {
    this.entity(siteId, 'component', id);
    let count = 0;
    for (const e of this.all('errors', siteId))
      if (e.component_id === id && e.status === 'has_error') {
        this.setStatus(siteId, e.id, 'in_progress');
        count++;
      }
    return { count };
  }
  prepareScan(siteId: string, kind: 'full' | 'verify', requestId: string = randomUUID()): Row {
    const site = this.site(siteId);
    const active = this.all('scans', siteId).find(
      (s) => ['queued', 'running'].includes(s.state) || s.ingest_state === 'failed',
    );
    if (active)
      throw new AppError('A scan is already active or awaiting import recovery for this site', 409);
    const errors = this.all('errors', siteId),
      selected = kind === 'verify' ? errors.filter((e) => e.status === 'in_progress') : errors;
    if (kind === 'verify' && !selected.length) throw new AppError('Declare a fix first');
    const targets = selected.map((e) => {
      const obs = this.getObservation(e.last_detected_observation_id);
      const scan = this.get('scans', obs!.scan_id)!;
      return {
        error_key: e.error_key,
        source_scan_id: scan.engine_scan_id,
        source_finding_id: obs!.engine_finding_id,
      };
    });
    const previous = this.all('scans', siteId)
      .filter((s) => s.kind === 'full' && s.state === 'completed')
      .at(-1);
    const request: Row = {
      request_id: requestId,
      site_id: siteId,
      site_url: site.url,
      expected_identity_version: site.identity_version,
      kind,
      options: {
        max_pages: 50,
        model_mode: site.model_mode,
        platform: 'auto',
        ...(kind === 'full' ? { tiers: [1, 2, 4, 5] } : {}),
      },
      ...(kind === 'verify'
        ? { targets }
        : {
            comparison_refs: targets,
            ...(previous
              ? { pages: previous.metadata.requested_urls ?? previous.metadata.attempted_urls }
              : {}),
          }),
    };
    const scan = {
      id: requestId,
      site_id: siteId,
      kind,
      scope: kind === 'verify' ? 'declared_fixes' : previous ? 'previous_pages' : 'url',
      state: 'queued',
      ingest_state: 'pending',
      request_payload: request,
      status_revisions: Object.fromEntries(errors.map((e) => [e.id, e.status_revision])),
      requested_at: now(),
      read_at: null,
      content_revision: 1,
      summary: {},
      progress: { phase: 'Queued', pages_done: 0, pages_total: 0 },
    };
    this.put('scans', scan);
    return scan;
  }
  getObservation(id: string): Row | undefined {
    return this.get('observations', id);
  }
  ingest(siteId: string, input: ScanBundle, scanId?: string): Row {
    const site = this.site(siteId);
    const pending = scanId ? this.get('scans', scanId) : undefined;
    const parsed = validateBundle(input, {
      ...(site.identity_version ? { expectedIdentityVersion: site.identity_version } : {}),
    });
    const expectedTargets =
      pending?.request_payload?.kind === 'verify'
        ? pending.request_payload.targets
        : pending?.request_payload?.comparison_refs?.filter((ref: Row) => {
            const error = this.all('errors', siteId).find((e) => e.error_key === ref.error_key);
            const page = error ? this.get('pages', error.page_id) : undefined;
            return page && parsed.scan.attempted_urls.includes(page.url);
          });
    const bundle = expectedTargets ? validateBundle(parsed, { targets: expectedTargets }) : parsed;
    if (bundle.scan.site_url.replace(/\/$/, '') !== site.url)
      throw new AppError('Scan result belongs to a different site', 409);
    if (pending && bundle.scan.kind !== pending.kind)
      throw new AppError('Scan result kind differs from request', 409);
    const existing = this.all('scans', siteId).find(
      (s) => s.engine_scan_id === bundle.scan.scan_id && s.ingest_state === 'imported',
    );
    if (existing) return existing;
    return this.db.transaction(() => {
      const id = scanId ?? randomUUID();
      const prior = scanId ? this.get('scans', id) : undefined;
      if (prior && prior.site_id !== siteId) throw new AppError('Scan not found', 404);
      const s: Row = {
        ...prior,
        id,
        site_id: siteId,
        engine_scan_id: bundle.scan.scan_id,
        kind: bundle.scan.kind,
        scope: prior?.scope ?? 'url',
        state: 'running',
        ingest_state: 'importing',
        metadata: bundle.scan,
        engine_version: bundle.scan.engine_version,
        identity_version: bundle.scan.identity_version,
        requested_at: prior?.requested_at ?? bundle.scan.requested_at,
        started_at: bundle.scan.started_at,
        content_revision: 1,
      };
      this.put('scans', s);
      site.identity_version = bundle.scan.identity_version;
      site.platform = bundle.scan.platform;
      this.put('sites', site);
      const upsert = (table: string, key: string, input: Row): Row => {
        const old = this.all(table, siteId).find((r) => r[key] === input[key]);
        const row = {
          ...old,
          ...input,
          id: old?.id ?? randomUUID(),
          site_id: siteId,
          content_revision: old?.content_revision ?? 1,
        };
        const compareKeys = Object.keys(input).filter(
          (k) => !['last_captured_at', 'page_keys'].includes(k),
        );
        if (old && compareKeys.some((k) => stable(old[k]) !== stable(input[k])))
          row.content_revision++;
        this.put(table, row);
        return row;
      };
      const templateMap = new Map<string, Row>();
      for (const t of bundle.templates)
        templateMap.set(t.template_key, upsert('templates', 'template_key', t));
      const componentMap = new Map<string, Row>();
      for (const c of bundle.components)
        componentMap.set(
          c.component_key,
          upsert('components', 'component_key', { ...c, name: c.label }),
        );
      const pages = new Map<string, Row>(),
        snaps = new Map<string, Row>();
      for (const p of bundle.pages) {
        let template = p.template_key
          ? (templateMap.get(p.template_key) ??
            this.all('templates', siteId).find((t) => t.template_key === p.template_key))
          : undefined;
        const previousPage = this.all('pages', siteId).find((x) => x.page_key === p.page_key);
        const previousSnapshot = previousPage?.latest_snapshot_id
          ? this.get('page_snapshots', previousPage.latest_snapshot_id)
          : undefined;
        const page = upsert('pages', 'page_key', {
          page_key: p.page_key,
          url: p.url,
          title: p.title,
          name: p.title || p.url,
          template_id: template?.id ?? null,
          last_captured_at: p.captured_at,
        });
        if (previousPage && previousPage.template_id !== page.template_id) {
          if (previousPage.template_id) this.bump(siteId, 'template', previousPage.template_id);
          if (page.template_id) this.bump(siteId, 'template', page.template_id);
        } else if (
          previousPage &&
          previousPage.content_revision !== page.content_revision &&
          page.template_id
        )
          this.bump(siteId, 'template', page.template_id);
        const snapshot = {
          ...p,
          id: randomUUID(),
          site_id: siteId,
          page_id: page.id,
          scan_id: id,
          engine_snapshot_id: p.snapshot_id,
        };
        this.db
          .prepare('INSERT INTO page_snapshots VALUES(?,?,?,?,?)')
          .run(snapshot.id, siteId, id, p.snapshot_id, JSON.stringify(snapshot));
        if (
          previousSnapshot &&
          (previousSnapshot.screenshot_hash === null ||
            previousSnapshot.screenshot_hash !== p.screenshot_hash ||
            previousSnapshot.render_health !== p.render_health)
        ) {
          page.content_revision++;
          if (page.template_id) this.bump(siteId, 'template', page.template_id);
        }
        page.latest_snapshot_id = snapshot.id;
        page.screenshot_url = p.screenshot_url;
        this.put('pages', page);
        pages.set(p.page_key, page);
        snaps.set(p.snapshot_id, snapshot);
      }
      const findings = new Map(bundle.findings.map((f) => [f.error_key, f]));
      const outcomes = new Map(bundle.outcomes.map((o) => [o.error_key, o]));
      for (const f of bundle.findings)
        if (!outcomes.has(f.error_key))
          outcomes.set(f.error_key, {
            error_key: f.error_key,
            outcome: 'detected',
            finding_id: f.finding_id,
            snapshot_id: f.snapshot_id,
            reason: null,
            evaluated_at: bundle.scan.completed_at ?? now(),
            source_scan_id: bundle.scan.scan_id,
            source_finding_id: f.finding_id,
            check_ids: f.check_ids,
          });
      const summary: Row = {
        new: 0,
        fixed: 0,
        reopened: 0,
        still_detected: 0,
        not_checked: 0,
        not_an_issue: 0,
        no_change: 0,
      };
      for (const [key, outcome] of outcomes) {
        const f = findings.get(key);
        let e = this.all('errors', siteId).find((x) => x.error_key === key);
        const isNew = !e;
        if (!e && !f) throw new AppError('Outcome references an unknown error');
        if (!e) {
          const page = pages.get(f!.page_key);
          if (!page) throw new AppError('Finding page missing');
          e = {
            id: randomUUID(),
            site_id: siteId,
            error_key: key,
            identity_version: bundle.scan.identity_version,
            element_key: f!.element_key,
            page_id: page.id,
            component_id: null,
            criterion: f!.criterion,
            level: f!.level,
            failure_type: f!.failure_type,
            name: f!.name,
            status: 'has_error',
            status_revision: 0,
            content_revision: 1,
            status_changed_at: now(),
            first_seen_scan_id: id,
          };
          this.put('errors', e);
          this.event(siteId, 'error', e.id, 'first_seen', { scan_id: id });
        }
        const before = e.status;
        const priorRevision = e.content_revision;
        let application = 'applied';
        const revision = prior?.status_revisions?.[e.id];
        if (!isNew && revision !== undefined && revision !== e.status_revision)
          application = 'skipped_newer_action';
        const after = isNew
          ? 'has_error'
          : application === 'skipped_newer_action'
            ? before
            : nextStatus(before, outcome.outcome);
        if (f) {
          const oldGroup = e.component_id;
          const group = f.component_key
            ? (componentMap.get(f.component_key) ??
              this.all('components', siteId).find((c) => c.component_key === f.component_key))
            : undefined;
          const removed =
            group &&
            this.db
              .prepare('SELECT 1 FROM group_removals WHERE error_id=? AND component_id=?')
              .get(e.id, group.id);
          e.component_id = removed ? null : (group?.id ?? null);
          if (e.finding && findingContent(e.finding) !== findingContent(f)) e.content_revision++;
          const oldSnapshot = e.snapshot_id ? this.get('page_snapshots', e.snapshot_id) : null;
          const newSnapshot = snaps.get(f.snapshot_id);
          if (
            oldSnapshot &&
            newSnapshot &&
            (oldSnapshot.screenshot_hash === null ||
              oldSnapshot.screenshot_hash !== newSnapshot.screenshot_hash)
          )
            e.content_revision++;
          if (oldGroup !== e.component_id) {
            e.content_revision++;
            if (oldGroup) this.bump(siteId, 'component', oldGroup);
            this.event(siteId, 'error', e.id, 'membership_changed', {
              scan_id: id,
              from_component_id: oldGroup,
              to_component_id: e.component_id,
            });
          }
          e.finding = f;
          e.name = f.name;
          e.criterion = f.criterion;
          e.level = f.level;
          e.failure_type = f.failure_type;
          e.last_captured_at = snaps.get(f.snapshot_id)?.captured_at;
          e.snapshot_id = snaps.get(f.snapshot_id)?.id;
          e.screenshot_url = snaps.get(f.snapshot_id)?.screenshot_url ?? null;
        }
        if (after !== before) {
          e.status = after;
          e.status_revision++;
          e.content_revision++;
          e.status_changed_at = now();
          this.event(siteId, 'error', e.id, 'status_changed', {
            from_status: before,
            to_status: after,
            scan_id: id,
          });
        }
        const obs = {
          id: randomUUID(),
          site_id: siteId,
          error_id: e.id,
          scan_id: id,
          outcome: outcome.outcome,
          reason: outcome.reason,
          engine_finding_id: f?.finding_id ?? null,
          snapshot_id: outcome.snapshot_id ? (snaps.get(outcome.snapshot_id)?.id ?? null) : null,
          evaluated_at: outcome.evaluated_at,
          captured_at: outcome.snapshot_id
            ? (snaps.get(outcome.snapshot_id)?.captured_at ?? null)
            : null,
          engine_version: bundle.scan.engine_version,
          identity_version: bundle.scan.identity_version,
          finding: f ?? null,
          raw_finding: f ?? null,
          status_application: application,
        };
        if (f) e.last_detected_observation_id = obs.id;
        this.put('errors', e);
        this.db
          .prepare('INSERT INTO observations VALUES(?,?,?,?,?)')
          .run(obs.id, e.id, id, siteId, JSON.stringify(obs));
        this.event(siteId, 'error', e.id, 'observed', {
          scan_id: id,
          outcome: outcome.outcome,
          reason: outcome.reason,
          observation_id: obs.id,
        });
        if (isNew || e.content_revision !== priorRevision) this.bumpParents(e);
        const category =
          after === 'not_an_issue'
            ? 'not_an_issue'
            : outcome.outcome === 'not_checked'
              ? 'not_checked'
              : isNew
                ? 'new'
                : before === 'fixed' && after === 'has_error'
                  ? 'reopened'
                  : before !== after && after === 'fixed'
                    ? 'fixed'
                    : outcome.outcome === 'detected'
                      ? 'still_detected'
                      : 'no_change';
        summary[category]++;
        const change = {
          error_id: e.id,
          scan_id: id,
          observation_id: obs.id,
          category,
          outcome: outcome.outcome,
          reason: outcome.reason,
          status_before: before,
          status_after: after,
          status_application: application,
          name: e.name,
        };
        this.db
          .prepare('INSERT INTO scan_changes VALUES(?,?,?,?)')
          .run(id, e.id, siteId, JSON.stringify(change));
      }
      s.state = 'completed';
      s.ingest_state = 'imported';
      s.completed_at = bundle.scan.completed_at ?? now();
      s.ingested_at = now();
      s.read_at = null;
      s.summary = summary;
      s.coverage = bundle.coverage;
      s.provenance = bundle.provenance;
      s.progress = {
        phase: 'Completed',
        pages_done: bundle.pages.length,
        pages_total: bundle.pages.length,
      };
      s.pages_covered = bundle.pages.length;
      this.put('scans', s);
      return s;
    })();
  }
  seed(bundle: ScanBundle) {
    let s = this.all('sites').find((s) => s.url === bundle.scan.site_url.replace(/\/$/, ''));
    if (!s) s = this.createSite('Popfly', bundle.scan.site_url, 'popfly');
    this.ingest(s.id, bundle);
    return s;
  }
  workspace(siteId: string): Row {
    const site = this.site(siteId),
      notes = this.all('notes', siteId),
      reviews = this.all('reviews', siteId),
      observations = this.all('observations', siteId),
      snapshots = this.all('page_snapshots', siteId);
    const mark = (type: string, e: Row): Row => {
      const r = reviews.filter((r) => r.entity_type === type && r.entity_id === e.id).at(-1);
      return {
        ...e,
        reviewed: !!r,
        reviewed_at: r?.created_at ?? null,
        changed_since_review: !!r && (e.content_revision ?? 1) > r.reviewed_content_revision,
      };
    };
    let pages = this.all('pages', siteId);
    const errors: Row[] = this.all('errors', siteId).map((e) => {
      const page = pages.find((p) => p.id === e.page_id);
      const ownNotes = notes.filter(
        (n) =>
          (n.entity_type === 'error' && n.entity_id === e.id) ||
          (n.entity_type === 'page' && n.entity_id === e.page_id) ||
          (n.entity_type === 'component' && n.entity_id === e.component_id) ||
          (n.entity_type === 'template' && n.entity_id === page?.template_id),
      );
      return {
        ...mark('error', e),
        notes_count: ownNotes.length,
        notes: ownNotes,
        snapshot: snapshots.find((p) => p.id === e.snapshot_id) ?? null,
        observations: observations
          .filter((o) => o.error_id === e.id)
          .map((o) => ({ ...o, snapshot: snapshots.find((p) => p.id === o.snapshot_id) ?? null })),
      };
    });
    const aggregate = (type: string, e: Row, members: Row[]) => ({
      ...mark(type, e),
      status: rollup(members),
      counts: Object.fromEntries(
        states.map((s) => [s, members.filter((m) => m.status === s).length]),
      ),
      open_errors: members.filter((m) => ['has_error', 'in_progress'].includes(m.status)).length,
      criteria: [...new Set(members.map((m) => m.criterion))].sort(),
      errors: members.map((m) => m.id),
      pages_affected: new Set(members.map((m) => m.page_id)).size,
      last_captured_at:
        members
          .map((m) => m.last_captured_at)
          .filter(Boolean)
          .sort()
          .at(-1) ??
        e.last_captured_at ??
        null,
    });
    pages = pages.map((p) => ({
      ...aggregate(
        'page',
        p,
        errors.filter((e) => e.page_id === p.id),
      ),
      snapshot: snapshots.find((s) => s.id === p.latest_snapshot_id),
    }));
    const components = this.all('components', siteId).map((c) =>
      aggregate(
        'component',
        c,
        errors.filter((e) => e.component_id === c.id),
      ),
    );
    const templates = this.all('templates', siteId).map((t) => {
      const memberPages = pages.filter((p) => p.template_id === t.id);
      return {
        ...aggregate(
          'template',
          t,
          errors.filter((e) => memberPages.some((p) => p.id === e.page_id)),
        ),
        pages_scanned: memberPages.length,
      };
    });
    const scans = this.all('scans', siteId)
      .map((s) => ({
        ...mark('scan', s),
        changes: this.all('scan_changes', siteId).filter((c) => c.scan_id === s.id),
      }))
      .sort((a: Row, b: Row) => b.requested_at.localeCompare(a.requested_at));
    return {
      site,
      errors,
      pages,
      templates,
      components,
      scans,
      notes,
      reviews,
      events: this.all('events', siteId),
    };
  }
  feedback(siteId: string) {
    this.site(siteId);
    const records = [
      ...this.all('decisions', siteId).map((d) => ({ ...d, record_type: 'decision' })),
      ...this.all('notes', siteId).map((n) => ({ ...n, record_type: 'note' })),
      ...this.all('group_removals', siteId).map((r) => ({ ...r, record_type: 'group_removal' })),
    ].map((r: Row) => {
      const e = r.error_id
        ? this.get('errors', r.error_id)
        : r.entity_type === 'error'
          ? this.get('errors', r.entity_id)
          : undefined;
      const obs = r.source_observation_id
        ? this.getObservation(r.source_observation_id)
        : undefined;
      return {
        ...r,
        error_key: e?.error_key,
        element_key: e?.element_key,
        identity_version: e?.identity_version,
        engine_version: obs?.engine_version,
        source_engine_scan_id: obs ? this.get('scans', obs.scan_id)?.engine_scan_id : undefined,
        source_engine_finding_id: obs?.engine_finding_id,
      };
    });
    return { schema_version: '0.1.0', site_id: siteId, exported_at: now(), records };
  }
}

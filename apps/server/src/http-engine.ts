import { z } from 'zod';
import {
  ContractVersionSchema,
  CoverageSchema,
  ErrorEnvelopeSchema,
  JobRequestSchema,
  ScanSessionSchema,
  validateBundle,
  type JobRequest,
  type ScanBundle,
} from '../../../packages/contract/src/index.js';
import { EngineError, type EngineClient, type Job } from './engine.js';

const healthSchema = z.object({
  engine_version: z.string(),
  contract_version: ContractVersionSchema,
  identity_version: z.string().min(1),
  capabilities: z.array(z.string()),
});
const jobSchema = z.object({
  job_id: z.string().min(1),
  request_id: z.string().min(1),
  state: z.enum(['queued', 'running', 'completed', 'failed']),
  queue_position: z.number().nullable(),
  progress: z
    .object({
      phase: z.string(),
      message: z.string().optional(),
      pages_done: z.number().nullable(),
      pages_total: z.number().nullable(),
    })
    .nullable(),
  scan_id: z.string().nullable(),
  error: ErrorEnvelopeSchema.shape.error.nullable(),
  requested_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
const collectionSchema = z.object({
  items: z.array(z.unknown()),
  next_cursor: z.string().nullable(),
});

export class HttpEngine implements EngineClient {
  private readonly origin: string;
  constructor(
    url: string,
    private readonly token: string,
    hosted = false,
  ) {
    const parsed = new URL(url);
    if (parsed.href !== parsed.origin + '/' || !['http:', 'https:'].includes(parsed.protocol))
      throw new Error('ENGINE_URL must be a plain HTTP(S) origin.');
    if (hosted && !parsed.hostname.endsWith('.railway.internal'))
      throw new Error('Hosted ENGINE_URL must use the Railway private service domain.');
    if (token.length < 32) throw new Error('ENGINE_TOKEN must have at least 32 characters.');
    this.origin = parsed.origin;
  }

  private async response(path: string, request?: JobRequest) {
    let res: Response;
    try {
      res = await fetch(this.origin + path, {
        method: request ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(request ? { 'Content-Type': 'application/json' } : {}),
        },
        body: request ? JSON.stringify(request) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new EngineError(
        'engine_connection',
        'The scan engine is temporarily unreachable.',
        503,
        true,
      );
    }
    if (!res.ok) {
      const error = ErrorEnvelopeSchema.safeParse(await res.json().catch(() => null));
      if (error.success) {
        const { code, message, retryable } = error.data.error;
        throw new EngineError(code, message, res.status, retryable);
      }
      throw new EngineError(
        'engine_response',
        `Scan engine returned HTTP ${res.status}.`,
        502,
        res.status >= 500,
      );
    }
    return res;
  }

  private async json(path: string, request?: JobRequest) {
    const res = await this.response(path, request);
    let value: unknown;
    try {
      value = await res.json();
    } catch {
      throw new EngineError(
        'engine_response',
        'The scan engine returned an incomplete response.',
        502,
        true,
      );
    }
    return z.object({ contract_version: ContractVersionSchema, data: z.unknown() }).parse(value);
  }

  async health() {
    return healthSchema.parse((await this.json('/health')).data);
  }

  async submit(request: JobRequest): Promise<Job> {
    return jobSchema.parse((await this.json('/jobs', JobRequestSchema.parse(request))).data);
  }

  async getJob(id: string): Promise<Job> {
    return jobSchema.parse((await this.json(`/jobs/${encodeURIComponent(id)}`)).data);
  }

  async getJobByRequest(id: string): Promise<Job | null> {
    try {
      return jobSchema.parse((await this.json(`/jobs/by-request/${encodeURIComponent(id)}`)).data);
    } catch (error) {
      if (error instanceof EngineError && error.code === 'job_not_found') return null;
      throw error;
    }
  }

  private async list(path: string) {
    const items: unknown[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ limit: '500', ...(cursor ? { cursor } : {}) });
      const page = collectionSchema.parse((await this.json(`${path}?${query}`)).data);
      items.push(...page.items);
      cursor = page.next_cursor;
      if (cursor && seen.has(cursor))
        throw new EngineError(
          'engine_pagination',
          'The scan engine repeated a results cursor.',
          502,
        );
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  }

  async getResult(id: string): Promise<ScanBundle> {
    const base = `/scans/${encodeURIComponent(id)}`;
    const header = await this.json(base);
    const scan = ScanSessionSchema.parse(header.data);
    if (scan.scan_id !== id)
      throw new EngineError('scan_mismatch', 'Scan ID differs from the requested result.', 502);
    const [pages, templates, components, findings, outcomes, coverage] = await Promise.all([
      this.list(base + '/pages'),
      this.list(base + '/templates'),
      this.list(base + '/components'),
      this.list(base + '/findings'),
      this.list(base + '/outcomes'),
      this.json(base + '/coverage'),
    ]);
    const result = validateBundle({
      ...header,
      scan,
      pages,
      templates,
      components,
      findings,
      outcomes,
      coverage: CoverageSchema.parse(coverage.data),
      provenance: {
        kind: 'engine',
        source_scan_ids: scan.source_scan_ids,
        notes: [],
        synthetic_fields: [],
      },
    });
    for (const page of result.pages) {
      page.screenshot_url = page.screenshot_asset_id
        ? '/api/assets/' + encodeURIComponent(page.screenshot_asset_id)
        : null;
    }
    return result;
  }

  screenshot(id: string) {
    return this.binary(`/screenshots/${encodeURIComponent(id)}`, /^image\/(png|jpeg|webp)$/);
  }

  report(scanId: string) {
    return this.binary(`/scans/${encodeURIComponent(scanId)}/report.pdf`, /^application\/pdf$/);
  }

  private async binary(path: string, contentType: RegExp) {
    const res = await this.response(path);
    const type = res.headers.get('content-type') ?? '';
    if (
      !contentType.test(type) ||
      !ContractVersionSchema.safeParse(res.headers.get('x-contract-version')).success
    ) {
      await res.body?.cancel();
      throw new EngineError('engine_media', 'The engine returned incompatible media.', 502);
    }
    return { type, stream: res.body };
  }
}

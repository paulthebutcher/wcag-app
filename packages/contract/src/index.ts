import { z } from 'zod';

export const CONTRACT_VERSION = '0.2.0';
export const FIXTURE_IDENTITY_VERSION = 'fixture-popfly-0.1';
const id = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
const json = z.record(z.unknown());
export const ContractVersionSchema = z.string().regex(/^0\.2\.\d+$/, 'Unsupported contract version; expected 0.2.x');
export const OutcomeSchema = z.enum(['detected', 'not_detected', 'not_checked']);
export const StatusSchema = z.enum(['has_error', 'in_progress', 'fixed', 'not_an_issue']);
export type ErrorStatus = z.infer<typeof StatusSchema>;
export const TargetRefSchema = z.object({ error_key: id, source_scan_id: id, source_finding_id: id });
export type TargetRef = z.infer<typeof TargetRefSchema>;
const options = z.object({ max_pages: z.number().int().min(1).max(50).default(50), tiers: z.array(z.number().int().min(1).max(5)).optional(), model_mode: z.enum(['local_only', 'assisted']).default('local_only'), platform: z.enum(['auto', 'webflow', 'wordpress']).default('auto') });
const requestBase = { request_id: id, site_id: id, site_url: z.string().url(), expected_identity_version: id, options };
export const JobRequestSchema = z.discriminatedUnion('kind', [
  z.object({ ...requestBase, kind: z.literal('full'), pages: z.array(z.string().url()).min(1).max(50).optional(), comparison_refs: z.array(TargetRefSchema).default([]) }),
  z.object({ ...requestBase, kind: z.literal('verify'), targets: z.array(TargetRefSchema).min(1) }),
]);
export type JobRequest = z.infer<typeof JobRequestSchema>;
export const RemediationSchema = z.object({ generic_fix: z.string(), platform_fix: z.object({ platform: z.string(), steps: z.array(z.string()), designer_path: z.string(), generated_by: z.string().optional(), platform_docs_url: z.string().nullable().optional() }).passthrough(), code_fix: z.string().nullable().optional(), estimated_effort: z.enum(['trivial', 'minor', 'moderate', 'significant']) }).passthrough();
export const FindingSchema = z.object({
  finding_id: id, error_key: id, element_key: id, name: id, snapshot_id: id, check_ids: z.array(id).min(1), component_key: id.nullable(), page_key: id,
  criterion: id, level: z.enum(['A', 'AA', 'AAA']), severity: z.enum(['critical', 'major', 'minor', 'advisory']), category: z.string(), failure_type: z.string(), detected_by: z.enum(['axe_core', 'playwright', 'claude_api', 'manual']), triage_bucket: z.enum(['fix_now', 'verify_manually', 'possibly_noisy', 'advisory']),
  confidence: z.object({ score: z.number().min(0).max(1), tier: z.enum(['definitive', 'high', 'moderate', 'needs_review']), basis: z.string(), requires_human: z.boolean(), false_positive_risk: z.enum(['low', 'medium', 'high']) }).passthrough(),
  evidence: z.object({ selector: z.string(), html: z.string(), measured_values: json, aria_attributes: z.record(z.string()), keyboard_sequence: z.array(z.unknown()).nullable(), bbox: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }).nullable() }).passthrough(),
  analysis: z.object({ method: z.string(), reasoning: z.string(), impact: z.string(), affected_users: z.array(z.string()), llm: z.object({ prompt: z.string().nullable(), input: z.string().nullable(), raw_response: z.string().nullable(), model: z.string().nullable(), tokens: z.number().nullable() }).passthrough().nullable() }).passthrough(), remediation: RemediationSchema,
}).passthrough();
export type Finding = z.infer<typeof FindingSchema>;
export const PageSnapshotSchema = z.object({
  snapshot_id: id, page_key: id, requested_url: z.string().url(), url: z.string().url(), title: z.string(), captured_at: timestamp, template_key: id.nullable(), screenshot_asset_id: id.nullable(), screenshot_url: z.string().nullable(), screenshot_dimensions: z.object({ width: z.number().positive(), height: z.number().positive() }).nullable(), screenshot_hash: z.string().nullable(), dom_hash: z.string().nullable(), viewport: z.object({ width: z.number().positive(), height: z.number().positive(), device_scale_factor: z.number().positive() }).nullable(), http_status: z.number().int().nullable(), render_health: z.enum(['healthy', 'degraded', 'failed', 'unknown']), warnings: z.array(z.string()),
}).passthrough();
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
export const TemplateSchema = z.object({ template_key: id, name: z.string(), page_keys: z.array(id), known_pages: z.number().int().nonnegative().nullable(), discovery_scope: z.string(), discovered_at: timestamp.nullable() }).passthrough();
export const ComponentSchema = z.object({ component_key: id, label: z.string(), scope: z.enum(['component', 'global']), criteria: z.array(id), remediation: RemediationSchema }).passthrough();
export const ComparisonOutcomeSchema = z.object({ error_key: id, source_scan_id: id, source_finding_id: id, outcome: OutcomeSchema, reason: z.string().nullable(), check_ids: z.array(id).min(1), evaluated_at: timestamp, snapshot_id: id.nullable(), finding_id: id.nullable() }).superRefine((o, ctx) => {
  if (o.outcome === 'not_checked' && !o.reason) ctx.addIssue({ code: 'custom', message: 'not_checked requires a reason' });
  if (o.outcome === 'detected' && (!o.finding_id || !o.snapshot_id)) ctx.addIssue({ code: 'custom', message: 'detected requires a finding and snapshot' });
  if (o.outcome !== 'detected' && o.finding_id) ctx.addIssue({ code: 'custom', message: 'Only detected has a finding_id' });
  if (o.outcome === 'not_detected' && !o.snapshot_id) ctx.addIssue({ code: 'custom', message: 'not_detected requires a successful capture' });
});
export type ComparisonOutcome = z.infer<typeof ComparisonOutcomeSchema>;
const exclusion = z.object({ url: z.string(), reason: z.string(), source: z.string().optional() }).passthrough();
const discovery = z.object({ sitemap_count: z.number().int().nonnegative().nullable(), budget: z.number().int().positive(), reason: z.string().nullable() });
export const CoverageSchema = z.object({ scan_id: id, requested_urls: z.array(z.string()).nullable(), attempted_urls: z.array(z.string()), captured_urls: z.array(z.string()), entries: z.array(z.object({ page_key: id, page_url: z.string(), check: id, status: z.enum(['ran', 'partial', 'failed', 'skipped', 'not_recorded']), reason: z.string().nullable() })), crawl_failures: z.array(z.object({ url: z.string(), reason: z.string() })), render_failures: z.array(z.object({ url: z.string(), reason: z.string() })), exclusions: z.array(exclusion), discovery });
export type Coverage = z.infer<typeof CoverageSchema>;
export const ScanSessionSchema = z.object({ scan_id: id, site_url: z.string().url(), platform: z.string(), kind: z.enum(['full', 'verify']), source_scan_ids: z.array(id), requested_at: timestamp, started_at: timestamp, completed_at: timestamp, engine_version: id, identity_version: id, detection_manifest: json, resolved_options: json, requested_urls: z.array(z.string()).nullable(), attempted_urls: z.array(z.string()), captured_urls: z.array(z.string()), excluded_urls: z.array(exclusion), discovery, timings: json.nullable(), model_usage: json.nullable(), report: z.object({ available: z.boolean(), reason: z.string().nullable() }) }).passthrough();
export const ProvenanceSchema = z.object({ kind: z.enum(['legacy_fixture', 'synthetic_fixture', 'engine']), source_scan_ids: z.array(id), notes: z.array(z.string()), synthetic_fields: z.array(z.string()) });
export const ScanBundleSchema = z.object({ contract_version: ContractVersionSchema, scan: ScanSessionSchema, pages: z.array(PageSnapshotSchema), templates: z.array(TemplateSchema), components: z.array(ComponentSchema), findings: z.array(FindingSchema), outcomes: z.array(ComparisonOutcomeSchema), coverage: CoverageSchema, provenance: ProvenanceSchema });
export type ScanBundle = z.infer<typeof ScanBundleSchema>;
export function envelope<T extends z.ZodTypeAny>(schema: T) { return z.object({ contract_version: ContractVersionSchema, data: schema }); }
export function collection<T extends z.ZodTypeAny>(schema: T) { return envelope(z.object({ items: z.array(schema), next_cursor: z.string().nullable() })); }
export const ErrorEnvelopeSchema = z.object({ contract_version: ContractVersionSchema, error: z.object({ code: id, message: z.string(), retryable: z.boolean(), details: z.unknown().optional() }) });

/** Validate relationships and coverage, not merely shape. App ingest must call this. */
export function validateBundle(input: unknown, options: { expectedIdentityVersion?: string; targets?: TargetRef[] } = {}): ScanBundle {
  const b = ScanBundleSchema.parse(input);
  const fail: (message: string) => never = (message) => { throw new Error(`Invalid scan bundle: ${message}`); };
  if (options.expectedIdentityVersion && b.scan.identity_version !== options.expectedIdentityVersion) fail('incompatible identity version');
  const unique = <T>(values: T[], key: (v: T) => string, name: string) => { const keys = values.map(key); if (new Set(keys).size !== keys.length) fail(`duplicate ${name}`); };
  unique(b.pages, p => p.snapshot_id, 'snapshot'); unique(b.pages, p => p.page_key, 'page'); unique(b.findings, f => f.error_key, 'error_key'); unique(b.findings, f => f.finding_id, 'finding'); unique(b.outcomes, o => o.error_key, 'outcome'); unique(b.components, c => c.component_key, 'component'); unique(b.templates, t => t.template_key, 'template');
  const snapshots = new Map(b.pages.map(p => [p.snapshot_id, p])); const pages = new Map(b.pages.map(p => [p.page_key, p])); const components = new Set(b.components.map(c => c.component_key)); const templates = new Set(b.templates.map(t => t.template_key)); const findings = new Map(b.findings.map(f => [f.finding_id, f]));
  for (const p of b.pages) if (p.template_key && !templates.has(p.template_key)) fail('page references missing template');
  for (const t of b.templates) for (const k of t.page_keys) if (!pages.has(k)) fail('template references missing page');
  for (const f of b.findings) {
    if (!pages.has(f.page_key) || snapshots.get(f.snapshot_id)?.page_key !== f.page_key) fail('finding references missing or inconsistent snapshot');
    if (f.component_key && !components.has(f.component_key)) fail('finding references missing component');
  }
  if (b.coverage.scan_id !== b.scan.scan_id) fail('coverage scan differs');
  unique(b.coverage.entries, e => `${e.page_key}\u0000${e.check}`, 'coverage page/check');
  const sameSet = (a: string[], c: string[]) => a.length === new Set(a).size && c.length === new Set(c).size && a.length === c.length && a.every(k => c.includes(k));
  if (!sameSet(b.coverage.captured_urls, b.pages.map(p => p.url)) || !sameSet(b.scan.captured_urls, b.coverage.captured_urls)) fail('captured scope differs from page snapshots');
  if (!sameSet(b.scan.attempted_urls, b.coverage.attempted_urls)) fail('attempted scope differs');
  if (b.coverage.captured_urls.some(url => !b.coverage.attempted_urls.includes(url))) fail('captured page outside attempted scope');
  for (const e of b.coverage.entries) {
    const p = pages.get(e.page_key);
    if (!p || p.url !== e.page_url) fail('coverage references inconsistent page');
    if (e.status !== 'ran' && !e.reason) fail('incomplete check needs a reason');
  }

  for (const o of b.outcomes) {
    const p = o.snapshot_id ? snapshots.get(o.snapshot_id) : undefined;
    if (o.snapshot_id && !p) fail('outcome references missing snapshot');
    if (o.outcome === 'detected') {
      const f = findings.get(o.finding_id!);
      if (!f || f.error_key !== o.error_key || f.snapshot_id !== o.snapshot_id) fail('outcome conflicts with detected finding');
    } else if (b.findings.some(f => f.error_key === o.error_key)) fail('absent/unchecked outcome conflicts with detected finding');
    if (o.outcome === 'not_detected') {
      if (!p || p.render_health !== 'healthy' || (p.http_status !== null && (p.http_status < 200 || p.http_status >= 400)) || b.coverage.crawl_failures.some(f => f.url === p.url) || b.coverage.render_failures.some(f => f.url === p.url) || !b.coverage.captured_urls.includes(p.url)) fail('absence without healthy captured page');
      if (!o.check_ids.every(check => b.coverage.entries.some(e => e.page_key === p.page_key && e.check === check && e.status === 'ran'))) fail('absence without complete relevant coverage');
    }
  }
  if (options.targets) {
    for (const target of options.targets) {
      const o = b.outcomes.find(o => o.error_key === target.error_key);
      if (!o) fail('missing requested outcome');
      if (o.source_scan_id !== target.source_scan_id || o.source_finding_id !== target.source_finding_id) fail('outcome source differs from request');
    }
  }
  return b;
}

const LegacyScanSchema = z.object({ contract_version: z.string().regex(/^0\.1\./), scan: z.object({ scan_id: id, site_url: z.string().url(), platform: z.string(), started_at: timestamp, completed_at: timestamp, kind: z.enum(['full', 'verify']), baseline_scan_id: id.nullable(), engine_version: id, detection_manifest: json, excluded_pages: z.array(z.object({ url: z.string(), reason: z.string().optional(), source: z.string().optional() }).passthrough()) }), pages: z.array(z.object({ page_key: id, url: z.string().url(), title: z.string(), captured_at: timestamp, screenshot_url: z.string(), template_key: id.nullable() })), templates: z.array(z.object({ template_key: id, name: z.string(), page_keys: z.array(id), known_pages: z.number() })).optional(), components: z.array(z.object({ component_key: id, label: z.string(), scope: z.enum(['component', 'global']), criterion: id, remediation: RemediationSchema })).optional(), findings: z.array(FindingSchema.omit({ name: true, element_key: true, snapshot_id: true, check_ids: true })), verify: z.array(z.object({ error_key: id, outcome: OutcomeSchema, reason: z.string().nullable() })).optional() });

/** Offline fixture adapter only. No production identity is computed here. */
export function adaptLegacy(baselineInput: unknown, verifyInput?: unknown): ScanBundle {
  const baseline = LegacyScanSchema.parse(baselineInput); const legacy = verifyInput ? LegacyScanSchema.parse(verifyInput) : baseline;
  const simulated = !!verifyInput;
  const sid = legacy.scan.scan_id;
  const disc = { sitemap_count: null, budget: 50, reason: 'Original discovery totals were not exported.' };
  const pages: PageSnapshot[] = legacy.pages.map(p => {
    const asset = p.screenshot_url.replace(/^\/screenshots\//, '').replaceAll('/', '-');
    return { ...p, snapshot_id: `${sid}:${p.page_key}`, requested_url: p.url, screenshot_asset_id: asset, screenshot_url: `/api/assets/${asset}`, screenshot_dimensions: null, screenshot_hash: null, dom_hash: null, viewport: null, http_status: null, render_health: simulated ? 'healthy' : 'unknown', warnings: [simulated ? 'Capture health is synthetic for the labeled verification scenario.' : 'Capture metadata not recorded in this legacy export.'] };
  });
  const pageMap = new Map(pages.map(p => [p.page_key, p]));
  const checkIds = (f: { error_key: string }) => [`fixture-check:${f.error_key}`];
  const findings = legacy.findings.map(f => ({ ...f, name: f.failure_type.replaceAll('_', ' ').replaceAll('-', ' ').replace(/^./, c => c.toUpperCase()), element_key: `fixture-element:${f.error_key}`, snapshot_id: pageMap.get(f.page_key)!.snapshot_id, check_ids: checkIds(f) }));
  const outcomes: ComparisonOutcome[] = (legacy.verify ?? []).map(o => {
    const source = baseline.findings.find(f => f.error_key === o.error_key); if (!source) throw new Error('Legacy outcome has no baseline subject');
    const matched = findings.find(f => f.error_key === o.error_key); const p = pageMap.get(source.page_key);
    return { ...o, source_scan_id: baseline.scan.scan_id, source_finding_id: source.finding_id, check_ids: checkIds(source), evaluated_at: legacy.scan.completed_at, snapshot_id: p?.snapshot_id ?? null, finding_id: matched?.finding_id ?? null };
  });
  const urls = pages.map(p => p.url);
  const excluded = legacy.scan.excluded_pages.map(e => ({ ...e, reason: e.reason ?? e.source ?? 'Reason not recorded' }));
  const entries: Coverage['entries'] = outcomes.length ? outcomes.flatMap(o => {
    const source = baseline.findings.find(f => f.error_key === o.error_key)!; const p = pageMap.get(source.page_key); if (!p) return [];
    return o.check_ids.map(check => ({ page_key: p.page_key, page_url: p.url, check, status: o.outcome === 'not_checked' ? 'skipped' as const : 'ran' as const, reason: o.reason ?? 'Synthetic coverage for legacy scenario outcome.' }));
  }) : findings.map(f => ({ page_key: f.page_key, page_url: pageMap.get(f.page_key)!.url, check: f.check_ids[0], status: 'not_recorded' as const, reason: 'Baseline coverage was not exported.' }));
  return validateBundle({ contract_version: CONTRACT_VERSION, scan: { ...legacy.scan, identity_version: FIXTURE_IDENTITY_VERSION, source_scan_ids: simulated ? [baseline.scan.scan_id] : [], requested_at: legacy.scan.started_at, resolved_options: { max_pages: 50, model_mode: 'historical_unknown' }, requested_urls: null, attempted_urls: urls, captured_urls: urls, excluded_urls: excluded, discovery: disc, timings: null, model_usage: null, report: { available: false, reason: 'No engine PDF is bundled with this sample.' } }, pages,
    templates: (baseline.templates ?? []).filter(t => pages.some(p => p.template_key === t.template_key)).map(t => ({ ...t, page_keys: t.page_keys.filter(k => pageMap.has(k)), known_pages: null, discovery_scope: 'provisional fixture subset', discovered_at: null })),
    components: (baseline.components ?? []).filter(c => findings.some(f => f.component_key === c.component_key)).map(c => ({ ...c, criteria: [c.criterion] })), findings, outcomes,
    coverage: { scan_id: sid, requested_urls: null, attempted_urls: urls, captured_urls: urls, entries, crawl_failures: [], render_failures: [], exclusions: excluded, discovery: disc },
    provenance: { kind: simulated ? 'synthetic_fixture' : 'legacy_fixture', source_scan_ids: [sid], notes: ['Keys and template membership are provisional source-fixture data.', 'Model traces may be truncated by the original fixture generator.', simulated ? 'Verification outcomes and complete coverage are a labeled simulation, not proof of historical absence.' : 'Historical baseline coverage is not recorded.'], synthetic_fields: ['finding.name', 'finding.element_key', 'finding.snapshot_id', 'finding.check_ids', ...(simulated ? ['outcomes', 'coverage.entries', 'pages.render_health'] : [])] },
  });
}

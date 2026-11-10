import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adaptLegacy, collection, ContractVersionSchema, FindingSchema, validateBundle, type ScanBundle } from './index.js';
const root = resolve(import.meta.dirname, '../../..');
const raw = (name: string) => JSON.parse(readFileSync(resolve(root, 'contract/fixtures/popfly-sample', name), 'utf8'));
const baseline = adaptLegacy(raw('scan-baseline.json'));
const verify = adaptLegacy(raw('scan-baseline.json'), raw('scan-verify.json'));
describe('versioned fixture contract', () => {
  it('adapts both legacy fixtures without inventing historical coverage', () => {
    expect(baseline.findings).toHaveLength(70); expect(baseline.pages).toHaveLength(10); expect(baseline.components).toHaveLength(10); expect(baseline.templates).toHaveLength(3);
    expect(baseline.coverage.entries.every(e => e.status === 'not_recorded')).toBe(true);
    expect(baseline.templates.every(t => t.known_pages === null)).toBe(true);
    expect(verify.provenance.kind).toBe('synthetic_fixture');
    expect(verify.outcomes.filter(o => o.outcome === 'not_detected')).toHaveLength(18);
    expect(verify.outcomes.filter(o => o.outcome === 'not_checked')).toHaveLength(37);
  });
  it('allows a compatible patch and rejects a different minor or major', () => {
    expect(ContractVersionSchema.parse('0.2.9')).toBe('0.2.9');
    for (const version of ['0.1.0','0.3.0','1.2.0','0.2.0-unknown']) expect(() => ContractVersionSchema.parse(version)).toThrow();
    expect(() => validateBundle(baseline, { expectedIdentityVersion: 'another-namespace' })).toThrow(/identity/);
  });
  it('validates pagination envelopes', () => {
    expect(collection(FindingSchema).parse({ contract_version:'0.2.0',data:{items:[],next_cursor:null}}).data.items).toEqual([]);
    expect(() => collection(FindingSchema).parse({contract_version:'0.2.0',data:{items:[]}})).toThrow();
  });
  it.each(['failed','partial','skipped','not_recorded'] as const)('never accepts absence with %s coverage', status => {
    const b = structuredClone(verify); const absent = b.outcomes.find(o => o.outcome === 'not_detected')!;
    const entry = b.coverage.entries.find(e => e.check === absent.check_ids[0])!; entry.status = status;
    expect(() => validateBundle(b)).toThrow(/coverage/);
  });
  it('rejects conflicting duplicated coverage even if the first record ran', () => {
    const b = structuredClone(verify); const absent = b.outcomes.find(o => o.outcome === 'not_detected')!;
    const entry = b.coverage.entries.find(e => e.check === absent.check_ids[0])!;
    b.coverage.entries.push({...entry,status:'failed',reason:'check crashed'});
    expect(() => validateBundle(b)).toThrow(/duplicate coverage/);
  });
  it('rejects missing requested outcomes and source mismatches', () => {
    const o = verify.outcomes[0];
    expect(() => validateBundle(verify,{targets:[{error_key:'missing',source_scan_id:o.source_scan_id,source_finding_id:o.source_finding_id}]})).toThrow(/missing requested/);
    expect(() => validateBundle(verify,{targets:[{...o,source_scan_id:'wrong'}]})).toThrow(/source differs/);
  });
  it.each([
    (b: ScanBundle) => { b.findings[0].snapshot_id='missing'; },
    (b: ScanBundle) => { b.findings[0].component_key='missing'; },
    (b: ScanBundle) => { b.findings.push(b.findings[0]); },
    (b: ScanBundle) => { b.coverage.captured_urls=[]; },
    (b: ScanBundle) => { b.coverage.entries[0].page_url='https://other.example'; },
    (b: ScanBundle) => { const o=b.outcomes.find(o=>o.outcome==='not_detected')!; b.pages.find(p=>p.snapshot_id===o.snapshot_id)!.render_health='failed'; },
  ])('rejects malformed references and capture scope', mutate => {
    const b=structuredClone(verify); mutate(b); expect(()=>validateBundle(b)).toThrow();
  });
});

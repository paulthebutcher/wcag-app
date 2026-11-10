import { afterEach, describe, expect, it, vi } from 'vitest';
import { filteredEntities, resolveSource, type Workspace } from './lib';
const w: Workspace = {
  site: { id: 'popfly' },
  pages: [
    { id: 'page-a', template_id: 'template', url: 'https://a.test' },
    { id: 'page-b', url: 'https://b.test' },
  ],
  components: [{ id: 'group' }],
  templates: [{ id: 'template', known_pages: 3 }],
  scans: [],
  notes: [],
  reviews: [],
  events: [],
  errors: [
    {
      id: 'a',
      name: 'First',
      page_id: 'page-a',
      component_id: 'group',
      criterion: '1.4.3',
      status: 'has_error',
    },
    { id: 'b', name: 'Second', page_id: 'page-b', criterion: '1.1.1', status: 'has_error' },
    {
      id: 'c',
      name: 'Third',
      page_id: 'page-a',
      component_id: 'group',
      criterion: '1.1.1',
      status: 'fixed',
      status_changed_at: '2026-11-01',
    },
  ],
};
describe('list context and filters', () => {
  it('resolves filtered members when opening an error from a page tab', () => {
    const result = resolveSource(
      w,
      '/sites/popfly/pages/page-a?tab=errors&status=has_error',
      'errors',
    );
    expect(result.resultKind).toBe('errors');
    expect(result.rows.map((x) => x.id)).toEqual(['a']);
  });
  it('rejects normalized cross-site return URLs', () => {
    expect(resolveSource(w, '/sites/popfly/../other/errors', 'errors').from).toBe(
      '/sites/popfly/errors',
    );
  });
  it('filters template coverage using distinct captured members', () => {
    expect(
      filteredEntities(w, 'templates', w.templates, new URLSearchParams('sampled=sampled')),
    ).toHaveLength(1);
    expect(
      filteredEntities(w, 'templates', w.templates, new URLSearchParams('sampled=fully_scanned')),
    ).toHaveLength(0);
  });
  it('requires the same member to satisfy criterion and status', () => {
    const rows = [{ id: 'group', status: 'has_error' }];
    expect(
      filteredEntities(
        w,
        'components',
        rows,
        new URLSearchParams('status=has_error&criterion=1.1.1'),
      ),
    ).toHaveLength(0);
    expect(
      filteredEntities(
        w,
        'components',
        rows,
        new URLSearchParams('status=has_error&criterion=1.4.3'),
      ),
    ).toHaveLength(1);
  });
});
afterEach(() => vi.unstubAllGlobals());
it('refreshes an expired local session while preserving the mutation id', async () => {
  vi.resetModules();
  const bodies: string[] = [];
  let sessions = 0,
    writes = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/session')
        return new Response(JSON.stringify({ token: `token${++sessions}` }));
      bodies.push(opts?.body as string);
      writes++;
      return new Response(
        JSON.stringify(
          writes === 1
            ? { error: { message: 'Missing or invalid local session token' } }
            : { saved: true },
        ),
        { status: writes === 1 ? 403 : 200 },
      );
    }),
  );
  const { api } = await import('./lib');
  expect(await api('/test', { status: 'in_progress' })).toEqual({ saved: true });
  expect(sessions).toBe(2);
  expect(bodies[0]).toBe(bodies[1]);
});

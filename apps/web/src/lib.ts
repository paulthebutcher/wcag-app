export type Entity = {
  id: string;
  name?: string;
  title?: string;
  url?: string;
  status?: string;
  [key: string]: any;
};
export type Workspace = {
  site: Entity;
  errors: Entity[];
  pages: Entity[];
  templates: Entity[];
  components: Entity[];
  scans: Entity[];
  notes: Entity[];
  reviews: Entity[];
  events: Entity[];
};
let token: string | undefined;
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const payload =
    body === undefined
      ? undefined
      : JSON.stringify({
          ...(body as object),
          request_id: (body as any)?.request_id ?? crypto.randomUUID(),
        });
  async function obtainToken() {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error('Could not connect to local server');
    token = (await response.json()).token;
  }
  if (payload && !token) await obtainToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('/api' + path, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json', 'x-session-token': token! } : {},
      body: payload,
    });
    const value = await response.json();
    const message =
      value.error?.message ??
      (typeof value.error === 'string' ? value.error : undefined) ??
      value.message ??
      'The request could not be completed.';
    if (response.status === 403 && payload && attempt === 0 && message.includes('session token')) {
      await obtainToken();
      continue;
    }
    if (!response.ok) throw new Error(message);
    return value;
  }
  throw new Error('Could not recover the local session.');
}
export const labels: Record<string, string> = {
  has_error: 'Has error',
  in_progress: 'In progress',
  fixed: 'Fixed',
  not_an_issue: 'Not an issue',
  no_issues: 'No issues detected',
  not_checked: 'Not checked',
  not_detected: 'No longer detected',
  detected: 'Detected',
  still_detected: 'Still detected',
  new: 'New',
  reopened: 'Reopened',
  no_change: 'No change',
  full: 'Full scan',
  verify: 'Verify scan',
};
export const label = (s: string) =>
  labels[s] ?? s.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
export const criteria: Record<string, string> = {
  '1.1.1': 'Non-text Content',
  '1.3.1': 'Info and Relationships',
  '1.3.2': 'Meaningful Sequence',
  '1.3.3': 'Sensory Characteristics',
  '1.4.1': 'Use of Color',
  '1.4.3': 'Contrast (Minimum)',
  '1.4.4': 'Resize Text',
  '1.4.5': 'Images of Text',
  '1.4.10': 'Reflow',
  '1.4.11': 'Non-text Contrast',
  '2.1.1': 'Keyboard',
  '2.1.2': 'No Keyboard Trap',
  '2.4.1': 'Bypass Blocks',
  '2.4.2': 'Page Titled',
  '2.4.3': 'Focus Order',
  '2.4.4': 'Link Purpose (In Context)',
  '2.4.5': 'Multiple Ways',
  '2.4.6': 'Headings and Labels',
  '2.4.7': 'Focus Visible',
  '3.1.1': 'Language of Page',
  '3.2.3': 'Consistent Navigation',
  '3.3.1': 'Error Identification',
  '3.3.2': 'Labels or Instructions',
  '4.1.1': 'Parsing',
  '4.1.2': 'Name, Role, Value',
  '4.1.3': 'Status Messages',
};
export function formattedDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return 'Not recorded';
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(d);
  const get = (name: string) => parts.find((p) => p.type === name)?.value ?? '';
  return `${get('month').toUpperCase()} ${get('day')} ${get('year')} - ${get('hour')}:${get('minute')}:${get('second')} ${get('timeZoneName')}`;
}
export function memberErrors(w: Workspace, kind: string, e: Entity) {
  if (kind === 'errors') return [e];
  if (kind === 'components') return w.errors.filter((x) => x.component_id === e.id);
  if (kind === 'pages') return w.errors.filter((x) => x.page_id === e.id);
  if (kind === 'templates') {
    const pages = new Set(w.pages.filter((p) => p.template_id === e.id).map((p) => p.id));
    return w.errors.filter((x) => pages.has(x.page_id));
  }
  return [];
}
export function errorName(e: Entity) {
  return (
    e.name ??
    e.finding?.name ??
    e.finding?.failure_type?.replaceAll('_', ' ') ??
    'Accessibility error'
  );
}
export function entityName(e: Entity, kind: string) {
  return kind === 'scans'
    ? `${label(e.kind ?? 'full')} · ${formattedDate(e.requested_at ?? e.started_at)}`
    : kind === 'errors'
      ? errorName(e)
      : (e.name ?? e.title ?? e.url ?? 'Untitled');
}
export function statusOf(e: Entity) {
  return e.status ?? 'no_issues';
}
export function rollup(errors: Entity[]) {
  if (!errors.length) return 'no_issues';
  if (errors.some((e) => e.status === 'in_progress')) return 'in_progress';
  if (errors.some((e) => e.status === 'has_error')) return 'has_error';
  return errors.every((e) => e.status === 'not_an_issue') ? 'not_an_issue' : 'fixed';
}
export function normalizeWorkspace(w: Workspace) {
  for (const kind of ['pages', 'components', 'templates'] as const) {
    w[kind] = w[kind].map((e) => {
      const members = memberErrors(w, kind, e);
      return {
        ...e,
        status: rollup(members),
        open_errors: members.filter((x) => ['has_error', 'in_progress'].includes(x.status!)).length,
        criteria: [...new Set(members.map((x) => x.criterion ?? x.finding?.criterion))].filter(
          Boolean,
        ),
        last_captured_at:
          e.last_captured_at ??
          members
            .map((x) => x.last_captured_at)
            .filter(Boolean)
            .sort()
            .at(-1),
        pages_affected: new Set(members.map((x) => x.page_id)).size,
      };
    });
  }
  return w;
}
export function filteredEntities(
  w: Workspace,
  kind: string,
  rows: Entity[],
  params: URLSearchParams,
) {
  const values = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  const statuses = values('status'),
    cs = values('criterion');
  const selected = rows.filter((e) => {
    const members = memberErrors(w, kind, e);
    if (statuses.length && !statuses.includes(statusOf(e))) return false;
    if (
      cs.length &&
      !members.some(
        (x) =>
          cs.includes(x.criterion ?? x.finding?.criterion) &&
          (!statuses.length || statuses.includes(x.status!)),
      )
    )
      return false;
    const reviewed = params.get('reviewed');
    if (reviewed === 'reviewed' && !e.reviewed) return false;
    if (reviewed === 'not_reviewed' && e.reviewed) return false;
    if (reviewed === 'changed' && !e.changed_since_review) return false;
    if (params.get('scope') && e.scope !== params.get('scope')) return false;
    if (params.get('kind') && e.kind !== params.get('kind')) return false;
    if (params.get('grouped') === 'grouped' && !e.component_id) return false;
    if (params.get('grouped') === 'ungrouped' && e.component_id) return false;
    if (params.get('notes') === 'has_notes' && !e.notes_count) return false;
    if (params.get('notes') === 'no_notes' && e.notes_count) return false;
    if (params.get('outcome') && !(e.summary?.[params.get('outcome')!] > 0)) return false;
    if (kind === 'templates' && params.get('sampled')) {
      const count = w.pages.filter((p) => p.template_id === e.id).length;
      const state =
        count === 0
          ? 'not_scanned'
          : e.known_pages == null
            ? 'unknown'
            : count < e.known_pages
              ? 'sampled'
              : 'fully_scanned';
      if (state !== params.get('sampled')) return false;
    }
    if (kind === 'scans') {
      const date = new Date(e.requested_at ?? e.started_at).getTime();
      if (
        params.get('from_date') &&
        date < new Date(params.get('from_date')! + 'T00:00:00').getTime()
      )
        return false;
      if (
        params.get('to_date') &&
        date > new Date(params.get('to_date')! + 'T23:59:59.999').getTime()
      )
        return false;
    }
    return true;
  });
  const rank = ['in_progress', 'has_error', 'fixed', 'not_an_issue', 'no_issues'];
  return selected.sort((a, b) => {
    if (kind === 'scans')
      return String(b.requested_at ?? b.started_at).localeCompare(a.requested_at ?? a.started_at);
    const sr = rank.indexOf(statusOf(a)) - rank.indexOf(statusOf(b));
    if (sr) return sr;
    if (kind === 'errors') {
      const ap = w.pages.find((p) => p.id === a.page_id)?.url ?? '',
        bp = w.pages.find((p) => p.id === b.page_id)?.url ?? '';
      return (
        ap.localeCompare(bp) ||
        String(a.criterion).localeCompare(String(b.criterion), undefined, { numeric: true }) ||
        entityName(a, kind).localeCompare(entityName(b, kind)) ||
        a.id.localeCompare(b.id)
      );
    }
    if (a.status === 'fixed') {
      const latest = (e: Entity) =>
        memberErrors(w, kind, e)
          .filter((x) => x.status === 'fixed')
          .map((x) => x.status_changed_at ?? '')
          .sort()
          .at(-1) ?? '';
      const diff = latest(b).localeCompare(latest(a));
      if (diff) return diff;
    }
    return (
      Number(b.open_errors ?? 0) - Number(a.open_errors ?? 0) ||
      Number(b.pages_affected ?? 0) - Number(a.pages_affected ?? 0) ||
      entityName(a, kind).localeCompare(entityName(b, kind)) ||
      a.id.localeCompare(b.id)
    );
  });
}

export function resolveSource(w: Workspace, raw: string | null, currentKind: string) {
  const base = `/sites/${w.site.id}`;
  let url = new URL(`${base}/${currentKind}`, 'http://localhost');
  if (raw) {
    try {
      const candidate = new URL(raw, 'http://localhost');
      if (
        candidate.origin === 'http://localhost' &&
        candidate.pathname.startsWith(base + '/') &&
        !candidate.searchParams.has('from')
      )
        url = candidate;
    } catch {}
  }
  const parts = url.pathname.split('/');
  const parentKind = parts[3];
  const parent = kindsForSource.includes(parentKind)
    ? (w as any)[parentKind].find((e: Entity) => e.id === parts[4])
    : undefined;
  let resultKind = parentKind,
    rows: Entity[] = kindsForSource.includes(parentKind) ? (w as any)[parentKind] : [];
  if (parent) {
    const tab = url.searchParams.get('tab');
    const members = memberErrors(w, parentKind, parent);
    if (tab === 'changes' && parentKind === 'scans') {
      resultKind = 'errors';
      rows = (parent.changes ?? [])
        .filter(
          (c: Entity) =>
            !url.searchParams.get('outcome') || c.category === url.searchParams.get('outcome'),
        )
        .map((c: Entity) => w.errors.find((e) => e.id === c.error_id))
        .filter(Boolean);
    } else if (tab === 'errors') {
      resultKind = 'errors';
      rows = members;
    } else if (tab === 'pages') {
      resultKind = 'pages';
      rows = w.pages.filter((p) =>
        parentKind === 'templates'
          ? p.template_id === parent.id
          : members.some((e) => e.page_id === p.id),
      );
    } else if (tab === 'components') {
      resultKind = 'components';
      rows = w.components.filter((c) => members.some((e) => e.component_id === c.id));
    } else if (tab === 'templates') {
      resultKind = 'templates';
      rows = w.templates.filter((t) =>
        w.pages.some((p) => p.template_id === t.id && members.some((e) => e.page_id === p.id)),
      );
    } else rows = [];
  }
  const params = new URLSearchParams(url.searchParams);
  if (parentKind === 'scans') params.delete('outcome');
  return {
    from: url.pathname + url.search,
    resultKind,
    rows: parentKind === 'scans' && parent ? rows : filteredEntities(w, resultKind, rows, params),
    parent,
  };
}
const kindsForSource = ['errors', 'components', 'templates', 'pages', 'scans'];

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import {
  Accessibility,
  LayoutDashboard,
  Layers3,
  PanelsTopLeft,
  Files,
  CircleAlert,
  ScanLine,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Plus,
  Download,
  ExternalLink,
  MessageSquare,
  History,
  Code2,
  Play,
  LoaderCircle,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  CircleDot,
  Globe,
  Clock3,
  FolderOpen,
  CircleCheck,
  Info,
  RefreshCw,
} from 'lucide-react';
import { Button, Dialog, Tooltip, TooltipProvider, cn } from './components/ui/primitives';
import {
  api,
  type Entity,
  type Workspace,
  label,
  criteria,
  formattedDate,
  memberErrors,
  entityName,
  filteredEntities,
  normalizeWorkspace,
  resolveSource,
} from './lib';
import './styles.css';
const kinds = ['components', 'templates', 'pages', 'errors', 'scans'];
const kindNames: Record<string, string> = {
  components: 'Components & Global',
  templates: 'Templates',
  pages: 'Pages',
  errors: 'Errors',
  scans: 'Scans',
};
const singular: Record<string, string> = {
  components: 'component',
  templates: 'template',
  pages: 'page',
  errors: 'error',
  scans: 'scan',
};
const iconMap: Record<string, React.ElementType> = {
  overview: LayoutDashboard,
  components: Layers3,
  templates: PanelsTopLeft,
  pages: Files,
  errors: CircleAlert,
  scans: ScanLine,
};
function DateStamp({ value }: { value?: string | null }) {
  return value ? <time dateTime={value}>{formattedDate(value)}</time> : <span>Not recorded</span>;
}
function Status({ status }: { status?: string }) {
  return (
    <span className={cn('status', `status-${status ?? 'no_issues'}`)}>
      <span aria-hidden="true" />
      {label(status ?? 'no_issues')}
    </span>
  );
}
function Reviewed({ entity }: { entity: Entity }) {
  return entity.reviewed ? (
    <span className="reviewed">
      <CheckCheck size={14} />
      {entity.changed_since_review ? 'Changed since review' : 'Reviewed'}
    </span>
  ) : (
    <span className="muted">Not reviewed</span>
  );
}
function Criterion({ value }: { value: string }) {
  return (
    <Tooltip text={criteria[value] ?? 'WCAG success criterion'}>
      <span className="criterion" tabIndex={0}>
        {value}
      </span>
    </Tooltip>
  );
}
function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('panel', className)}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
function Empty({
  title = 'Nothing here yet',
  text = 'Results will appear here after a scan.',
  children,
}: {
  title?: string;
  text?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function App() {
  const location = useLocation(),
    navigate = useNavigate();
  const segments = location.pathname.split('/').filter(Boolean);
  const siteId = segments[1],
    kind = kinds.includes(segments[2]) ? segments[2] : 'overview',
    id = kinds.includes(segments[2]) ? segments[3] : undefined;
  const [sites, setSites] = useState<Entity[]>([]),
    [mode, setMode] = useState<'disabled' | 'fixture'>('disabled'),
    [workspace, setWorkspace] = useState<Workspace | null>(null),
    [loadError, setLoadError] = useState(''),
    [message, setMessage] = useState(''),
    [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const requestGeneration = useRef(0);
  async function refresh() {
    if (!siteId || siteId === 'new') return;
    const generation = ++requestGeneration.current;
    try {
      const w = normalizeWorkspace(await api<Workspace>(`/sites/${siteId}/workspace`));
      if (generation === requestGeneration.current) {
        setWorkspace(w);
        setLoadError('');
      }
    } catch (e) {
      if (generation === requestGeneration.current) setLoadError((e as Error).message);
    }
  }
  useEffect(() => {
    Promise.all([api<Entity[]>('/sites'), api<{ mode: 'disabled' | 'fixture' }>('/health')])
      .then(([s, health]) => {
        setMode(health.mode);
        setSites(s);
        if (location.pathname === '/')
          navigate(s[0] ? `/sites/${s[0].id}` : '/sites/new', { replace: true });
      })
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    setWorkspace(null);
    setActionError('');
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearInterval(timer);
      requestGeneration.current++;
    };
  }, [siteId]);
  useEffect(() => {
    setMobile(false);
    setActionError('');
    const key = sessionStorage.getItem('wcag-return-focus');
    if (key && location.pathname === key.split('|')[0]) {
      requestAnimationFrame(() => {
        const row = document.getElementById(key.split('|')[1]);
        if (row) row.focus();
        else {
          const heading = document.querySelector<HTMLElement>('#main h1');
          heading?.setAttribute('tabindex', '-1');
          heading?.focus();
          setMessage('This item no longer matches the list.');
        }
      });
      sessionStorage.removeItem('wcag-return-focus');
    }
  }, [location.pathname, location.search]);
  async function action(path: string, body: object = {}, success = 'Saved') {
    setBusy(true);
    setActionError('');
    try {
      const value = await api(`/sites/${siteId}${path}`, body);
      await refresh();
      setMessage(success);
      return value;
    } catch (e) {
      setActionError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const scanAvailable = mode === 'fixture';
  const active = workspace?.scans.find((s) => ['queued', 'running'].includes(s.state));
  const waiting = workspace?.errors.filter((e) => e.status === 'in_progress').length ?? 0;
  const side = (
    <>
      <Link className="brand" to={siteId && siteId !== 'new' ? `/sites/${siteId}` : '/'}>
        <span className="brand-mark">
          <Accessibility size={23} />
        </span>
        <span>
          WCAG<span className="brand-small">WORKSPACE</span>
        </span>
      </Link>
      <div className="site-label">WORKING SITE</div>
      <label className="sr-only" htmlFor="site-picker">
        Current site
      </label>
      <select
        id="site-picker"
        className="site-select"
        value={siteId === 'new' ? 'new' : (siteId ?? '')}
        onChange={(e) =>
          navigate(e.target.value === 'new' ? '/sites/new' : `/sites/${e.target.value}`)
        }
      >
        {sites.map((s) => (
          <option value={s.id} key={s.id}>
            {s.name}
          </option>
        ))}
        <option value="new">Add site +</option>
      </select>
      <nav aria-label="Main navigation">
        {['overview', ...kinds].map((k) => {
          const Icon = iconMap[k],
            path = `/sites/${siteId}${k === 'overview' ? '' : '/' + k}`;
          return (
            <NavLink
              key={k}
              className={cn('nav-link', kind === k && 'active')}
              to={siteId === 'new' ? '/sites/new' : path}
            >
              <Icon size={18} />
              <span>{k === 'overview' ? 'Overview' : kindNames[k]}</span>
              {k === 'errors' && workspace && (
                <span className="nav-count">
                  {
                    workspace.errors.filter((e) => ['has_error', 'in_progress'].includes(e.status!))
                      .length
                  }
                </span>
              )}
              {k === 'scans' && active ? (
                <LoaderCircle size={14} className="spin" aria-label="Scan running" />
              ) : k === 'scans' &&
                workspace?.scans.some((s) => s.state === 'completed' && !s.read_at) ? (
                <span className="unread-dot" aria-label="Unread scan" />
              ) : null}
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        {siteId && siteId !== 'new' && (
          <a
            className="nav-link"
            href={`/api/sites/${siteId}/feedback`}
            download={`${workspace?.site.name ?? 'site'}-feedback.json`}
          >
            <Download size={16} />
            <span>Export feedback</span>
          </a>
        )}
        <p>Evidence. Action. Verification.</p>
        <div className="profile">
          <span className="avatar">PB</span>
          <div>
            <strong>Paul Butcher</strong>
            <small>Internal workspace</small>
          </div>
        </div>
      </div>
    </>
  );
  return (
    <TooltipProvider delayDuration={250}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">{side}</aside>
      <Dialog
        open={mobile}
        onOpenChange={setMobile}
        title="Workspace navigation"
        description="Choose a site or section."
      >
        <div className="mobile-nav">{side}</div>
      </Dialog>
      <div className="app-main">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={20} />
          </Button>
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <span>{workspace?.site.name ?? (siteId === 'new' ? 'Add site' : 'Loading')}</span>
            {kind !== 'overview' && (
              <>
                <ChevronRight size={14} />
                <span>{kindNames[kind]}</span>
              </>
            )}
          </div>
          {mode === 'fixture' && (
            <span className="sample-pill">
              <span />
              Sample data
            </span>
          )}
        </header>
        <main id="main" tabIndex={-1} className="main-content">
          <div className="sr-only" role="status" aria-live="polite">
            {message}
          </div>
          {actionError && (
            <div className="alert error" role="alert">
              <CircleAlert size={18} />
              {actionError}
            </div>
          )}
          {loadError && (
            <div className="alert error" role="alert">
              {loadError}
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Reconnect
              </Button>
            </div>
          )}
          {siteId === 'new' ? (
            <AddSite
              fixture={mode === 'fixture'}
              onAdded={(s) => {
                setSites((old) => [...old, s]);
                navigate(`/sites/${s.id}`);
              }}
            />
          ) : workspace ? (
            id ? (
              <Detail w={workspace} kind={kind} id={id} action={action} busy={busy} />
            ) : kind === 'overview' ? (
              <Overview
                w={workspace}
                action={action}
                busy={busy}
                active={active}
                scanAvailable={scanAvailable}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">SITE WORKSPACE</div>
                    <h1>{kindNames[kind]}</h1>
                    <p>
                      {
                        {
                          components: 'Work on the changes that reach the most pages.',
                          templates: 'Understand recurring layouts across your site.',
                          pages: 'Work through accessibility, one page at a time.',
                          errors: 'Every finding, with the evidence to act on it.',
                          scans: 'A lasting record of what ran and what changed.',
                        }[kind]
                      }
                    </p>
                  </div>
                  {kind === 'scans' && scanAvailable && (
                    <div className="actions">
                      <Button
                        variant="outline"
                        disabled={busy || !!active}
                        onClick={() =>
                          void action('/scans', { kind: 'full' }, 'Full scan queued').catch(
                            () => {},
                          )
                        }
                      >
                        <RefreshCw size={16} />
                        Rescan previous pages
                      </Button>
                      <Button
                        disabled={busy || !!active || !waiting}
                        onClick={() =>
                          void action('/scans', { kind: 'verify' }, 'Verification queued').catch(
                            () => {},
                          )
                        }
                      >
                        <ScanLine size={16} />
                        Scan declared fixes
                      </Button>
                    </div>
                  )}
                </div>
                {kind === 'scans' && (
                  <p className="muted small">
                    {scanAvailable
                      ? 'Verification re-runs only the checks behind declared fixes. Other problems need a full rescan.'
                      : 'Scanning is currently unavailable.'}
                  </p>
                )}
                <EntityList
                  w={workspace}
                  kind={kind}
                  rows={(workspace as any)[kind]}
                  action={action}
                />
              </>
            )
          ) : (
            <div className="loading">
              <LoaderCircle className="spin" />
              <h1>Opening your workspace</h1>
              <p>Loading saved scan evidence.</p>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>WCAG Workspace</span>
          <span>Findings are evidence, not a conformance assessment.</span>
        </footer>
      </div>
    </TooltipProvider>
  );
}
type Action = (path: string, body?: object, success?: string) => Promise<any>;
function Overview({
  w,
  action,
  busy,
  active,
  scanAvailable,
}: {
  w: Workspace;
  action: Action;
  busy: boolean;
  active?: Entity;
  scanAvailable: boolean;
}) {
  const base = `/sites/${w.site.id}`,
    waiting = w.errors.filter((e) => e.status === 'in_progress').length,
    completed = w.scans.filter((s) => s.state === 'completed'),
    latest = completed[0],
    latestFull = completed.find((s) => s.kind === 'full'),
    open = w.errors.filter((e) => ['has_error', 'in_progress'].includes(e.status!)).length;
  const top = filteredEntities(
    w,
    'components',
    w.components,
    new URLSearchParams('status=has_error,in_progress'),
  ).slice(0, 5);
  const summaries = ['new', 'fixed', 'reopened', 'not_checked'];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR ACCESSIBILITY WORKSPACE</div>
          <h1>
            {w.site.name}
            <span className="heading-divider">/</span>
            <span className="light-heading">Overview</span>
          </h1>
          <p>
            <Globe size={14} />
            <a href={w.site.url} target="_blank" rel="noreferrer">
              {w.site.url}
              <ArrowUpRight size={13} />
            </a>
            <span className="dot-separator">·</span>
            {w.pages.length} pages captured
          </p>
        </div>
        {scanAvailable && (
          <Button
            variant="outline"
            disabled={busy || !!active}
            onClick={() =>
              void action('/scans', { kind: 'full' }, 'Full scan queued').catch(() => {})
            }
          >
            <RefreshCw size={16} />
            {completed.length ? 'Rescan previous pages' : 'Run first scan'}
          </Button>
        )}
      </div>
      {scanAvailable ? (
        <>
          <div className="workflow-banner">
            <span className="banner-icon">
              <ScanLine size={25} />
            </span>
            <div>
              <h2>
                {active
                  ? 'Your scan is in progress'
                  : waiting
                    ? `${waiting} ${waiting === 1 ? 'fix is' : 'fixes are'} ready to verify`
                    : 'A clear path from findings to fixes'}
              </h2>
              <p>
                {active
                  ? `${label(active.state)} · ${active.progress?.phase ?? 'Preparing the scan'}`
                  : waiting
                    ? 'Recheck the original detections and see what changed.'
                    : 'Start with a shared component, review the evidence, then declare your fix.'}
              </p>
            </div>
            <Button
              disabled={busy || !!active || !waiting}
              onClick={() =>
                void action('/scans', { kind: 'verify' }, 'Verification queued').catch(() => {})
              }
            >
              {active ? <LoaderCircle className="spin" size={16} /> : <Play size={15} />}Scan
              declared fixes
            </Button>
          </div>
          <p className="helper">
            Verification checks declared fixes only. Use a full rescan to look for other changes.
          </p>
        </>
      ) : (
        <p className="helper">Scanning is currently unavailable.</p>
      )}
      <div className="overview-stats">
        {[
          {
            name: 'Open errors',
            value: open,
            icon: CircleAlert,
            to: 'errors?status=has_error,in_progress',
            sub: 'Ready for your attention',
          },
          {
            name: 'Shared fixes',
            value: w.components.filter((e) => e.open_errors > 0).length,
            icon: Layers3,
            to: 'components?status=has_error,in_progress',
            sub: 'Components & Global',
          },
          {
            name: 'Pages captured',
            value: w.pages.length,
            icon: Files,
            to: 'pages',
            sub: `Across ${w.templates.length} templates`,
          },
          {
            name: 'Human reviewed',
            value: w.errors.filter((e) => e.reviewed).length,
            icon: ShieldCheck,
            to: 'errors?reviewed=reviewed',
            sub: `Of ${w.errors.length} recorded errors`,
          },
        ].map((s) => (
          <Link key={s.name} to={`${base}/${s.to}`} className="stat-card">
            <div>
              <span>{s.name}</span>
              <s.icon size={18} />
            </div>
            <strong>{s.value}</strong>
            <small>{s.sub}</small>
          </Link>
        ))}
      </div>
      <div className="overview-columns">
        <Panel
          title="Start here"
          description="Shared changes with the widest impact."
          action={
            <Link className="text-link" to={`${base}/components`}>
              View all <ArrowRight size={14} />
            </Link>
          }
        >
          {top.length ? (
            <div className="priority-list">
              {top.map((c, i) => (
                <div className="priority-row" key={c.id}>
                  <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <Link
                      to={`${base}/components/${c.id}?from=${encodeURIComponent(base + '/components')}`}
                    >
                      {entityName(c, 'components')}
                    </Link>
                    <p>
                      <span>{label(c.scope ?? 'component')}</span>
                      <span>·</span>
                      <span>{c.pages_affected} pages affected</span>
                    </p>
                  </div>
                  <div className="priority-count">
                    <strong>{c.open_errors}</strong>
                    <small>open errors</small>
                  </div>
                  <ChevronRight size={16} className="muted" />
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No open shared fixes" text="Shared findings will appear after a scan." />
          )}
        </Panel>
        <Panel
          title="Latest scan"
          description={latest ? label(latest.kind) : 'Your next step'}
          action={
            <span className="mini-icon">
              <Clock3 size={17} />
            </span>
          }
        >
          {latest ? (
            <div className="latest-scan">
              <div className="scan-complete">
                <CircleCheck size={17} />
                Results captured
              </div>
              <DateStamp value={latest.requested_at ?? latest.started_at} />
              <div className="result-grid">
                {summaries.map((k) => (
                  <Link key={k} to={`${base}/scans/${latest.id}?tab=changes&outcome=${k}`}>
                    <strong>{latest.summary?.[k] ?? 0}</strong>
                    <span>{label(k)}</span>
                  </Link>
                ))}
              </div>
              <Link className="button button-outline full-width" to={`${base}/scans/${latest.id}`}>
                View scan results
                <ArrowRight size={15} />
              </Link>
              <p className="small muted">
                Engine{' '}
                {latest.engine_version ?? latest.metadata?.engine_version ?? 'version not recorded'}
              </p>
            </div>
          ) : (
            <Empty
              title="Ready for a first scan"
              text="Capture a baseline to start tracking your work."
            />
          )}
        </Panel>
      </div>
      <Panel title="Work at a glance" description="Current status across your saved findings.">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Status by entity">
          <table>
            <caption className="sr-only">Current workflow statuses</caption>
            <thead>
              <tr>
                <th>AREA</th>
                {['has_error', 'in_progress', 'fixed', 'not_an_issue', 'no_issues'].map((s) => (
                  <th key={s}>{label(s)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['components', 'templates', 'pages', 'errors'].map((k) => (
                <tr key={k}>
                  <th>
                    <Link to={`${base}/${k}`}>{kindNames[k]}</Link>
                  </th>
                  {['has_error', 'in_progress', 'fixed', 'not_an_issue', 'no_issues'].map((s) => (
                    <td key={s}>
                      <Link className="count-link" to={`${base}/${k}?status=${s}`}>
                        {(w as any)[k].filter((e: Entity) => e.status === s).length}
                      </Link>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="coverage-note">
        <Info size={18} />
        <div>
          <strong>Keep coverage in context</strong>
          <p>
            {latestFull
              ? 'The full baseline defines site coverage. Targeted verification only checks the selected fixes.'
              : 'No full scan has been captured yet.'}{' '}
            Automated findings do not replace manual testing.
          </p>
        </div>
        {latestFull && (
          <Link className="text-link" to={`${base}/scans/${latestFull.id}?tab=coverage`}>
            Review coverage
            <ArrowUpRight size={15} />
          </Link>
        )}
      </div>
    </>
  );
}
function MultiFilter({
  name,
  title,
  options,
  params,
  setParams,
}: {
  name: string;
  title: string;
  options: { value: string; label: string }[];
  params: URLSearchParams;
  setParams: (p: URLSearchParams) => void;
}) {
  const current = (params.get(name) ?? '').split(',').filter(Boolean);
  return (
    <details className="filter-multi">
      <summary>
        {title}
        {current.length > 0 && <span>{current.length}</span>}
      </summary>
      <div className="filter-options">
        <fieldset>
          <legend className="sr-only">{title}</legend>
          {options.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={current.includes(o.value)}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  const selected = e.target.checked
                    ? [...current, o.value]
                    : current.filter((v) => v !== o.value);
                  selected.length ? next.set(name, selected.join(',')) : next.delete(name);
                  next.delete('page');
                  setParams(next);
                }}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      </div>
    </details>
  );
}
function EntityList({
  w,
  kind,
  rows,
  action,
  embedded = false,
}: {
  w: Workspace;
  kind: string;
  rows: Entity[];
  action: Action;
  embedded?: boolean;
}) {
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const filtered = filteredEntities(w, kind, rows, params);
  const page = Math.min(
    Math.max(1, Number(params.get('page')) || 1),
    Math.max(1, Math.ceil(filtered.length / 50)),
  );
  const visible = filtered.slice((page - 1) * 50, page * 50),
    base = `/sites/${w.site.id}`;
  const criterionOptions = [...new Set(w.errors.map((e) => e.criterion ?? e.finding?.criterion))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((c) => ({ value: c, label: `${c} ${criteria[c] ?? ''}` }));
  const setFilter = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    value ? p.set(key, value) : p.delete(key);
    p.delete('page');
    setParams(p);
  };
  const filtersActive = [
    'status',
    'criterion',
    'reviewed',
    'scope',
    'kind',
    'grouped',
    'notes',
    'outcome',
    'sampled',
    'from_date',
    'to_date',
  ].some((k) => params.has(k));
  function link(e: Entity) {
    const sourceParams = new URLSearchParams(location.search);
    sourceParams.delete('from');
    return `${base}/${kind}/${e.id}?from=${encodeURIComponent(location.pathname + (sourceParams.size ? '?' + sourceParams.toString() : ''))}`;
  }
  function remember(e: Entity) {
    sessionStorage.setItem('wcag-return-focus', `${location.pathname}|row-${e.id}`);
  }
  return (
    <Panel className={embedded ? 'embedded-list' : ''}>
      <div className="filter-bar">
        <SlidersHorizontal size={16} className="muted" />
        {kind !== 'scans' ? (
          <>
            <MultiFilter
              name="status"
              title="Status"
              options={[
                'has_error',
                'in_progress',
                'fixed',
                'not_an_issue',
                ...(kind === 'errors' ? [] : ['no_issues']),
              ].map((s) => ({ value: s, label: label(s) }))}
              params={params}
              setParams={setParams}
            />
            <MultiFilter
              name="criterion"
              title="Criterion"
              options={criterionOptions}
              params={params}
              setParams={setParams}
            />
          </>
        ) : (
          <select
            aria-label="Scan kind"
            value={params.get('kind') ?? ''}
            onChange={(e) => setFilter('kind', e.target.value)}
          >
            <option value="">All scan kinds</option>
            <option value="full">Full scan</option>
            <option value="verify">Verify scan</option>
          </select>
        )}
        <select
          aria-label="Reviewed filter"
          value={params.get('reviewed') ?? ''}
          onChange={(e) => setFilter('reviewed', e.target.value)}
        >
          <option value="">Review status</option>
          <option value="reviewed">Reviewed</option>
          <option value="not_reviewed">Not reviewed</option>
          <option value="changed">Changed since review</option>
        </select>
        {kind === 'components' && (
          <select
            aria-label="Scope filter"
            value={params.get('scope') ?? ''}
            onChange={(e) => setFilter('scope', e.target.value)}
          >
            <option value="">All scopes</option>
            <option value="component">Component</option>
            <option value="global">Global</option>
          </select>
        )}
        {kind === 'errors' && (
          <>
            <select
              aria-label="Grouped filter"
              value={params.get('grouped') ?? ''}
              onChange={(e) => setFilter('grouped', e.target.value)}
            >
              <option value="">All groups</option>
              <option value="grouped">Grouped</option>
              <option value="ungrouped">Ungrouped</option>
            </select>
            <select
              aria-label="Notes filter"
              value={params.get('notes') ?? ''}
              onChange={(e) => setFilter('notes', e.target.value)}
            >
              <option value="">All notes</option>
              <option value="has_notes">Has notes</option>
              <option value="no_notes">No notes</option>
            </select>
          </>
        )}
        {kind === 'templates' && (
          <select
            aria-label="Template coverage filter"
            value={params.get('sampled') ?? ''}
            onChange={(e) => setFilter('sampled', e.target.value)}
          >
            <option value="">All coverage</option>
            <option value="not_scanned">Not scanned</option>
            <option value="sampled">Sampled</option>
            <option value="fully_scanned">Fully scanned</option>
            <option value="unknown">Total unknown</option>
          </select>
        )}
        {kind === 'scans' && (
          <>
            <select
              aria-label="Scan scope"
              value={params.get('scope') ?? ''}
              onChange={(e) => setFilter('scope', e.target.value)}
            >
              <option value="">All scopes</option>
              <option value="url">Site</option>
              <option value="previous_pages">Previous pages</option>
              <option value="declared_fixes">Declared fixes</option>
            </select>
            <select
              aria-label="Scan outcome"
              value={params.get('outcome') ?? ''}
              onChange={(e) => setFilter('outcome', e.target.value)}
            >
              <option value="">All outcomes</option>
              {['new', 'fixed', 'reopened', 'not_checked'].map((k) => (
                <option value={k} key={k}>
                  Had {label(k).toLowerCase()}
                </option>
              ))}
            </select>
            <label className="date-filter">
              From
              <input
                aria-label="Scans from date"
                type="date"
                value={params.get('from_date') ?? ''}
                onChange={(e) => setFilter('from_date', e.target.value)}
              />
            </label>
            <label className="date-filter">
              To
              <input
                aria-label="Scans to date"
                type="date"
                value={params.get('to_date') ?? ''}
                onChange={(e) => setFilter('to_date', e.target.value)}
              />
            </label>
          </>
        )}
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const p = new URLSearchParams(params);
              [
                'status',
                'criterion',
                'reviewed',
                'scope',
                'kind',
                'grouped',
                'notes',
                'outcome',
                'sampled',
                'from_date',
                'to_date',
                'page',
              ].forEach((k) => p.delete(k));
              setParams(p);
            }}
          >
            Clear filters
          </Button>
        )}
        <span className="filter-count">
          {filtered.length} {kind === 'components' ? 'groups' : kind}
        </span>
        {kind === 'scans' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void action('/scans/read-all', {}, 'Scans marked read').catch(() => {})}
          >
            Mark all read
          </Button>
        )}
      </div>
      {visible.length ? (
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${kindNames[kind]} table`}
        >
          <table>
            <caption className="sr-only">
              {kindNames[kind]}, page {page} of {Math.max(1, Math.ceil(filtered.length / 50))}
            </caption>
            <thead>
              <tr>
                <th>{kind === 'scans' ? 'SCAN' : 'NAME'}</th>
                {kind === 'components' && <th>SCOPE</th>}
                {kind === 'errors' && <th>PAGE</th>}
                <th>{kind === 'scans' ? 'STATE' : 'STATUS'}</th>
                {kind === 'scans' ? (
                  <>
                    <th>NEW / FIXED / REOPENED / NOT CHECKED</th>
                    <th>ENGINE</th>
                  </>
                ) : (
                  <>
                    <th>{kind === 'errors' ? 'CRITERION' : 'CRITERIA'}</th>
                    {kind === 'errors' ? (
                      <>
                        <th>CONFIDENCE</th>
                        <th>TRIAGE</th>
                        <th>SEVERITY</th>
                      </>
                    ) : (
                      <th>OPEN ERRORS</th>
                    )}
                    {kind === 'components' && <th>SPREAD</th>}
                    {kind === 'templates' && <th>PAGES SCANNED / TOTAL</th>}
                    <th>LAST CAPTURED</th>
                  </>
                )}
                <th>REVIEWED</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id}>
                  <td className="name-cell">
                    <Link id={`row-${e.id}`} to={link(e)} onClick={() => remember(e)}>
                      {kind === 'scans' && e.state === 'completed' && !e.read_at && (
                        <span className="unread-dot" aria-label="Unread" />
                      )}
                      {entityName(e, kind)}
                    </Link>
                    {kind === 'pages' && <small>{e.url}</small>}
                    {kind === 'scans' && <small>{label(e.scope ?? 'url')}</small>}
                  </td>
                  {kind === 'components' && (
                    <td>
                      <span className="neutral-pill">{label(e.scope ?? 'component')}</span>
                    </td>
                  )}
                  {kind === 'errors' && (
                    <td className="page-cell">
                      <Link
                        to={`${base}/pages/${e.page_id}?from=${encodeURIComponent(location.pathname + location.search)}`}
                      >
                        {w.pages.find((p) => p.id === e.page_id)?.title ??
                          w.pages.find((p) => p.id === e.page_id)?.name ??
                          'Page'}
                      </Link>
                    </td>
                  )}
                  <td>
                    {kind === 'scans' ? (
                      <span className="scan-state">
                        {['running', 'queued'].includes(e.state) && (
                          <LoaderCircle size={14} className="spin" />
                        )}
                        {label(e.state)}
                      </span>
                    ) : (
                      <Status status={e.status} />
                    )}
                  </td>
                  {kind === 'scans' ? (
                    <>
                      <td className="tabular">
                        {['new', 'fixed', 'reopened', 'not_checked']
                          .map((k) => e.summary?.[k] ?? 0)
                          .join(' / ')}
                      </td>
                      <td>{e.engine_version ?? e.metadata?.engine_version ?? 'Not recorded'}</td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="criteria-list">
                          {(kind === 'errors'
                            ? [e.criterion ?? e.finding?.criterion]
                            : (e.criteria ?? [])
                          )
                            .slice(0, 2)
                            .map((c: string) => (
                              <Criterion key={c} value={c} />
                            ))}
                          {e.criteria?.length > 2 && (
                            <span className="muted">+{e.criteria.length - 2}</span>
                          )}
                        </div>
                      </td>
                      {kind === 'errors' ? (
                        <>
                          <td>
                            <Tooltip text="No labels yet">
                              <span tabIndex={0} className="neutral-pill">
                                {label(e.finding?.confidence?.tier ?? 'unknown')}
                              </span>
                            </Tooltip>
                          </td>
                          <td>
                            <span className="neutral-pill">
                              {label(e.finding?.triage_bucket ?? 'not_recorded')}
                            </span>
                          </td>
                          <td>
                            <span className="neutral-pill">
                              {label(e.finding?.severity ?? 'not_recorded')}
                            </span>
                          </td>
                        </>
                      ) : (
                        <td className="number-cell">{e.open_errors ?? 0}</td>
                      )}
                      {kind === 'components' && (
                        <td className="nowrap">{e.pages_affected ?? 0} pages</td>
                      )}
                      {kind === 'templates' && (
                        <td>
                          {w.pages.filter((p) => p.template_id === e.id).length} /{' '}
                          {e.known_pages ?? 'unknown'}
                        </td>
                      )}
                      <td className="date-cell">
                        <DateStamp value={e.last_captured_at} />
                      </td>
                    </>
                  )}
                  <td>
                    <Reviewed entity={e} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={filtersActive ? 'No matching results' : 'No results yet'}
          text={
            filtersActive
              ? 'Try changing or clearing your filters.'
              : 'Run a scan to populate this workspace.'
          }
        />
      )}
      <div className="pagination">
        <span>
          {filtered.length
            ? `${(page - 1) * 50 + 1}-${Math.min(page * 50, filtered.length)} of ${filtered.length}`
            : '0 results'}
        </span>
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            aria-label="Previous page"
            onClick={() => {
              const p = new URLSearchParams(params);
              page === 2 ? p.delete('page') : p.set('page', String(page - 1));
              setParams(p);
            }}
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(filtered.length / 50))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 50 >= filtered.length}
            aria-label="Next page"
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set('page', String(page + 1));
              setParams(p);
            }}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </Panel>
  );
}
function Detail({
  w,
  kind,
  id,
  action,
  busy,
}: {
  w: Workspace;
  kind: string;
  id: string;
  action: Action;
  busy: boolean;
}) {
  const e = ((w as any)[kind] as Entity[]).find((x) => x.id === id);
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [form, setForm] = useState<'note' | 'review' | 'dismiss' | null>(null),
    [text, setText] = useState(''),
    [noteType, setNoteType] = useState(''),
    [formError, setFormError] = useState('');
  const base = `/sites/${w.site.id}`,
    tab = params.get('tab') ?? 'overview';
  const fromValue = params.get('from');
  const {
    from,
    resultKind: sourceKind,
    rows: sourceRows,
    parent: sourceParent,
  } = resolveSource(w, fromValue, kind);
  const position = sourceRows.findIndex((x) => x.id === id);
  const markedRead = useRef('');
  useEffect(() => {
    if (kind === 'scans' && e?.state === 'completed' && !e.read_at && markedRead.current !== id) {
      markedRead.current = id;
      void action(`/scans/${id}/read`, {}, 'Scan opened').catch(() => {});
    }
  }, [id, e?.state]);
  if (!e)
    return (
      <Empty title="Item not found" text="This item is not part of the selected site.">
        <Button asChild variant="outline">
          <Link to={`${base}/${kind}`}>Back to {kindNames[kind]}</Link>
        </Button>
      </Empty>
    );
  const members = memberErrors(w, kind, e),
    currentFinding = e.finding ?? members[0]?.finding;
  const page = w.pages.find((p) => p.id === e.page_id);
  const component = w.components.find((c) => c.id === e.component_id);
  const template = w.templates.find((t) => t.id === (page ?? e).template_id);
  const noteEntities = new Set([
    e.id,
    ...(kind === 'errors' ? [page?.id, component?.id, template?.id].filter(Boolean) : []),
  ]);
  const notes = w.notes.filter((n) => noteEntities.has(n.entity_id));
  const events = w.events.filter((x) => x.entity_id === e.id);
  const tabNames =
    kind === 'errors'
      ? ['overview', 'trace', 'notes', 'history']
      : kind === 'scans'
        ? ['overview', 'changes', 'coverage']
        : kind === 'components'
          ? ['overview', 'errors', 'pages', 'templates', 'notes', 'history']
          : kind === 'templates'
            ? ['overview', 'pages', 'components', 'errors', 'notes', 'history']
            : ['overview', 'components', 'errors', 'notes', 'history'];
  const currentTab = tabNames.includes(tab) ? tab : 'overview';
  const relatedPages = w.pages.filter((p) =>
    kind === 'templates' ? p.template_id === id : members.some((x) => x.page_id === p.id),
  );
  const relatedTemplates = w.templates.filter((t) =>
    relatedPages.some((p) => p.template_id === t.id),
  );
  const relatedComponents = w.components.filter((c) =>
    members.some((x) => x.component_id === c.id),
  );
  const rawOutcome = e.observations ?? [];
  const selectedObservation = params.get('observation')
    ? rawOutcome.find((o: Entity) => o.id === params.get('observation'))
    : null;
  const finding = selectedObservation
    ? (selectedObservation.finding ?? selectedObservation.raw_finding)
    : currentFinding;
  const evidenceFinding =
    kind === 'pages'
      ? null
      : selectedObservation
        ? selectedObservation.outcome === 'detected'
          ? (selectedObservation.finding ?? selectedObservation.raw_finding)
          : null
        : finding;
  const screenshot = selectedObservation
    ? (selectedObservation.screenshot_url ?? selectedObservation.snapshot?.screenshot_url)
    : (e.screenshot_url ??
      (kind === 'pages' ? e.snapshot?.screenshot_url : members[0]?.screenshot_url));
  const submitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError('');
    try {
      if (form === 'dismiss')
        await action(
          `/errors/${e.id}/status`,
          { status: 'not_an_issue', status_revision: e.status_revision, text },
          'Marked Not an issue and human reviewed',
        );
      else if (form === 'note')
        await action(
          '/notes',
          { entity_type: singular[kind], entity_id: e.id, type: noteType, text },
          'Note added',
        );
      else
        await action(
          '/reviews',
          { entity_type: singular[kind], entity_id: e.id, note: text },
          'Human review recorded',
        );
      setForm(null);
      setText('');
      setNoteType('');
    } catch (err) {
      setFormError((err as Error).message);
    }
  };
  const showForm = (type: typeof form) => {
    setText('');
    setFormError('');
    setForm(type);
  };
  return (
    <>
      <div className="detail-navigation">
        <Link className="back-link" to={from}>
          <ChevronLeft size={15} />
          Back to{' '}
          {sourceParent
            ? `${sourceParent.name ?? sourceParent.title ?? 'Item'}, ${kindNames[sourceKind] ?? 'Results'}`
            : (kindNames[sourceKind] ?? kindNames[kind])}
        </Link>
        {fromValue && position >= 0 && (
          <div className="pager-inline">
            <Button asChild variant="ghost" size="sm" disabled={position === 0}>
              {position > 0 ? (
                <Link
                  to={`${base}/${sourceKind}/${sourceRows[position - 1].id}?from=${encodeURIComponent(from)}`}
                >
                  Previous
                </Link>
              ) : (
                <span>Previous</span>
              )}
            </Button>
            <span>
              {position + 1} of {sourceRows.length}
            </span>
            <Button asChild variant="ghost" size="sm" disabled={position === sourceRows.length - 1}>
              {position < sourceRows.length - 1 ? (
                <Link
                  to={`${base}/${sourceKind}/${sourceRows[position + 1].id}?from=${encodeURIComponent(from)}`}
                >
                  Next
                  <ChevronRight size={14} />
                </Link>
              ) : (
                <span>Next</span>
              )}
            </Button>
          </div>
        )}
      </div>
      <div className="page-heading detail-heading">
        <div>
          <div className="eyebrow">{kindNames[kind]}</div>
          <h1>{entityName(e, kind)}</h1>
          <div className="detail-meta">
            {kind !== 'scans' ? (
              <Status status={e.status} />
            ) : (
              <span className="neutral-pill">{label(e.state)}</span>
            )}
            {kind === 'errors' && (
              <span>
                {e.criterion} {criteria[e.criterion] ?? ''} · {finding?.level ?? 'AA'}
              </span>
            )}
            <Reviewed entity={e} />
          </div>
        </div>
      </div>
      <div className="detail-actions">
        {kind === 'errors' && (
          <label className="inline-label">
            Status
            <select
              aria-label="Error status"
              value={e.status}
              disabled={busy}
              onChange={(ev) => {
                if (ev.target.value === 'not_an_issue') showForm('dismiss');
                else
                  void action(
                    `/errors/${id}/status`,
                    { status: ev.target.value, status_revision: e.status_revision },
                    'Status updated',
                  ).catch(() => {});
              }}
            >
              <option value={e.status}>{label(e.status!)}</option>
              {e.status === 'has_error' && <option value="in_progress">In progress</option>}
              {['in_progress', 'not_an_issue'].includes(e.status!) && (
                <option value="has_error">Has error</option>
              )}
              {e.status !== 'not_an_issue' && <option value="not_an_issue">Not an issue</option>}
              {e.status !== 'fixed' && (
                <option value="fixed" disabled>
                  Fixed (set by scan)
                </option>
              )}
            </select>
          </label>
        )}
        {kind === 'components' && (
          <Button
            disabled={busy || !members.some((x) => x.status === 'has_error')}
            onClick={() =>
              void action(`/components/${id}/declare-fixed`, {}, 'Group fixes declared').catch(
                () => {},
              )
            }
          >
            <Check size={16} />
            Declare fixed
          </Button>
        )}
        <Button
          variant="outline"
          disabled={busy || (kind === 'scans' && e.state !== 'completed')}
          onClick={() => showForm('review')}
        >
          <CheckCheck size={16} />
          Reviewed
        </Button>
        {kind !== 'scans' && (
          <Button variant="outline" onClick={() => showForm('note')}>
            <MessageSquare size={16} />
            Add note
          </Button>
        )}
        {kind === 'errors' && e.component_id && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void action(`/errors/${id}/remove-group`, {}, 'Removed from group').catch(() => {})
            }
          >
            Remove from group
          </Button>
        )}
        {kind === 'pages' && (
          <Button asChild variant="ghost">
            <a href={e.url} target="_blank" rel="noreferrer">
              Open live page
              <ExternalLink size={14} />
            </a>
          </Button>
        )}
        {kind === 'scans' && (
          <Tooltip text="No PDF is bundled with this recorded scan">
            <span tabIndex={0}>
              <Button variant="outline" disabled>
                <Download size={16} />
                Export engine PDF
              </Button>
            </span>
          </Tooltip>
        )}
      </div>
      <Tabs.Root
        value={currentTab}
        onValueChange={(value) => {
          const p = new URLSearchParams(params);
          value === 'overview' ? p.delete('tab') : p.set('tab', value);
          ['page', 'criterion', 'status', 'outcome', 'observation'].forEach((k) => p.delete(k));
          setParams(p, { replace: true });
        }}
      >
        <Tabs.List className="tabs" aria-label="Detail sections">
          {tabNames.map((t) => (
            <Tabs.Trigger key={t} value={t} className="tab">
              {t === 'components' ? 'Components & Global' : label(t)}
              {t === 'errors' && <span>{members.length}</span>}
              {t === 'notes' && notes.length > 0 && <span>{notes.length}</span>}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="overview" className="tab-content">
          {kind === 'scans' ? (
            <ScanOverview scan={e} base={base} action={action} busy={busy} />
          ) : (
            <>
              <div className="detail-grid">
                <div>
                  <Panel
                    title={kind === 'pages' ? 'Page capture' : 'Evidence'}
                    description={
                      kind === 'pages'
                        ? 'The latest recorded capture for this page.'
                        : selectedObservation
                          ? 'Evidence from the selected historical observation.'
                          : 'Captured evidence from the latest detected observation.'
                    }
                  >
                    <div className="panel-body">
                      {selectedObservation && (
                        <div className="alert">
                          <Info size={17} />
                          <div>
                            Historical observation: {label(selectedObservation.outcome)}.{' '}
                            {selectedObservation.reason ?? ''}
                            <button
                              className="text-link"
                              onClick={() => {
                                const p = new URLSearchParams(params);
                                p.delete('observation');
                                setParams(p, { replace: true });
                              }}
                            >
                              Return to latest detected evidence
                            </button>
                          </div>
                        </div>
                      )}
                      {kind === 'errors' && (
                        <dl className="location-list">
                          <dt>Page</dt>
                          <dd>
                            <Link to={`${base}/pages/${page?.id}`}>
                              {page?.title ?? page?.name}
                            </Link>
                          </dd>
                          <dt>Template</dt>
                          <dd>
                            {template ? (
                              <Link to={`${base}/templates/${template.id}`}>{template.name}</Link>
                            ) : (
                              'Static'
                            )}
                          </dd>
                          <dt>Group</dt>
                          <dd>
                            {component ? (
                              <Link to={`${base}/components/${component.id}`}>
                                {component.name}
                              </Link>
                            ) : (
                              'Ungrouped'
                            )}
                          </dd>
                        </dl>
                      )}
                      {screenshot ? (
                        <>
                          <div
                            className="screenshot"
                            tabIndex={0}
                            role="region"
                            aria-label="Captured page screenshot"
                          >
                            <img
                              src={screenshot}
                              alt={`Captured page evidence for ${page?.title ?? e.title ?? w.site.name}`}
                              loading="lazy"
                            />
                          </div>
                          <a
                            className="text-link small"
                            href={screenshot}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open full capture
                            <ExternalLink size={13} />
                          </a>
                        </>
                      ) : (
                        <div className="evidence-empty">
                          <Files size={22} />
                          <p>Screenshot not recorded for this view.</p>
                        </div>
                      )}
                      {evidenceFinding?.evidence && (
                        <>
                          <div className="code-label">SELECTOR</div>
                          <pre className="code-block">{evidenceFinding.evidence.selector}</pre>
                          <div className="code-label">ELEMENT HTML</div>
                          <pre className="code-block">{evidenceFinding.evidence.html}</pre>
                          <details className="disclosure">
                            <summary>Measured values and interaction evidence</summary>
                            <pre className="code-block">
                              {JSON.stringify(
                                {
                                  measured_values: evidenceFinding.evidence.measured_values,
                                  aria: evidenceFinding.evidence.aria_attributes,
                                  keyboard: evidenceFinding.evidence.keyboard_sequence,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        </>
                      )}
                      <p className="small muted">
                        Captured{' '}
                        <DateStamp
                          value={
                            selectedObservation
                              ? selectedObservation.captured_at
                              : e.last_captured_at
                          }
                        />
                      </p>
                    </div>
                  </Panel>
                  {kind === 'errors' && finding?.analysis?.impact && (
                    <Panel title="Who is affected">
                      <div className="panel-body">
                        <p>{finding.analysis.impact}</p>
                        <div className="pills">
                          {finding.analysis.affected_users?.map((u: string) => (
                            <span key={u} className="neutral-pill">
                              {label(u)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
                <div>
                  <Panel title="Remediation" description="A practical starting point for the fix.">
                    <div className="panel-body prose">
                      <p>
                        {(e.remediation ?? finding?.remediation)?.generic_fix ??
                          'No remediation was recorded for this item.'}
                      </p>
                      {(e.remediation ?? finding?.remediation)?.platform_fix?.steps?.length > 0 && (
                        <ol>
                          {(e.remediation ?? finding?.remediation).platform_fix.steps.map(
                            (s: string, i: number) => (
                              <li key={i}>{s}</li>
                            ),
                          )}
                        </ol>
                      )}
                      {(e.remediation ?? finding?.remediation)?.platform_fix?.designer_path && (
                        <p className="small muted">
                          {(e.remediation ?? finding?.remediation).platform_fix.designer_path}
                        </p>
                      )}
                    </div>
                  </Panel>
                  {finding && (
                    <Panel
                      title="Engine labels"
                      description="Original analysis, preserved as received."
                    >
                      <div className="panel-body">
                        <dl className="label-list">
                          {[
                            ['Confidence', label(finding.confidence?.tier ?? 'unknown')],
                            ['Severity', label(finding.severity ?? 'unknown')],
                            ['Triage', label(finding.triage_bucket ?? 'unknown')],
                            ['Source', label(finding.detected_by ?? 'unknown')],
                            [
                              'False-positive risk',
                              label(finding.confidence?.false_positive_risk ?? 'unknown'),
                            ],
                          ].map(([name, value]) => (
                            <React.Fragment key={name}>
                              <dt>{name}</dt>
                              <dd>
                                <span className="neutral-pill">{value}</span>
                              </dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      </div>
                    </Panel>
                  )}
                  <Panel title="Related work">
                    <div className="related-links">
                      {(kind === 'errors'
                        ? ['notes', 'history']
                        : ['errors', 'notes', 'history']
                      ).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            const p = new URLSearchParams(params);
                            p.set('tab', t);
                            setParams(p, { replace: true });
                          }}
                        >
                          <span>{label(t)}</span>
                          <span>
                            {t === 'errors'
                              ? members.length
                              : t === 'notes'
                                ? notes.length
                                : events.length}
                            <ChevronRight size={15} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            </>
          )}
        </Tabs.Content>
        {['errors', 'pages', 'templates', 'components'].map((t) => (
          <Tabs.Content key={t} value={t} className="tab-content">
            <EntityList
              w={w}
              kind={t}
              rows={
                t === 'errors'
                  ? members
                  : t === 'pages'
                    ? relatedPages
                    : t === 'templates'
                      ? relatedTemplates
                      : relatedComponents
              }
              action={action}
              embedded
            />
          </Tabs.Content>
        ))}
        <Tabs.Content value="trace" className="tab-content">
          <Panel
            title="Detection trace"
            description="The engine's recorded reasoning and model output."
          >
            <div className="panel-body prose">
              <h3>Reasoning</h3>
              <p>{finding?.analysis?.reasoning ?? 'No reasoning recorded.'}</p>
              <h3>Confidence basis</h3>
              <p>{finding?.confidence?.basis ?? 'Not recorded'}</p>
              {finding?.analysis?.llm ? (
                <>
                  <h3>Model output</h3>
                  <pre className="code-block">{finding.analysis.llm.raw_response}</pre>
                  <p className="small muted">
                    {finding.analysis.llm.model} · {finding.analysis.llm.tokens ?? 'Unknown'} tokens
                    · Legacy trace may be truncated.
                  </p>
                  <details className="disclosure">
                    <summary>Show raw prompt and input</summary>
                    <pre className="code-block">
                      {finding.analysis.llm.prompt}
                      {'\n\n'}
                      {finding.analysis.llm.input}
                    </pre>
                  </details>
                </>
              ) : (
                <p className="muted">No model trace recorded.</p>
              )}
            </div>
          </Panel>
        </Tabs.Content>
        <Tabs.Content value="notes" className="tab-content">
          <Panel
            title="Notes"
            description="Append-only feedback. Original engine data stays unchanged."
            action={
              <Button size="sm" variant="outline" onClick={() => showForm('note')}>
                <Plus size={15} />
                Add note
              </Button>
            }
          >
            {notes.length ? (
              <div className="notes-list">
                {notes.map((n) => (
                  <article key={n.id} className="note">
                    <div>
                      <span className="neutral-pill">{label(n.type)}</span>
                      <DateStamp value={n.created_at} />
                    </div>
                    {n.text && <p>{n.text}</p>}
                    {n.entity_id !== id && (
                      <p className="small muted">
                        Inherited from {label(n.entity_type)}:{' '}
                        <Link
                          to={`${base}/${n.entity_type === 'component' ? 'components' : n.entity_type + 's'}/${n.entity_id}`}
                        >
                          {[...w.pages, ...w.components, ...w.templates].find(
                            (x) => x.id === n.entity_id,
                          )?.name ??
                            [...w.pages, ...w.components, ...w.templates].find(
                              (x) => x.id === n.entity_id,
                            )?.title ??
                            'Related item'}
                        </Link>
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="Leave a useful trail"
                text="Add feedback about the finding, evidence or suggested fix."
              />
            )}
          </Panel>
        </Tabs.Content>
        <Tabs.Content value="history" className="tab-content">
          <Panel title="History" description="Observations, decisions and reviews are preserved.">
            <div className="timeline">
              {[
                ...events.map((x) => ({ ...x, sort: x.created_at })),
                ...rawOutcome.map((x: Entity) => ({
                  ...x,
                  kind: 'observation',
                  sort: x.evaluated_at ?? x.created_at ?? x.captured_at,
                })),
              ]
                .sort((a, b) => String(b.sort).localeCompare(String(a.sort)))
                .map((item, i) => (
                  <div className="timeline-item" key={item.id ?? i}>
                    <span className="timeline-dot">
                      <History size={14} />
                    </span>
                    <div>
                      <strong>{label(item.outcome ?? item.kind)}</strong>
                      <p>
                        {item.from_status &&
                          `${label(item.from_status)} → ${label(item.to_status)}`}
                        {item.reason ?? ''}
                      </p>
                      <DateStamp value={item.sort} />
                      {item.engine_version && (
                        <span className="small muted"> · Engine {item.engine_version}</span>
                      )}
                      {item.kind === 'observation' && (
                        <button
                          className="text-link small history-evidence"
                          onClick={() => {
                            const p = new URLSearchParams(params);
                            p.delete('tab');
                            p.set('observation', item.id);
                            setParams(p, { replace: true });
                          }}
                        >
                          View observation{item.outcome === 'detected' ? ' evidence' : ''}
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {events.length === 0 && rawOutcome.length === 0 && (
                <Empty title="No history recorded" />
              )}
            </div>
          </Panel>
        </Tabs.Content>
        <Tabs.Content value="changes" className="tab-content">
          <Panel
            title="Changes in this scan"
            description="These results stay fixed as your current workflow changes."
          >
            <div className="filter-bar">
              <select
                aria-label="Change category"
                value={params.get('outcome') ?? ''}
                onChange={(ev) => {
                  const p = new URLSearchParams(params);
                  ev.target.value ? p.set('outcome', ev.target.value) : p.delete('outcome');
                  setParams(p, { replace: true });
                }}
              >
                <option value="">All changes</option>
                {[
                  'new',
                  'fixed',
                  'reopened',
                  'still_detected',
                  'not_checked',
                  'not_an_issue',
                  'no_change',
                ].map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="Scan changes">
              <table>
                <caption className="sr-only">Frozen scan changes</caption>
                <thead>
                  <tr>
                    <th>ERROR</th>
                    <th>CHANGE</th>
                    <th>OUTCOME</th>
                  </tr>
                </thead>
                <tbody>
                  {(e.changes ?? [])
                    .filter(
                      (c: Entity) => !params.get('outcome') || c.category === params.get('outcome'),
                    )
                    .map((c: Entity) => {
                      const err = w.errors.find((x) => x.id === c.error_id);
                      return (
                        <tr key={c.error_id}>
                          <td>
                            <Link
                              to={`${base}/errors/${c.error_id}?from=${encodeURIComponent(location.pathname + location.search)}`}
                            >
                              {err ? entityName(err, 'errors') : c.error_id}
                            </Link>
                            {c.status_application === 'skipped_newer_action' && (
                              <small>Result recorded; a newer status action was kept.</small>
                            )}
                          </td>
                          <td>{label(c.category)}</td>
                          <td>{label(c.outcome ?? c.category)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {!e.changes?.length && (
              <Empty
                title="No changes recorded"
                text="Results appear when this scan finishes importing."
              />
            )}
          </Panel>
        </Tabs.Content>
        <Tabs.Content value="coverage" className="tab-content">
          <Panel title="Coverage" description="What was attempted, checked and left untested.">
            <div className="panel-body">
              <div className="alert">
                <Info size={18} />
                <span>
                  {e.coverage?.provenance ??
                    e.coverage?.reason ??
                    'Missing historical values remain unknown.'}
                </span>
              </div>
              <dl className="location-list">
                <dt>Pages captured</dt>
                <dd>
                  {e.coverage?.captured_urls?.length ??
                    e.metadata?.captured_urls?.length ??
                    'Not recorded'}
                </dd>
                <dt>Page budget</dt>
                <dd>
                  {e.coverage?.budget ?? e.metadata?.resolved_options?.max_pages ?? 'Not recorded'}
                </dd>
                <dt>Excluded URLs</dt>
                <dd>
                  {e.coverage?.exclusions?.length ??
                    e.metadata?.excluded_urls?.length ??
                    'Not recorded'}
                </dd>
              </dl>
              {e.coverage?.entries?.length ? (
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Per-check coverage"
                  tabIndex={0}
                >
                  <table>
                    <caption className="sr-only">Per-page check coverage</caption>
                    <thead>
                      <tr>
                        <th>PAGE</th>
                        <th>CHECK</th>
                        <th>RESULT</th>
                        <th>REASON</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.coverage.entries.map((c: any, i: number) => (
                        <tr key={i}>
                          <td>{c.page_url ?? c.url ?? c.page_key}</td>
                          <td>{c.check_id ?? c.check}</td>
                          <td>{label(c.status)}</td>
                          <td>{c.reason ?? c.message ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Per-check coverage was not recorded in this scan.</p>
              )}
            </div>
          </Panel>
        </Tabs.Content>
      </Tabs.Root>
      <Dialog
        open={form !== null}
        onOpenChange={(v) => !v && setForm(null)}
        title={
          form === 'note'
            ? 'Add a note'
            : form === 'dismiss'
              ? 'Mark Not an issue'
              : 'Record human review'
        }
        description={
          form === 'dismiss'
            ? 'This exact element and error will stay dismissed in later scans. This action also records a false-positive judgment and human review.'
            : form === 'note'
              ? 'Feedback is preserved and can be exported for engine improvement.'
              : 'Record that you inspected this item. A review alone does not change its status.'
        }
      >
        <form className="stack-form" onSubmit={submitForm}>
          {form === 'note' && (
            <label>
              Note type
              <select required value={noteType} onChange={(ev) => setNoteType(ev.target.value)}>
                <option value="">Choose a type</option>
                {[
                  'false_positive',
                  'wrong_severity',
                  'wrong_criterion',
                  'wrong_element',
                  'duplicate',
                  'other',
                  ...(kind === 'components'
                    ? ['wrong_grouping', 'should_split', 'should_merge', 'wrong_remediation']
                    : kind === 'pages'
                      ? ['missed_error', 'capture_problem']
                      : kind === 'templates'
                        ? ['wrong_page_membership', 'missed_error']
                        : []),
                ].map((t) => (
                  <option key={t} value={t}>
                    {label(t)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Notes <span className="muted">(optional)</span>
            <textarea
              rows={4}
              value={text}
              onChange={(ev) => setText(ev.target.value)}
              placeholder={
                form === 'note' && !noteType
                  ? 'Choose a type first'
                  : 'Add context for your future self…'
              }
            />
          </label>
          {formError && (
            <p role="alert" className="text-error">
              {formError}
            </p>
          )}
          <div className="dialog-actions">
            <Button type="button" variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy || (form === 'note' && !noteType)}>
              {busy && <LoaderCircle className="spin" size={15} />}{' '}
              {form === 'dismiss'
                ? 'Mark Not an issue'
                : form === 'note'
                  ? 'Save note'
                  : 'Save review'}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
function ScanOverview({
  scan,
  base,
  action,
  busy,
}: {
  scan: Entity;
  base: string;
  action: Action;
  busy: boolean;
}) {
  const metadata = scan.metadata ?? {},
    manifest = metadata.detection_manifest ?? {};
  return (
    <>
      <Panel title="Scan summary">
        <div className="panel-body">
          <div className="result-grid wide">
            {['new', 'fixed', 'reopened', 'not_checked'].map((k) => (
              <Link key={k} to={`${base}/scans/${scan.id}?tab=changes&outcome=${k}`}>
                <strong>{scan.summary?.[k] ?? 0}</strong>
                <span>{label(k)}</span>
              </Link>
            ))}
          </div>
          {(scan.failure_message || scan.state === 'failed') && (
            <div role="alert" className="alert error">
              <div>
                <p>{scan.failure_message ?? scan.error ?? 'The scan did not complete.'}</p>
                {scan.ingest_state === 'failed' ? (
                  <Button
                    disabled={busy}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void action(`/scans/${scan.id}/retry-import`, {}, 'Import retried').catch(
                        () => {},
                      )
                    }
                  >
                    Retry import
                  </Button>
                ) : (
                  <Button
                    disabled={busy}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void action('/scans', { kind: scan.kind }, 'Retry queued').catch(() => {})
                    }
                  >
                    Run another {scan.kind === 'verify' ? 'verification' : 'full scan'}
                  </Button>
                )}
              </div>
            </div>
          )}
          <dl className="location-list">
            <dt>Requested</dt>
            <dd>
              <DateStamp value={scan.requested_at} />
            </dd>
            <dt>Engine</dt>
            <dd>{scan.engine_version ?? metadata.engine_version ?? 'Not recorded'}</dd>
            <dt>Check tiers</dt>
            <dd>
              {(manifest.active_tiers ?? manifest.enabled_tiers ?? []).join(', ') || 'Not recorded'}
            </dd>
            <dt>Model mode</dt>
            <dd>
              {metadata.resolved_options?.model_mode
                ? label(metadata.resolved_options.model_mode)
                : 'Not recorded'}
            </dd>
            <dt>Report</dt>
            <dd>PDF not bundled. Engine reports exclude app statuses, notes and reviews.</dd>
          </dl>
        </div>
      </Panel>
      <Panel title="Timing and model usage">
        <div className="panel-body">
          <p className="muted">
            {metadata.timings
              ? 'Recorded timing data is shown below.'
              : 'Timing details were not recorded.'}
          </p>
          {metadata.timings && (
            <pre className="code-block">{JSON.stringify(metadata.timings, null, 2)}</pre>
          )}
          <p className="muted">
            {metadata.model_usage
              ? 'Recorded model usage is shown below.'
              : 'Model usage was not recorded.'}
          </p>
          {metadata.model_usage && (
            <pre className="code-block">{JSON.stringify(metadata.model_usage, null, 2)}</pre>
          )}
        </div>
      </Panel>
    </>
  );
}
function AddSite({ fixture, onAdded }: { fixture: boolean; onAdded: (s: Entity) => void }) {
  const [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="add-site">
      <div className="eyebrow">GROW YOUR WORKSPACE</div>
      <h1>Add a site</h1>
      <p className="muted">Keep findings and progress organized by client website.</p>
      <Panel>
        <form
          className="stack-form panel-body"
          onSubmit={async (ev) => {
            ev.preventDefault();
            setBusy(true);
            setError('');
            try {
              onAdded(await api('/sites', { name, url }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Site name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Client website"
            />
          </label>
          <label>
            Website URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://example.com"
            />
          </label>
          {fixture && (
            <div className="alert">
              <Info size={18} />
              <p>
                Sample mode uses recorded Popfly scans. Other sites can be saved, but live scanning
                needs the engine service.
              </p>
            </div>
          )}
          {error && (
            <p className="text-error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}Add site
          </Button>
        </form>
      </Panel>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);

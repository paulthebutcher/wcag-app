import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api, label } from '../lib';
import { Button, Dialog } from './ui/primitives';

export type SavedBrief = { id: string; count: number };

type ReceiptRow = {
  id: string;
  note?: string;
  state: 'ready' | 'unknown' | 'changed' | 'already_in_progress' | 'closed';
  finding: {
    id: string;
    name: string;
    url: string;
    selector: string;
    criterion: string;
    status: string;
  } | null;
};

const rowState = {
  ready: 'Ready to mark In progress',
  unknown: 'Unknown ID in this brief',
  changed: 'Finding changed since export',
  already_in_progress: 'Already In progress',
  closed: 'Finding is closed',
};

function parseReceipt(text: string): unknown {
  const clean = text.trim();
  const fenced = clean.match(/^\x60\x60\x60(?:json)?\s*\n([\s\S]*?)\n\x60\x60\x60$/i);
  try {
    return JSON.parse(fenced?.[1] ?? clean);
  } catch {
    throw new Error('Paste the JSON receipt returned by Codex.');
  }
}

export function FixBriefDownload({
  siteId,
  brief,
  close,
}: {
  siteId: string;
  brief: SavedBrief | null;
  close: () => void;
}) {
  return (
    <Dialog
      open={brief !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Fix brief ready"
      description="Give this Markdown file to Codex and ask it to return the receipt in the brief."
    >
      {brief && (
        <div className="stack-form">
          <p>
            {brief.count} {brief.count === 1 ? 'finding' : 'findings'} in this brief.
          </p>
          <div className="dialog-actions receipt-actions">
            <Button asChild>
              <a href={'/api/sites/' + siteId + '/fix-briefs/' + brief.id + '/download'} download>
                <Download size={16} /> Download fix brief
              </a>
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function FixReceiptDialog({
  siteId,
  onApplied,
}: {
  siteId: string;
  onApplied: (count: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [receipt, setReceipt] = useState<{ data: unknown; rows: ReceiptRow[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [applied, setApplied] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const submission = useRef<{ selection: string; requestId: string } | null>(null);

  useEffect(() => {
    if (receipt || applied !== null) heading.current?.focus();
  }, [receipt, applied]);

  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setText('');
      setReceipt(null);
      setSelected([]);
      setApplied(null);
      setError('');
      submission.current = null;
    }
  }

  async function preview(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const data = parseReceipt(text);
      const { rows } = await api<{ rows: ReceiptRow[] }>(
        '/sites/' + siteId + '/fix-receipts/preview',
        { receipt: data },
      );
      setReceipt({ data, rows });
      setSelected(rows.filter((row) => row.state === 'ready').map((row) => row.id));
      submission.current = null;
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!receipt || !selected.length) return;
    const ordered = [...selected].sort();
    const selection = JSON.stringify(ordered);
    if (submission.current?.selection !== selection)
      submission.current = { selection, requestId: crypto.randomUUID() };
    setPending(true);
    setError('');
    try {
      const result = await api<{ count: number }>('/sites/' + siteId + '/fix-receipts/confirm', {
        receipt: receipt.data,
        selected: ordered,
        request_id: submission.current.requestId,
      });
      setApplied(result.count);
      onApplied(result.count);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => changeOpen(true)}>
        Paste fix receipt
      </Button>
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        title="Fix receipt"
        description="Review the exact findings Codex addressed before marking them In progress."
      >
        {applied !== null ? (
          <div className="stack-form">
            <h3 ref={heading} tabIndex={-1}>
              {applied} {applied === 1 ? 'finding' : 'findings'} marked In progress
            </h3>
            <p>
              Once the changes are published, run Scan declared fixes. It checks all findings
              currently In progress for this site.
            </p>
            <div className="dialog-actions receipt-actions">
              <Button variant="outline" onClick={() => changeOpen(false)}>
                Done
              </Button>
              <Button asChild>
                <Link to={'/sites/' + siteId + '/scans'} onClick={() => changeOpen(false)}>
                  Open Scans
                </Link>
              </Button>
            </div>
          </div>
        ) : !receipt ? (
          <form className="stack-form" onSubmit={preview}>
            <label>
              Receipt JSON
              <textarea
                rows={7}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={200000}
                required
              />
            </label>
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
            <div className="dialog-actions receipt-actions">
              <Button disabled={pending || !text.trim()}>Preview findings</Button>
            </div>
          </form>
        ) : (
          <div className="stack-form">
            <h3 ref={heading} tabIndex={-1}>
              {selected.length} of {receipt.rows.length} selected
            </h3>
            <ul className="receipt-rows" tabIndex={0} aria-label="Receipt findings">
              {receipt.rows.map((row) => (
                <li key={row.id}>
                  <div className="receipt-row-heading">
                    {row.state === 'ready' && (
                      <input
                        type="checkbox"
                        aria-label={'Select ' + row.id + ' ' + row.finding?.name}
                        checked={selected.includes(row.id)}
                        disabled={pending}
                        onChange={(event) =>
                          setSelected((old) =>
                            event.target.checked
                              ? [...old, row.id]
                              : old.filter((id) => id !== row.id),
                          )
                        }
                      />
                    )}
                    <strong>{row.id}</strong>
                    {row.finding && (
                      <Link
                        target="_blank"
                        rel="noreferrer"
                        to={'/sites/' + siteId + '/errors/' + row.finding.id}
                      >
                        {row.finding.name}
                      </Link>
                    )}
                  </div>
                  <p>
                    {rowState[row.state]}
                    {row.finding && ' · Current status: ' + label(row.finding.status)}
                  </p>
                  {row.finding && (
                    <>
                      <p className="muted">
                        {row.finding.url} · WCAG {row.finding.criterion}
                      </p>
                      {row.finding.selector && <code>{row.finding.selector}</code>}
                    </>
                  )}
                  {row.note && <p>Codex note: {row.note}</p>}
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
            <div className="dialog-actions receipt-actions">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setReceipt(null);
                  setError('');
                }}
              >
                Back to receipt
              </Button>
              <Button disabled={pending || !selected.length} onClick={() => void confirm()}>
                Mark {selected.length} In progress
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

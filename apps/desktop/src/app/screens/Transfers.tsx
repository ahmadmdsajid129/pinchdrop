import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Folder, PauseCircle, XCircle } from 'lucide-react';
import { api, formatBytes, useTransfers } from '../../shared/api';
import type { TransferView } from '../../shared/types';
import { useApp } from '../context';
import { Button, Card, EmptyState, PageTitle } from '../ui';
import { confirm } from '../pickers';

const FILTERS = ['All', 'In progress', 'Delivered', 'Failed / not caught'] as const;
type Filter = (typeof FILTERS)[number];

const ACTIVE = new Set<TransferView['state']>(['offered', 'sending', 'paused']);

function matches(t: TransferView, f: Filter) {
  if (f === 'All') return true;
  if (f === 'In progress') return ACTIVE.has(t.state);
  if (f === 'Delivered') return t.state === 'done';
  return ['failed', 'declined', 'cancelled'].includes(t.state);
}

function statusText(t: TransferView): string {
  switch (t.state) {
    case 'offered':
      return `Waiting for ${t.deviceName} to accept`;
    case 'sending':
      return `Sending · ${t.filesDone} of ${t.fileCount} files · ${formatBytes(t.bytesDone)} / ${formatBytes(t.totalBytes)}`;
    case 'paused':
      return `Paused at ${pct(t)}% — resumes when ${t.deviceName} is back`;
    case 'done':
      return `Delivered to ${t.deviceName}${t.moved ? ' · PC copy moved to the Recycle Bin' : ''}`;
    case 'declined':
      return `${t.deviceName} declined`;
    case 'cancelled':
      return 'Cancelled';
    case 'failed':
      return t.error ?? 'Failed';
  }
}

function pct(t: TransferView) {
  return t.totalBytes > 0 ? Math.floor((t.bytesDone / t.totalBytes) * 100) : t.state === 'done' ? 100 : 0;
}

function when(secs: number) {
  const d = new Date(secs * 1000);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString();
}

function Row({ t }: { t: TransferView }) {
  const active = ACTIVE.has(t.state);
  const icon =
    t.state === 'done' ? <CheckCircle2 size={22} className="text-success" aria-hidden="true" />
    : t.state === 'paused' ? <PauseCircle size={22} className="text-warn" aria-hidden="true" />
    : active ? <Folder size={22} className="text-accent" aria-hidden="true" />
    : <XCircle size={22} className="text-danger" aria-hidden="true" />;
  const what = [
    t.fileCount ? `${t.fileCount} file${t.fileCount === 1 ? '' : 's'} · ${formatBytes(t.totalBytes)}` : null,
    t.textCount ? `${t.textCount} note${t.textCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  async function cancel() {
    if (await confirm(`Stop sending “${t.label}”? Files that already arrived stay on the phone.`, 'Cancel this send?', 'Stop sending')) {
      await api.cancelTransfer(t.id);
    }
  }

  return (
    <li className="flex items-center gap-3.5 p-4 rounded-2xl bg-surface border border-line">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold truncate">{t.label}</span>
          <span className="text-[12px] text-muted">{what}</span>
        </div>
        <div className={`text-[13px] ${t.state === 'failed' ? 'text-danger' : 'text-muted'}`}>{statusText(t)}</div>
        {t.error && t.state === 'done' && <div className="text-[12px] text-warn">{t.error}</div>}
        {(t.state === 'sending' || t.state === 'paused') && (
          <div
            className="mt-2 h-1.5 rounded-full bg-surface2 overflow-hidden"
            role="progressbar"
            aria-label={`${t.label} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct(t)}
          >
            <div
              className={`h-full w-full origin-left ${t.state === 'paused' ? 'bg-warn' : 'bg-primary'} transition-transform duration-300 ease-out`}
              style={{ transform: `scaleX(${pct(t) / 100})` }}
            />
          </div>
        )}
      </div>
      <div className="text-[12px] text-muted shrink-0">{when(t.createdAt)}</div>
      {active && <Button size="sm" variant="ghost" onClick={() => void cancel()}>Cancel</Button>}
    </li>
  );
}

export function Transfers() {
  const { go } = useApp();
  const transfers = useTransfers();
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  const shown = useMemo(
    () => transfers.filter((t) => matches(t, filter) && t.label.toLowerCase().includes(query.trim().toLowerCase())),
    [transfers, filter, query],
  );
  const hasFinished = transfers.some((t) => !ACTIVE.has(t.state));

  async function clear() {
    if (await confirm('Removes finished sends from this list. Files on the phone are not touched.', 'Clear transfer history?', 'Clear')) {
      await api.clearTransferHistory();
    }
  }

  return (
    <>
      <PageTitle
        actions={
          <>
            <label htmlFor="tsearch" className="sr-only">Search transfers</label>
            <input
              id="tsearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              className="h-10 w-56 px-3 rounded-xl bg-surface border border-line text-[14px] text-text placeholder:text-muted"
            />
            <Button disabled={!hasFinished} onClick={() => void clear()}>Clear history</Button>
          </>
        }
      >
        Transfers
      </PageTitle>

      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Filter transfers">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={`h-[34px] px-3.5 rounded-full text-[13px] font-semibold ${filter === f ? 'bg-primary text-white' : 'border border-line text-soft hover:text-text'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
          {shown.map((t) => <Row key={t.id} t={t} />)}
        </ul>
      ) : (
        <Card>
          <EmptyState
            icon={<Clock size={26} aria-hidden="true" />}
            title={transfers.length === 0 ? 'No transfers yet' : 'Nothing matches'}
            action={transfers.length === 0 ? <Button variant="primary" onClick={() => go('send')}>Send something</Button> : undefined}
          >
            Everything you send is listed here with its status. Interrupted sends resume by themselves when the phone is back. History stays on this PC only.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { File, Folder, Upload } from 'lucide-react';
import { api, formatBytes } from '../shared/api';
import type { HoldView } from '../shared/types';

/**
 * Something was pinched on the PC and released: it's "in the air" for the catch window.
 * The phone shows its Catch screen (P6); here the user can also send it straight away or drop it.
 */
export function HoldIsland({ hold, width }: { hold: HoldView; width: number }) {
  const [left, setLeft] = useState(hold.expiresInMs);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const end = Date.now() + hold.expiresInMs;
    setLeft(hold.expiresInMs);
    const t = window.setInterval(() => setLeft(Math.max(0, end - Date.now())), 200);
    return () => clearInterval(t);
  }, [hold.id, hold.expiresInMs]);

  const secs = Math.ceil(left / 1000);
  const frac = hold.totalMs > 0 ? left / hold.totalMs : 0;
  const R = 22;
  const C = 2 * Math.PI * R;

  async function sendNow() {
    setSending(true);
    setError(null);
    try {
      await api.holdSendNow();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setSending(false);
    }
  }

  return (
    <section
      aria-label="Holding grabbed items"
      style={{ width }}
      className="p-5 flex flex-col gap-4 text-text"
    >
      <div className="flex items-center gap-3">
        <div className="relative w-[54px] h-[54px] shrink-0" role="timer" aria-label={`${secs} seconds left to catch`}>
          <svg width="54" height="54" viewBox="0 0 54 54" className="-rotate-90" aria-hidden="true">
            <circle cx="27" cy="27" r={R} fill="none" stroke="rgb(var(--surface2))" strokeWidth="5" />
            <circle
              cx="27"
              cy="27"
              r={R}
              fill="none"
              stroke="rgb(var(--accent))"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[15px] font-bold">{secs}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 font-display font-semibold text-[16px]">
            {hold.isFolder ? (
              <Folder size={16} className="text-warn shrink-0" aria-hidden="true" />
            ) : (
              <File size={16} className="text-accent shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">“{hold.label}” is in the air</span>
          </div>
          <div className="text-[12px] text-muted truncate">
            {hold.fileCount === 0 ? 'Link or note' : `${hold.fileCount} file${hold.fileCount === 1 ? '' : 's'} · ${formatBytes(hold.totalBytes)}`} ·{' '}
            {hold.phoneName ? `open your hand over ${hold.phoneName}` : 'no phone connected — use Send now'}
          </div>
        </div>
      </div>
      {error && (
        <div className="text-[12px] text-danger" role="alert">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={sending}
          onClick={() => void sendNow()}
          className="flex-1 h-10 rounded-full bg-primary text-white text-[13px] font-semibold hover:brightness-110 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
        >
          <Upload size={15} aria-hidden="true" /> {sending ? 'Sending…' : 'Send now'}
        </button>
        <button
          type="button"
          onClick={() => void api.holdCancel()}
          className="flex-1 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-[13px] font-semibold text-soft hover:text-text"
        >
          Drop it
        </button>
      </div>
    </section>
  );
}

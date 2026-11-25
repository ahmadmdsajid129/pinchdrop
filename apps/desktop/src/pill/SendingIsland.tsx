import { motion } from 'framer-motion';
import { Check, File, Folder, Pause, X } from 'lucide-react';
import { api, formatBytes } from '../shared/api';
import type { TransferView } from '../shared/types';

/**
 * Live progress of a send on the Island (like a phone's live activity), then a short
 * "Delivered" moment. GPU-only animation: the bar is a scaleX transform.
 */
export function SendingIsland({ t, width, reduced }: { t: TransferView; width: number; reduced: boolean }) {
  const done = t.state === 'done';
  const failed = ['failed', 'declined', 'cancelled'].includes(t.state);
  const paused = t.state === 'paused';
  const waiting = t.state === 'offered';
  const frac = t.totalBytes > 0 ? Math.min(1, t.bytesDone / t.totalBytes) : done ? 1 : 0;
  const pct = Math.round(frac * 100);

  let line: string;
  if (done) line = `Delivered to ${t.deviceName}${t.moved ? ' · PC copy in the Recycle Bin' : ''}`;
  else if (failed) line = t.error ?? (t.state === 'declined' ? `${t.deviceName} declined` : 'Stopped');
  else if (paused) line = `Paused at ${pct}% — resumes when ${t.deviceName} is back`;
  else if (waiting) line = `Waiting for ${t.deviceName} to accept…`;
  else line = `${t.filesDone} of ${t.fileCount} files · ${formatBytes(t.bytesDone)} of ${formatBytes(t.totalBytes)}`;

  return (
    <section aria-label={`Sending ${t.label}`} style={{ width }} className="p-5 flex flex-col gap-4 text-text">
      <div className="flex items-center gap-3">
        <motion.div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
            done ? 'bg-success text-[#0B1020]' : failed ? 'bg-danger/20 text-danger' : 'bg-surface2 text-accent'
          }`}
          initial={false}
          animate={done && !reduced ? { scale: [1, 1.18, 1] } : { scale: 1 }}
          transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
        >
          {done ? (
            <Check size={22} strokeWidth={3} aria-hidden="true" />
          ) : failed ? (
            <X size={22} aria-hidden="true" />
          ) : paused ? (
            <Pause size={20} aria-hidden="true" />
          ) : t.fileCount > 1 ? (
            <Folder size={22} aria-hidden="true" />
          ) : (
            <File size={22} aria-hidden="true" />
          )}
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-[16px] truncate">
            {done ? `“${t.label}” arrived` : `Sending “${t.label}”`}
          </div>
          <div className={`text-[12px] truncate ${failed ? 'text-danger' : 'text-muted'}`} aria-live="polite">
            {line}
          </div>
        </div>
        {!done && !failed && <div className="text-[18px] font-bold tabular-nums">{pct}%</div>}
      </div>
      {!failed && (
        <div className="h-1 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label={`${t.label} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-full w-full origin-left transition-transform duration-300 ease-out ${done ? 'bg-success' : paused ? 'bg-warn' : 'bg-gradient-to-r from-primary to-accent'}`}
            style={{ transform: `scaleX(${frac})` }}
          />
        </div>
      )}
      {!done && !failed && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void api.cancelTransfer(t.id)}
            className="h-8 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-[12px] font-semibold text-soft hover:text-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

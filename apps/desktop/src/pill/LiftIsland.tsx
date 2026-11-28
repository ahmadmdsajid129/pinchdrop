import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Hand } from 'lucide-react';
import { api, formatBytes } from '../shared/api';
import { ItemThumb } from '../shared/ItemPreview';
import type { LiftView } from '../shared/types';

/**
 * v2 · Your phone lifted something into the air: open your hand at the webcam to catch it,
 * or press Take it. Counts down like the phone's catch window.
 */
export function LiftIsland({ lift, width, cameraOn }: { lift: LiftView; width: number; cameraOn: boolean }) {
  const [left, setLeft] = useState(lift.expiresInMs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const end = Date.now() + lift.expiresInMs;
    setLeft(lift.expiresInMs);
    const t = window.setInterval(() => setLeft(Math.max(0, end - Date.now())), 200);
    return () => clearInterval(t);
  }, [lift.id, lift.expiresInMs]);

  const secs = Math.ceil(left / 1000);
  const frac = lift.totalMs > 0 ? left / lift.totalMs : 0;
  const R = 22;
  const C = 2 * Math.PI * R;
  const what =
    lift.fileCount === 0
      ? lift.preview.kind === 'link'
        ? 'Link'
        : 'Note'
      : `${lift.fileCount} file${lift.fileCount === 1 ? '' : 's'} · ${formatBytes(lift.totalBytes)}`;

  async function take() {
    setBusy(true);
    setError(null);
    try {
      await api.liftCatch(lift.id);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <section aria-label={`${lift.label} from ${lift.phoneName}`} style={{ width }} className="p-5 flex flex-col gap-4 text-text">
      <div className="flex items-center gap-3">
        <motion.div
          className="relative shrink-0"
          initial={{ y: 18, scale: 0.8, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        >
          <ItemThumb p={lift.preview} size={54} />
          <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-black flex items-center justify-center" role="timer" aria-label={`${secs} seconds left`}>
            <svg width="24" height="24" viewBox="0 0 54 54" className="absolute -rotate-90" aria-hidden="true">
              <circle cx="27" cy="27" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
              <circle cx="27" cy="27" r={R} fill="none" stroke="rgb(var(--accent))" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
            </svg>
            <span className="relative text-[9px] font-bold">{secs}</span>
          </span>
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-[16px] truncate">“{lift.label}”</div>
          <div className="text-[12px] text-muted truncate">
            From {lift.phoneName} · {what}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-accent">
            <Hand size={13} aria-hidden="true" />
            {cameraOn ? 'Open your hand at the camera to catch it' : 'Press Take it to catch it'}
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
          disabled={busy}
          onClick={() => void take()}
          className="flex-1 h-10 rounded-full bg-primary text-on-primary text-[13px] font-semibold hover:brightness-110 disabled:opacity-60 transition active:scale-[0.97]"
        >
          {busy ? 'Taking…' : 'Take it'}
        </button>
        <button
          type="button"
          onClick={() => void api.liftDismiss()}
          className="flex-1 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-[13px] font-semibold text-soft hover:text-text transition active:scale-[0.97]"
        >
          Not now
        </button>
      </div>
    </section>
  );
}

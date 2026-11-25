import { useEffect, useState } from 'react';
import { Hand } from 'lucide-react';
import type { SessionView } from '../shared/types';

/**
 * The camera line inside the Island. All camera state lives here — no separate on-screen
 * badge: a green dot (like the iPhone's camera indicator) when it's watching, a clear
 * Start gestures button when it isn't, and any problem in plain words.
 */
export function CameraRow({
  session,
  error,
  mode,
  enabled,
  onStart,
  onStop,
}: {
  session: SessionView | null;
  error: string | null;
  mode: string;
  enabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const active = !!session?.active;
  const [left, setLeft] = useState(session?.endsInMs ?? 0);
  useEffect(() => {
    if (!session?.active) return;
    const end = Date.now() + session.endsInMs;
    setLeft(session.endsInMs);
    const t = window.setInterval(() => setLeft(Math.max(0, end - Date.now())), 250);
    return () => clearInterval(t);
  }, [session]);

  if (!enabled) return null;
  if (mode === 'on_select') {
    return error ? <p className="m-0 text-[12px] text-danger" role="alert">{error}</p> : null;
  }

  if (!active) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onStart}
          className="h-11 rounded-full bg-white text-black text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition-transform duration-150 active:scale-[0.97] hover:bg-white/90"
        >
          <Hand size={17} aria-hidden="true" /> Start gestures
        </button>
        {error && <p className="m-0 text-[12px] text-danger text-center" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3.5 h-11 rounded-full bg-white/[0.06]" aria-live="polite">
      <span className="relative flex w-2.5 h-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
        <span className="relative w-2.5 h-2.5 rounded-full bg-success" />
      </span>
      <div className="flex-1 min-w-0 text-[13px] truncate">
        {error ? (
          <span className="text-danger" role="alert">{error}</span>
        ) : (
          <>
            <span className="text-text font-semibold">Watching</span>
            <span className="text-muted"> · select, then pinch</span>
          </>
        )}
      </div>
      <span className="text-[12px] text-muted tabular-nums">{Math.ceil(left / 1000)}s</span>
      <button
        type="button"
        onClick={onStop}
        className="h-7 px-3 rounded-full bg-white/10 text-[12px] font-semibold text-soft hover:text-text hover:bg-white/15 transition-colors"
      >
        Stop
      </button>
    </div>
  );
}

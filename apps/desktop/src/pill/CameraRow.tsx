import { useEffect, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import type { SessionView } from '../shared/types';

/**
 * The camera line on the Island: tells the user, at all times, whether the camera is on,
 * what it's waiting for, and when it switches itself off — plus any problem in plain words.
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

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${active ? 'bg-success/10' : 'bg-surface'}`}>
      {active ? (
        <Camera size={16} className="text-success shrink-0" aria-hidden="true" />
      ) : (
        <CameraOff size={16} className="text-muted shrink-0" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0 text-[12px] leading-snug" aria-live="polite">
        {error ? (
          <span className="text-danger" role="alert">{error}</span>
        ) : active ? (
          <>
            <span className="text-text font-semibold">Camera on</span>
            <span className="text-muted"> · select a file or folder, then pinch · off in {Math.ceil(left / 1000)} s</span>
          </>
        ) : (
          <span className="text-muted">Camera off{mode === 'hotkey' ? ' · Ctrl+Shift+Space turns it on' : ''}</span>
        )}
      </div>
      <button
        type="button"
        onClick={active ? onStop : onStart}
        className="h-7 px-2.5 rounded-lg border border-line bg-bg text-[12px] font-semibold text-soft hover:text-text shrink-0"
      >
        {active ? 'Stop' : 'Turn on'}
      </button>
    </div>
  );
}

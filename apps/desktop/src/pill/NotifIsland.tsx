import { useEffect, useRef, useState } from 'react';
import { Bell, CornerDownLeft, X } from 'lucide-react';
import { api } from '../shared/api';
import type { NotifView } from '../shared/types';

/** "now", "3 min", "2 h", else the time. */
export function shortAgo(ms: number): string {
  const d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 60) return 'now';
  if (d < 3600) return `${Math.floor(d / 60)} min`;
  if (d < 86400) return `${Math.floor(d / 3600)} h`;
  return new Date(ms).toLocaleDateString();
}

export function AppIcon({ n, size = 40 }: { n: Pick<NotifView, 'icon' | 'app'>; size?: number }) {
  return n.icon ? (
    <img src={n.icon} alt="" width={size} height={size} className="rounded-[10px] shrink-0" style={{ width: size, height: size }} />
  ) : (
    <span className="rounded-[10px] shrink-0 bg-white/10 text-soft flex items-center justify-center font-bold" style={{ width: size, height: size }}>
      {n.app ? n.app.charAt(0).toUpperCase() : <Bell size={size * 0.45} />}
    </span>
  );
}

/**
 * v2 · A phone notification dropping down from the Island (like the iPhone's), with Reply
 * (when the app allows it) and Dismiss. Closes by itself unless you're replying or hovering.
 */
export function NotifIsland({
  n,
  width,
  onClose,
  onReplying,
  replyNonce = 0,
  showDevice = false,
}: {
  n: NotifView;
  width: number;
  onClose: () => void;
  onReplying: (on: boolean) => void;
  /** Bumped by the peace-sign gesture: open the reply box. */
  replyNonce?: number;
  /** Several phones connected: say which one it's from. */
  showDevice?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setReplying(false);
    setText('');
    setError(null);
  }, [n.key]);
  useEffect(() => {
    if (replyNonce > 0 && n.canReply) setReplying(true);
  }, [replyNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onReplying(replying);
    if (replying) input.current?.focus();
  }, [replying, onReplying]);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.notifReply(n.key, text.trim());
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={`${n.app}: ${n.title}`} style={{ width }} className="p-4 flex flex-col gap-3 text-text">
      <div className="flex items-start gap-3">
        <AppIcon n={n} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <span className="truncate font-semibold uppercase tracking-wide">{n.app}</span>
            <span>·</span>
            <span className="shrink-0">{shortAgo(n.time)}</span>
            {showDevice && n.deviceName && <span className="shrink-0 truncate opacity-80">· {n.deviceName}</span>}
          </div>
          {n.title && <div className="font-semibold text-[15px] truncate">{n.title}</div>}
          {n.text && <div className="text-[13px] text-soft line-clamp-2 break-words">{n.text}</div>}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss (clears it on the phone too)"
          onClick={() => {
            void api.notifDismiss(n.key).catch(() => undefined);
            onClose();
          }}
          className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-soft flex items-center justify-center shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      {replying ? (
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                setReplying(false);
              }
            }}
            placeholder={`Reply to ${n.title || n.app}…`}
            className="flex-1 resize-none max-h-24 rounded-[14px] bg-white/[0.08] px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/60 placeholder:text-muted"
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void send()}
            className="h-9 px-4 rounded-full bg-primary text-white text-[13px] font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <CornerDownLeft size={14} /> {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      ) : (
        n.canReply && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="flex-1 h-9 rounded-full bg-white/[0.1] hover:bg-white/[0.16] text-[13px] font-semibold transition active:scale-[0.97]"
            >
              Reply
            </button>
          </div>
        )
      )}
      {error && (
        <div className="text-[12px] text-danger" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

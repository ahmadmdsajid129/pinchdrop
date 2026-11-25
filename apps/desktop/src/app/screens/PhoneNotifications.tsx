import { useState } from 'react';
import { Bell, CornerDownLeft, X } from 'lucide-react';
import { api, useNotifications } from '../../shared/api';
import type { NotifView } from '../../shared/types';
import { useApp } from '../context';
import { Button, Card, EmptyState, PageTitle } from '../ui';
import { shortAgo } from '../../pill/NotifIsland';

function Icon({ n }: { n: NotifView }) {
  return n.icon ? (
    <img src={n.icon} alt="" width={40} height={40} className="w-10 h-10 rounded-[10px] shrink-0" />
  ) : (
    <span className="w-10 h-10 rounded-[10px] shrink-0 bg-surface2 text-soft flex items-center justify-center font-bold">{n.app.charAt(0).toUpperCase() || '?'}</span>
  );
}

function Item({ n }: { n: NotifView }) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.notifReply(n.key, text.trim());
      setText('');
      setReplying(false);
      setMsg('Sent');
    } catch (e) {
      setMsg(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3.5 flex gap-3">
      <Icon n={n} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11.5px] text-muted">
          <span className="font-semibold uppercase tracking-wide truncate">{n.app}</span>
          <span>·</span>
          <span className="shrink-0">{shortAgo(n.time)}</span>
        </div>
        {n.title && <div className="font-semibold text-[14px]">{n.title}</div>}
        {n.text && <div className="text-[13.5px] text-soft whitespace-pre-wrap break-words">{n.text}</div>}
        {replying && (
          <div className="mt-2 flex items-end gap-2">
            <textarea
              autoFocus
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`Reply to ${n.title || n.app}…`}
              className="flex-1 resize-none max-h-28 rounded-[14px] bg-bg2 px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-primary/50"
            />
            <Button size="sm" variant="primary" onClick={() => void send()} disabled={busy || !text.trim()}>
              <CornerDownLeft size={13} /> {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>
        )}
        {msg && <div className={`mt-1 text-[12px] ${msg === 'Sent' ? 'text-success' : 'text-danger'}`}>{msg}</div>}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        {n.canReply && !replying && (
          <Button size="sm" onClick={() => setReplying(true)}>
            Reply
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-label="Dismiss" title="Dismiss (clears it on the phone too)" onClick={() => void api.notifDismiss(n.key).catch(() => undefined)}>
          <X size={14} />
        </Button>
      </div>
    </li>
  );
}

/** v2 · What's showing on the phone right now. Mirrored live while connected; never saved. */
export function PhoneNotifications() {
  const { phone, go } = useApp();
  const items = useNotifications();
  return (
    <>
      <PageTitle>Notifications</PageTitle>
      <Card className="p-0 overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={<Bell size={26} />}
            title={phone.state === 'connected' ? 'No notifications on your phone' : 'Connect your phone'}
            action={phone.state !== 'connected' ? <Button variant="primary" onClick={() => go(phone.state === 'none' ? 'pair' : 'devices')}>{phone.state === 'none' ? 'Pair a phone' : 'Devices'}</Button> : undefined}
          >
            New ones drop down from the Island as they arrive. If nothing ever shows up, turn on
            <b> Notifications on your PC</b> in the phone app: Settings → Permissions.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <Item key={n.key} n={n} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

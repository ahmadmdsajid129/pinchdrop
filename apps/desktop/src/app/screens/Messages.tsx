import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, PenSquare, RefreshCw, Search, Send as SendIcon } from 'lucide-react';
import { api, onEvent } from '../../shared/api';
import type { SmsThread, SmsThreadDetail } from '../../shared/types';
import { useApp } from '../context';
import { Button, Card, EmptyState, PageTitle } from '../ui';
import { initials } from '../Sidebar';

/** Another screen (Contacts) can ask Messages to open a conversation with someone. */
let pendingCompose: { address: string; name: string | null } | null = null;
export function composeTo(address: string, name: string | null) {
  pendingCompose = { address, name };
}

function when(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - ms) / 86400e3;
  if (days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const digits = (s: string) => s.replace(/\D/g, '').slice(-10);

/**
 * v2 · Text messages from the phone: conversations on the left, the open one on the right,
 * reply from the PC keyboard. Read from the phone each time; nothing is saved on the PC.
 */
export function Messages() {
  const { phone, go } = useApp();
  const [threads, setThreads] = useState<SmsThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ threadId: number | null; address: string; name: string | null } | null>(null);
  const [detail, setDetail] = useState<SmsThreadDetail | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      setThreads(await api.smsThreads());
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (threadId: number) => {
    try {
      setDetail(await api.smsThread(threadId));
    } catch (e) {
      setSendError(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    void loadThreads().then(() => {
      if (pendingCompose) {
        setOpen({ threadId: null, ...pendingCompose });
        pendingCompose = null;
      }
    });
  }, [loadThreads, phone.state]);

  // A text arrived: refresh the list (and the open conversation if it's from them).
  useEffect(() => {
    const off = onEvent<{ address: string }>('sms-new', (m) => {
      void loadThreads();
      const o = openRef.current;
      if (o?.threadId != null && digits(o.address) === digits(m.address)) {
        window.setTimeout(() => void loadThread(o.threadId!), 1200);
      }
    });
    return () => void off.then((u) => u());
  }, [loadThreads, loadThread]);

  // Opening a new conversation with someone who already has one: use that thread.
  useEffect(() => {
    if (!open || open.threadId != null || !threads) return;
    const t = threads.find((x) => digits(x.address) === digits(open.address));
    if (t) setOpen({ threadId: t.threadId, address: t.address, name: t.name });
  }, [open, threads]);

  useEffect(() => {
    setDetail(null);
    setSendError(null);
    if (open?.threadId != null) void loadThread(open.threadId);
  }, [open?.threadId, loadThread]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [detail]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!threads) return [];
    return q ? threads.filter((t) => (t.name ?? '').toLowerCase().includes(q) || t.address.includes(q) || t.snippet.toLowerCase().includes(q)) : threads;
  }, [threads, query]);

  async function send() {
    if (!open || !text.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await api.smsSend(open.address, text.trim());
      setText('');
      // Android files it in a moment; then show it.
      window.setTimeout(async () => {
        await loadThreads();
        const o = openRef.current;
        if (o?.threadId != null) void loadThread(o.threadId);
      }, 1500);
    } catch (e) {
      setSendError(String(e instanceof Error ? e.message : e));
    } finally {
      setSending(false);
    }
  }

  function newMessage() {
    const n = window.prompt('Send a text to (phone number):');
    if (n && n.trim()) setOpen({ threadId: null, address: n.trim(), name: null });
  }

  if (phone.state !== 'connected' && !phone.isDemo) {
    return (
      <>
        <PageTitle>Messages</PageTitle>
        <Card>
          <EmptyState icon={<MessageSquare size={26} />} title="Connect your phone to see messages" action={<Button variant="primary" onClick={() => go(phone.state === 'none' ? 'pair' : 'devices')}>{phone.state === 'none' ? 'Pair a phone' : 'Devices'}</Button>}>
            Your text messages stay on your phone. PinchDrop shows them here while it's connected.
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle
        actions={
          <>
            <Button size="sm" onClick={() => void loadThreads()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button size="sm" variant="primary" onClick={newMessage}>
              <PenSquare size={14} /> New message
            </Button>
          </>
        }
      >
        Messages
      </PageTitle>
      {error ? (
        <Card>
          <EmptyState icon={<MessageSquare size={26} />} title="Can't show messages yet" action={<Button onClick={() => void loadThreads()}>Try again</Button>}>
            {error}
          </EmptyState>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden flex h-[calc(100vh-150px)] min-h-[420px]">
          {/* conversations */}
          <div className={`w-[300px] shrink-0 border-r border-line flex flex-col max-[860px]:w-[230px]`}>
            <div className="p-3 border-b border-line">
              <label className="flex items-center gap-2 h-9 px-3 rounded-full bg-bg2 text-muted">
                <Search size={14} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="flex-1 bg-transparent outline-none text-[13px] text-text placeholder:text-muted" />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads === null && <div className="p-4 text-[13px] text-muted">Asking your phone…</div>}
              {threads?.length === 0 && <div className="p-4 text-[13px] text-muted">No text messages on the phone.</div>}
              {shown.map((t) => {
                const active = open?.threadId === t.threadId;
                return (
                  <button
                    key={t.threadId}
                    type="button"
                    onClick={() => setOpen({ threadId: t.threadId, address: t.address, name: t.name })}
                    className={`w-full text-left flex gap-3 px-3 py-2.5 ${active ? 'bg-primary/10' : 'hover:bg-bg2'}`}
                  >
                    <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a1a1aa] to-[#71717a] text-white font-semibold text-[14px] flex items-center justify-center shrink-0">
                      {t.name ? initials(t.name) : '#'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`flex-1 truncate text-[14px] ${t.unread ? 'font-bold' : 'font-semibold'}`}>{t.name ?? t.address}</span>
                        <span className="text-[11px] text-muted shrink-0">{when(t.date)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`flex-1 truncate text-[12.5px] ${t.unread ? 'text-text' : 'text-muted'}`}>
                          {t.outgoing ? 'You: ' : ''}
                          {t.snippet}
                        </span>
                        {t.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">{t.unread}</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* the open conversation */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!open ? (
              <div className="flex-1 flex items-center justify-center text-muted text-[14px]">Pick a conversation</div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-line">
                  <div className="font-semibold text-[15px]">{open.name ?? detail?.name ?? open.address}</div>
                  {(open.name ?? detail?.name) && <div className="text-[12px] text-muted">{open.address}</div>}
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-1.5 bg-bg">
                  {open.threadId != null && !detail && <div className="text-[13px] text-muted">Loading…</div>}
                  {open.threadId == null && <div className="text-[13px] text-muted">New conversation</div>}
                  {detail?.messages.map((m, i) => {
                    const prev = detail.messages[i - 1];
                    const gap = !prev || m.date - prev.date > 30 * 60e3;
                    return (
                      <div key={m.id} className="flex flex-col">
                        {gap && <div className="self-center text-[11px] text-muted my-2">{new Date(m.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</div>}
                        <div
                          className={`max-w-[72%] px-3.5 py-2 rounded-[18px] text-[14px] whitespace-pre-wrap break-words ${
                            m.outgoing ? 'self-end bg-[#007AFF] text-white rounded-br-[6px]' : 'self-start bg-surface2 text-text rounded-bl-[6px]'
                          } ${m.status === 'failed' ? 'opacity-60' : ''}`}
                          title={new Date(m.date).toLocaleString()}
                        >
                          {m.body}
                        </div>
                        {m.status === 'failed' && <div className="self-end text-[11px] text-danger mt-0.5">Not delivered</div>}
                      </div>
                    );
                  })}
                  <div ref={bottom} />
                </div>
                {sendError && <div className="px-5 pt-2 text-[12px] text-danger">{sendError}</div>}
                <div className="p-3 border-t border-line flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Text message (Enter to send, Shift+Enter for a new line)"
                    className="flex-1 resize-none max-h-32 rounded-[18px] bg-bg2 px-4 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted"
                  />
                  <Button variant="primary" onClick={() => void send()} disabled={sending || !text.trim()} aria-label="Send">
                    <SendIcon size={15} /> {sending ? 'Sending…' : 'Send'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Phone, RefreshCw, Search, Star, Users } from 'lucide-react';
import { api } from '../../shared/api';
import type { Contact } from '../../shared/types';
import { useApp } from '../context';
import { Button, Card, EmptyState, PageTitle } from '../ui';
import { initials } from '../Sidebar';
import { composeTo } from './Messages';

/**
 * v2 · The phone's contacts: search, text or call (the phone makes the call).
 * Asked from the phone each time; nothing is saved on the PC.
 */
export function Contacts() {
  const { phone, go } = useApp();
  const [list, setList] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api.contacts());
      setError(null);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, phone.state]);

  const shown = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    const hits = q
      ? list.filter((c) => c.name.toLowerCase().includes(q) || (qd.length >= 3 && c.numbers.some((n) => n.number.replace(/\D/g, '').includes(qd))))
      : list;
    return [...hits.filter((c) => c.starred), ...hits.filter((c) => !c.starred)];
  }, [list, query]);

  async function call(c: Contact, number: string) {
    setNote(null);
    try {
      const r = await api.dial(number);
      setNote(
        r.how === 'calling'
          ? `Calling ${c.name} on your phone…`
          : r.how === 'dialer'
            ? `Your phone's dialer is open with ${c.name}'s number — tap call.`
            : `Tap the notification on your phone to call ${c.name}.`,
      );
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e));
    }
  }

  function text(c: Contact, number: string) {
    composeTo(number, c.name);
    go('messages');
  }

  if (phone.state !== 'connected' && !phone.isDemo) {
    return (
      <>
        <PageTitle>Contacts</PageTitle>
        <Card>
          <EmptyState icon={<Users size={26} />} title="Connect your phone to see contacts" action={<Button variant="primary" onClick={() => go(phone.state === 'none' ? 'pair' : 'devices')}>{phone.state === 'none' ? 'Pair a phone' : 'Devices'}</Button>}>
            Your contacts stay on your phone. PinchDrop shows them here while it's connected.
          </EmptyState>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageTitle
        actions={
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      >
        Contacts
      </PageTitle>
      {note && (
        <div className="px-4 py-3 rounded-2xl bg-primary/10 text-[14px] text-text" role="status">
          {note}
        </div>
      )}
      {error ? (
        <Card>
          <EmptyState icon={<Users size={26} />} title="Can't show contacts yet" action={<Button onClick={() => void load()}>Try again</Button>}>
            {error}
          </EmptyState>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="p-3 border-b border-line">
            <label className="flex items-center gap-2 h-10 px-3.5 rounded-full bg-bg2 text-muted">
              <Search size={15} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={list ? `Search ${list.length} contacts` : 'Search'} className="flex-1 bg-transparent outline-none text-[14px] text-text placeholder:text-muted" />
            </label>
          </div>
          {list === null && <div className="p-5 text-[13px] text-muted">Asking your phone…</div>}
          {list?.length === 0 && <div className="p-5 text-[13px] text-muted">No contacts with phone numbers.</div>}
          <ul className="divide-y divide-line">
            {shown.slice(0, 400).map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a1a1aa] to-[#71717a] text-white font-semibold text-[14px] flex items-center justify-center shrink-0">{initials(c.name)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] flex items-center gap-1.5 truncate">
                    {c.name}
                    {c.starred && <Star size={12} className="text-warn shrink-0" fill="currentColor" aria-label="Favourite" />}
                  </div>
                  <div className="flex flex-col">
                    {c.numbers.map((n) => (
                      <div key={n.number} className="flex items-center gap-2 text-[12.5px] text-muted">
                        <span className="truncate">
                          {n.number} · {n.label}
                        </span>
                        <button type="button" onClick={() => text(c, n.number)} className="ml-auto sm:ml-0 h-7 px-2.5 rounded-full hover:bg-bg2 text-primary-ink inline-flex items-center gap-1 font-medium" title={`Text ${n.number}`}>
                          <MessageSquare size={13} /> Text
                        </button>
                        <button type="button" onClick={() => void call(c, n.number)} className="h-7 px-2.5 rounded-full hover:bg-bg2 text-success inline-flex items-center gap-1 font-medium" title={`Call ${n.number} on your phone`}>
                          <Phone size={13} /> Call
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {shown.length > 400 && <div className="p-4 text-[12px] text-muted">Showing 400 of {shown.length}. Search to narrow it down.</div>}
        </Card>
      )}
    </>
  );
}

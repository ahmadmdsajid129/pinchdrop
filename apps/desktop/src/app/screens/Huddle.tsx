import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardPaste, Copy, Crown, Download, ExternalLink, FileText, Folder, GitBranch, Globe, KeyRound, LogOut, Radar, Router, Users, Wifi, X } from 'lucide-react';
import { onEvent } from '../../shared/api';
import { askUpgrade, usePro } from '../../shared/pro';
import {
  huddleApi,
  initials,
  showCode,
  looksSecret,
  useHuddle,
  useHuddleInbox,
  useHuddleShelf,
  type Clash,
  type FoundHuddle,
  type HuddleMember,
  type IncomingChanges,
  type JoinRequest,
  type ShelfItem,
} from '../../shared/huddle';
import { pickFolder } from '../pickers';
import { Button, Card, PageTitle } from '../ui';
import { Pass } from '../Pass';

const ALL = '__all';
const err = (e: unknown) => String(e instanceof Error ? e.message : e);

function Face({ m, size = 64, ring = false }: { m: Pick<HuddleMember, 'name' | 'color' | 'online'>; size?: number; ring?: boolean }) {
  return (
    <span
      className={`relative shrink-0 rounded-full text-white font-bold flex items-center justify-center ${ring ? 'ring-4 ring-primary/40' : ''}`}
      style={{ width: size, height: size, background: m.color, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(m.name)}
      <span className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface ${m.online ? 'bg-success' : 'bg-muted'}`} />
    </span>
  );
}

/** Route "huddle". */
export function HuddlePage() {
  const h = useHuddle();
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const say = useCallback((ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 4500);
  }, []);
  // Drops landing here (Explorer → a face) report back through this event.
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ ok: boolean; text: string }>).detail;
      say(d.ok, d.text);
    };
    window.addEventListener('pd-huddle-result', on);
    const off = onEvent<{ from: string; text: string }>('huddle-drop', (d) => say(true, `${d.from} ${d.text}`));
    return () => {
      window.removeEventListener('pd-huddle-result', on);
      void off.then((u) => u());
    };
  }, [say]);

  return (
    <>
      <div className="flex items-center gap-3">
        <PageTitle>Huddle</PageTitle>
        {h.active && (
          <span className="h-6 px-2.5 rounded-full bg-primary/10 text-primary-ink text-[12px] font-semibold inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success" /> {h.name}
          </span>
        )}
      </div>
      {h.active ? <InHuddle say={say} /> : <Lobby say={say} />}
      {toast && (
        <div role="status" className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full text-[13px] font-semibold shadow-lg ${toast.ok ? 'bg-text text-bg' : 'bg-danger text-white'}`}>
          {toast.text}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- not in a huddle

function Lobby({ say }: { say: (ok: boolean, t: string) => void }) {
  const pro = usePro();
  /** Huddle is a Pro feature: without Pro the buttons open the upgrade prompt. */
  const needPro = () => {
    if (pro.active) return false;
    askUpgrade('huddle');
    return true;
  };
  const [found, setFound] = useState<FoundHuddle[] | null>(null);
  const [joining, setJoining] = useState<{ hid: string; code: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [via, setVia] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const scan = async () => {
      const list = await huddleApi.find().catch(() => []);
      if (alive) setFound(list);
    };
    void scan();
    const t = window.setInterval(() => void scan(), 6000);
    const off = onEvent<{ code: string | null; via?: string }>('huddle-joining', (d) => {
      if (d.via) setVia(d.via);
      if (d.code) setJoining((j) => (j ? { ...j, code: d.code } : j));
    });
    return () => {
      alive = false;
      window.clearInterval(t);
      void off.then((u) => u());
    };
  }, []);

  async function start() {
    if (needPro()) return;
    setBusy(true);
    try {
      await huddleApi.start();
    } catch (e) {
      say(false, err(e));
    } finally {
      setBusy(false);
    }
  }

  async function joinByCode() {
    if (needPro()) return;
    setJoining({ hid: '__code', code: null });
    setVia(null);
    try {
      await huddleApi.joinCode(code);
    } catch (e) {
      say(false, err(e));
    } finally {
      setJoining(null);
      setVia(null);
    }
  }

  async function join(f: FoundHuddle) {
    if (needPro()) return;
    setJoining({ hid: f.hid, code: null });
    try {
      await huddleApi.join(f.ip, f.port);
    } catch (e) {
      say(false, err(e));
    } finally {
      setJoining(null);
    }
  }

  return (
    <>
      <Pass
        tone="blue"
        eyebrow="PinchDrop · Huddle pass"
        serial="For hackathons and teams"
        title="Your team's laptops, connected in one click."
        subtitle="Drag code, your project's changes or your running app onto a teammate's face. No WhatsApp, no push and pull, no internet needed."
        from={{ k: 'From', v: 'Your laptop' }}
        to={{ k: 'To', v: 'Your whole team' }}
        fields={[
          { k: 'Needs', v: 'Same Wi-Fi or a hotspot' },
          { k: 'Internet', v: 'Not needed' },
          { k: 'Plan', v: pro.active ? (pro.plan === 'trial' ? 'Pro trial' : 'Pro') : 'Needs Pro' },
        ]}
        stubValue={String(found?.length ?? 0).padStart(2, '0')}
        stubLabel={found?.length === 1 ? 'huddle nearby' : 'huddles nearby'}
        stamp="TEAM"
        action={
          <button type="button" className="pd-pass-btn" disabled={busy} onClick={() => void start()}>
            {pro.active ? <Users size={16} aria-hidden="true" /> : <Crown size={16} aria-hidden="true" />} {pro.active ? 'Start a huddle' : 'Unlock Huddle'}
          </button>
        }
      />

      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Radar size={18} className="text-accent" aria-hidden="true" />
          <span className="font-semibold">Huddles on this Wi-Fi</span>
          {found === null && <span className="text-[12px] text-muted">looking…</span>}
        </div>
        {found && found.length === 0 && (
          <p className="m-0 text-[13px] text-muted">
            None yet. When a teammate starts one, it shows up here. Everyone needs PinchDrop and the same Wi-Fi (or one laptop's hotspot).
          </p>
        )}
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {found?.map((f) => (
            <li key={f.hid} className="flex items-center gap-3 p-3 rounded-2xl bg-bg2">
              <span className="w-10 h-10 rounded-full bg-primary/15 text-primary-ink flex items-center justify-center">
                <Users size={18} aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] truncate">{f.name}</div>
                <div className="text-[12px] text-muted">
                  {f.count} laptop{f.count === 1 ? '' : 's'} · host {f.hostName}
                </div>
              </div>
              <Button variant="primary" size="sm" disabled={!!joining} onClick={() => void join(f)}>
                {joining?.hid === f.hid ? 'Waiting for the host…' : 'Join'}
              </Button>
            </li>
          ))}
        </ul>
        {joining?.code && (
          <div className="p-3.5 rounded-2xl bg-primary/10 text-[13px]" role="status">
            Ask the host to check this code on their screen and click Allow: <b className="font-mono text-[16px] tracking-[0.2em] ml-1">{joining.code}</b>
          </div>
        )}
      </Card>

      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-accent" aria-hidden="true" />
          <span className="font-semibold">Join with a code</span>
          <span className="text-[12px] text-muted">Can't see your team's huddle? Type the code from the host's screen.</span>
        </div>
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void joinByCode();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="KX7Q-49MZ"
            aria-label="Join code"
            maxLength={9}
            autoComplete="off"
            spellCheck={false}
            className="w-[180px] h-11 px-4 rounded-xl bg-bg2 border border-line text-[17px] font-mono tracking-[0.15em] outline-none focus:border-primary"
          />
          <Button variant="primary" type="submit" disabled={!!joining || code.replace(/[^A-Za-z0-9]/g, '').length !== 8}>
            {joining?.hid === '__code' ? (via ? 'Joining through the hotspot…' : 'Looking for it…') : 'Join'}
          </Button>
        </form>
        {via && (
          <div className="p-3 rounded-2xl bg-bg2 text-[12.5px] text-soft flex items-center gap-2" role="status">
            <Router size={15} className="text-accent" aria-hidden="true" />
            Connected to the host's hotspot <b>{via}</b>. Your usual Wi-Fi comes back when you leave the huddle.
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- in a huddle

function InHuddle({ say }: { say: (ok: boolean, t: string) => void }) {
  const h = useHuddle();
  const inbox = useHuddleInbox();
  const shelf = useHuddleShelf();
  const [address, setAddress] = useState('localhost:3000');
  const [shareTo, setShareTo] = useState<string>(ALL);
  const laptops = h.members.length + 1;
  const [hotspotBusy, setHotspotBusy] = useState(false);
  async function toggleHotspot() {
    setHotspotBusy(true);
    try {
      await huddleApi.hotspot(!h.hotspot);
    } catch (e) {
      say(false, err(e));
    } finally {
      setHotspotBusy(false);
    }
  }

  const run = async (p: Promise<string | void>) => {
    try {
      const r = await p;
      if (r) say(true, r);
    } catch (e) {
      say(false, err(e));
    }
  };

  return (
    <>
      {/* Join code + hotspot fallback */}
      <Card className="p-5 flex items-center gap-4 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold tracking-wider text-muted">JOIN CODE</span>
          <button
            type="button"
            title="Copy the code"
            onClick={() => void navigator.clipboard.writeText(showCode(h.code)).then(() => say(true, 'Code copied'))}
            className="font-mono text-[24px] font-bold tracking-[0.18em] text-left"
          >
            {showCode(h.code)}
          </button>
        </div>
        <div className="flex-1 min-w-[260px] text-[13px] text-muted leading-relaxed">
          {h.onHotspot
            ? 'You joined through the host\'s hotspot. Your usual Wi-Fi comes back when you leave.'
            : h.hotspot
              ? `Your hotspot "PinchDrop-${(h.code ?? '').slice(0, 4)}" is on. Teammates type the code under Join with a code; their laptops connect to it by themselves.`
              : "Teammates on this Wi-Fi see the huddle by itself. If they can't (some Wi-Fi keeps laptops apart), they type this code."}
        </div>
        {h.host && (
          <Button onClick={() => void toggleHotspot()} disabled={hotspotBusy} variant={h.hotspot ? 'secondary' : 'primary'}>
            <Router size={16} aria-hidden="true" /> {hotspotBusy ? 'One moment…' : h.hotspot ? 'Turn hotspot off' : "Team can't see it? Share a hotspot"}
          </Button>
        )}
      </Card>

      {/* Faces: drop targets */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Drop on a face</span>
          <span className="text-[12px] text-muted">Drag files, folders or a project folder from Explorer onto someone. Or copy code and press Paste on their face.</span>
          <span className="basis-full text-[12.5px] text-soft flex items-center gap-1.5 flex-wrap">
            <b className="text-text">Team clipboard:</b> copy anything, press
            <kbd className="px-1.5 py-0.5 rounded-md bg-surface2 border border-line font-mono text-[11.5px]">Ctrl + Alt + C</kbd>
            to share it; teammates paste it with
            <kbd className="px-1.5 py-0.5 rounded-md bg-surface2 border border-line font-mono text-[11.5px]">Ctrl + Alt + V</kbd>
            (their own Ctrl + V stays theirs).
          </span>
          <span className="flex-1" />
          <span className="text-[12px] text-muted">
            {`${laptops} laptop${laptops === 1 ? '' : 's'}`}
          </span>
        </div>
        <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
          <li data-huddle-member={ALL} data-huddle-name="everyone" className="pd-huddle-face rounded-[20px] border-2 border-dashed border-line p-4 flex flex-col items-center gap-2 text-center bg-bg2">
            <span className="w-16 h-16 rounded-full bg-text text-bg flex items-center justify-center" aria-hidden="true">
              <Users size={28} />
            </span>
            <div className="font-semibold text-[14px]">Everyone</div>
            <Button size="sm" onClick={() => void run(huddleApi.sendClipboard(null))}>
              <ClipboardPaste size={14} aria-hidden="true" /> Paste
            </Button>
          </li>
          {h.members.map((m) => (
            <li key={m.id} data-huddle-member={m.id} data-huddle-name={m.name} className="pd-huddle-face rounded-[20px] border-2 border-transparent p-4 flex flex-col items-center gap-2 text-center bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <span className={m.online ? '' : 'grayscale opacity-60'}>
                <Face m={m} />
              </span>
              <div className="font-semibold text-[14px] truncate max-w-full">
                {m.name}
                {m.host && <span className="text-muted font-normal"> · host</span>}
              </div>
              {!m.online && <div className="text-[11.5px] text-warn -mt-1">Reconnecting…</div>}
              <div className="flex gap-1.5">
                <Button size="sm" disabled={!m.online} onClick={() => void run(huddleApi.sendClipboard(m.id))}>
                  <ClipboardPaste size={14} aria-hidden="true" /> Paste
                </Button>
                <Button size="sm" disabled={!m.online} title={`Get ${m.name}'s latest changes`} onClick={() => void run(huddleApi.pull(m.id).then(() => `Asked ${m.name} for their latest`))}>
                  <Download size={14} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
          {h.me && (
            <li className="rounded-[20px] p-4 flex flex-col items-center gap-2 text-center opacity-70">
              <Face m={h.me} ring />
              <div className="font-semibold text-[14px] truncate max-w-full">You{h.host ? ' · host' : ''}</div>
              <div className="text-[11.5px] text-muted">{h.members.length === 0 ? 'Waiting for teammates…' : 'Teammates see you here'}</div>
            </li>
          )}
        </ul>
      </Card>

      {/* Incoming changes */}
      {inbox.map((c) => (
        <IncomingCard key={c.id} c={c} say={say} />
      ))}

      {/* Share a running app */}
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Globe size={18} className="text-accent" aria-hidden="true" />
          <span className="font-semibold">Share your running app</span>
          <span className="text-[12px] text-muted">It opens in their browser, live from your laptop. Only teammates can reach it.</span>
        </div>
        <form
          className="flex gap-2 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void run(huddleApi.share(shareTo === ALL ? null : shareTo, address));
          }}
        >
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            aria-label="Your app's address"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-[200px] h-10 px-3.5 rounded-xl bg-bg2 border border-line text-[13px] font-mono outline-none focus:border-primary"
          />
          <select
            value={shareTo}
            onChange={(e) => setShareTo(e.target.value)}
            aria-label="Share with"
            className="h-10 px-3 rounded-xl bg-bg2 border border-line text-[13px] outline-none focus:border-primary"
          >
            <option value={ALL}>Everyone</option>
            {h.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Button variant="primary" type="submit" disabled={h.members.length === 0}>
            Share
          </Button>
        </form>
      </Card>

      {/* Team shelf */}
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Team shelf</span>
          <span className="text-[12px] text-muted">Everything shared in this huddle. Wiped when you leave.</span>
        </div>
        {shelf.length === 0 ? (
          <p className="m-0 text-[13px] text-muted py-3">Nothing yet. Drop something on a face.</p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {shelf.map((s) => (
              <ShelfRow key={s.id} s={s} say={say} />
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => void huddleApi.leave()}>
          <LogOut size={16} aria-hidden="true" /> {h.host ? 'End huddle' : 'Leave huddle'}
        </Button>
      </div>
    </>
  );
}

function ShelfRow({ s, say }: { s: ShelfItem; say: (ok: boolean, t: string) => void }) {
  const secret = !!s.text && looksSecret(s.text);
  const [shown, setShown] = useState(!secret);
  const icon =
    s.kind === 'text' ? <FileText size={16} /> : s.kind === 'url' ? <Globe size={16} /> : s.kind === 'changes' ? <GitBranch size={16} /> : <Folder size={16} />;
  const ago = (() => {
    const d = Math.max(0, Math.floor(Date.now() / 1000) - s.at);
    return d < 60 ? 'just now' : d < 3600 ? `${Math.floor(d / 60)} min ago` : `${Math.floor(d / 3600)} h ago`;
  })();
  return (
    <li className="flex gap-3 p-3 rounded-2xl bg-bg2">
      <span className="w-8 h-8 shrink-0 rounded-lg bg-surface text-accent flex items-center justify-center">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">
          <b>{s.fromName}</b> <span className="text-muted">· {s.summary} · {ago}</span>
        </div>
        {s.text && (
          <button
            type="button"
            onClick={() => setShown(true)}
            className={`mt-1 w-full text-left text-[12px] font-mono whitespace-pre-wrap break-all max-h-[96px] overflow-hidden rounded-lg bg-surface p-2 ${shown ? '' : 'blur-[5px] select-none'}`}
            aria-label={shown ? 'Shared text' : 'Looks like a secret. Click to show'}
          >
            {s.text.slice(0, 600)}
          </button>
        )}
        {secret && !shown && <div className="text-[11px] text-warn mt-1">Looks like a key or password, hidden until you click.</div>}
      </div>
      <div className="flex items-start gap-1.5 shrink-0">
        {s.text && (
          <Button
            size="sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(s.text ?? '')
                .then(() => say(true, 'Copied'))
                .catch(() => say(false, 'Could not copy'))
            }
          >
            <Copy size={14} aria-hidden="true" /> Copy
          </Button>
        )}
        {(s.url || s.path) && (
          <Button size="sm" onClick={() => void huddleApi.open(s.id).catch((e) => say(false, err(e)))}>
            <ExternalLink size={14} aria-hidden="true" /> Open
          </Button>
        )}
      </div>
    </li>
  );
}

function IncomingCard({ c, say }: { c: IncomingChanges; say: (ok: boolean, t: string) => void }) {
  const [clashes, setClashes] = useState<{ list: Clash[]; folder: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(folder?: string | null, choices?: Record<string, 'mine' | 'theirs'>) {
    setBusy(true);
    try {
      let r;
      try {
        r = await huddleApi.accept(c.id, folder, choices);
      } catch (e) {
        if (err(e) !== 'NEED_FOLDER') throw e;
        const picked = await pickFolder();
        if (!picked[0]) return;
        r = await huddleApi.accept(c.id, picked[0], choices);
      }
      if (r.clashes.length) setClashes({ list: r.clashes, folder: r.folder });
      else say(true, `${r.applied} file${r.applied === 1 ? '' : 's'} from ${c.fromName} applied to ${c.repo}`);
    } catch (e) {
      say(false, err(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 flex flex-col gap-3 border-2 !border-primary/50">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="w-10 h-10 rounded-full bg-primary/15 text-primary-ink flex items-center justify-center">
          <GitBranch size={18} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold text-[15px]">
            {c.fromName} changed {c.files.length} file{c.files.length === 1 ? '' : 's'} in {c.repo}
          </div>
          <div className="text-[12px] text-muted">{c.ready ? (c.target ? `Goes into ${c.target}` : "You'll pick your copy of the project once") : 'Arriving…'}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void huddleApi.dismiss(c.id)}>
          <X size={14} aria-hidden="true" /> Not now
        </Button>
        <Button variant="primary" disabled={!c.ready || busy} onClick={() => void accept()}>
          <Check size={16} aria-hidden="true" /> Accept
        </Button>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-1.5">
        {c.files.slice(0, 24).map((f) => (
          <li key={f.path} className="h-7 px-2.5 rounded-lg bg-bg2 text-[12px] font-mono inline-flex items-center gap-1.5">
            <span className={`text-[10px] font-bold ${f.status === 'D' ? 'text-danger' : 'text-success'}`}>{f.status === 'D' ? 'DEL' : 'MOD'}</span>
            {f.path}
          </li>
        ))}
        {c.files.length > 24 && <li className="text-[12px] text-muted self-center">+{c.files.length - 24} more</li>}
      </ul>
      {clashes && <ClashView clashes={clashes.list} onDone={(choices) => void accept(clashes.folder, choices).then(() => setClashes(null))} onCancel={() => setClashes(null)} from={c.fromName} />}
    </Card>
  );
}

/** You both changed these files: theirs and yours side by side, pick one for each. */
function ClashView({ clashes, from, onDone, onCancel }: { clashes: Clash[]; from: string; onDone: (c: Record<string, 'mine' | 'theirs'>) => void; onCancel: () => void }) {
  const [pick, setPick] = useState<Record<string, 'mine' | 'theirs'>>({});
  const all = clashes.every((c) => pick[c.path]);
  return (
    <div className="flex flex-col gap-3 pt-2 border-t border-line">
      <div className="text-[14px] font-semibold text-warn">You also changed {clashes.length === 1 ? 'this file' : 'these files'}. Choose a version for each:</div>
      {clashes.map((c) => (
        <div key={c.path} className="flex flex-col gap-2">
          <div className="text-[13px] font-mono font-semibold">{c.path}</div>
          <div className="grid grid-cols-2 gap-2">
            {(['theirs', 'mine'] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={pick[c.path] === side}
                onClick={() => setPick((p) => ({ ...p, [c.path]: side }))}
                className={`text-left rounded-xl border-2 overflow-hidden ${pick[c.path] === side ? 'border-primary' : 'border-line'}`}
              >
                <div className={`px-3 py-1.5 text-[12px] font-semibold ${side === 'theirs' ? 'bg-primary/10' : 'bg-bg2'}`}>{side === 'theirs' ? `${from}'s version` : 'Your version'}</div>
                <pre className="m-0 p-3 text-[11.5px] leading-snug max-h-[260px] overflow-auto bg-surface whitespace-pre-wrap break-all">{(side === 'theirs' ? c.theirs : c.mine) || '(deleted)'}</pre>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!all} onClick={() => onDone(pick)}>Apply my choices</Button>
      </div>
    </div>
  );
}

/** Host only: "<name> wants to join", with the check code. Lives at the app root (any page). */
export function HuddleJoinDialog() {
  const [reqs, setReqs] = useState<JoinRequest[]>([]);
  useEffect(() => {
    const off = onEvent<JoinRequest>('huddle-join-request', (r) => setReqs((list) => [...list, r]));
    return () => void off.then((u) => u());
  }, []);
  const r = reqs[0];
  if (!r) return null;
  const answer = (ok: boolean) => {
    void huddleApi.answer(r.reqId, ok);
    setReqs((list) => list.slice(1));
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="pd-join-title" className="w-full max-w-[420px] rounded-[24px] bg-bg p-6 flex flex-col gap-4 shadow-[0_30px_80px_rgba(0,0,0,0.35)] animate-[pd-pop_160ms_ease-out]">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-full bg-[#FF9F0A] text-white flex items-center justify-center font-bold text-[18px]">{initials(r.name)}</span>
          <div>
            <h2 id="pd-join-title" className="m-0 text-[18px] font-semibold">{r.name} wants to join</h2>
            <div className="text-[13px] text-muted">Your huddle</div>
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-bg2 text-[13px] flex items-center gap-2">
          <Wifi size={16} className="text-accent" aria-hidden="true" />
          Their screen shows <b className="font-mono text-[17px] tracking-[0.2em] ml-1">{r.code}</b>. Allow only if it matches.
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => answer(false)}>Not now</Button>
          <Button variant="primary" onClick={() => answer(true)}>
            <Check size={16} aria-hidden="true" /> Allow
          </Button>
        </div>
      </div>
    </div>
  );
}

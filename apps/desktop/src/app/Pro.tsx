import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Crown, KeyRound, Lock, Sparkles, X } from 'lucide-react';
import { BUY_URL, PRO_FEATURES, PRO_LIST, TRIAL_DAYS_TEXT, proApi, usePro } from '../shared/pro';
import type { ProStatus } from '../shared/pro';
import { Button, Card, PageTitle } from './ui';
import { useApp } from './context';
import { onEvent } from '../shared/api';

function openBuy() {
  if (!BUY_URL) return;
  void import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(BUY_URL)).catch(() => window.open(BUY_URL, '_blank'));
}

const fmtDate = (secs: number) => new Date(secs * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** One line about where the user stands. */
export function proSummary(s: ProStatus): string {
  if (s.plan === 'pro') {
    const who = s.licensee ? ` · ${s.licensee}` : '';
    if (s.kind === 'lifetime') return `Pro for life${who}`;
    return `Pro${s.expires ? ` until ${fmtDate(s.expires)}` : ''}${who}`;
  }
  if (s.plan === 'trial') return `Pro trial · ${s.trialDaysLeft} day${s.trialDaysLeft === 1 ? '' : 's'} left`;
  return 'Free plan';
}

/** The small "PRO" tag next to locked things. */
export function ProTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center h-[18px] px-1.5 rounded-md bg-gradient-to-r from-[#F59E0B] to-[#F97316] text-white text-[10px] font-bold tracking-wide ${className}`}>
      PRO
    </span>
  );
}

function FeatureList({ highlight }: { highlight?: string }) {
  return (
    <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2.5">
      {PRO_LIST.map((k) => {
        const f = PRO_FEATURES[k];
        const on = k === highlight;
        return (
          <li key={k} className={`flex gap-3 p-3.5 rounded-2xl border ${on ? 'border-[#F59E0B] bg-[#F59E0B]/[0.08]' : 'border-line bg-surface'}`}>
            <span className="w-7 h-7 shrink-0 rounded-full bg-gradient-to-br from-[#F59E0B] to-[#F97316] text-white flex items-center justify-center">
              <Check size={15} strokeWidth={3} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-[14px]">{f.title}</div>
              <div className="text-[12.5px] text-muted leading-snug">{f.line}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Enter / remove a licence key. */
function KeyBox({ s }: { s: ProStatus }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // "Open in PinchDrop" on the website's thank-you page fills the key in; the buyer presses Activate.
  useEffect(() => {
    const take = () =>
      void proApi.takeLinkKey().then((k) => {
        if (!k) return;
        setKey(k);
        setMsg({ ok: true, text: 'Your key from the website is filled in. Press Activate to turn on Pro.' });
        setTimeout(() => document.getElementById('pd-key-go')?.focus(), 80);
      });
    take();
    let off: (() => void) | undefined;
    void onEvent('pro-key', take).then((u) => (off = u));
    return () => off?.();
  }, []);
  async function activate() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await proApi.activate(key);
      setKey('');
      setMsg({ ok: true, text: `Welcome to PinchDrop Pro${r.licensee ? `, ${r.licensee}` : ''}! Everything is unlocked.` });
    } catch (e) {
      setMsg({ ok: false, text: String(e instanceof Error ? e.message : e) });
    } finally {
      setBusy(false);
    }
  }
  if (s.plan === 'pro') {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[13px] text-muted flex-1 min-w-[220px]">Moving to a new PC? Remove the key here, then enter it on the new one.</span>
        <Button size="sm" onClick={() => void proApi.remove()}>Remove key from this PC</Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim()) void activate();
      }}
    >
      <label htmlFor="pd-key" className="text-[13px] font-semibold">Have a licence key?</label>
      <div className="flex gap-2 flex-wrap">
        <input
          id="pd-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="PD1-…"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-[260px] h-10 px-3.5 rounded-xl bg-bg2 border border-line text-[13px] font-mono outline-none focus:border-primary"
        />
        <Button id="pd-key-go" variant="primary" type="submit" disabled={busy || !key.trim()}>
          <KeyRound size={16} aria-hidden="true" /> {busy ? 'Checking…' : 'Activate'}
        </Button>
      </div>
      {msg && (
        <div role="status" className={`text-[13px] ${msg.ok ? 'text-success' : 'text-danger'}`}>
          {msg.text}
        </div>
      )}
    </form>
  );
}

/** The header card: plan, trial countdown, buy. */
function PlanCard({ s }: { s: ProStatus }) {
  const pct = s.plan === 'trial' ? Math.max(0, Math.min(1, s.trialDaysLeft / 7)) : s.plan === 'pro' ? 1 : 0;
  return (
    <section className="relative overflow-hidden rounded-[22px] p-6 text-white bg-[linear-gradient(135deg,#1E1B4B_0%,#4C1D95_45%,#9A3412_100%)]">
      <div aria-hidden="true" className="absolute -top-16 -right-10 w-64 h-64 rounded-full bg-[#F59E0B]/30 blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-20 left-10 w-72 h-72 rounded-full bg-[#22D3EE]/20 blur-3xl" />
      <div className="relative flex items-center gap-5 flex-wrap">
        <span className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">
          <Crown size={30} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-[240px]">
          <div className="text-[12px] font-bold tracking-wider text-white/70">PINCHDROP PRO</div>
          <div className="font-display text-[24px] font-semibold">{proSummary(s)}</div>
          <div className="text-[13.5px] text-white/75">
            {s.plan === 'pro'
              ? 'Thank you for supporting PinchDrop. Every Pro feature is on.'
              : s.plan === 'trial'
                ? 'Every Pro feature is on during your trial. Keep them with a licence key.'
                : 'Your trial has ended. Free still sends files both ways with one phone.'}
          </div>
          {s.plan !== 'free' && (
            <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden max-w-[360px]">
              <div className="h-full bg-white rounded-full origin-left transition-transform duration-500" style={{ transform: `scaleX(${pct})` }} />
            </div>
          )}
        </div>
        {s.plan !== 'pro' && BUY_URL && (
          <Button variant="primary" size="lg" onClick={openBuy} className="!bg-white !text-[#4C1D95]">
            <Sparkles size={18} aria-hidden="true" /> Get Pro
          </Button>
        )}
      </div>
      {s.problem && <div className="relative mt-3 text-[13px] text-[#FDE68A]">{s.problem}</div>}
    </section>
  );
}

/** Route "pro": everything about Pro in one place. */
export function ProPage() {
  const s = usePro();
  return (
    <>
      <PageTitle>PinchDrop Pro</PageTitle>
      <PlanCard s={s} />
      <Card className="p-5 flex flex-col gap-4">
        <KeyBox s={s} />
        {s.plan !== 'pro' && !BUY_URL && (
          <p className="m-0 text-[13px] text-muted">Licence keys are sold on the PinchDrop website. One key works on one PC and unlocks Pro for all its phones.</p>
        )}
      </Card>
      <div className="font-semibold text-[15px] mt-1">What Pro adds</div>
      <FeatureList />
      <p className="m-0 text-[13px] text-muted">
        Always free: sending files, photos, folders and links both ways, pinch and drop, one phone, notifications, reading messages, seeing who's calling. No account, no cloud, ever.
      </p>
    </>
  );
}

/** Wraps a Pro-only page: shows it with Pro on, a friendly lock card with Pro off. */
export function ProGate({ feature, children }: { feature: string; children: ReactNode }) {
  const s = usePro();
  const { go } = useApp();
  if (s.active) return <>{children}</>;
  const f = PRO_FEATURES[feature];
  return (
    <section className="flex flex-col items-center text-center gap-4 py-16 px-6 rounded-[22px] bg-surface border border-line">
      <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#F97316] text-white flex items-center justify-center">
        <Lock size={30} aria-hidden="true" />
      </span>
      <div className="font-display text-[24px] font-semibold">{f?.title ?? 'This feature'} is part of Pro</div>
      <p className="m-0 text-[14px] text-muted max-w-[440px]">{f?.line}</p>
      <div className="flex gap-2.5 flex-wrap justify-center">
        <Button variant="primary" onClick={() => go('pro')}>
          <Crown size={16} aria-hidden="true" /> See PinchDrop Pro
        </Button>
      </div>
    </section>
  );
}

/** The upgrade prompt: opens when a Pro-only action is tried (any page). */
export function UpgradeDialog() {
  const [feature, setFeature] = useState<string | null>(null);
  const s = usePro();
  const { go } = useApp();
  useEffect(() => {
    const on = (e: Event) => setFeature((e as CustomEvent<string>).detail);
    window.addEventListener('pd-upgrade', on);
    return () => window.removeEventListener('pd-upgrade', on);
  }, []);
  useEffect(() => {
    if (!feature) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFeature(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [feature]);
  if (!feature) return null;
  const f = PRO_FEATURES[feature];
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-6 animate-[pd-fade_120ms_ease-out]" onClick={() => setFeature(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pd-up-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] max-h-full overflow-y-auto rounded-[24px] bg-bg shadow-[0_30px_80px_rgba(0,0,0,0.35)] animate-[pd-pop_160ms_ease-out]"
      >
        <div className="relative overflow-hidden p-6 text-white bg-[linear-gradient(135deg,#1E1B4B_0%,#4C1D95_45%,#9A3412_100%)]">
          <button type="button" aria-label="Close" onClick={() => setFeature(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center">
            <X size={16} />
          </button>
          <Crown size={30} aria-hidden="true" />
          <h2 id="pd-up-title" className="m-0 mt-2 font-display text-[22px] font-semibold">{f?.title ?? 'This'} is a Pro feature</h2>
          <p className="m-0 mt-1 text-[14px] text-white/80">{f?.line}</p>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div className="text-[13px] text-muted">
            {s.plan === 'free' ? `Your ${TRIAL_DAYS_TEXT} trial has ended.` : `${proSummary(s)}.`} Pro also gives you:
          </div>
          <FeatureList highlight={feature} />
          <div className="flex gap-2.5 justify-end flex-wrap">
            <Button variant="ghost" onClick={() => setFeature(null)}>Not now</Button>
            {BUY_URL && (
              <Button onClick={openBuy}>
                <Sparkles size={16} aria-hidden="true" /> Get Pro
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                setFeature(null);
                go('pro');
              }}
            >
              <KeyRound size={16} aria-hidden="true" /> Enter a licence key
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

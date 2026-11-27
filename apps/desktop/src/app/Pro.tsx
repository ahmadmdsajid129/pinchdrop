import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Crown, KeyRound, Lock, Sparkles, X } from 'lucide-react';
import { BUY_URL, PRO_FEATURES, PRO_LIST, TRIAL_DAYS_TEXT, proApi, usePro } from '../shared/pro';
import type { ProStatus } from '../shared/pro';
import { Button, Card, PageTitle } from './ui';
import { useApp } from './context';
import { onEvent } from '../shared/api';
import { Pass } from './Pass';

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
    <span className={`inline-flex items-center h-[18px] px-1.5 rounded-md pd-pro-chip text-[10px] font-bold tracking-wide ${className}`}>
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
            <span className="w-7 h-7 shrink-0 rounded-full pd-pro-chip flex items-center justify-center">
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
    let off: (() => void) | undefined;
    void onEvent('pro-key', take).then((u) => {
      off = u;
      take();
    });
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

/** The header card: the Pro pass (plan, trial countdown, buy). */
function PlanCard({ s }: { s: ProStatus }) {
  const { settings } = useApp();
  const days = s.plan === 'trial' ? s.trialDaysLeft : s.plan === 'pro' && s.expires ? Math.max(0, Math.ceil((s.expires * 1000 - Date.now()) / 86400000)) : 0;
  const title = s.plan === 'pro' ? "You're Pro. Thank you." : s.plan === 'trial' ? 'Your Pro trial is on.' : 'Your trial has ended.';
  const sub =
    s.plan === 'pro'
      ? 'Every Pro feature is on, on this PC and every phone you connect to it.'
      : s.plan === 'trial'
        ? 'Every Pro feature is on during your trial. Keep them with a licence key.'
        : 'Free still sends files both ways with one phone. Pro brings back everything else.';
  const plan = s.plan === 'pro' ? (s.kind === 'lifetime' ? 'Lifetime' : s.kind === 'year' ? 'Yearly' : s.kind === 'month' ? 'Monthly' : 'Pro') : s.plan === 'trial' ? `${TRIAL_DAYS_TEXT} trial` : 'Free';
  const valid = s.plan === 'pro' ? (s.expires ? `Renews by ${fmtDate(s.expires)}` : 'Forever') : s.plan === 'trial' ? `${days} day${days === 1 ? '' : 's'} more` : 'Ended';
  return (
    <Pass
      eyebrow="PinchDrop · Pro pass"
      serial={s.plan === 'pro' ? 'Admit one PC + phones' : 'Admit one PC'}
      title={title}
      subtitle={sub}
      from={{ k: 'From', v: settings.profile.pcName || 'This PC' }}
      to={{ k: 'To', v: 'Every phone' }}
      fields={[
        { k: 'Plan', v: plan },
        { k: 'Valid', v: valid },
        { k: 'Holder', v: s.licensee || settings.profile.pcName || 'You' },
      ]}
      punches={s.plan === 'trial' ? { total: 7, left: Math.min(7, days) } : undefined}
      stubValue={s.plan === 'pro' && !s.expires ? '∞' : String(days).padStart(2, '0')}
      stubLabel={s.plan === 'pro' && !s.expires ? 'for life' : s.plan === 'free' ? 'days left' : days === 1 ? 'day left' : 'days left'}
      stamp={s.plan === 'pro' ? 'PRO' : s.plan === 'trial' ? 'TRIAL' : 'FREE'}
      action={
        s.plan !== 'pro' && BUY_URL ? (
          <button type="button" className="pd-pass-btn" onClick={openBuy}>
            <Sparkles size={16} aria-hidden="true" /> Get Pro
          </button>
        ) : undefined
      }
      footer={s.problem ?? undefined}
    />
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
      <span className="w-16 h-16 rounded-2xl pd-pro-chip flex items-center justify-center">
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
        <div className="relative p-4 pb-0">
          <Pass compact eyebrow="PinchDrop · Pro feature" serial="Admit one PC" title={`${f?.title ?? 'This'} is part of Pro`} subtitle={f?.line} stamp="PRO" />
          <button type="button" aria-label="Close" onClick={() => setFeature(null)} className="absolute top-6 right-6 z-10 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 flex items-center justify-center text-[#17140E]">
            <X size={16} />
          </button>
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

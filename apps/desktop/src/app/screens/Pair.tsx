import { useEffect, useState } from 'react';
import { CheckCircle2, Laptop, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { api, onEvent } from '../../shared/api';
import type { PairInfo, PairRequest, PairResult } from '../../shared/types';
import { useApp } from '../context';
import { Button, Card, Toggle } from '../ui';

const RESULT_TEXT: Record<Exclude<PairResult['outcome'], 'paired'>, string> = {
  cancelled: 'Pairing cancelled.',
  mismatch: 'The phone said the codes didn’t match, so nothing was paired. Try again.',
  phone_left: 'The phone left before pairing finished.',
};

/** Groups a 6-digit code as "482 913" for reading aloud. */
function spaced(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/**
 * Pairing (Phase 3). While this panel is on screen the PC accepts new phones:
 * the QR carries its address and certificate fingerprint; both screens then show
 * the same 6-digit code and each user presses Pair.
 */
export function PairPanel({ compact = false, onPaired }: { compact?: boolean; onPaired?: () => void }) {
  const { settings, update, go } = useApp();
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [request, setRequest] = useState<PairRequest | null>(null);
  const [result, setResult] = useState<PairResult | null>(null);
  const [left, setLeft] = useState(0);

  useEffect(() => {
    let alive = true;
    const open = () => api.pairingOpen().then((i) => alive && (setInfo(i), setLeft(i.expiresInSecs)));
    void open();
    void api.pairingRequest().then((r) => alive && setRequest(r));
    const offs = [
      onEvent<PairRequest | null>('pair-request', (r) => setRequest(r)),
      onEvent<PairResult>('pair-result', (r) => {
        setResult(r);
        if (r.outcome !== 'paired') void open();
      }),
    ];
    return () => {
      alive = false;
      offs.forEach((p) => void p.then((off) => off()));
      void api.pairingClose();
    };
  }, []);

  // Countdown; when the window runs out, open a fresh one (new QR).
  useEffect(() => {
    if (!info || info.listenError || result?.outcome === 'paired') return;
    const t = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          void api.pairingOpen().then((i) => (setInfo(i), setLeft(i.expiresInSecs)));
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [info, result]);

  if (result?.outcome === 'paired') {
    return (
      <Card className="p-8 flex flex-col items-center gap-4 text-center border-success/60">
        <CheckCircle2 size={56} className="text-success" aria-hidden="true" />
        <h2 className="m-0 font-display text-[24px] font-semibold">{result.phoneName} is paired</h2>
        <p className="m-0 text-[14px] text-muted max-w-[420px]">
          It shows up on the pill now and reconnects by itself whenever both are on the same Wi-Fi.
        </p>
        <Button variant="primary" onClick={() => (onPaired ? onPaired() : go('devices'))}>{onPaired ? 'Continue' : 'Done'}</Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-wrap gap-6">
      <Card className="flex-[1_1_320px] p-7 flex flex-col items-center gap-4 text-center">
        {request ? (
          <>
            {request.phoneModel === 'Windows PC' ? <Laptop size={40} className="text-accent" aria-hidden="true" /> : <Smartphone size={40} className="text-accent" aria-hidden="true" />}
            <div>
              <div className="font-semibold text-[16px]">{request.phoneName}</div>
              <div className="text-[13px] text-muted">{request.phoneModel}</div>
            </div>
            <h2 className="m-0 text-[17px] font-semibold">Does {request.phoneModel === 'Windows PC' ? 'the other PC' : 'your phone'} show this code?</h2>
            <div className="font-mono text-[44px] font-bold tracking-[0.12em] text-text" aria-live="polite" aria-label={`Code ${request.code.split('').join(' ')}`}>
              {spaced(request.code)}
            </div>
            {request.pcConfirmed ? (
              <p className="m-0 text-[14px] text-soft" role="status">Waiting for the phone to press Pair…</p>
            ) : (
              <div className="flex gap-3 flex-wrap justify-center">
                <Button variant="primary" onClick={() => void api.pairingRespond(true)}>Codes match — Pair</Button>
                <Button onClick={() => void api.pairingRespond(false)}>They don't match</Button>
              </div>
            )}
            {request.phoneConfirmed && !request.pcConfirmed && <p className="m-0 text-[13px] text-success">The phone already pressed Pair.</p>}
            <p className="m-0 text-[12px] text-muted max-w-[300px] flex gap-1.5 items-start text-left">
              <ShieldCheck size={16} className="shrink-0 text-accent mt-0.5" aria-hidden="true" />
              Matching codes prove the phone is talking to this PC and nobody else on the Wi-Fi.
            </p>
          </>
        ) : info?.qrSvgDataUrl ? (
          <>
            <img src={info.qrSvgDataUrl} alt="Pairing QR code — scan it with PinchDrop on your phone" className="w-[240px] h-[240px] rounded-2xl bg-white p-2" />
            <div className="text-[13px] text-muted">
              {info.pcName} · {info.hosts[0] ?? 'no network'}{info.port ? `:${info.port}` : ''}
            </div>
            <div className="text-[12px] text-muted" aria-live="off">
              New code in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </div>
            {info.hosts.length === 0 && (
              <p className="m-0 text-[13px] text-warn max-w-[300px]">This PC isn't on a network. Connect to Wi-Fi (the same one as your phone).</p>
            )}
          </>
        ) : (
          <div className="w-[240px] h-[240px] rounded-2xl border-2 border-dashed border-line bg-bg2 flex flex-col items-center justify-center gap-3 text-muted">
            <QrCode size={56} aria-hidden="true" />
            <span className="text-[13px] px-6">{info?.listenError ?? 'Preparing the pairing code…'}</span>
          </div>
        )}
        {result && (
          <p className="m-0 text-[13px] text-warn" role="status">{RESULT_TEXT[result.outcome]}</p>
        )}
      </Card>

      <div className="flex-[1_1_380px] flex flex-col gap-4">
        <Card className="p-[22px] flex flex-col gap-3">
          <div className="text-[12px] font-bold text-accent tracking-wide">HOW TO PAIR</div>
          <ol className="m-0 pl-5 list-decimal text-[14px] text-soft leading-7">
            <li>Install PinchDrop on your Android phone and open it.</li>
            <li>Tap <strong className="text-text">Pair with PC</strong> and scan this QR code — or pick this PC from the list on the phone.</li>
            <li>Both screens show the same 6-digit code — press Pair on both.</li>
            <li>Done. They reconnect on their own whenever they're on the same Wi-Fi.</li>
          </ol>
        </Card>

        {!compact && (
          <Card className="p-[22px] flex flex-col gap-2">
            <div className="font-semibold">Phone can't find this PC?</div>
            <ul className="m-0 pl-5 list-disc text-[13px] text-muted leading-7">
              <li>Both devices must be on the same Wi-Fi.</li>
              <li>Guest or office Wi-Fi often blocks devices talking to each other — use your phone's hotspot instead.</li>
              <li>If Windows asked about the firewall, PinchDrop must be allowed on <strong className="text-soft">private networks</strong>.</li>
            </ul>
          </Card>
        )}

        <Card className="p-[22px] flex items-center gap-4">
          <div className="flex-1">
            <div className="font-semibold text-[14px]">Preview with a demo phone</div>
            <div className="text-[12px] text-muted">Shows a pretend phone (marked DEMO) when no real phone is paired. Nothing is sent.</div>
          </div>
          <Toggle label="Demo phone" checked={settings.demoPhone} onChange={(v) => void update({ demoPhone: v })} />
        </Card>
      </div>
    </div>
  );
}

export function Pair() {
  const { go } = useApp();
  return (
    <>
      <div>
        <h1 className="m-0 mb-2 font-display text-[28px] font-semibold">Pair your phone</h1>
        <p className="m-0 text-[15px] text-muted">Open PinchDrop on your Android phone and tap Pair with PC.</p>
      </div>
      <PairPanel />
      <div><Button variant="ghost" onClick={() => go('devices')}>← Back to Devices</Button></div>
    </>
  );
}

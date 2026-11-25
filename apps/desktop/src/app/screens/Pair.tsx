import { QrCode } from 'lucide-react';
import { useApp } from '../context';
import { Button, Card, PhaseBadge, Toggle } from '../ui';

/** Pairing screen. The real QR + code exchange is built in Phase 3; until then it explains the flow honestly. */
export function PairPanel({ compact = false }: { compact?: boolean }) {
  const { settings, update } = useApp();
  return (
    <div className="flex flex-wrap gap-6">
      <Card className="flex-[1_1_320px] p-7 flex flex-col items-center gap-4 text-center">
        <div className="w-[220px] h-[220px] rounded-2xl border-2 border-dashed border-line bg-bg2 flex flex-col items-center justify-center gap-3 text-muted">
          <QrCode size={56} aria-hidden="true" />
          <span className="text-[13px] px-6">Your pairing QR code appears here</span>
        </div>
        <PhaseBadge phase={3} />
        <p className="m-0 text-[13px] text-muted max-w-[300px]">
          The PC ↔ phone connection and the Android app are being built next. Until then this space stays empty — nothing here is faked.
        </p>
      </Card>

      <div className="flex-[1_1_380px] flex flex-col gap-4">
        <Card className="p-[22px] flex flex-col gap-3">
          <div className="text-[12px] font-bold text-accent tracking-wide">HOW PAIRING WILL WORK</div>
          <ol className="m-0 pl-5 list-decimal text-[14px] text-soft leading-7">
            <li>Install PinchDrop on your Android phone and open it.</li>
            <li>Tap <strong className="text-text">Pair with PC</strong> and scan the QR code shown here.</li>
            <li>Both screens show the same 6-digit code — press Pair on both.</li>
            <li>Done. They reconnect on their own whenever they're on the same Wi-Fi.</li>
          </ol>
        </Card>

        {!compact && (
          <Card className="p-[22px] flex flex-col gap-2">
            <div className="font-semibold">Phone can't find this PC? (once pairing ships)</div>
            <ul className="m-0 pl-5 list-disc text-[13px] text-muted leading-7">
              <li>Both devices must be on the same Wi-Fi.</li>
              <li>Guest or office Wi-Fi often blocks devices talking to each other — use your phone's hotspot instead.</li>
              <li>Windows Firewall must allow PinchDrop on private networks.</li>
            </ul>
          </Card>
        )}

        <Card className="p-[22px] flex items-center gap-4">
          <div className="flex-1">
            <div className="font-semibold text-[14px]">Preview with a demo phone</div>
            <div className="text-[12px] text-muted">Shows a pretend phone on the pill, Island and Home so you can see the design. Clearly marked DEMO; nothing is sent.</div>
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
        <p className="m-0 text-[15px] text-muted">Install PinchDrop on your Android phone, open it, and tap Pair with PC.</p>
      </div>
      <PairPanel />
      <div><Button variant="ghost" onClick={() => go('devices')}>← Back to Devices</Button></div>
    </>
  );
}

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, Camera, Check, Hand, Power, Wifi } from 'lucide-react';
import { api, useTheme } from '../../shared/api';
import { useApp } from '../context';
import { Button, Toggle } from '../ui';
import { PairPanel } from './Pair';
import { listCameras, requestCameraAccess } from '../CameraPreview';

const STEPS = ['Welcome', 'Permissions', 'Pair phone', 'Meet the pill'];

function PermissionCard({ icon, title, children, control, ok }: { icon: ReactNode; title: string; children: ReactNode; control: ReactNode; ok?: boolean }) {
  return (
    <div className={`flex items-center gap-4 p-[18px] rounded-2xl bg-surface border ${ok ? 'border-success/70' : 'border-line'}`}>
      <div className="w-11 h-11 rounded-xl bg-surface2 text-accent flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">{title}</div>
        <div className="text-[13px] text-muted leading-relaxed">{children}</div>
      </div>
      {control}
    </div>
  );
}

export function Onboarding() {
  const { settings, update, go } = useApp();
  useTheme(settings.theme);
  const [step, setStep] = useState(0);
  const [camera, setCamera] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [cameraName, setCameraName] = useState<string | null>(null);
  const [autostart, setAutostart] = useState(true);

  useEffect(() => {
    void api.getAutostart().then((on) => on && setAutostart(true));
  }, []);

  async function allowCamera() {
    const ok = await requestCameraAccess();
    setCamera(ok ? 'granted' : 'denied');
    if (ok) {
      const cams = await listCameras();
      if (cams[0]) {
        setCameraName(cams[0].label);
        if (!settings.gestures.cameraId) void update({ gestures: { cameraId: cams[0].deviceId } });
      }
    }
  }

  async function finish() {
    try {
      await api.setAutostart(autostart);
    } catch {
      // Not fatal; it can be changed in Settings.
    }
    await update({ onboarded: true });
    go('home');
  }

  return (
    <div className="h-full overflow-y-auto bg-bg text-text">
      <div className="max-w-[860px] mx-auto px-6 py-10 flex flex-col gap-7">
        <ol className="flex items-center gap-2 flex-wrap m-0 p-0 list-none" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-current={i === step ? 'step' : undefined}
                className={`h-7 px-3 rounded-full inline-flex items-center gap-1.5 text-[12px] font-semibold ${
                  i < step ? 'bg-surface2 text-success' : i === step ? 'bg-primary text-white' : 'bg-surface border border-line text-muted'
                }`}
              >
                {i < step && <Check size={13} aria-hidden="true" />} {i + 1} {s}
              </span>
              {i < STEPS.length - 1 && <span className="w-6 h-px bg-line" aria-hidden="true" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="flex flex-col items-start gap-5 py-6">
            <span className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-white">
              <Hand size={34} aria-hidden="true" />
            </span>
            <h1 className="m-0 font-display text-[34px] font-semibold leading-tight">Welcome to PinchDrop</h1>
            <p className="m-0 text-[16px] text-muted max-w-[560px] leading-relaxed">
              Send files, folders, photos and links from this PC to your phone — pick them in the app, or pinch them in mid-air and open your hand over the phone.
              Everything stays on your Wi-Fi. No cloud, no account.
            </p>
            <Button variant="primary" size="lg" onClick={() => setStep(1)}>Get started</Button>
          </div>
        )}

        {step === 1 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">A few permissions first</h1>
              <p className="m-0 text-[15px] text-muted leading-relaxed">Each one says why it's needed. You can change any of them later in Settings.</p>
            </div>
            <div className="flex flex-col gap-3">
              <PermissionCard
                icon={<Camera size={22} aria-hidden="true" />}
                title="Camera — for air gestures"
                ok={camera === 'granted'}
                control={
                  camera === 'granted' ? (
                    <span className="text-[13px] font-semibold text-success flex items-center gap-1.5"><Check size={16} aria-hidden="true" /> Allowed</span>
                  ) : (
                    <Button variant="primary" onClick={() => void allowCamera()}>{camera === 'denied' ? 'Try again' : 'Allow'}</Button>
                  )
                }
              >
                Watches for your pinch only while something is selected. Frames stay in memory — never saved, never sent.
                {cameraName && <> Using <strong className="text-text">{cameraName}</strong>.</>}
                {camera === 'denied' && <span className="text-warn"> Access was refused — gestures stay off, manual sending still works.</span>}
              </PermissionCard>

              <PermissionCard icon={<Wifi size={22} aria-hidden="true" />} title="Local network — so your phone can reach this PC" control={<span className="text-[12px] text-muted text-right w-28">Asked when you pair (Phase 3)</span>}>
                Windows Firewall will ask once. Tick <strong className="text-text">Private networks</strong> only and press Allow.
              </PermissionCard>

              <PermissionCard icon={<Bell size={22} aria-hidden="true" />} title="Notifications" control={<Toggle label="Notifications" checked={settings.notifications.onFinish} onChange={(v) => void update({ notifications: { onFinish: v } })} />}>
                Tells you when a send finishes or fails while the window is closed.
              </PermissionCard>

              <PermissionCard icon={<Power size={22} aria-hidden="true" />} title="Start with Windows" control={<Toggle label="Start with Windows" checked={autostart} onChange={setAutostart} />}>
                Keeps the pill at the top of your screen after every restart. Runs quietly from the tray.
              </PermissionCard>
            </div>
            <div className="flex justify-between items-center flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(2)}>Continue to pairing</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">Pair your phone</h1>
              <p className="m-0 text-[15px] text-muted">You can skip this for now and pair later from Devices.</p>
            </div>
            <PairPanel compact />
            <div className="flex justify-between items-center flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(3)}>Continue</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">Meet your pill</h1>
              <p className="m-0 text-[15px] text-muted leading-relaxed">It sits at the top of your screen all the time.</p>
            </div>
            <ul className="m-0 pl-0 list-none flex flex-col gap-3 text-[15px]">
              {[
                ['Click once', 'opens the Dynamic Island: your phone, its battery, quick actions'],
                ['Double-click', 'opens this window'],
                ['Drag', 'moves it anywhere — it sticks to the nearest edge'],
                ['Right-click', 'menu: send files, pause gestures, hide for an hour, quit'],
              ].map(([k, v]) => (
                <li key={k} className="p-4 rounded-2xl bg-surface border border-line">
                  <strong className="text-text">{k}</strong> <span className="text-muted">— {v}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between items-center flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" size="lg" onClick={() => void finish()}>Finish</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

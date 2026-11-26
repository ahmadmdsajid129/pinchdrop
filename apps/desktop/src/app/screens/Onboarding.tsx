import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Bell, Camera, Check, Hand, Lock, MousePointer2, Power, Smartphone, Sparkles, Wifi } from 'lucide-react';
import { FlyHero, Guide } from '../Illustrations';
import { api, useTheme } from '../../shared/api';
import { useApp } from '../context';
import { Button, Toggle } from '../ui';
import { PairPanel } from './Pair';
import { listCameras, requestCameraAccess } from '../CameraPreview';

const STEPS = ['Welcome', 'How it works', 'Quick setup', 'Pair phone', 'Guide'];

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
          <div className="flex flex-col gap-8 py-2">
            <div className="flex items-center gap-8 flex-wrap">
              <div className="flex-[1_1_320px] flex flex-col items-start gap-5">
                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-primary/10 text-primary-ink text-[12px] font-semibold">
                  <Sparkles size={13} aria-hidden="true" /> Move things with your hands
                </span>
                <h1 className="m-0 font-display text-[38px] font-semibold leading-[1.1]">
                  Pinch it on your PC.
                  <br />
                  <span className="bg-gradient-to-r from-[#0071E3] to-[#22D3EE] bg-clip-text text-transparent">Drop it on your phone.</span>
                </h1>
                <p className="m-0 text-[16px] text-muted max-w-[460px] leading-relaxed">
                  Files, photos and links fly between this PC and your phones with a gesture. And your phone's calls, messages and notifications show up right here.
                </p>
                <div className="flex gap-3 flex-wrap">
                  <Button variant="primary" size="lg" onClick={() => setStep(1)}>
                    Get started <ArrowRight size={18} aria-hidden="true" />
                  </Button>
                </div>
                <p className="m-0 text-[13px] text-muted">Takes about a minute · no account needed</p>
              </div>
              <div className="flex-[1_1_380px] flex justify-center">
                <FlyHero />
              </div>
            </div>
            <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {(
                [
                  [<Hand key="h" size={20} />, 'Pinch & drop', 'Grab in the air, open your hand over the phone.'],
                  [<Smartphone key="p" size={20} />, 'Your phone, here', 'Calls, messages, notifications, photos and files.'],
                  [<Lock key="l" size={20} />, 'Private by design', 'Only your Wi-Fi. No cloud, nothing recorded.'],
                ] as const
              ).map(([icon, t, d]) => (
                <li key={t} className="flex gap-3 p-4 rounded-2xl bg-surface border border-line">
                  <span className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 text-primary-ink flex items-center justify-center">{icon}</span>
                  <div>
                    <div className="font-semibold text-[14px]">{t}</div>
                    <div className="text-[13px] text-muted leading-snug">{d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">How it works</h1>
              <p className="m-0 text-[15px] text-muted leading-relaxed">Three moves. That's all.</p>
            </div>
            <div className="flex justify-center">
              <FlyHero />
            </div>
            <ol className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              {(
                [
                  [<MousePointer2 key="m" size={22} />, 'Select', 'Click a file, folder, photo or link on your PC like you always do.'],
                  [<Hand key="h" size={22} />, 'Pinch', 'Pinch your thumb and index in front of the webcam. The file lifts with your hand.'],
                  [<Smartphone key="s" size={22} />, 'Open your hand', 'Open your hand towards the phone. On the phone, hold your open hand over it and it lands.'],
                ] as const
              ).map(([icon, t, d], i) => (
                <li key={t} className="relative p-5 rounded-2xl bg-surface border border-line flex flex-col gap-2">
                  <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0071E3] to-[#22D3EE] text-white flex items-center justify-center pd-float" style={{ animationDelay: `${i * 0.4}s` }}>
                    {icon}
                  </span>
                  <div className="text-[12px] font-semibold text-primary-ink mt-1">STEP {i + 1}</div>
                  <div className="font-display font-semibold text-[18px]">{t}</div>
                  <div className="text-[13px] text-muted leading-relaxed">{d}</div>
                </li>
              ))}
            </ol>
            <p className="m-0 text-[13px] text-muted">Rather click? Drag files onto this window or use right-click → Send to → PinchDrop. Gestures are optional.</p>
            <div className="flex justify-between items-center flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(2)}>Next</Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">Quick setup</h1>
              <p className="m-0 text-[15px] text-muted leading-relaxed">Turn on what you like. Everything can be changed later in Settings.</p>
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
                Turns on only when you click the pill, and off again after 30 seconds of nothing happening. It reacts to a pinch and an open hand — nothing else. Frames stay in memory — never saved, never sent.
                {cameraName && <> Using <strong className="text-text">{cameraName}</strong>.</>}
                {camera === 'denied' && <span className="text-warn"> Access was refused — gestures stay off, manual sending still works.</span>}
              </PermissionCard>

              <PermissionCard icon={<Wifi size={22} aria-hidden="true" />} title="Local network — so your phone can reach this PC" control={<span className="text-[12px] text-muted text-right w-28">Windows asks once</span>}>
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
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(3)}>Continue to pairing</Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">Pair your phone</h1>
              <p className="m-0 text-[15px] text-muted leading-relaxed">
                Install <b className="text-text">PinchDrop</b> on your Android phone, open it, and scan this code. Both need to be on the same Wi-Fi. You can skip this and pair later from Devices.
              </p>
            </div>
            <PairPanel compact onPaired={() => setStep(4)} />
            <div className="flex justify-between items-center flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button variant="primary" onClick={() => setStep(4)}>Continue</Button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div>
              <h1 className="m-0 mb-2 font-display text-[30px] font-semibold">You're ready. Here's how to use it</h1>
              <p className="m-0 text-[15px] text-muted leading-relaxed">
                Your pill now sits at the top of the screen. This guide is always under <b className="text-text">How to use</b> in the sidebar.
              </p>
            </div>
            <Guide />
            <div className="flex justify-between items-center flex-wrap gap-3">
              <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
              <Button variant="primary" size="lg" onClick={() => void finish()}>Start using PinchDrop</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

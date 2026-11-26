import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, useDevices } from '../../shared/api';
import { ALERTS, DEFAULT_PHONE_SOUNDS, RINGS, playAlert } from '../../shared/sound';
import { useApp } from '../context';
import { Button, Card, PageTitle, Radio, Row, Segmented, Select, Toggle } from '../ui';
import { CameraPreview, listCameras, requestCameraAccess } from '../CameraPreview';
import type { Camera } from '../CameraPreview';

const SECTIONS = [
  ['general', 'General'],
  ['pill', 'Pill & Island'],
  ['gestures', 'Gestures & camera'],
  ['transfers', 'Transfers'],
  ['notify', 'Notifications'],
  ['privacy', 'Privacy & security'],
  ['about', 'About & updates'],
] as const;

function Section({ id, title, badge, children }: { id: string; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <Card className="px-5 py-1.5 scroll-mt-6" id={id}>
      <h2 className="mt-3.5 mb-1 text-[15px] font-bold flex items-center gap-2.5">{title} {badge}</h2>
      {children}
    </Card>
  );
}

export function SettingsScreen() {
  const { settings, update } = useApp();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [preview, setPreview] = useState(false);
  const [info, setInfo] = useState<{ version: string; configDir: string; fingerprint: string | null } | null>(null);

  useEffect(() => {
    void api.getAutostart().then(setAutostart);
    void listCameras().then(setCameras);
    void api.getAppInfo().then(setInfo);
  }, []);

  const p = settings.pill;
  const g = settings.gestures;
  const t = settings.transfers;

  async function changeAutostart(v: boolean) {
    setAutostartError(null);
    try {
      setAutostart(await api.setAutostart(v));
    } catch (e) {
      setAutostartError(String(e));
    }
  }

  async function findCameras() {
    await requestCameraAccess();
    setCameras(await listCameras());
  }

  return (
    <>
      <PageTitle>Settings</PageTitle>
      <nav aria-label="Settings sections" className="flex gap-2 flex-wrap">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }}
            className="h-8 px-3 rounded-full border border-line text-[13px] text-soft hover:text-text flex items-center no-underline">
            {label}
          </a>
        ))}
      </nav>

      <Section id="general" title="General">
        <Row title="Start with Windows" description={autostartError ?? 'The pill appears after every restart'}>
          <Toggle label="Start with Windows" checked={autostart ?? false} disabled={autostart === null} onChange={(v) => void changeAutostart(v)} />
        </Row>
        <Row title="Keep running when I close the window" description="Closing hides PinchDrop to the tray; quit from the pill or tray menu">
          <Toggle label="Keep running" checked={settings.keepRunningOnClose} onChange={(v) => void update({ keepRunningOnClose: v })} />
        </Row>
        <Row title="Theme">
          <Select label="Theme" value={settings.theme} onChange={(v) => void update({ theme: v })}
            options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match Windows' }]} />
        </Row>
        <Row title="Animations" description="Reduced swaps springs and fly-ins for quick fades" last>
          <Select label="Animations" value={settings.motion} onChange={(v) => void update({ motion: v })}
            options={[{ value: 'system', label: 'Match Windows' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]} />
        </Row>
      </Section>

      <Section id="pill" title="Pill & Island">
        <Row title="Show the pill on screen">
          <Toggle label="Show pill" checked={p.visible} onChange={(v) => void update({ pill: { visible: v } })} />
        </Row>
        <Row title="Position" description="Drag the pill anywhere; it sticks to the nearest edge and remembers the spot">
          <span className="text-[13px] text-soft capitalize">{p.anchorV} · {p.anchorH}</span>
          <Button size="sm" onClick={() => void api.pillResetPosition()}>Reset</Button>
        </Row>
        <Row title="Pill shows">
          <Select label="Pill shows" value={p.shows} onChange={(v) => void update({ pill: { shows: v } })}
            options={[{ value: 'name_battery', label: 'Phone name + battery' }, { value: 'battery', label: 'Battery only' }, { value: 'dot', label: 'Status dot only' }]} />
        </Row>
        <Row title="Size">
          <Segmented label="Pill size" value={p.size} onChange={(v) => void update({ pill: { size: v } })}
            options={[{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }]} />
        </Row>
        <Row title="Island closes by itself after">
          <Select label="Island auto-close" value={p.islandAutoCloseSecs} onChange={(v) => void update({ pill: { islandAutoCloseSecs: v } })}
            options={[{ value: 4, label: '4 seconds' }, { value: 8, label: '8 seconds' }, { value: 0, label: 'Never' }]} />
        </Row>
        <Row title="Keyboard shortcut" description="Ctrl + Shift + Space opens and closes the Island from anywhere">
          <Toggle label="Keyboard shortcut" checked={p.shortcut ?? true} onChange={(v) => void update({ pill: { shortcut: v } })} />
        </Row>
        <Row title="Hide the pill in full-screen apps" description="Games, videos and slideshows" last>
          <Toggle label="Hide in full-screen apps" checked={p.hideInFullscreen} onChange={(v) => void update({ pill: { hideInFullscreen: v } })} />
        </Row>
      </Section>

      <Section id="gestures" title="Gestures & camera">
        <Row title="Air gestures">
          <Toggle label="Air gestures" checked={g.enabled} onChange={(v) => void update({ gestures: { enabled: v } })} />
        </Row>
        <Row title="Camera" description={cameras.length === 0 ? 'No camera found yet' : undefined}>
          {cameras.length > 0 ? (
            <Select label="Camera" value={g.cameraId ?? cameras[0].deviceId}
              onChange={(v) => void update({ gestures: { cameraId: v } })}
              options={cameras.map((c) => ({ value: c.deviceId, label: c.label }))} />
          ) : (
            <Button size="sm" onClick={() => void findCameras()}>Find cameras</Button>
          )}
          <Button size="sm" onClick={() => setPreview((v) => !v)}>{preview ? 'Hide preview' : 'Preview'}</Button>
        </Row>
        {preview && <div className="py-3"><CameraPreview deviceId={g.cameraId} onClose={() => setPreview(false)} /></div>}
        <fieldset className="border-0 m-0 py-3.5 border-b border-surface2 flex flex-col gap-2">
          <legend className="text-[14px] mb-2">Turn the camera on</legend>
          <Radio name="cam" checked={g.cameraMode !== 'on_select'} onChange={() => void update({ gestures: { cameraMode: 'on_click' } })}>
            When I open the Island (click the pill or press Ctrl + Shift + Space) — turns off by itself after 30 seconds with nothing happening (recommended)
          </Radio>
          <Radio name="cam" checked={g.cameraMode === 'on_select'} onChange={() => void update({ gestures: { cameraMode: 'on_select' } })}>
            Whenever a file or folder is selected in Explorer or on the Desktop
          </Radio>
          <p className="m-0 text-[12px] text-muted">
            The camera never runs on its own in the background. Only a pinch (grab) and an open hand (drop) do anything; other hand movements are ignored.
          </p>
        </fieldset>
        <Row title="When the Island opens" description="Start watching right away, or show a Start gestures button first">
          <Segmented label="When the Island opens" value={g.islandCamera ?? 'auto'} onChange={(v) => void update({ gestures: { islandCamera: v } })}
            options={[{ value: 'auto', label: 'Start camera' }, { value: 'button', label: 'Show button' }]} />
        </Row>
        <Row title={<label htmlFor="sens">Pinch sensitivity</label>}>
          <span className="text-[12px] text-muted">Relaxed</span>
          <input id="sens" type="range" min={0} max={100} value={g.sensitivity}
            onChange={(e) => void update({ gestures: { sensitivity: Number(e.target.value) } })}
            className="w-44 accent-[rgb(var(--primary))]" />
          <span className="text-[12px] text-muted">Strict</span>
        </Row>
        <Row title="Time to catch on the phone">
          <Select label="Catch window" value={g.catchSecs} onChange={(v) => void update({ gestures: { catchSecs: v } })}
            options={[{ value: 15, label: '15 seconds' }, { value: 30, label: '30 seconds' }, { value: 60, label: '60 seconds' }]} />
        </Row>
        <Row title="Show the hand ring and floating card on screen">
          <Toggle label="Hand ring" checked={g.showHandRing} onChange={(v) => void update({ gestures: { showHandRing: v } })} />
        </Row>
        <Row title="Sounds" description="Pill open/close now; pop, whoosh and chime for gestures later" last>
          <Toggle label="Sounds" checked={g.sounds} onChange={(v) => void update({ gestures: { sounds: v } })} />
        </Row>
      </Section>

      <Section id="phone" title="Your phone">
        <PhoneSection />
      </Section>

      <Section id="transfers" title="Transfers">
        <Row title="When I send something" description="Move puts the PC copy in the Recycle Bin only after the phone confirms">
          <Select label="Copy or move" value={t.mode} onChange={(v) => void update({ transfers: { mode: v } })}
            options={[{ value: 'copy', label: 'Copy (keep on PC)' }, { value: 'move', label: 'Move' }]} />
        </Row>
        <Row title="Photos & videos land in"><span className="text-[13px] text-soft">Gallery · Pictures/PinchDrop, Movies/PinchDrop</span></Row>
        <Row title="Other files & folders land in"><span className="text-[13px] text-soft">Downloads/PinchDrop</span></Row>
        <Row title="If the name already exists on the phone" description="Chosen on the phone (Settings → Saving), because that's where the files land" last>
          <span className="text-[13px] text-soft">Set on the phone</span>
        </Row>
      </Section>

      <Section id="notify" title="Notifications">
        <Row title="Windows notification when a send finishes or fails" description="Only while the PinchDrop window isn't in front">
          <Toggle label="Finish notifications" checked={settings.notifications.onFinish} onChange={(v) => void update({ notifications: { onFinish: v } })} />
        </Row>
        <Row title="Tell me when my phone disconnects" last>
          <Toggle label="Disconnect notifications" checked={settings.notifications.onDisconnect} onChange={(v) => void update({ notifications: { onDisconnect: v } })} />
        </Row>
      </Section>

      <Section id="privacy" title="Privacy & security">
        <div className="py-3.5 border-b border-surface2 text-[13px] text-soft leading-relaxed">
          Camera frames are analysed in memory and thrown away — never saved, never sent. Files travel only between your PC and your phone, encrypted. No accounts, no cloud.
        </div>
        <Row title="Transfer history" description="Names, sizes and status of past sends, kept only on this PC">
          <Button size="sm" onClick={() => void api.clearTransferHistory()}>Clear history</Button>
        </Row>
        <Row title="Anonymous crash reports" description="Off by default. Nothing is sent while off." last>
          <Toggle label="Crash reports" checked={settings.crashReports} onChange={(v) => void update({ crashReports: v })} />
        </Row>
      </Section>

      <Section id="about" title="About & updates">
        <Row title={`PinchDrop ${info?.version ?? ''}`} description="Pinch it on your PC, drop it on your phone" />
        <Row title="Preview with a demo phone" description="Shows a pretend phone (marked DEMO) when no real phone is paired">
          <Toggle label="Demo phone" checked={settings.demoPhone} onChange={(v) => void update({ demoPhone: v })} />
        </Row>
        <Row title="Settings folder" description={info?.configDir} last>
          <Button size="sm" onClick={() => void api.openConfigFolder()}>Open</Button>
        </Row>
      </Section>
    </>
  );
}

/** v2 · Calls, clipboard, find my phone. */
function PhoneSection() {
  const { settings, update } = useApp();
  const ph = settings.phone ?? { clipboardSync: false, callGestures: true };
  const [ringing, setRinging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function find(stop: boolean) {
    setNote(null);
    try {
      await api.findPhone(stop);
      setRinging(!stop);
      if (!stop) window.setTimeout(() => setRinging(false), 60_000);
    } catch (e) {
      setNote(String(e instanceof Error ? e.message : e));
    }
  }
  return (
    <>
      <Row title="Answer calls with gestures" description="While your phone rings, the camera watches for an open palm (answer), a swipe (reject) or a fist (silence). Only while it rings.">
        <Toggle label="Answer calls with gestures" checked={ph.callGestures} onChange={(v) => void update({ phone: { callGestures: v } })} />
      </Row>
      <Row title="Share the clipboard" description="Copy text on the PC and paste it on the phone. Text copied on the phone comes over when you open PinchDrop there (Android only allows that).">
        <Toggle label="Share the clipboard" checked={ph.clipboardSync} onChange={(v) => void update({ phone: { clipboardSync: v } })} />
      </Row>
      <Row title="Sounds on the PC" description="A soft sound when a chat message, a text (SMS) or a call comes in on your phone">
        <Toggle label="Sounds on the PC" checked={ph.soundsOn !== false} onChange={(v) => void update({ phone: { soundsOn: v } })} />
      </Row>
      {ph.soundsOn !== false && <PhoneSoundRows />}
      <Row title="Find my phone" description={note ?? 'Rings your phone loudly, even on silent, for up to a minute'} last>
        {ringing ? (
          <Button size="sm" onClick={() => void find(true)}>Stop ringing</Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => void find(false)}>Ring my phone</Button>
        )}
      </Row>
    </>
  );
}

/** v2 · Pick the message / text / call sound for each phone (like the phone's own settings). */
function PhoneSoundRows() {
  const { settings, update } = useApp();
  const phones = useDevices().filter((d) => d.model !== 'Windows PC');
  const all = settings.phone?.sounds ?? {};
  const rows = phones.length > 0 ? phones.map((d) => ({ id: d.id, name: d.name })) : [{ id: 'default', name: 'Your phone' }];
  const set = (id: string, key: 'message' | 'sms' | 'call', v: string) => {
    const cur = { ...DEFAULT_PHONE_SOUNDS, ...(all[id] ?? {}) };
    void update({ phone: { sounds: { [id]: { ...cur, [key]: v } } } });
  };
  const alertOpts = Object.entries(ALERTS).map(([value, a]) => ({ value, label: a.label }));
  const ringOpts = Object.entries(RINGS).map(([value, r]) => ({ value, label: r.label }));
  return (
    <>
      {rows.map((p) => {
        const cur = { ...DEFAULT_PHONE_SOUNDS, ...(all[p.id] ?? {}) };
        return (
          <Row key={p.id} title={p.name} description="Chat messages · Texts (SMS) · Calls">
            <div className="flex flex-wrap items-center gap-2">
              <Select label={`${p.name} chat message sound`} value={cur.message} options={alertOpts} onChange={(v) => { set(p.id, 'message', v); playAlert(v); }} />
              <Select label={`${p.name} text message sound`} value={cur.sms} options={alertOpts} onChange={(v) => { set(p.id, 'sms', v); playAlert(v); }} />
              <Select label={`${p.name} ringing sound`} value={cur.call} options={ringOpts} onChange={(v) => { set(p.id, 'call', v); RINGS[v]?.play(); }} />
            </div>
          </Row>
        );
      })}
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { FlyHero, Guide } from './Illustrations';
import { ProGate, ProPage, UpgradeDialog } from './Pro';
import { StudioPage } from './Studio';
import { HuddleJoinDialog, HuddlePage } from './screens/Huddle';
import { huddleApi } from '../shared/huddle';
import { installUpdate, startUpdateChecks, useUpdate } from '../shared/updates';
import { PageTitle } from './ui';
import { Upload } from 'lucide-react';
import { api, inTauri, useReducedMotion, useTheme } from '../shared/api';
import { useApp } from './context';
import { Sidebar } from './Sidebar';
import { GestureStudioPage } from './GestureStudio';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Send } from './screens/Send';
import { Transfers } from './screens/Transfers';
import { Devices } from './screens/Devices';
import { Pair } from './screens/Pair';
import { SettingsScreen } from './screens/Settings';
import { Profile } from './screens/Profile';
import { Messages } from './screens/Messages';
import { Contacts } from './screens/Contacts';
import { PhoneNotifications } from './screens/PhoneNotifications';
import { MapScreen } from './screens/MapScreen';
import { PhoneFiles } from './screens/PhoneFiles';

export function App() {
  const { route, go, settings, addPaths } = useApp();
  const routeRef = useRef(route);
  routeRef.current = route;
  useTheme(settings.theme);
  const reduced = useReducedMotion(settings.motion);
  const [dragOver, setDragOver] = useState(false);

  // Files dragged from Explorer onto any screen go into the send list.
  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      // v2: on the Phone files page, files dragged in from Explorer go straight into the folder
      // a phone pane is showing (the pane under the pointer lights up).
      const paneAt = (pos: { x: number; y: number } | undefined) => {
        if (!pos) return null;
        const k = window.devicePixelRatio || 1;
        const el = document.elementFromPoint(pos.x / k, pos.y / k)?.closest('[data-drop-device]') as HTMLElement | null;
        return el ? { id: el.dataset.dropDevice!, name: el.dataset.dropName ?? 'phone', path: el.dataset.dropPath ?? '' } : null;
      };
      // v2 Huddle: files dropped on a teammate's face go to them.
      const faceAt = (pos: { x: number; y: number } | undefined) => {
        if (!pos) return null;
        const k = window.devicePixelRatio || 1;
        return (document.elementFromPoint(pos.x / k, pos.y / k)?.closest('[data-huddle-member]') as HTMLElement | null) ?? null;
      };
      const lightFace = (el: HTMLElement | null) => {
        document.querySelectorAll('.pd-huddle-face').forEach((f) => f.classList.toggle('pd-face-hot', f === el));
      };
      off = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload as { type: string; paths?: string[]; position?: { x: number; y: number } };
        if (routeRef.current === 'huddle') {
          if (p.type === 'enter' || p.type === 'over') lightFace(faceAt(p.position));
          else if (p.type === 'leave') lightFace(null);
          else if (p.type === 'drop') {
            const face = faceAt(p.position);
            lightFace(null);
            const id = face?.dataset.huddleMember;
            const result = (ok: boolean, text: string) => window.dispatchEvent(new CustomEvent('pd-huddle-result', { detail: { ok, text } }));
            if (!face || !id || !p.paths?.length) result(false, 'Drop it on a face');
            else
              void huddleApi
                .sendPaths(id === '__all' ? null : id, p.paths)
                .then((t) => result(true, t))
                .catch((err) => result(false, String(err instanceof Error ? err.message : err)));
          }
          return;
        }
        const onFiles = routeRef.current === 'files';
        if (p.type === 'enter' || p.type === 'over') {
          if (onFiles) window.dispatchEvent(new CustomEvent('pd-os-drag', { detail: paneAt(p.position)?.id ?? null }));
          else setDragOver(true);
        } else if (p.type === 'leave') {
          setDragOver(false);
          window.dispatchEvent(new CustomEvent('pd-os-drag', { detail: null }));
        } else if (p.type === 'drop') {
          setDragOver(false);
          window.dispatchEvent(new CustomEvent('pd-os-drag', { detail: null }));
          const pane = onFiles ? paneAt(p.position) : null;
          if (pane && p.paths?.length) {
            window.dispatchEvent(new CustomEvent('pd-os-drop', { detail: { ...pane, count: p.paths.length } }));
            void api.sendItems(p.paths, [], `folder:${pane.path}`, pane.id).catch((err) =>
              window.dispatchEvent(new CustomEvent('pd-os-drop', { detail: { ...pane, error: String(err instanceof Error ? err.message : err) } })),
            );
          } else if (!onFiles) {
            void addPaths(p.paths ?? []).then(() => go('send'));
          }
        }
      });
    });
    return () => off?.();
  }, [addPaths, go]);

  // v2: the window appears only once this page has drawn (no blank flash on first run).
  useEffect(() => {
    if (!inTauri) return;
    // Not requestAnimationFrame: a hidden window never gets a frame, so it would never fire.
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke('main_ready').catch(() => undefined));
  }, []);

  if (!settings.onboarded || route === 'onboarding') return <Onboarding />;

  const screen = {
    home: <Home />,
    send: <Send />,
    transfers: <Transfers />,
    messages: <Messages />,
    contacts: <Contacts />,
    notifications: <PhoneNotifications />,
    devices: <Devices />,
    pair: <Pair />,
    settings: <SettingsScreen />,
    profile: <Profile />,
    guide: <GuidePage />,
    pro: <ProPage />,
    studio: <StudioPage />,
    huddle: <HuddlePage />,
    gestures: <GestureStudioPage />,
    files: <ProGate feature="files"><PhoneFiles /></ProGate>,
    map: <ProGate feature="map"><MapScreen /></ProGate>,
    onboarding: null,
  }[route];

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]">
        {/* A plain CSS fade-in per page: it can never get stuck invisible waiting on a JS animation. */}
        <div
          key={route}
          className={`max-w-[1100px] mx-auto px-8 py-7 flex flex-col gap-5 ${reduced ? '' : 'animate-[pd-page_200ms_cubic-bezier(0.2,0,0,1)]'}`}
        >
          {screen}
        </div>
      </main>
      <UpgradeDialog />
      <HuddleJoinDialog />
      <UpdateBanner />
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-bg/90 flex items-center justify-center pointer-events-none animate-[pd-fade_120ms_ease-out]">
          <div className="rounded-3xl border-2 border-dashed border-primary px-16 py-12 flex flex-col items-center gap-3 bg-surface">
            <Upload size={36} className="text-primary-ink" aria-hidden="true" />
            <div className="font-display text-[20px] font-semibold">Drop to add to the send list</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** v2 · How to use PinchDrop, on the PC and on the phone. */
function GuidePage() {
  return (
    <>
      <PageTitle>How to use PinchDrop</PageTitle>
      <section className="flex items-center gap-6 flex-wrap p-6 rounded-[20px] bg-surface border border-line">
        <div className="flex-[1_1_300px] flex flex-col gap-2">
          <div className="font-display text-[22px] font-semibold leading-snug">Pinch it on your PC. Drop it on your phone.</div>
          <p className="m-0 text-[14px] text-muted leading-relaxed">
            Select something, pinch in front of the webcam, and open your hand over the phone. Everything below works with clicks too.
          </p>
        </div>
        <div className="flex-[1_1_360px] flex justify-center">
          <FlyHero compact />
        </div>
      </section>
      <Guide />
    </>
  );
}

let updateChecksStarted = false;

/** A new version is out: a small card at the bottom of the window. */
function UpdateBanner() {
  const u = useUpdate();
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!updateChecksStarted) {
      updateChecksStarted = true;
      startUpdateChecks();
    }
  }, []);
  if (u.stage !== 'available' && u.stage !== 'downloading') return null;
  if (hidden === u.info.version && u.stage === 'available') return null;
  return (
    <div role="status" className="fixed bottom-5 right-5 z-50 w-[320px] p-4 rounded-2xl bg-surface border border-line shadow-[0_12px_40px_rgba(0,0,0,0.18)] flex flex-col gap-2 animate-[pd-pop_160ms_ease-out]">
      <div className="font-semibold text-[14px]">PinchDrop {u.info.version} is ready</div>
      <div className="text-[12.5px] text-muted">
        {u.stage === 'downloading' ? `Downloading… ${u.pct}%` : 'New features and fixes. It installs in a few seconds and PinchDrop restarts.'}
      </div>
      {u.stage === 'available' && (
        <div className="flex gap-2 justify-end">
          <button type="button" className="h-8 px-3 rounded-full text-[13px] font-semibold text-soft hover:text-text" onClick={() => setHidden(u.info.version)}>
            Later
          </button>
          <button type="button" className="h-8 px-4 rounded-full bg-primary text-on-primary text-[13px] font-semibold" onClick={() => void installUpdate()}>
            Update now
          </button>
        </div>
      )}
    </div>
  );
}

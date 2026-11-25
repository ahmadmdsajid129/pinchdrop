import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, Hand, Smartphone, Upload, LayoutGrid } from 'lucide-react';
import { api, inTauri, onEvent, usePhone, useReducedMotion, useSettings, useTheme, useTransfers } from '../shared/api';
import { SendingIsland } from './SendingIsland';
import { HoldIsland } from './HoldIsland';
import { LiftIsland } from './LiftIsland';
import { NotifIsland } from './NotifIsland';
import { CameraRow } from './CameraRow';
import { Battery } from '../shared/Battery';
import { sound } from '../shared/sound';
import type { HoldView, LiftView, NotifView, PhoneStatus, SessionView, Settings, TransferView } from '../shared/types';

/** Transparent margin around the pill so its shadow isn't clipped. */
const PAD = 8;
const ISLAND_W = 400;
const DOUBLE_CLICK_MS = 240;
const DRAG_THRESHOLD = 4;

const SIZES = {
  s: { h: 30, text: 'text-[12px]', px: 'px-3', icon: 14, gap: 'gap-2' },
  m: { h: 36, text: 'text-[13px]', px: 'px-3.5', icon: 16, gap: 'gap-2.5' },
  l: { h: 44, text: 'text-[15px]', px: 'px-[18px]', icon: 18, gap: 'gap-3' },
} as const;

async function currentWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  return getCurrentWindow();
}

/** What the overlay's send animation needs: what's flying and where the Island is on screen. */
function fxInfo(t: TransferView) {
  return {
    label: t.label,
    fileCount: t.fileCount,
    totalBytes: t.totalBytes,
    isFolder: t.fileCount > 1,
    target: { x: window.screenX + window.innerWidth / 2, y: window.screenY + 30 },
  };
}

export function Pill() {
  const { settings, update } = useSettings();
  const phone = usePhone();
  useTheme(undefined, 'dark');
  const reduced = useReducedMotion(settings?.motion);

  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hold, setHold] = useState<HoldView | null>(null);
  /** v2: something the phone lifted, waiting to be caught here. */
  const [lift, setLift] = useState<LiftView | null>(null);
  const liftRef = useRef<LiftView | null>(null);
  liftRef.current = lift;
  /** v2: a phone notification dropping down from the Island. */
  const [banner, setBanner] = useState<NotifView | null>(null);
  const [replying, setReplying] = useState(false);
  /** The banner opened the Island (so closing the banner closes it again). */
  const bannerOpened = useRef(false);

  // ---- a send in progress shows live on the Island, then "Delivered" for a moment
  const realTransfers = useTransfers();
  const [demoTransfer, setDemoTransfer] = useState<TransferView | null>(null);
  const transfers = demoTransfer ? [demoTransfer] : realTransfers;
  const [shownDone, setShownDone] = useState<string | null>(null);
  const liveTransfer =
    transfers.find((t) => t.state === 'sending' || t.state === 'offered' || t.state === 'paused') ??
    transfers.find((t) => t.id === shownDone) ??
    null;
  const seenActive = useRef<Set<string>>(new Set());
  /** When the current lift-off animation ends (the Island opens then). */
  const fxEndAt = useRef(0);
  useEffect(() => {
    for (const t of transfers) {
      const active = t.state === 'sending' || t.state === 'offered' || t.state === 'paused';
      if (active && !seenActive.current.has(t.id) && t.direction === 'in') {
        // Caught from the phone: the Island shows it arriving.
        seenActive.current.add(t.id);
        setExpanded(true);
      } else if (active && !seenActive.current.has(t.id)) {
        // A new send started (caught by the phone or dropped on the app). First the lift-off plays
        // on its own, showing the item itself; when it lands at the top, the Island opens on the
        // live progress (already some % in) and carries on from there.
        seenActive.current.add(t.id);
        if (!holdRef.current) setExpanded(false);
        const fxMs = reduced ? 600 : 1550;
        fxEndAt.current = Date.now() + fxMs + 400;
        void api.transferPreview(t.id).then(async (preview) => {
          await api.playSendFx({ kind: 'launch', ...fxInfo(t), preview });
          fxEndAt.current = Date.now() + fxMs;
          window.setTimeout(() => setExpanded(true), fxMs);
        });
      } else if (!active && seenActive.current.has(t.id)) {
        seenActive.current.delete(t.id);
        // Big sends get a "landed" burst at the Island.
        if (t.state === 'done' && t.totalBytes >= 50 * 1024 * 1024) void api.playSendFx({ kind: 'landed', ...fxInfo(t) });
        setShownDone(t.id);
        const id = t.id;
        // A quick send may finish during the lift-off: still show "Delivered" for a moment after it.
        window.setTimeout(() => {
          setShownDone((cur) => (cur === id ? null : cur));
          if (!holdRef.current && !sessionRef.current) setExpanded(false);
        }, Math.max(2600, fxEndAt.current - Date.now() + 2200));
      }
    }
  }, [transfers]); // eslint-disable-line react-hooks/exhaustive-deps
  const holdRef = useRef<HoldView | null>(null);
  holdRef.current = hold;
  const [session, setSession] = useState<SessionView | null>(null);
  const sessionRef = useRef(false);
  sessionRef.current = !!session?.active;
  const [gestureError, setGestureError] = useState<string | null>(null);
  const errorTimer = useRef<number | null>(null);

  const showError = useCallback((msg: string) => {
    setGestureError(msg);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setGestureError(null), 6000);
  }, []);

  /** Clicking the pill open allows the camera (unless the mode is "follow my selection"). */
  const startCamera = useCallback(() => {
    if (!settings?.gestures.enabled || settings.gestures.cameraMode === 'on_select') return;
    setGestureError(null);
    api.gestureSessionStart().then(setSession, (e) => showError(String(e instanceof Error ? e.message : e)));
  }, [settings?.gestures.enabled, settings?.gestures.cameraMode, showError]);
  const clickTimer = useRef<number | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const dragging = useRef(false);
  const dragTimer = useRef<number | null>(null);

  // ---- one shell morphs between pill and Island (Dynamic-Island style)
  // The content's *layout* size (offsetWidth/Height — unaffected by animation transforms) drives
  // both the shell's spring and the OS window. The window grows once, up front, and shrinks once,
  // after the shell has finished shrinking — never on every animation frame.
  const [shell, setShell] = useState<{ w: number; h: number } | null>(null);
  const windowSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const pendingShrink = useRef<{ w: number; h: number } | null>(null);
  /** The very first size is applied instantly (no grow-from-nothing on startup). */
  const sizedOnce = useRef(false);

  const sizeWindow = useCallback((w: number, h: number) => {
    const next = { w: w + PAD * 2, h: h + PAD * 2 };
    const cur = windowSize.current;
    if (next.w >= cur.w && next.h >= cur.h) {
      pendingShrink.current = null;
      windowSize.current = next;
      void api.pillResize(next.w, next.h);
    } else {
      // Grow whichever side needs it now; shrink the rest when the morph ends.
      const grow = { w: Math.max(cur.w, next.w), h: Math.max(cur.h, next.h) };
      if (grow.w !== cur.w || grow.h !== cur.h) {
        windowSize.current = grow;
        void api.pillResize(grow.w, grow.h);
      }
      pendingShrink.current = next;
    }
  }, []);

  const onMorphDone = useCallback(() => {
    const p = pendingShrink.current;
    if (!p) return;
    pendingShrink.current = null;
    windowSize.current = p;
    void api.pillResize(p.w, p.h);
  }, []);

  // Watches whichever content box is current. After every change we look it up by its data-box
  // attribute rather than relying on ref callbacks: when the Island re-opens before its close
  // animation finished, the animation library *reuses* the old element (no new ref call), which
  // left the shell sized for the pill while the Island's content was showing.
  const shellRef = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef<Element | null>(null);
  const measureBox = useCallback(
    (el: Element) => {
      const w = (el as HTMLElement).offsetWidth;
      const h = (el as HTMLElement).offsetHeight;
      if (w > 0 && h > 0) {
        setShell((s) => (s && s.w === w && s.h === h ? s : { w, h }));
        sizeWindow(w, h);
        if (!sizedOnce.current) requestAnimationFrame(() => (sizedOnce.current = true));
      }
    },
    [sizeWindow],
  );
  const contentRef = useCallback((_: HTMLDivElement | null) => undefined, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  const collapse = useCallback(() => {
    if (holdRef.current || liftRef.current) return; // countdowns stay visible while something is in the air
    if (sessionRef.current) void api.gestureSessionStop(); // closing the Island switches the camera off
    setBanner(null);
    bannerOpened.current = false;
    setExpanded((was) => {
      if (was && settings?.gestures.sounds) sound.close();
      return false;
    });
  }, [settings?.gestures.sounds]);

  const expand = useCallback(() => {
    setExpanded(true);
    if (settings?.gestures.sounds) sound.open();
    // "auto": camera starts with the Island. "button": the Island shows Start gestures instead.
    if (settings?.gestures.islandCamera !== 'button') startCamera();
  }, [settings?.gestures.sounds, settings?.gestures.islandCamera, startCamera]);
  useLayoutEffect(() => {
    const el = shellRef.current?.querySelector(`[data-box="${expanded ? 'island' : 'pill'}"]`);
    if (!el) return;
    if (observed.current !== el) {
      observer.current?.disconnect();
      observed.current = el;
      observer.current = new ResizeObserver(() => measureBox(el));
      observer.current.observe(el);
    }
    measureBox(el);
  });
  const expandedRef = useRef(false);
  expandedRef.current = expanded;

  // ---- design preview only (plain browser, showcase.html drives these); inert inside the app
  useEffect(() => {
    if (inTauri) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: string; [k: string]: unknown };
      if (d.type === 'expand') setExpanded(true);
      else if (d.type === 'collapse') setExpanded(false);
      else if (d.type === 'session') {
        setGestureError(null);
        setSession(d.session as SessionView | null);
      } else if (d.type === 'hold') setHold(d.hold as HoldView | null);
      else if (d.type === 'lift') setLift(d.lift as LiftView | null);
      else if (d.type === 'notif') {
        setBanner(d.notif as NotifView | null);
        if (d.notif) setExpanded(true);
      }
      else if (d.type === 'transfer') setDemoTransfer(d.transfer as TransferView | null);
    };
    window.addEventListener('pd-demo', on);
    return () => window.removeEventListener('pd-demo', on);
  }, []);

  // ---- Phase 5: a pinch-grabbed item is held: open the Island with its countdown
  useEffect(() => {
    if (!inTauri) return;
    void api.holdState().then(setHold);
    void api.liftState().then((l) => {
      setLift(l);
      if (l) setExpanded(true);
    });
    const offs = [
      onEvent<HoldView | null>('hold-changed', (h) => {
        setHold(h);
        if (!h) setExpanded(false);
      }),
      onEvent<LiftView | null>('lift-changed', (l) => {
        setLift(l);
        if (l) setExpanded(true);
      }),
      onEvent<NotifView>('phone-notif', (n) => {
        // Something more important is on the Island: the notification waits in the app's list.
        if (holdRef.current || liftRef.current) return;
        setBanner((cur) => {
          if (!cur) bannerOpened.current = !expandedRef.current;
          return n;
        });
        setExpanded(true);
      }),
      onEvent<string>('phone-notif-removed', (key) => setBanner((cur) => (cur?.key === key ? null : cur))),
      onEvent<null>('island-open', () => {
        // Opened by Rust for a hold: just show it.
        setExpanded(true);
      }),
      // Ctrl+Shift+Space from anywhere: open (camera per setting) or close the Island.
      onEvent<null>('island-toggle', () => (expandedRef.current ? collapseRef.current() : expandRef.current())),
      onEvent<SessionView>('gesture-session', (v) => {
        setSession(v);
        // 30 s with nothing happening: camera off and back to the pill.
        if (!v.active && v.reason === 'idle' && !holdRef.current) setExpanded(false);
      }),
      onEvent<string>('gesture-error', (msg) => showError(msg)),
    ];
    void api.gestureSessionState().then((v) => v && setSession(v));
    return () => offs.forEach((p) => void p.then((u) => u()));
  }, [showError]);
  const expandRef = useRef(expand);
  expandRef.current = expand;
  const collapseRef = useRef(collapse);
  collapseRef.current = collapse;

  // ---- a notification banner closes by itself after a few seconds (not while hovered or replying)
  const closeBanner = useCallback(() => {
    setBanner(null);
    setReplying(false);
    if (bannerOpened.current && !holdRef.current && !liftRef.current && !sessionRef.current) setExpanded(false);
    bannerOpened.current = false;
  }, []);
  useEffect(() => {
    if (!banner || hovered || replying) return;
    const t = window.setTimeout(closeBanner, 6500);
    return () => clearTimeout(t);
  }, [banner, hovered, replying, closeBanner]);

  // ---- auto-close after N seconds when the pointer isn't on the Island
  useEffect(() => {
    const secs = settings?.pill.islandAutoCloseSecs ?? 4;
    if (!expanded || hovered || secs === 0 || hold || lift || banner || session?.active || liveTransfer) return;
    const t = window.setTimeout(collapse, secs * 1000);
    return () => clearTimeout(t);
  }, [expanded, hovered, settings?.pill.islandAutoCloseSecs, collapse, hold, lift, banner, session?.active, liveTransfer]);

  // ---- close on Escape and when the pill window loses focus (click elsewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && collapse();
    window.addEventListener('keydown', onKey);
    let unlisten: (() => void) | undefined;
    if (inTauri) {
      void currentWindow().then(async (w) => {
        unlisten = await w.onFocusChanged(({ payload: focused }) => {
          // While the camera is on the user is expected to click into Explorer to select things,
          // so losing focus must not close the Island; the 30 s idle rule closes it instead.
          if (!focused && !sessionRef.current) collapse();
        });
      });
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      unlisten?.();
    };
  }, [collapse]);

  // ---- drag end detection: snap + save once moves stop
  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    void currentWindow().then(async (w) => {
      unlisten = await w.onMoved(() => {
        if (!dragging.current) return;
        if (dragTimer.current) clearTimeout(dragTimer.current);
        dragTimer.current = window.setTimeout(finishDrag, 350);
      });
    });
    return () => unlisten?.();
  }, []);

  function finishDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    // Any click belonging to the drag has fired by now (or never will).
    suppressClick.current = false;
    void api.pillDragEnd();
  }

  async function startDrag() {
    dragging.current = true;
    suppressClick.current = true;
    if (!inTauri) return;
    const w = await currentWindow();
    await w.startDragging();
    // If the window never moved, still settle it.
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(finishDrag, 350);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    press.current = { x: e.screenX, y: e.screenY };
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = press.current;
    if (!p || (e.buttons & 1) === 0) return;
    if (Math.hypot(e.screenX - p.x, e.screenY - p.y) > DRAG_THRESHOLD) {
      press.current = null;
      void startDrag();
    }
  }

  function onPillClick() {
    press.current = null;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (clickTimer.current) {
      // Second click inside the window: double-click → open the app.
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      setExpanded(false);
      void api.openMain('home');
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      expanded ? collapse() : expand();
    }, DOUBLE_CLICK_MS);
  }

  async function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    if (!inTauri || !settings) return;
    const { Menu, MenuItem, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
    const connected = phone?.state === 'connected';
    const items = await Promise.all([
      MenuItem.new({ text: 'Open PinchDrop', action: () => void api.openMain('home') }),
      MenuItem.new({
        text: connected ? `Send files to ${phone?.name}…` : 'Send files…',
        action: () => void api.openMain('send'),
      }),
      MenuItem.new({
        text: settings.gestures.enabled ? 'Pause gestures' : 'Resume gestures',
        action: () => void update({ gestures: { enabled: !settings.gestures.enabled } }),
      }),
      MenuItem.new({ text: 'Hide pill for 1 hour', action: () => void api.pillHideFor(60) }),
      MenuItem.new({ text: 'Reset pill position', action: () => void api.pillResetPosition() }),
      PredefinedMenuItem.new({ item: 'Separator' }),
      MenuItem.new({ text: 'Settings', action: () => void api.openMain('settings') }),
      MenuItem.new({ text: 'Quit PinchDrop', action: () => void api.quit() }),
    ]);
    const menu = await Menu.new({ items });
    await menu.popup();
  }

  if (!settings || !phone) return null;

  const anchorH = settings.pill.anchorH;
  const anchorV = settings.pill.anchorV;
  const justify = anchorH === 'left' ? 'justify-start' : anchorH === 'right' ? 'justify-end' : 'justify-center';
  const align = anchorV === 'bottom' ? 'items-end' : 'items-start';
  const origin = `${anchorH === 'left' ? 'left' : anchorH === 'right' ? 'right' : 'center'} ${anchorV}`;
  // Critically-damped-ish spring: fast, no wobble at the end, feels "physical".
  const morph = reduced ? { duration: 0.12, ease: 'easeOut' as const } : { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.9 };
  const fade = reduced ? { duration: 0.08 } : { duration: 0.18, ease: [0.2, 0, 0, 1] as const };
  const collapsed = !expanded;
  const ringClass = hold ? 'ring-primary/70' : collapsed && phone.state === 'none' ? 'ring-white/25' : 'ring-white/[0.09]';
  // Content sits on the anchored edge and stays put while the shell grows/shrinks around it.
  // (Flex alignment, not a CSS translate: the fade/scale animation owns `transform`.)
  const contentPos = `${anchorV === 'bottom' ? 'bottom-0' : 'top-0'} inset-x-0 flex ${justify}`;

  return (
    <div className={`flex ${justify} ${align} w-screen h-screen`} style={{ padding: PAD }}>
      <motion.div
        ref={shellRef}
        className={`relative overflow-hidden bg-black ring-1 ring-inset ${ringClass}`}
        initial={false}
        animate={shell ? { width: shell.w, height: shell.h, borderRadius: collapsed ? shell.h / 2 : 30 } : undefined}
        transition={sizedOnce.current ? morph : { duration: 0 }}
        onAnimationComplete={onMorphDone}
        style={{ transformOrigin: origin, willChange: 'width, height' }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              key="island"
              className={`absolute ${contentPos}`}
              initial={{ opacity: 0, scale: 0.96, filter: 'blur(2px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { ...fade, delay: reduced ? 0 : 0.06 } }}
              exit={{ opacity: 0, scale: 0.97, transition: fade }}
              style={{ transformOrigin: origin }}
            >
              <div ref={contentRef} data-box="island" className="shrink-0">
              {hold ? (
                <HoldIsland hold={hold} width={ISLAND_W} />
              ) : lift ? (
                <LiftIsland lift={lift} width={ISLAND_W} cameraOn={!!settings.gestures.enabled} />
              ) : banner ? (
                <NotifIsland n={banner} width={ISLAND_W} onClose={closeBanner} onReplying={setReplying} />
              ) : liveTransfer ? (
                <SendingIsland t={liveTransfer} width={ISLAND_W} reduced={reduced} />
              ) : (
                <Island
                  settings={settings}
                  phone={phone}
                  update={update}
                  onCollapse={collapse}
                  onDragStart={onPointerDown}
                  onDragMove={onPointerMove}
                  camera={
                    <CameraRow
                      session={session}
                      error={gestureError}
                      mode={settings.gestures.cameraMode}
                      enabled={settings.gestures.enabled}
                      onStart={startCamera}
                      onStop={() => void api.gestureSessionStop()}
                    />
                  }
                />
              )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pill"
              className={`absolute ${contentPos}`}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1, transition: { ...fade, delay: reduced ? 0 : 0.08 } }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.1 } }}
              style={{ transformOrigin: origin }}
            >
              <div ref={contentRef} data-box="pill" className="shrink-0">
                <PillButton
                  settings={settings}
                  phone={phone}
                  onClick={onPillClick}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onContextMenu={onContextMenu}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function PillButton({
  settings,
  phone,
  onClick,
  onPointerDown,
  onPointerMove,
  onContextMenu,
}: {
  settings: Settings;
  phone: PhoneStatus;
  onClick: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const size = SIZES[settings.pill.size] ?? SIZES.m;
  const connected = phone.state === 'connected';
  const offline = phone.state === 'offline';
  const dot = connected ? 'bg-success' : offline ? 'bg-warn' : 'bg-muted';
  const shows = settings.pill.shows;
  const paused = !settings.gestures.enabled;

  let label: string;
  if (phone.state === 'none') label = 'Pair a phone';
  else if (offline) label = `${phone.name} · offline`;
  else label = phone.name ?? 'Phone';

  const aria =
    phone.state === 'none'
      ? 'PinchDrop: no phone paired. Click to expand, double-click to open the app.'
      : `PinchDrop: ${phone.name} ${phone.state}${phone.battery != null ? `, battery ${phone.battery} percent` : ''}. Click to expand, double-click to open the app.`;

  return (
    <button
      type="button"
      aria-label={aria}
      title="Click: Island · Double-click: open PinchDrop · Drag: move · Right-click: menu"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onContextMenu={onContextMenu}
      style={{ height: size.h }}
      className={`inline-flex items-center ${size.gap} ${size.px} ${size.text} font-semibold whitespace-nowrap rounded-full text-text cursor-default select-none transition-[filter] duration-150 hover:brightness-125 active:brightness-90`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {shows === 'name_battery' && (
        <>
          {connected && <Smartphone size={size.icon} className="text-accent" aria-hidden="true" />}
          <span>{label}</span>
        </>
      )}
      {shows === 'battery' && phone.state === 'none' && <span>Pair a phone</span>}
      {shows !== 'dot' && connected && phone.battery != null && (
        <>
          {shows === 'name_battery' && <span className="w-px h-4 bg-line" />}
          <Battery level={phone.battery} charging={phone.charging} size={size.icon + 2} />
          <span>{phone.battery}%</span>
        </>
      )}
      {paused && shows !== 'dot' && (
        <span className="text-muted" title="Gestures paused">
          <Hand size={size.icon - 2} aria-label="Gestures paused" />
        </span>
      )}
    </button>
  );
}

function Island({
  settings,
  phone,
  update,
  onCollapse,
  onDragStart,
  onDragMove,
  camera,
}: {
  settings: Settings;
  phone: PhoneStatus;
  update: ReturnType<typeof useSettings>['update'];
  onCollapse: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
  camera: React.ReactNode;
}) {
  const connected = phone.state === 'connected';
  const gesturesOn = settings.gestures.enabled;

  return (
    <section
      aria-label="PinchDrop Island"
      style={{ width: ISLAND_W }}
      className="p-5 flex flex-col gap-4 text-text"
    >
      {/* header row doubles as a drag handle */}
      <div className="flex items-center gap-3" onPointerDown={onDragStart} onPointerMove={onDragMove}>
        <div className={`w-12 h-12 rounded-[16px] bg-white/[0.08] flex items-center justify-center ${connected ? 'text-accent' : 'text-muted'}`}>
          <Smartphone size={22} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {phone.state === 'none' ? (
            <>
              <div className="font-display font-semibold text-[18px]">No phone paired yet</div>
              <div className="text-[12px] text-muted">Pair your Android phone to send to it</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-[18px] truncate">{phone.name}</span>
                {phone.isDemo && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-warn/20 text-warn">DEMO</span>
                )}
              </div>
              <div className="text-[12px] text-muted truncate">
                {phone.state === 'offline' ? 'Not reachable right now' : `Connected · ${phone.network ?? 'same Wi-Fi'}`}
              </div>
            </>
          )}
        </div>
        {connected && phone.battery != null && (
          <div className="text-right">
            <div className={`text-[20px] font-semibold tabular-nums ${phone.battery < 20 && !phone.charging ? 'text-warn' : 'text-success'}`}>{phone.battery}%</div>
            <div className="text-[11px] text-muted">{phone.charging ? 'Charging' : 'Battery'}</div>
          </div>
        )}
      </div>

      {connected && phone.battery != null && (
        <div className="h-1 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-label="Phone battery" aria-valuenow={phone.battery} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={`h-1 w-full origin-left transition-transform duration-500 ease-out ${phone.battery < 20 && !phone.charging ? 'bg-warn' : 'bg-success'}`}
            style={{ transform: `scaleX(${phone.battery / 100})` }}
          />
        </div>
      )}

      {camera}

      <div className="flex gap-2">
        {phone.state === 'none' ? (
          <button
            type="button"
            onClick={() => void api.openMain('pair')}
            className="flex-1 h-10 rounded-full bg-primary text-white text-[13px] font-semibold hover:brightness-110 transition active:scale-[0.97]"
          >
            Pair a phone
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void api.openMain('send')}
            className="flex-1 h-10 rounded-full bg-primary text-white text-[13px] font-semibold hover:brightness-110 inline-flex items-center justify-center gap-1.5 transition active:scale-[0.97]"
          >
            <Upload size={15} aria-hidden="true" /> Send files…
          </button>
        )}
        <button
          type="button"
          aria-pressed={gesturesOn}
          onClick={() => void update({ gestures: { enabled: !gesturesOn } })}
          className={`flex-1 h-10 rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.12] transition active:scale-[0.97] ${
            gesturesOn ? 'text-text' : 'text-muted'
          }`}
        >
          <Hand size={15} aria-hidden="true" /> Gestures: {gesturesOn ? 'On' : 'Paused'}
        </button>
        <button
          type="button"
          aria-label="Open PinchDrop"
          title="Open PinchDrop"
          onClick={() => void api.openMain('home')}
          className="w-10 h-10 rounded-full bg-white/[0.08] text-soft inline-flex items-center justify-center hover:text-text hover:bg-white/[0.12] transition active:scale-[0.95]"
        >
          <LayoutGrid size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Collapse"
          title="Collapse"
          onClick={onCollapse}
          className="w-10 h-10 rounded-full bg-white/[0.08] text-soft inline-flex items-center justify-center hover:text-text hover:bg-white/[0.12] transition active:scale-[0.95]"
        >
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

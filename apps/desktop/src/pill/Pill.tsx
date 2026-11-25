import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp, Hand, Smartphone, Upload, LayoutGrid } from 'lucide-react';
import { api, inTauri, onEvent, usePhone, useReducedMotion, useSettings, useTheme } from '../shared/api';
import { HoldIsland } from './HoldIsland';
import { Battery } from '../shared/Battery';
import { sound } from '../shared/sound';
import type { HoldView, PhoneStatus, Settings } from '../shared/types';

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

export function Pill() {
  const { settings, update } = useSettings();
  const phone = usePhone();
  useTheme(undefined, 'dark');
  const reduced = useReducedMotion(settings?.motion);

  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hold, setHold] = useState<HoldView | null>(null);
  const holdRef = useRef<HoldView | null>(null);
  holdRef.current = hold;
  const contentRef = useRef<HTMLDivElement>(null);
  const clickTimer = useRef<number | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const dragging = useRef(false);
  const dragTimer = useRef<number | null>(null);

  // ---- keep the OS window exactly as big as the content (+ shadow margin)
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) void api.pillResize(Math.ceil(r.width) + PAD * 2, Math.ceil(r.height) + PAD * 2);
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const collapse = useCallback(() => {
    if (holdRef.current) return; // the countdown stays visible while something is held
    setExpanded((was) => {
      if (was && settings?.gestures.sounds) sound.close();
      return false;
    });
  }, [settings?.gestures.sounds]);

  const expand = useCallback(() => {
    // Grow the window first so the Island has room to animate in.
    void api.pillResize(ISLAND_W + PAD * 2, 240);
    setExpanded(true);
    if (settings?.gestures.sounds) sound.open();
  }, [settings?.gestures.sounds]);

  // ---- Phase 5: a pinch-grabbed item is held: open the Island with its countdown
  useEffect(() => {
    if (!inTauri) return;
    void api.holdState().then(setHold);
    const offs = [
      onEvent<HoldView | null>('hold-changed', (h) => {
        setHold(h);
        if (!h) setExpanded(false);
      }),
      onEvent<null>('island-open', () => expand()),
    ];
    return () => offs.forEach((p) => void p.then((u) => u()));
  }, [expand]);

  // ---- auto-close after N seconds when the pointer isn't on the Island
  useEffect(() => {
    const secs = settings?.pill.islandAutoCloseSecs ?? 4;
    if (!expanded || hovered || secs === 0 || hold) return;
    const t = window.setTimeout(collapse, secs * 1000);
    return () => clearTimeout(t);
  }, [expanded, hovered, settings?.pill.islandAutoCloseSecs, collapse, hold]);

  // ---- close on Escape and when the pill window loses focus (click elsewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && collapse();
    window.addEventListener('keydown', onKey);
    let unlisten: (() => void) | undefined;
    if (inTauri) {
      void currentWindow().then(async (w) => {
        unlisten = await w.onFocusChanged(({ payload: focused }) => {
          if (!focused) collapse();
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
  const spring = reduced ? { duration: 0.08 } : { type: 'spring' as const, stiffness: 420, damping: 30 };

  return (
    <div className={`flex ${justify} ${align} w-screen h-screen`} style={{ padding: PAD }}>
      <div ref={contentRef} className="inline-block" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <AnimatePresence mode="wait" initial={false}>
          {expanded ? (
            <motion.div
              key="island"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={spring}
              style={{ transformOrigin: origin }}
            >
              {hold ? (
                <HoldIsland hold={hold} width={ISLAND_W} />
              ) : (
                <Island settings={settings} phone={phone} update={update} onCollapse={collapse} onDragStart={onPointerDown} onDragMove={onPointerMove} />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="pill"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={spring}
              style={{ transformOrigin: origin }}
            >
              <PillButton
                settings={settings}
                phone={phone}
                onClick={onPillClick}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onContextMenu={onContextMenu}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
      className={`inline-flex items-center ${size.gap} ${size.px} ${size.text} font-semibold whitespace-nowrap rounded-full bg-bg/95 text-text border ${
        phone.state === 'none' ? 'border-dashed border-muted/60' : 'border-line'
      } shadow-[0_4px_14px_rgba(0,0,0,0.45)] cursor-default select-none`}
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
}: {
  settings: Settings;
  phone: PhoneStatus;
  update: ReturnType<typeof useSettings>['update'];
  onCollapse: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onDragMove: (e: React.PointerEvent) => void;
}) {
  const connected = phone.state === 'connected';
  const gesturesOn = settings.gestures.enabled;

  return (
    <section
      aria-label="PinchDrop Island"
      style={{ width: ISLAND_W }}
      className="rounded-[26px] bg-bg/[0.97] border border-line shadow-[0_14px_40px_rgba(0,0,0,0.55)] p-4 flex flex-col gap-3 text-text"
    >
      {/* header row doubles as a drag handle */}
      <div className="flex items-center gap-3" onPointerDown={onDragStart} onPointerMove={onDragMove}>
        <div className={`w-11 h-11 rounded-2xl bg-surface2 flex items-center justify-center ${connected ? 'text-accent' : 'text-muted'}`}>
          <Smartphone size={22} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          {phone.state === 'none' ? (
            <>
              <div className="font-display font-semibold text-[16px]">No phone paired yet</div>
              <div className="text-[12px] text-muted">Pair your Android phone to send to it</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-[16px] truncate">{phone.name}</span>
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
            <div className={`text-[16px] font-bold ${phone.battery < 20 && !phone.charging ? 'text-warn' : 'text-success'}`}>{phone.battery}%</div>
            <div className="text-[11px] text-muted">{phone.charging ? 'Charging' : 'Battery'}</div>
          </div>
        )}
      </div>

      {connected && phone.battery != null && (
        <div className="h-1.5 rounded-full bg-surface2" role="progressbar" aria-label="Phone battery" aria-valuenow={phone.battery} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-1.5 rounded-full ${phone.battery < 20 && !phone.charging ? 'bg-warn' : 'bg-success'}`} style={{ width: `${phone.battery}%` }} />
        </div>
      )}

      <div className="flex gap-2">
        {phone.state === 'none' ? (
          <button
            type="button"
            onClick={() => void api.openMain('pair')}
            className="flex-1 h-9 rounded-xl bg-primary text-white text-[13px] font-semibold hover:brightness-110"
          >
            Pair a phone
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void api.openMain('send')}
            className="flex-1 h-9 rounded-xl bg-primary text-white text-[13px] font-semibold hover:brightness-110 inline-flex items-center justify-center gap-1.5"
          >
            <Upload size={15} aria-hidden="true" /> Send files…
          </button>
        )}
        <button
          type="button"
          aria-pressed={gesturesOn}
          onClick={() => void update({ gestures: { enabled: !gesturesOn } })}
          className={`flex-1 h-9 rounded-xl border text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 ${
            gesturesOn ? 'border-line bg-surface text-text' : 'border-line bg-surface text-muted'
          }`}
        >
          <Hand size={15} aria-hidden="true" /> Gestures: {gesturesOn ? 'On' : 'Paused'}
        </button>
        <button
          type="button"
          aria-label="Open PinchDrop"
          title="Open PinchDrop"
          onClick={() => void api.openMain('home')}
          className="w-9 h-9 rounded-xl border border-line bg-surface text-soft inline-flex items-center justify-center hover:text-text"
        >
          <LayoutGrid size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Collapse"
          title="Collapse"
          onClick={onCollapse}
          className="w-9 h-9 rounded-xl border border-line bg-surface text-soft inline-flex items-center justify-center hover:text-text"
        >
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

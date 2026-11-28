import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, useVelocity } from 'framer-motion';
import { Hand } from 'lucide-react';
import { ItemPreview } from '../shared/ItemPreview';
import type { DeviceView, ItemPreviewData, LiftView } from '../shared/types';
import { Smartphone } from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  frameRect,
  PoseMachine,
  poseConfigFor,
  callPoseConfigFor,
  handShape,
  CatchMachine,
  catchConfigFor,
  GrabMachine,
  OneEuroFilter,
  calculatePinchRatio,
  cameraToScreen,
  extendedFingers,
  grabConfigFor,
  handScale,
} from '@pinchdrop/gesture-core';
import { formatBytes, inTauri, onEvent } from '../shared/api';
import { SendFx } from './SendFx';
import { EdgeGlow } from './EdgeGlow';
import type { SendFxEvent } from './SendFx';
import { sound } from '../shared/sound';

/** Mirrors grab::ArmState. */
interface ArmState {
  armed: boolean;
  label: string | null;
  cameraId: string | null;
  sensitivity: number;
  showRing: boolean;
  sounds: boolean;
  /** "grab" (pinch the selection) or "catch" (v2: open hand takes what the phone lifted). */
  mode?: 'grab' | 'catch' | 'attention';
}

/** Mirrors grab::GrabbedItems. */
interface Grabbed {
  paths: string[];
  label: string;
  fileCount: number;
  totalBytes: number;
  isFolder: boolean;
  partial: boolean;
  texts?: string[];
  openOnArrival?: boolean;
  preview?: ItemPreviewData;
}

/**
 * Display-rate pointer. The camera delivers 30–60 positions a second; the screen draws 60–144
 * frames. Between camera frames we keep gliding along the hand's current velocity (for at most
 * one frame's worth, so a stop never overshoots), and ease toward that point with a critically
 * damped follow. Result: one fluid motion instead of small steps at camera rate.
 */
interface Track {
  tx: number; // last camera target (px)
  ty: number;
  vx: number; // smoothed velocity (px/s)
  vy: number;
  t: number; // when the target arrived (ms)
  x: number; // drawn position (px)
  y: number;
  live: boolean;
}
/** Easing time constant of the follow: lower = tighter. */
const FOLLOW_TAU_S = 0.028;
/** Never extrapolate further ahead than this past the last camera frame. */
const MAX_GLIDE_S = 0.045;

type Card = { items: Grabbed; phase: 'held' | 'flying' | 'dropped'; to?: { x: number; y: number } };

/** v2 · Where the device chips sit along the top of the screen while you carry something. */
const CHIP_W = 168;
const CHIP_H = 52;
const CHIP_GAP = 18;
const CHIP_Y = 26;
function chipRects(n: number, screenW: number) {
  const total = n * CHIP_W + (n - 1) * CHIP_GAP;
  const x0 = (screenW - total) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (CHIP_W + CHIP_GAP), y: CHIP_Y, w: CHIP_W, h: CHIP_H }));
}
/** Pointing under a chip for this long picks it. */
const DWELL_MS = 400;

/** Older Rust builds (or text) without a preview: a plain tile from what we know. */
function fallbackPreview(g: Grabbed): ItemPreviewData {
  const ext = g.paths[0]?.split('.').pop()?.toUpperCase() ?? '';
  return {
    kind: g.fileCount === 0 ? 'note' : g.isFolder ? 'folder' : 'file',
    width: 0,
    height: 0,
    lines: g.texts ?? [],
    ext: g.isFolder ? '' : ext,
    children: [],
    childCount: 0,
    host: '',
    thumb: null,
  };
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

/** Tells Rust (and through it the Island) about a problem. Fatal ones switch the camera off. */
function reportError(message: string, fatal: boolean) {
  if (inTauri) void invoke('gesture_error', { message, fatal }).catch(() => undefined);
}

/** Plain-words explanation for getUserMedia failures. */
function cameraErrorText(e: unknown, chosenDevice: boolean): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked. Allow it in Windows Settings → Privacy & security → Camera.';
    case 'NotFoundError':
      return 'No camera found. Plug one in, or check Settings → Gestures & camera.';
    case 'OverconstrainedError':
      return chosenDevice ? 'The chosen camera isn’t connected. Pick another in Settings → Gestures & camera.' : 'The camera can’t provide video right now.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy in another app (Teams, Zoom, Camera…). Close it and try again.';
    default:
      return 'The camera couldn’t start. Try again, or pick another camera in Settings.';
  }
}

let landmarkerPromise: Promise<HandLandmarker> | null = null;

/** Loads MediaPipe from the files bundled with the app (no CDN). GPU first, CPU if that fails. */
function loadLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe');
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO' as const,
        // Two hands for the v2 screenshot frame; the closer hand drives everything else.
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      try {
        return await HandLandmarker.createFromOptions(fileset, opts('GPU'));
      } catch {
        return HandLandmarker.createFromOptions(fileset, opts('CPU'));
      }
    })();
    landmarkerPromise.catch(() => (landmarkerPromise = null));
  }
  return landmarkerPromise;
}

/**
 * Full-screen, click-through overlay shown only while the camera is allowed to run.
 * Webcam frames go straight from the <video> element into MediaPipe in memory and are
 * dropped; nothing is drawn to a canvas, saved or sent.
 */
export function Overlay() {
  const [arm, setArm] = useState<ArmState | null>(null);
  // Hand position lives in motion values, updated straight from the camera loop: the ring and
  // card move on the GPU every frame without React re-rendering. React state changes only when
  // something visible changes (hand appears/disappears, pinch starts/ends).
  const W = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const H = typeof window !== 'undefined' ? window.innerHeight : 1080;
  // The ring sits exactly on the fingers (drawn every display frame by the Track loop).
  const hx = useMotionValue(W / 2);
  const hy = useMotionValue(H / 2);
  const track = useRef<Track>({ tx: W / 2, ty: H / 2, vx: 0, vy: 0, t: 0, x: W / 2, y: H / 2, live: false });
  /** New camera position (px). `jump` places it there at once (first sighting). */
  const feed = (x: number, y: number, now: number, jump = false) => {
    const k = track.current;
    if (jump || !k.live) {
      Object.assign(k, { tx: x, ty: y, x, y, vx: 0, vy: 0, t: now, live: true });
      hx.set(x);
      hy.set(y);
      return;
    }
    const dt = Math.max(1, now - k.t) / 1000;
    // Smoothed velocity: responsive, but one noisy frame can't fling the card.
    k.vx = k.vx * 0.55 + ((x - k.tx) / dt) * 0.45;
    k.vy = k.vy * 0.55 + ((y - k.ty) / dt) * 0.45;
    k.tx = x;
    k.ty = y;
    k.t = now;
  };
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const paint = (now: number) => {
      raf = requestAnimationFrame(paint);
      const k = track.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!k.live) return;
      const ahead = Math.min(MAX_GLIDE_S, Math.max(0, (now - k.t) / 1000));
      const gx = k.tx + k.vx * ahead;
      const gy = k.ty + k.vy * ahead;
      const a = 1 - Math.exp(-dt / FOLLOW_TAU_S);
      k.x += (gx - k.x) * a;
      k.y += (gy - k.y) * a;
      hx.set(k.x);
      hy.set(k.y);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [hx, hy]);
  const ringX = useTransform(hx, (v) => v - 22);
  const catchRingX = useTransform(hx, (v) => v - 32);
  const catchRingY = useTransform(hy, (v) => v - 32);
  const ringY = useTransform(hy, (v) => v - 22);
  // The card is "carried": a soft, critically damped follow (no wobble) and a gentle tilt with
  // the direction of travel, like a photo held between two fingers.
  const carried = { stiffness: 420, damping: 40, mass: 0.6 };
  const cardX = useSpring(useTransform(hx, (v) => v + 22), carried);
  const cardY = useSpring(useTransform(hy, (v) => v + 22), carried);
  const tilt = useSpring(useTransform(useVelocity(hx), [-2500, 0, 2500], [-7, 0, 7], { clamp: true }), { stiffness: 260, damping: 30 });
  const toastY = useTransform(hy, (v) => v + 14);
  const toastX = useTransform(hx, (v) => v + 22);
  const [hand, setHand] = useState<{ pinched: boolean } | null>(null);
  const handRef = useRef<{ pinched: boolean } | null>(null);
  const setHandIfChanged = (next: { pinched: boolean } | null) => {
    const cur = handRef.current;
    if ((cur === null) !== (next === null) || (cur && next && cur.pinched !== next.pinched)) {
      handRef.current = next;
      setHand(next);
    }
  };
  const [card, setCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fx, setFx] = useState<SendFxEvent | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const off = onEvent<SendFxEvent>('send-fx', (e) => setFx({ ...e, reduced }));
    return () => void off.then((u) => u());
  }, []);
  // Camera problems are reported to the Island (gesture_error); kept here only to stop retries.
  const [, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cardRef = useRef<Card | null>(null);
  cardRef.current = card;

  // Design preview only (plain browser, driven by showcase.html): simulated hand + card, no camera.
  useEffect(() => {
    if (inTauri) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: string; [k: string]: unknown };
      if (d.type === 'arm') setArm(d.arm as ArmState);
      else if (d.type === 'hand') {
        const h = d.hand as { x: number; y: number; pinched: boolean } | null;
        if (h) feed(h.x * window.innerWidth, h.y * window.innerHeight, performance.now(), !handRef.current);
        else track.current.live = false;
        setHandIfChanged(h ? { pinched: h.pinched } : null);
      } else if (d.type === 'card') setCard(d.card as Card | null);
      else if (d.type === 'sendfx') setFx(d.fx as SendFxEvent);
      else if (d.type === 'lift') setLift(d.lift as LiftView | null);
      else if (d.type === 'devices') setDevices(d.devices as DeviceView[]);
    };
    window.addEventListener('pd-demo', on);
    return () => window.removeEventListener('pd-demo', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inTauri) return;
    void invoke<ArmState | null>('grab_arm_state').then((a) => a && setArm(a));
    const off = onEvent<ArmState>('grab-arm', setArm);
    return () => void off.then((u) => u());
  }, []);

  const armed = !!arm?.armed;

  // v2 · Several phones / tablets: chips to aim at while carrying.
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const devicesRef = useRef<DeviceView[]>([]);
  devicesRef.current = devices;
  const [chipHover, setChipHover] = useState<{ i: number; picked: boolean } | null>(null);
  const chipHoverRef = useRef<{ i: number; since: number; picked: boolean } | null>(null);
  useEffect(() => {
    if (!inTauri) return;
    const keep = (l: DeviceView[]) => setDevices(l.filter((d) => d.connected));
    void invoke<DeviceView[]>('list_devices').then(keep);
    const off = onEvent<DeviceView[]>('devices-changed', keep);
    return () => void off.then((u) => u());
  }, []);
  const catching = armed && arm?.mode === 'catch';
  /** v2: the phone is ringing; only palm / swipe / fist mean anything. */
  const attention = armed && arm?.mode === 'attention';

  // v2 · What the phone has in the air (shown big while the webcam waits for an open hand).
  const [lift, setLift] = useState<LiftView | null>(null);
  const [catchProgress, setCatchProgress] = useState(0);
  /** v2 · Two "L" hands framing part of the screen (screen px) and how long it's been held. */
  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number; progress: number } | null>(null);
  const [caught, setCaught] = useState(false);
  useEffect(() => {
    if (!inTauri) return;
    void invoke<LiftView | null>('lift_state').then(setLift);
    const off = onEvent<LiftView | null>('lift-changed', (l) => {
      if (l) {
        setCaught(false);
        setLift(l);
      } else {
        // Leave a moment for the "pulled in" animation after a catch.
        window.setTimeout(() => {
          setLift(null);
          setCaught(false);
        }, 700);
      }
    });
    return () => void off.then((u) => u());
  }, []);

  useEffect(() => {
    if (!armed || !arm || !inTauri) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelFrame = () => cancelAnimationFrame(raf);
    const machine = new GrabMachine(grabConfigFor(arm.sensitivity));
    // v2: in catch mode only an open hand counts (no pinching, nothing is picked up here).
    const catcher = arm.mode === 'catch' ? new CatchMachine(catchConfigFor(arm.sensitivity)) : null;
    // v2 gestures (palm hold, swipe, peace, thumbs up, fist, wave): the Island decides what they do.
    // While the phone rings, the easier call set (palm without thumb, shaky hand OK, no wave).
    const poses = new PoseMachine(arm.mode === 'attention' ? callPoseConfigFor(arm.sensitivity) : poseConfigFor(arm.sensitivity));
    /** Ringing: tell the call card which pose is being held and how far (it lights that action up). */
    let lastPose = '';
    const tellPose = (pose: string | null, progress: number) => {
      const key = `${pose ?? ''}:${Math.round(progress * 10)}`;
      if (key === lastPose) return;
      lastPose = key;
      void import('@tauri-apps/api/event').then(({ emitTo }) => emitTo('pill', 'call-pose', { pose, progress })).catch(() => undefined);
    };
    const LABEL: Record<string, string> = {
      palm_hold: '✋ Open palm',
      swipe_left: '👈 Swipe',
      swipe_right: '👉 Swipe',
      peace_hold: '✌️ Reply',
      thumbs_up: '👍',
      fist_hold: '✊ Fist',
      wave: '👋 Wave',
    };
    const sendGesture = (g: string, quiet = false) => {
      activity();
      if (!quiet) flash(LABEL[g] ?? g);
      void import('@tauri-apps/api/event').then(({ emitTo }) => emitTo('pill', 'gesture', g)).catch(() => undefined);
    };
    let shownProgress = 0;
    const showProgress = (v: number) => {
      if (Math.abs(v - shownProgress) >= 0.08 || (v === 0) !== (shownProgress === 0)) {
        shownProgress = v;
        setCatchProgress(v);
      }
    };
    // Pointer filter: steady when the hand is still, almost no lag when it moves fast (high beta).
    // Gesture classification uses the raw landmarks — its thresholds, dwell and hysteresis are the stabiliser.
    const POINTER = { minCutoff: 1.2, beta: 0.05, dCutoff: 1.0 };
    let fx = new OneEuroFilter(POINTER);
    let fy = new OneEuroFilter(POINTER);
    let prev: { x: number; y: number; t: number } | null = null;
    /** Lead the pointer by ~1 camera frame to cancel capture + inference delay. */
    const LEAD_S = 0.02;
    let lastVideoTime = -1;
    let busy = false;

    const flash = (text: string) => {
      setToast(text);
      window.setTimeout(() => setToast((t) => (t === text ? null : t)), 1800);
    };
    const activity = () => void invoke('gesture_activity').catch(() => undefined);
    let lastActivity = 0;
    let farSince = 0;
    let hintShown = false;
    let frameErrors = 0;

    const FRAME_HOLD_MS = 700;
    const frameState: { box: { x: number; y: number; w: number; h: number } | null; since: number; coolUntil: number } = { box: null, since: 0, coolUntil: 0 };
    async function captureFrame(box: { x: number; y: number; w: number; h: number }) {
      busy = true;
      activity();
      setFrame(null);
      if (arm?.sounds) sound.pop();
      const items = await invoke<Grabbed>('capture_region', { x: box.x, y: box.y, w: box.w, h: box.h }).catch(() => null);
      busy = false;
      frameState.box = null;
      if (!items) {
        flash('Couldn’t take the screenshot');
        return;
      }
      // Straight into the air for the phone, like a grabbed file.
      const held = await invoke('hold_start', { items }).catch(() => null);
      flash(held ? '📸 Screenshot — open your hand over your phone' : '📸 Saved, but no phone is connected');
    }

    async function onGrab() {
      busy = true;
      activity();
      const items = await invoke<Grabbed | null>('grab_selection').catch(() => null);
      busy = false;
      if (!items) {
        machine.reset();
        flash('Select a file, or copy a link or text, then pinch');
        reportError('Nothing to grab. Select a file or folder, or copy a link or some text, then pinch.', false);
        return;
      }
      if (arm?.sounds) sound.pop();
      setCard({ items, phase: 'held' });
    }

    async function onRelease() {
      const c = cardRef.current;
      if (!c) return;
      const devs = devicesRef.current;
      if (devs.length > 1) {
        const rects = chipRects(devs.length, window.innerWidth);
        let i = chipHoverRef.current?.i ?? -1;
        const k = track.current;
        // A throw: a fast flick upward, aimed at a chip (where would it reach the top?).
        if (i < 0 && k.vy < -1400) {
          const reach = k.x + (k.vx * (CHIP_Y + CHIP_H / 2 - k.y)) / k.vy;
          let best = -1;
          let bestD = 160;
          rects.forEach((r, j) => {
            const d = Math.abs(r.x + r.w / 2 - reach);
            if (d < bestD) {
              best = j;
              bestD = d;
            }
          });
          i = best;
        }
        chipHoverRef.current = null;
        setChipHover(null);
        if (i >= 0) {
          const r = rects[i];
          setCard({ ...c, phase: 'flying', to: { x: r.x + 10, y: r.y } });
          if (arm?.sounds) sound.close();
          activity();
          // In the air for that device only: its Catch screen opens; open your hand over it.
          const ok = await invoke('hold_start', { items: c.items, target: devs[i].id }).then((h) => !!h, () => false);
          flash(ok ? `Catch it on ${devs[i].name}` : `${devs[i].name} isn’t connected`);
          window.setTimeout(() => setCard(null), 700);
          return;
        }
      }
      setCard({ ...c, phase: 'flying' });
      if (arm?.sounds) sound.close();
      activity();
      const held = await invoke('hold_start', { items: c.items }).catch(() => null);
      if (!held) {
        flash('Couldn’t hold that — try again');
        reportError('Couldn’t hold that item. Try the pinch again.', false);
      }
      window.setTimeout(() => setCard(null), 700);
    }

    function onCancel() {
      const c = cardRef.current;
      if (!c) return;
      setCard({ ...c, phase: 'dropped' });
      flash('Hand left the camera — nothing was grabbed');
      window.setTimeout(() => setCard(null), 500);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera unavailable');
        reportError('This PC doesn’t offer a camera to apps.', true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: arm?.cameraId ? { exact: arm.cameraId } : undefined,
            // Smaller frames → faster inference; hands are big enough at 640×360.
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 60, min: 24 },
          },
          audio: false,
        });
      } catch (e) {
        const msg = cameraErrorText(e, !!arm?.cameraId);
        setCameraError(msg);
        reportError(msg, true);
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setCameraError(null);
      // Unplugged / taken by another app mid-session.
      stream.getVideoTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          if (!stopped) reportError('The camera was disconnected.', true);
        }),
      );
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const landmarker = await loadLandmarker().catch(() => null);
      if (!landmarker) {
        setCameraError('Hand tracking failed to load');
        reportError('Hand tracking couldn’t start on this PC. Try again; if it keeps failing, update your graphics driver.', true);
        return;
      }

      // Run exactly once per new camera frame (no polling jitter). Falls back to rAF where unsupported.
      type VFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
      const v = video as VFC;
      const schedule = () => {
        if (stopped) return;
        if (v.requestVideoFrameCallback) raf = v.requestVideoFrameCallback(loop);
        else raf = requestAnimationFrame(loop);
      };
      cancelFrame = () => (v.cancelVideoFrameCallback ? v.cancelVideoFrameCallback(raf) : cancelAnimationFrame(raf));
      const loop = () => {
        if (stopped) return;
        schedule();
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        const now = performance.now();
        let res;
        try {
          res = landmarker.detectForVideo(video, now);
          frameErrors = 0;
        } catch {
          // One bad frame is fine; a run of them means tracking is broken.
          if (++frameErrors > 30) reportError('Hand tracking stopped working. Turn the camera on again from the pill.', true);
          return;
        }
        const all = res.landmarks ?? [];
        // v2 · Two-hand screenshot: both hands make an "L", framing an area; hold still to capture.
        if (all.length >= 2 && arm?.mode === 'grab' && !machine.holding && !busy) {
          const r = frameRect(all[0], all[1]);
          if (r) {
            // Camera space → screen px (the image is mirrored, so x flips).
            const a = cameraToScreen(r.x0, r.y0);
            const b = cameraToScreen(r.x1, r.y1);
            const W2 = window.innerWidth;
            const H2 = window.innerHeight;
            const box = { x: Math.min(a.x, b.x) * W2, y: Math.min(a.y, b.y) * H2, w: Math.abs(a.x - b.x) * W2, h: Math.abs(a.y - b.y) * H2 };
            const f = frameState;
            const moved = !f.box || Math.abs(f.box.x - box.x) + Math.abs(f.box.y - box.y) + Math.abs(f.box.w - box.w) + Math.abs(f.box.h - box.h) > 0.04 * W2;
            if (moved) {
              f.box = box;
              f.since = now;
            }
            const held = f.box ?? box;
            const progress = Math.min(1, (now - f.since) / FRAME_HOLD_MS);
            setFrame({ ...held, progress });
            if (progress >= 1 && now > f.coolUntil) {
              f.coolUntil = now + 4000;
              void captureFrame(held);
            }
            setHandIfChanged(null);
            return;
          }
        }
        if (frameState.box) {
          frameState.box = null;
          setFrame(null);
        }
        const raw = all.length > 1 ? (handScale(all[0]) >= handScale(all[1]) ? all[0] : all[1]) : all[0];
        if (!raw || raw.length < 21) {
          fx = new OneEuroFilter(POINTER);
          fy = new OneEuroFilter(POINTER);
          prev = null;
          track.current.live = false;
          setHandIfChanged(null);
          poses.step(now, null);
          if (arm?.mode === 'attention') tellPose(null, 0);
          if (catcher || arm?.mode === 'attention') {
            catcher?.step(now, null);
            showProgress(0);
            return;
          }
          const ev = machine.step(now, null);
          if (ev?.type === 'cancel') onCancel();
          return;
        }
        const lm = raw;
        const shapeNow = handShape(lm, res.handedness?.[0]?.[0]?.score ?? 0);
        if (arm?.mode === 'attention') {
          // Ringing: the ring sits on the palm and fills while a pose is held.
          const palm = cameraToScreen(lm[9].x, lm[9].y);
          feed(fx.filter(palm.x, now) * window.innerWidth, fy.filter(palm.y, now) * window.innerHeight, now, !handRef.current);
          setHandIfChanged({ pinched: false });
          const ev = poses.step(now, shapeNow);
          showProgress(poses.holding?.progress ?? 0);
          tellPose(poses.holding?.pose ?? (shapeNow ? 'seen' : null), poses.holding?.progress ?? 0);
          if (ev) sendGesture(ev);
          return;
        }
        if (catcher) {
          // The ring sits on the palm; the hold fills it.
          const palm = cameraToScreen(lm[9].x, lm[9].y);
          feed(fx.filter(palm.x, now) * window.innerWidth, fy.filter(palm.y, now) * window.innerHeight, now, !handRef.current);
          const got = catcher.step(now, {
            t: now,
            extended: extendedFingers(lm),
            pinchRatio: calculatePinchRatio(lm),
            scale: handScale(raw),
            score: res.handedness?.[0]?.[0]?.score ?? 0,
            x: lm[9].x,
            y: lm[9].y,
          });
          setHandIfChanged(catcher.hint === 'TOO_FAR' || catcher.hint === 'LOOKING' ? null : { pinched: false });
          showProgress(catcher.progress);
          if (catcher.hint === 'TOO_FAR') {
            if (!farSince) farSince = now;
            if (now - farSince > 1200 && !hintShown) {
              hintShown = true;
              flash('Move your hand a little closer to the camera');
            }
          } else farSince = 0;
          if (got) {
            activity();
            setCaught(true);
            if (arm?.sounds) sound.pop();
            void invoke('lift_catch', { id: null }).catch(() => {
              setCaught(false);
              catcher.reset();
              flash('It isn’t in the air any more');
            });
          }
          return;
        }
        const mid = { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
        const target = cameraToScreen(mid.x, mid.y);
        const sx = fx.filter(target.x, now);
        const sy = fy.filter(target.y, now);
        // Velocity-based lead so the card sits under the fingers, not behind them.
        let px = sx;
        let py = sy;
        if (prev && now > prev.t) {
          const dt = (now - prev.t) / 1000;
          px = Math.min(1, Math.max(0, sx + ((sx - prev.x) / dt) * LEAD_S));
          py = Math.min(1, Math.max(0, sy + ((sy - prev.y) / dt) * LEAD_S));
        }
        prev = { x: sx, y: sy, t: now };
        const p = { x: px, y: py };
        if (busy) return;
        const ev = machine.step(now, {
          x: p.x,
          y: p.y,
          pinchRatio: calculatePinchRatio(lm),
          extended: extendedFingers(lm),
          scale: handScale(raw),
          score: res.handedness?.[0]?.[0]?.score ?? 0,
        });
        // Only gentle hints; ignored gestures never do anything.
        if (machine.ignored === 'far') {
          if (!farSince) farSince = now;
          if (now - farSince > 1200 && !hintShown) {
            hintShown = true;
            flash('Move your hand a little closer to the camera');
          }
        } else {
          farSince = 0;
        }
        const tracked = machine.ignored !== 'far' && machine.ignored !== 'unsure';
        if (tracked) {
          // First sighting: jump there instead of sliding in from the last spot.
          feed(p.x * window.innerWidth, p.y * window.innerHeight, now, !handRef.current);
        }
        setHandIfChanged(tracked ? { pinched: machine.holding || machine.state === 'PINCHING' } : null);
        // v2: carrying with several devices: point under a chip to aim at it.
        if (machine.holding && devicesRef.current.length > 1) {
          const rects = chipRects(devicesRef.current.length, window.innerWidth);
          const hxp = track.current.x;
          const hyp = track.current.y;
          const i = hyp < CHIP_Y + CHIP_H + 110 ? rects.findIndex((r) => hxp >= r.x - 20 && hxp <= r.x + r.w + 20) : -1;
          const cur = chipHoverRef.current;
          if (i < 0) {
            if (cur) {
              chipHoverRef.current = null;
              setChipHover(null);
            }
          } else if (!cur || cur.i !== i) {
            chipHoverRef.current = { i, since: now, picked: false };
            setChipHover({ i, picked: false });
          } else if (!cur.picked && now - cur.since >= DWELL_MS) {
            cur.picked = true;
            setChipHover({ i, picked: true });
            if (arm?.sounds) sound.pop();
          }
        } else if (chipHoverRef.current) {
          chipHoverRef.current = null;
          setChipHover(null);
        }
        // Holding something counts as activity, so the camera never switches off mid-move.
        if (machine.holding && now - lastActivity > 3000) {
          lastActivity = now;
          activity();
        }
        // v2 gestures only while nothing is pinched or carried, so they never fight the grab.
        if (!machine.holding && machine.state !== 'PINCHING' && !ev) {
          const g = poses.step(now, shapeNow);
          // While grabbing, only gestures that mean something on the Island (reply, dismiss,
          // take it) go through, silently; the Island shows the result.
          // (Fist was missing here, so "fist" actions in Gesture Studio never fired.)
          if (g) sendGesture(g, true);
        } else poses.reset();
        if (ev?.type === 'grab') void onGrab();
        else if (ev?.type === 'release') void onRelease();
        else if (ev?.type === 'cancel') onCancel();
      };
      schedule();
    }

    void start();
    return () => {
      stopped = true;
      cancelFrame();
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setHand(null);
    };
  }, [armed, arm?.cameraId, arm?.sensitivity, arm?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardTarget = { x: window.innerWidth / 2 - 60, y: 8 };

  return (
    <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
      <SendFx ev={fx} onDone={() => setFx(null)} />
      <EdgeGlow />

      {/* Never shown: the camera feeds MediaPipe directly. */}
      <video ref={videoRef} className="hidden" muted playsInline />


      {/* v2 · the area two "L" hands are framing; it fills up, then it's captured */}
      {frame && (
        <div
          className="absolute rounded-[14px] border-[3px] border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
          style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
        >
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-white text-[#1D1D1F] text-[12px] font-semibold whitespace-nowrap">
            📸 Hold still… {Math.round(frame.progress * 100)}%
          </div>
          <div className="absolute bottom-0 left-0 h-1 bg-[#30D158] rounded-full" style={{ width: `${frame.progress * 100}%` }} />
        </div>
      )}

      {/* v2 · device chips while carrying (several phones / tablets) */}
      <AnimatePresence>
        {card?.phase === 'held' && devices.length > 1 &&
          chipRects(devices.length, window.innerWidth).map((r, i) => {
            const hot = chipHover?.i === i;
            const picked = hot && chipHover?.picked;
            return (
              <motion.div
                key={devices[i].id}
                className={`absolute flex items-center gap-2.5 px-4 rounded-full text-[14px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.25)] ${
                  picked ? 'bg-[#FFC53D] text-[#15130F]' : hot ? 'bg-white text-[#1D1D1F] ring-2 ring-[#FFC53D]' : 'bg-white/90 text-[#1D1D1F]'
                }`}
                style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                initial={{ opacity: 0, y: -30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: hot ? 1.08 : 1 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28, delay: i * 0.04 }}
              >
                <Smartphone size={18} />
                <span className="truncate">{devices[i].name}</span>
              </motion.div>
            );
          })}
      </AnimatePresence>

      {/* v2 · what the phone lifted, floating in, waiting for an open hand */}
      <AnimatePresence>
        {lift && (catching || caught) && (
          <motion.div
            key={lift.id}
            className="absolute left-1/2 top-[18%]"
            initial={{ opacity: 0, y: 60, scale: 0.7, x: '-50%' }}
            animate={
              caught
                ? { opacity: 0, scale: 1.25, y: 30, x: '-50%', transition: { duration: 0.45, ease: [0.2, 0, 0, 1] } }
                : { opacity: 1, y: [0, -8, 0], scale: 1, x: '-50%', transition: { opacity: { duration: 0.3 }, scale: { type: 'spring', stiffness: 300, damping: 22 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } } }
            }
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            <ItemPreview
              size="big"
              p={lift.preview}
              title={lift.label}
              subtitle={`From ${lift.phoneName}${lift.fileCount ? ` · ${formatBytes(lift.totalBytes)}` : ''}`}
              hint={caught ? 'Caught!' : 'Open your hand at the camera to catch it'}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(catching || attention) && hand && catchProgress > 0 && (
        <motion.svg
          className="absolute left-0 top-0 pointer-events-none"
          width="64"
          height="64"
          viewBox="0 0 64 64"
          style={{ x: catchRingX, y: catchRingY }}
          aria-hidden="true"
        >
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="4" />
          <circle cx="32" cy="32" r="28" fill="none" stroke="#30D158" strokeWidth="4" strokeLinecap="round" strokeDasharray={2 * Math.PI * 28} strokeDashoffset={2 * Math.PI * 28 * (1 - catchProgress)} transform="rotate(-90 32 32)" />
        </motion.svg>
      )}

      {armed && hand && arm?.showRing && (
        <motion.div
          className="absolute left-0 top-0 w-11 h-11 rounded-full border-[3px]"
          style={{ x: ringX, y: ringY, willChange: 'transform' }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: 1,
            scale: hand.pinched ? 0.7 : 1,
            borderColor: hand.pinched ? '#FFC53D' : 'rgba(232,236,255,0.85)',
            backgroundColor: hand.pinched ? 'rgba(34,211,238,0.25)' : 'rgba(124,92,255,0.12)',
          }}
          transition={{ type: 'spring', stiffness: 700, damping: 34 }}
        />
      )}

      <AnimatePresence>
        {card && (
          <motion.div
            key="card"
            className="absolute left-0 top-0"
            // While held, the card rides the hand's motion values (no re-renders). When it flies to the
            // pill or drops, animate() takes over from where it is.
            style={card.phase === 'held' ? { x: cardX, y: cardY, rotate: tilt, willChange: 'transform' } : { willChange: 'transform' }}
            initial={{ scale: 0.55, opacity: 0 }}
            animate={
              card.phase === 'flying'
                ? {
                    // Keyframes start where the hand left the card, so it never jumps.
                    x: [cardX.get(), card.to?.x ?? cardTarget.x],
                    y: [cardY.get(), card.to?.y ?? cardTarget.y],
                    scale: 0.2,
                    rotate: 0,
                    opacity: 0,
                    transition: { duration: 0.6, ease: [0.32, 0, 0.12, 1] },
                  }
                : card.phase === 'dropped'
                  ? { x: cardX.get(), y: [cardY.get(), cardY.get() + 120], opacity: 0, rotate: 8, transition: { duration: 0.45, ease: [0.4, 0, 1, 1] } }
                  : { scale: 1, opacity: 1, rotate: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          >
            <ItemPreview
              p={card.items.preview ?? fallbackPreview(card.items)}
              title={card.items.label}
              subtitle={
                card.items.fileCount === 0
                  ? 'From your clipboard'
                  : `${card.items.fileCount} file${card.items.fileCount === 1 ? '' : 's'}${card.items.partial ? '+' : ''} · ${formatBytes(card.items.totalBytes)}`
              }
              hint="Open your hand to drop"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && armed && (
          <motion.div
            key={toast}
            className="absolute left-0 top-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0B1020]/90 text-[13px] text-[#E8ECFF] border border-white/10"
            style={{ x: toastX, y: toastY }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <Hand size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

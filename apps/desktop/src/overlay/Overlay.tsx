import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { File, Folder, Hand } from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
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
}

type Card = { items: Grabbed; phase: 'held' | 'flying' | 'dropped' };

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
        numHands: 1,
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
  const rawX = useMotionValue(W / 2);
  const rawY = useMotionValue(H / 2);
  // Near-instant spring: it only fills the gaps between camera frames (30-60 fps) on 60-144 Hz screens.
  // All real smoothing happens once, in the pointer filter below — no double smoothing, no trailing card.
  const springCfg = { stiffness: 2600, damping: 90, mass: 0.25 };
  const hx = useSpring(rawX, springCfg);
  const hy = useSpring(rawY, springCfg);
  const ringX = useTransform(hx, (v) => v - 22);
  const ringY = useTransform(hy, (v) => v - 22);
  const cardX = useTransform(hx, (v) => v + 18);
  const cardY = useTransform(hy, (v) => v + 18);
  const toastY = useTransform(hy, (v) => v - 8);
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
        if (h) {
          if (!handRef.current) {
            hx.jump(h.x * window.innerWidth);
            hy.jump(h.y * window.innerHeight);
          }
          rawX.set(h.x * window.innerWidth);
          rawY.set(h.y * window.innerHeight);
        }
        setHandIfChanged(h ? { pinched: h.pinched } : null);
      } else if (d.type === 'card') setCard(d.card as Card | null);
      else if (d.type === 'sendfx') setFx(d.fx as SendFxEvent);
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

  useEffect(() => {
    if (!armed || !arm || !inTauri) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelFrame = () => cancelAnimationFrame(raf);
    const machine = new GrabMachine(grabConfigFor(arm.sensitivity));
    // Pointer filter: steady when the hand is still, almost no lag when it moves fast (high beta).
    // Gesture classification uses the raw landmarks — its thresholds, dwell and hysteresis are the stabiliser.
    const POINTER = { minCutoff: 1.6, beta: 0.06, dCutoff: 1.0 };
    let fx = new OneEuroFilter(POINTER);
    let fy = new OneEuroFilter(POINTER);
    let prev: { x: number; y: number; t: number } | null = null;
    /** Lead the pointer by ~1 camera frame to cancel capture + inference delay. */
    const LEAD_S = 0.035;
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
        const raw = res.landmarks?.[0];
        if (!raw || raw.length < 21) {
          fx = new OneEuroFilter(POINTER);
          fy = new OneEuroFilter(POINTER);
          prev = null;
          setHandIfChanged(null);
          const ev = machine.step(now, null);
          if (ev?.type === 'cancel') onCancel();
          return;
        }
        const lm = raw;
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
          if (!handRef.current) {
            hx.jump(p.x * window.innerWidth);
            hy.jump(p.y * window.innerHeight);
          }
          rawX.set(p.x * window.innerWidth);
          rawY.set(p.y * window.innerHeight);
        }
        setHandIfChanged(tracked ? { pinched: machine.holding || machine.state === 'PINCHING' } : null);
        // Holding something counts as activity, so the camera never switches off mid-move.
        if (machine.holding && now - lastActivity > 3000) {
          lastActivity = now;
          activity();
        }
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
  }, [armed, arm?.cameraId, arm?.sensitivity]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardTarget = { x: W / 2 - 110, y: 8 };

  return (
    <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
      <SendFx ev={fx} onDone={() => setFx(null)} />

      {/* Never shown: the camera feeds MediaPipe directly. */}
      <video ref={videoRef} className="hidden" muted playsInline />


      {armed && hand && arm?.showRing && (
        <motion.div
          className="absolute left-0 top-0 w-11 h-11 rounded-full border-[3px]"
          style={{ x: ringX, y: ringY, willChange: 'transform' }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: 1,
            scale: hand.pinched ? 0.7 : 1,
            borderColor: hand.pinched ? '#22D3EE' : 'rgba(232,236,255,0.85)',
            backgroundColor: hand.pinched ? 'rgba(34,211,238,0.25)' : 'rgba(124,92,255,0.12)',
          }}
          transition={{ type: 'spring', stiffness: 700, damping: 34 }}
        />
      )}

      <AnimatePresence>
        {card && (
          <motion.div
            key="card"
            className="absolute left-0 top-0 flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#141B34]/95 border border-[#7C5CFF] shadow-[0_18px_50px_rgba(124,92,255,0.45)] text-[#E8ECFF]"
            // While held, the card rides the hand's motion values (no re-renders). When it flies to the
            // pill or drops, animate() takes over from where it is.
            style={card.phase === 'held' ? { x: cardX, y: cardY, willChange: 'transform' } : { willChange: 'transform' }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={
              card.phase === 'flying'
                ? {
                    // Keyframes start where the hand left the card, so it never jumps.
                    x: [cardX.get(), cardTarget.x],
                    y: [cardY.get(), cardTarget.y],
                    scale: 0.35,
                    opacity: 0,
                    transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] },
                  }
                : card.phase === 'dropped'
                  ? { x: cardX.get(), y: [cardY.get(), cardY.get() + 120], opacity: 0, rotate: 8, transition: { duration: 0.45, ease: [0.4, 0, 1, 1] } }
                  : { scale: 1, opacity: 1, rotate: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          >
            {card.items.isFolder ? <Folder size={28} className="text-[#FBBF24]" fill="#FBBF24" /> : <File size={28} className="text-[#22D3EE]" />}
            <div className="min-w-0">
              <div className="font-semibold text-[15px] max-w-[220px] truncate">{card.items.label}</div>
              <div className="text-[12px] text-[#8B94B8]">
                {card.items.fileCount === 0
                  ? 'From your clipboard'
                  : `${card.items.fileCount} file${card.items.fileCount === 1 ? '' : 's'}${card.items.partial ? '+' : ''} · ${formatBytes(card.items.totalBytes)}`}{' '}
                · open your hand to drop
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && armed && (
          <motion.div
            key={toast}
            className="absolute left-0 top-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0B1020]/90 text-[13px] text-[#E8ECFF] border border-white/10"
            style={{ x: cardX, y: toastY }}
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

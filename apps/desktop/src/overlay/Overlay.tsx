import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { File, Folder, Hand } from 'lucide-react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { GESTURE_CONFIG, GrabMachine, LandmarkSmoother, calculatePinchRatio, cameraToScreen, grabConfigFor } from '@pinchdrop/gesture-core';
import { formatBytes, inTauri, onEvent } from '../shared/api';
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
}

type Card = { items: Grabbed; phase: 'held' | 'flying' | 'dropped' };

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
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
  const [hand, setHand] = useState<{ x: number; y: number; pinched: boolean } | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cardRef = useRef<Card | null>(null);
  cardRef.current = card;

  useEffect(() => {
    if (!inTauri) return;
    void invoke<ArmState | null>('grab_arm_state').then((a) => a && setArm(a));
    const off = onEvent<ArmState>('grab-arm', setArm);
    return () => void off.then((u) => u());
  }, []);

  const armed = !!arm?.armed;

  useEffect(() => {
    if (!armed || !arm) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const machine = new GrabMachine(grabConfigFor(arm.sensitivity));
    const smoother = new LandmarkSmoother(GESTURE_CONFIG.ONE_EURO);
    let lastVideoTime = -1;
    let busy = false;

    const flash = (text: string) => {
      setToast(text);
      window.setTimeout(() => setToast((t) => (t === text ? null : t)), 1600);
    };

    async function onGrab() {
      busy = true;
      const items = await invoke<Grabbed | null>('grab_selection').catch(() => null);
      busy = false;
      if (!items) {
        machine.reset();
        flash('Select a file or folder first');
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
      await invoke('hold_start', { items: c.items }).catch(() => flash('Couldn’t hold that — try again'));
      window.setTimeout(() => setCard(null), 700);
    }

    function onCancel() {
      const c = cardRef.current;
      if (!c) return;
      setCard({ ...c, phase: 'dropped' });
      flash('Hand lost — nothing was grabbed');
      window.setTimeout(() => setCard(null), 500);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: arm?.cameraId ? { exact: arm.cameraId } : undefined,
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      } catch (e) {
        setCameraError(e instanceof Error && e.name === 'NotFoundError' ? 'No camera found' : 'Camera unavailable');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      setCameraError(null);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const landmarker = await loadLandmarker().catch(() => null);
      if (!landmarker) {
        setCameraError('Hand tracking failed to load');
        return;
      }

      const loop = () => {
        if (stopped) return;
        raf = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const res = landmarker.detectForVideo(video, now);
        const raw = res.landmarks?.[0];
        if (!raw || raw.length < 21) {
          smoother.reset();
          setHand(null);
          const ev = machine.step(now, null);
          if (ev?.type === 'cancel') onCancel();
          return;
        }
        const lm = smoother.smooth(raw, now);
        const ratio = calculatePinchRatio(lm);
        const mid = { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
        const p = cameraToScreen(mid.x, mid.y);
        if (busy) return;
        const ev = machine.step(now, { x: p.x, y: p.y, pinchRatio: ratio });
        setHand({ x: p.x, y: p.y, pinched: machine.holding || machine.state === 'PINCHING' });
        if (ev?.type === 'grab') void onGrab();
        else if (ev?.type === 'release') void onRelease();
        else if (ev?.type === 'cancel') onCancel();
      };
      raf = requestAnimationFrame(loop);
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setHand(null);
    };
  }, [armed, arm?.cameraId, arm?.sensitivity]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const H = typeof window !== 'undefined' ? window.innerHeight : 1080;
  const hx = (hand?.x ?? 0.5) * W;
  const hy = (hand?.y ?? 0.5) * H;

  return (
    <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
      {/* Never shown: the camera feeds MediaPipe directly. */}
      <video ref={videoRef} className="hidden" muted playsInline />

      {armed && (
        <div className="absolute right-4 bottom-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0B1020]/85 text-[12px] text-[#E8ECFF] border border-white/10">
          <span className={`w-2 h-2 rounded-full ${cameraError ? 'bg-[#FBBF24]' : 'bg-[#34D399]'}`} />
          {cameraError ?? (arm?.label ? `Camera on · pinch to grab “${arm.label}”` : 'Camera on · pinch to grab')}
        </div>
      )}

      {armed && hand && arm?.showRing && (
        <motion.div
          className="absolute rounded-full border-[3px]"
          style={{ left: 0, top: 0 }}
          animate={{
            x: hx - 22,
            y: hy - 22,
            width: 44,
            height: 44,
            scale: hand.pinched ? 0.7 : 1,
            borderColor: hand.pinched ? '#22D3EE' : 'rgba(232,236,255,0.85)',
            backgroundColor: hand.pinched ? 'rgba(34,211,238,0.25)' : 'rgba(124,92,255,0.12)',
          }}
          transition={{ type: 'spring', stiffness: 900, damping: 50, mass: 0.4 }}
        />
      )}

      <AnimatePresence>
        {card && (
          <motion.div
            key="card"
            className="absolute flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#141B34]/95 border border-[#7C5CFF] shadow-[0_18px_50px_rgba(124,92,255,0.45)] text-[#E8ECFF]"
            style={{ left: 0, top: 0 }}
            initial={{ x: hx + 18, y: hy + 18, scale: 0.6, opacity: 0 }}
            animate={
              card.phase === 'flying'
                ? { x: W / 2 - 110, y: 8, scale: 0.35, opacity: 0, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }
                : card.phase === 'dropped'
                  ? { y: hy + 120, opacity: 0, rotate: 8, transition: { duration: 0.45 } }
                  : { x: hx + 18, y: hy + 18, scale: 1, opacity: 1, rotate: 0 }
            }
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          >
            {card.items.isFolder ? <Folder size={28} className="text-[#FBBF24]" fill="#FBBF24" /> : <File size={28} className="text-[#22D3EE]" />}
            <div className="min-w-0">
              <div className="font-semibold text-[15px] max-w-[220px] truncate">{card.items.label}</div>
              <div className="text-[12px] text-[#8B94B8]">
                {card.items.fileCount} file{card.items.fileCount === 1 ? '' : 's'}
                {card.items.partial ? '+' : ''} · {formatBytes(card.items.totalBytes)} · open your hand to drop
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && armed && (
          <motion.div
            key={toast}
            className="absolute flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0B1020]/90 text-[13px] text-[#E8ECFF] border border-white/10"
            style={{ left: 0, top: 0 }}
            initial={{ x: hx + 24, y: hy - 8, opacity: 0 }}
            animate={{ x: hx + 24, y: hy - 8, opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Hand size={14} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

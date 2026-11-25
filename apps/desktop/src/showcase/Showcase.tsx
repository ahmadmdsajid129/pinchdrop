import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Folder, FileText, Image as ImageIcon, RotateCcw } from 'lucide-react';

/**
 * Design preview (dev only — not part of the app build). Plays the real pill/Island and hand
 * overlay components through one full PC → phone send on a pretend Windows desktop, by sending
 * them the same state the Rust side would. No camera, no files, no network.
 */

const MB = 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function send(frame: HTMLIFrameElement | null, detail: Record<string, unknown>) {
  frame?.contentWindow?.dispatchEvent(new CustomEvent('pd-demo', { detail }));
}

const FILES = [
  { name: 'CPP', kind: 'folder' },
  { name: 'Projects', kind: 'folder' },
  { name: 'Lectures', kind: 'folder' },
  { name: 'trip.jpg', kind: 'image' },
  { name: 'notes.txt', kind: 'file' },
  { name: 'Resume.pdf', kind: 'file' },
] as const;

export function Showcase() {
  const pill = useRef<HTMLIFrameElement>(null);
  const overlay = useRef<HTMLIFrameElement>(null);
  const cppRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState({ x: 0.82, y: 0.82, down: false, show: true });
  const [run, setRun] = useState(0);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    // The pill reads the browser-preview settings: show the clearly marked demo phone.
    localStorage.setItem('pd-mock-settings', JSON.stringify({ onboarded: true, demoPhone: true, theme: 'dark' }));
  }, []);

  useEffect(() => {
    if (ready < 2) return;
    let cancelled = false;
    const P = () => pill.current;
    const O = () => overlay.current;
    const say = (n: number, text: string) => !cancelled && (setStep(n), setCaption(text));
    const center = () => {
      const r = cppRef.current!.getBoundingClientRect();
      return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
    };

    /** Moves the simulated hand along a straight line, ~60 fps. */
    async function moveHand(from: { x: number; y: number }, to: { x: number; y: number }, ms: number, pinched: boolean) {
      const steps = Math.round(ms / 16);
      for (let i = 1; i <= steps && !cancelled; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out
        // A little natural wobble.
        const wob = Math.sin(i / 6) * 0.004;
        send(O(), { type: 'hand', hand: { x: from.x + (to.x - from.x) * e + wob, y: from.y + (to.y - from.y) * e, pinched } });
        await sleep(16);
      }
    }

    (async () => {
      // ---- reset
      send(P(), { type: 'collapse' });
      send(P(), { type: 'hold', hold: null });
      send(P(), { type: 'transfer', transfer: null });
      send(P(), { type: 'session', session: null });
      send(O(), { type: 'arm', arm: { armed: false, label: null, cameraId: null, sensitivity: 55, showRing: true, sounds: false } });
      send(O(), { type: 'hand', hand: null });
      send(O(), { type: 'card', card: null });
      setSelected(null);
      setCursor({ x: 0.82, y: 0.82, down: false, show: true });
      say(1, 'PinchDrop sits at the top of your screen. The camera is off.');
      await sleep(2200);

      // ---- 1. click the pill
      setCursor({ x: 0.5, y: 0.035, down: false, show: true });
      await sleep(900);
      setCursor((c) => ({ ...c, down: true }));
      await sleep(120);
      setCursor((c) => ({ ...c, down: false }));
      send(P(), { type: 'expand' });
      send(P(), { type: 'session', session: { active: true, endsInMs: 30000, idleSecs: 30, reason: null } });
      send(O(), { type: 'arm', arm: { armed: true, label: null, cameraId: null, sensitivity: 55, showRing: true, sounds: false } });
      say(2, 'Click the pill: the Island opens and the camera turns on — it switches off again after 30 s of nothing happening.');
      await sleep(2600);
      if (cancelled) return;

      // ---- 2. select CPP
      const cpp = center();
      setCursor({ x: cpp.x, y: cpp.y, down: false, show: true });
      await sleep(900);
      setCursor((c) => ({ ...c, down: true }));
      setSelected('CPP');
      await sleep(120);
      setCursor((c) => ({ ...c, down: false }));
      send(O(), { type: 'arm', arm: { armed: true, label: 'CPP', cameraId: null, sensitivity: 55, showRing: true, sounds: false } });
      send(P(), { type: 'session', session: { active: true, endsInMs: 30000, idleSecs: 30, reason: null } });
      say(3, 'Select the folder you want to send.');
      await sleep(1400);
      setCursor((c) => ({ ...c, show: false }));

      // ---- 3. hand appears and pinches over the folder
      say(4, 'Raise your hand to the webcam — the ring follows it. Pinch to grab.');
      const start = { x: 0.78, y: 0.86 };
      await moveHand(start, { x: cpp.x + 0.02, y: cpp.y + 0.03 }, 1400, false);
      await sleep(350);
      send(O(), { type: 'hand', hand: { x: cpp.x + 0.02, y: cpp.y + 0.03, pinched: true } });
      await sleep(250);
      send(O(), {
        type: 'card',
        card: { phase: 'held', items: { paths: [], label: 'CPP', fileCount: 12, totalBytes: 48 * MB, isFolder: true, partial: false } },
      });
      say(5, 'Grabbed. The card follows your hand.');
      await moveHand({ x: cpp.x + 0.02, y: cpp.y + 0.03 }, { x: 0.52, y: 0.24 }, 1600, true);
      if (cancelled) return;

      // ---- 4. open the hand: it's in the air
      send(O(), { type: 'hand', hand: { x: 0.52, y: 0.24, pinched: false } });
      await sleep(180);
      send(O(), {
        type: 'card',
        card: { phase: 'flying', items: { paths: [], label: 'CPP', fileCount: 12, totalBytes: 48 * MB, isFolder: true, partial: false } },
      });
      await sleep(250);
      send(O(), { type: 'hand', hand: null });
      send(O(), { type: 'arm', arm: { armed: false, label: null, cameraId: null, sensitivity: 55, showRing: true, sounds: false } });
      send(P(), { type: 'session', session: { active: false, endsInMs: 0, idleSecs: 30, reason: 'holding' } });
      send(P(), {
        type: 'hold',
        hold: { id: 'demo', label: 'CPP', fileCount: 12, totalBytes: 48 * MB, isFolder: true, expiresInMs: 30000, totalMs: 30000, phoneName: 'Demo phone' },
      });
      await sleep(500);
      send(O(), { type: 'card', card: null });
      say(6, 'Open your hand: CPP is “in the air”. The camera turns off and your phone shows its Catch screen.');
      await sleep(4200);
      if (cancelled) return;

      // ---- 5. caught on the phone → sending
      send(P(), { type: 'hold', hold: null });
      const base = {
        id: 't1', deviceName: 'Demo phone', label: 'CPP', createdAt: Date.now() / 1000, finishedAt: null, error: null,
        mode: 'copy' as const, fileCount: 12, textCount: 0, totalBytes: 48 * MB, moved: false, firstName: 'main.cpp',
      };
      say(7, 'Open your hand over the phone — caught! The Island shows the send live.');
      const total = 48 * MB;
      for (let i = 0; i <= 40 && !cancelled; i++) {
        const k = i / 40;
        send(P(), {
          type: 'transfer',
          transfer: { ...base, state: 'sending', bytesDone: Math.round(total * k), filesDone: Math.min(12, Math.floor(12 * k)) },
        });
        await sleep(110);
      }
      send(P(), { type: 'transfer', transfer: { ...base, state: 'done', bytesDone: total, filesDone: 12, finishedAt: Date.now() / 1000 } });
      say(8, 'Delivered. The Island folds back into the pill a moment later.');
      await sleep(3200);
      send(P(), { type: 'transfer', transfer: null });
      send(P(), { type: 'collapse' });
      setSelected(null);
      say(9, 'Done — CPP is in Downloads/PinchDrop on the phone.');
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, run]);

  return (
    <div className="fixed inset-0 overflow-hidden select-none" style={{ background: 'radial-gradient(1200px 700px at 20% 10%, #2a2f6b 0%, #141836 45%, #0b0e20 100%)' }}>
      {/* Pretend File Explorer window */}
      <div className="absolute left-[8%] top-[22%] w-[46%] min-w-[520px] rounded-xl bg-[#1f2333] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="h-9 px-4 flex items-center justify-between text-[12px] text-[#c9cde0] bg-[#262a3c]">
          <span>Desktop</span>
          <span className="flex gap-4 text-[#8b90a8]"><span>—</span><span>☐</span><span>✕</span></span>
        </div>
        <div className="p-5 grid grid-cols-6 gap-4">
          {FILES.map((f) => (
            <button
              key={f.name}
              ref={f.name === 'CPP' ? cppRef : undefined}
              type="button"
              className={`flex flex-col items-center gap-2 p-2 rounded-lg border transition-colors ${
                selected === f.name ? 'bg-[#3b5bdb]/35 border-[#5c7cfa]/70' : 'border-transparent'
              }`}
            >
              {f.kind === 'folder' ? (
                <Folder size={44} className="text-[#f6c344]" fill="#f6c344" />
              ) : f.kind === 'image' ? (
                <ImageIcon size={40} className="text-[#74c0fc]" />
              ) : (
                <FileText size={40} className="text-[#ced4da]" />
              )}
              <span className="text-[12px] text-[#e9ecf5]">{f.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Taskbar */}
      <div className="absolute bottom-0 inset-x-0 h-12 bg-[#11131f]/90 border-t border-white/5" />

      {/* The real pill / Island (pill.html) and hand overlay (overlay.html) */}
      <iframe
        ref={pill}
        src="/pill.html"
        title="Pill"
        onLoad={() => setReady((r) => r + 1)}
        className="absolute left-1/2 -translate-x-1/2 top-0 w-[460px] h-[300px] border-0 bg-transparent"
        allowTransparency
      />
      <iframe
        ref={overlay}
        src="/overlay.html"
        title="Hand overlay"
        onLoad={() => setReady((r) => r + 1)}
        className="absolute inset-0 w-full h-full border-0 bg-transparent pointer-events-none"
        allowTransparency
      />

      {/* Pretend mouse cursor */}
      {cursor.show && (
        <motion.svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          className="absolute left-0 top-0 pointer-events-none drop-shadow"
          animate={{ x: cursor.x * innerWidth, y: cursor.y * innerHeight, scale: cursor.down ? 0.85 : 1 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
        >
          <path d="M3 2l7 18 2.5-7.5L20 10z" fill="white" stroke="#111" strokeWidth="1.2" />
        </motion.svg>
      )}

      {/* Caption */}
      <div className="absolute left-6 bottom-16 max-w-[560px] flex items-start gap-3 px-4 py-3 rounded-2xl bg-[#0B1020]/90 border border-white/10 text-[#E8ECFF]">
        <span className="w-6 h-6 rounded-full bg-[#7C5CFF] text-white text-[12px] font-bold flex items-center justify-center shrink-0">{step}</span>
        <span className="text-[14px] leading-snug">{caption}</span>
      </div>
      <button
        type="button"
        onClick={() => setRun((r) => r + 1)}
        className="absolute right-6 bottom-16 h-10 px-4 rounded-xl bg-[#7C5CFF] text-white text-[13px] font-semibold flex items-center gap-2"
      >
        <RotateCcw size={15} /> Replay
      </button>
      <div className="absolute right-6 top-4 text-[11px] text-white/50">Design preview · real PinchDrop components · no camera, no files</div>
    </div>
  );
}

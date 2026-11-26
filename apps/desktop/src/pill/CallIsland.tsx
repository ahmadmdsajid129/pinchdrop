import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { BellOff, Hand, Phone, PhoneOff } from 'lucide-react';
import { api, inTauri, onEvent } from '../shared/api';
import type { PhoneLive } from '../shared/types';

/**
 * v2 · The phone is ringing: who's calling, and Answer / Reject / Silence. With the camera
 * listening: open palm = answer, swipe = reject, fist = silence. The call stays on the phone.
 */
export function CallIsland({ live, width, listening, showDevice = false }: { live: PhoneLive; width: number; listening: boolean; showDevice?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const who = live.callerName ?? live.callerNumber ?? 'Unknown caller';
  const initials = (live.callerName ?? '#')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  async function act(a: 'answer' | 'reject' | 'silence') {
    setBusy(a);
    setError(null);
    try {
      await api.callAction(a, live.deviceId);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      setError(
        /permission|allowed/i.test(msg)
          ? 'Your phone needs “Calls on your PC” turned on (PinchDrop app → Settings → Features).'
          : msg,
      );
    } finally {
      setBusy(null);
    }
  }
  const actRef = useRef(act);
  actRef.current = act;

  // v2: a gesture from the webcam (palm / swipe / fist), and which one is being held right now.
  const [held, setHeld] = useState<{ pose: string | null; progress: number }>({ pose: null, progress: 0 });
  useEffect(() => {
    const onGesture = (e: Event) => void actRef.current((e as CustomEvent<'answer' | 'reject' | 'silence'>).detail);
    window.addEventListener('pd-call-gesture', onGesture);
    const off = inTauri ? onEvent<{ pose: string | null; progress: number }>('call-pose', setHeld) : null;
    return () => {
      window.removeEventListener('pd-call-gesture', onGesture);
      void off?.then((u) => u());
    };
  }, []);

  return (
    <section aria-label={`Incoming call from ${who}`} style={{ width }} className="p-5 flex flex-col gap-4 text-text">
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 shrink-0">
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-success"
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
            />
          ))}
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[#a1a1aa] to-[#71717a] text-white font-semibold flex items-center justify-center">
            {initials || '#'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted uppercase tracking-wide font-semibold">
            {live.callApp ? `${live.callApp} call` : 'Incoming call'}
            {showDevice && live.deviceName ? ` · ${live.deviceName}` : ''}
          </div>
          <div className="font-display font-semibold text-[18px] truncate">{who}</div>
          {live.callerName && live.callerNumber && <div className="text-[12px] text-muted truncate">{live.callerNumber}</div>}
        </div>
      </div>
      {listening && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-3 gap-1.5" aria-label="Hand gestures">
            {(
              [
                { pose: 'open', emoji: '✋', label: 'Hold palm', does: 'Answer', color: '#34C759' },
                { pose: 'swipe', emoji: '👋', label: 'Swipe', does: 'Reject', color: '#FF3B30' },
                { pose: 'fist', emoji: '✊', label: 'Hold fist', does: 'Silence', color: '#A1A1AA' },
              ] as const
            ).map((g) => {
              const on = held.pose === g.pose;
              const p = on ? held.progress : 0;
              return (
                <div
                  key={g.pose}
                  className={`relative overflow-hidden rounded-xl px-2 py-1.5 text-center transition-colors ${on ? 'bg-white/[0.14]' : 'bg-white/[0.06]'}`}
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: `${p * 100}%`, background: `${g.color}55` }} />
                  <div className="relative text-[18px] leading-none">{g.emoji}</div>
                  <div className="relative text-[11px] font-semibold mt-1">{g.does}</div>
                  <div className="relative text-[10px] text-muted">{g.label}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-accent" aria-live="polite">
            <Hand size={12} aria-hidden="true" />
            {held.pose === null
              ? 'Raise your hand to the camera'
              : held.pose === 'open'
                ? 'Keep your palm still…'
                : held.pose === 'fist'
                  ? 'Keep your fist still…'
                  : 'I see your hand. Hold your palm still to answer'}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act('reject')}
          className="flex-1 h-10 rounded-full bg-[#FF3B30] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.97] transition"
        >
          <PhoneOff size={15} /> Reject
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act('silence')}
          className="h-10 px-4 rounded-full bg-white/[0.1] hover:bg-white/[0.16] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.97] transition"
          title="Stop the ringing (the call keeps ringing silently)"
        >
          <BellOff size={15} /> Silence
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void act('answer')}
          className="flex-1 h-10 rounded-full bg-[#34C759] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 active:scale-[0.97] transition"
        >
          <Phone size={15} /> Answer
        </button>
      </div>
      {error && (
        <div className="text-[12px] text-danger" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, File, Folder, Link2 } from 'lucide-react';
import { formatBytes } from '../shared/api';
import { ItemPreview } from '../shared/ItemPreview';
import type { ItemPreviewData } from '../shared/types';
import type { FxPack } from '../shared/pillThemes';
import { LandedPack, LaunchPack } from './PackFx';
import { ArrivePack, LandedPack2, LaunchPack2, isNewPack } from './PackFx2';
import { playPackSound } from '../shared/packSounds';

/** A send that just started (or a big one that just landed), shown full screen. Mirrors the pill's payload. */
export interface SendFxEvent {
  /** launch: leaving for the phone · landed: a big send finished · arrive (v2): caught from the phone. */
  kind: 'launch' | 'landed' | 'arrive';
  label: string;
  fileCount: number;
  totalBytes: number;
  isFolder: boolean;
  /** Where the Island is, in screen (CSS) pixels. */
  target: { x: number; y: number };
  reduced?: boolean;
  /** The item's real look (photo, folder, first lines…) when known. */
  preview?: ItemPreviewData | null;
  /** v2 Pro: the animation pack. */
  pack?: FxPack;
  /** v2: play the pack's sound too. */
  sounds?: boolean;
}

const PARTICLES = 14;

/**
 * The "lift off" moment: a frosted card rises in the middle of the screen, particles draw in,
 * then it streaks up into the Island. Big sends also get a "landed" burst at the Island.
 * GPU-only (transform/opacity); the window is click-through the whole time.
 */
export function SendFx({ ev, onDone }: { ev: SendFxEvent | null; onDone: () => void }) {
  const [phase, setPhase] = useState<'rise' | 'fly' | 'gone'>('rise');

  const pack = ev && !ev.reduced && ev.pack && ev.pack !== 'default' ? ev.pack : null;
  // The parent passes a new onDone on every render; the timers below must not restart because of it.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  /** Each event gets a fresh animation (no state carried over from the previous one). */
  const evId = useMemo(() => Math.random().toString(36).slice(2), [ev]);
  useEffect(() => {
    const onDone = () => doneRef.current();
    if (!ev) return;
    if (pack) {
      if (ev.sounds) playPackSound(pack, ev.kind);
      // Packs run on their own clock (≈1.6 s; an arrival holds the card a moment longer).
      const t = window.setTimeout(onDone, ev.kind === 'landed' ? 1300 : ev.kind === 'arrive' ? 1900 : 1650);
      return () => clearTimeout(t);
    }
    if (ev.kind === 'arrive') {
      onDone(); // the default arrival is the pill's own; nothing to draw here
      return;
    }
    if (ev.kind === 'landed') {
      const t = window.setTimeout(onDone, ev.reduced ? 400 : 1300);
      return () => clearTimeout(t);
    }
    setPhase('rise');
    const a = window.setTimeout(() => setPhase('fly'), ev.reduced ? 150 : 720);
    const b = window.setTimeout(() => {
      setPhase('gone');
      onDone();
    }, ev.reduced ? 500 : 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [ev, pack]);

  if (!ev) return null;
  if (pack) {
    if (ev.kind === 'arrive') return <ArrivePack key={evId} ev={ev} pack={pack} />;
    if (ev.kind === 'landed') return isNewPack(pack) ? <LandedPack2 key={evId} ev={ev} pack={pack} /> : <LandedPack key={evId} ev={ev} pack={pack} />;
    return isNewPack(pack) ? <LaunchPack2 key={evId} ev={ev} pack={pack} /> : <LaunchPack key={evId} ev={ev} pack={pack as 'plane' | 'portal' | 'comet'} />;
  }
  if (ev.kind === 'arrive') return null;
  const W = window.innerWidth;
  const H = window.innerHeight;
  // Target relative to this (full-monitor) window.
  const tx = ev.target.x - window.screenX;
  const ty = ev.target.y - window.screenY;
  const cx = W / 2;
  const cy = H * 0.46;
  const icon = ev.fileCount === 0 ? <Link2 size={30} /> : ev.isFolder || ev.fileCount > 1 ? <Folder size={30} fill="currentColor" /> : <File size={30} />;

  if (ev.kind === 'landed') {
    return (
      <div className="fixed inset-0 pointer-events-none">
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full border-2 border-[#30D158]"
            style={{ left: tx - 40, top: ty - 40, width: 80, height: 80 }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 3.2, opacity: 0 }}
            transition={{ duration: 1.1, delay: i * 0.18, ease: [0.2, 0, 0, 1] }}
          />
        ))}
        <motion.span
          className="absolute rounded-full bg-[#30D158] text-white flex items-center justify-center shadow-[0_10px_30px_rgba(48,209,88,0.45)]"
          style={{ left: tx - 22, top: ty - 22, width: 44, height: 44 }}
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.25, 1], opacity: [1, 1, 0] }}
          transition={{ duration: 1.2, times: [0, 0.3, 1], ease: 'easeOut' }}
        >
          <Check size={24} strokeWidth={3} />
        </motion.span>
      </div>
    );
  }

  const fly = phase === 'fly' || phase === 'gone';
  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* soft glow behind the card while it rises */}
      <motion.div
        className="absolute rounded-full"
        style={{ left: cx - 220, top: cy - 220, width: 440, height: 440, background: 'radial-gradient(circle, rgba(0,113,227,0.35), rgba(0,113,227,0) 65%)' }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={fly ? { opacity: 0, scale: 0.4 } : { opacity: 1, scale: 1 }}
        transition={{ duration: fly ? 0.35 : 0.5, ease: [0.2, 0, 0, 1] }}
      />
      {/* particles drawn in toward the card */}
      {!ev.reduced &&
        Array.from({ length: PARTICLES }, (_, i) => {
          const a = (i / PARTICLES) * Math.PI * 2;
          const r = 240 + (i % 3) * 40;
          return (
            <motion.span
              key={i}
              className="absolute w-2 h-2 rounded-full bg-[#0071E3]"
              style={{ left: cx - 4, top: cy - 4 }}
              initial={{ x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, scale: 1 }}
              animate={{ x: 0, y: 0, opacity: [0, 0.9, 0], scale: 0.3 }}
              transition={{ duration: 0.7, delay: (i % 5) * 0.03, ease: [0.4, 0, 0.2, 1] }}
            />
          );
        })}
      {/* light streak that follows the card up to the Island */}
      <AnimatePresence>
        {fly && !ev.reduced && (
          <motion.div
            key="streak"
            className="absolute origin-left h-[3px] rounded-full"
            style={{
              left: cx,
              top: cy,
              width: Math.hypot(tx - cx, ty - cy),
              rotate: `${(Math.atan2(ty - cy, tx - cx) * 180) / Math.PI}deg`,
              background: 'linear-gradient(90deg, rgba(0,113,227,0), rgba(0,113,227,0.9), rgba(255,255,255,0.95))',
              boxShadow: '0 0 18px rgba(0,113,227,0.8)',
            }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 0.75, times: [0, 0.6, 1], ease: [0.4, 0, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
      {/* the card: the item itself (photo, video frame, folder, text…) rising, then flying to the Island */}
      <motion.div
        className="absolute"
        style={{ left: cx, top: cy }}
        initial={{ opacity: 0, scale: 0.7, y: 40 }}
        animate={
          fly
            ? { opacity: [1, 1, 0], scale: 0.18, x: tx - cx, y: ty - cy, transition: { duration: 0.7, times: [0, 0.85, 1], ease: [0.5, 0, 0.2, 1] } }
            : { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 26 } }
        }
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          {ev.preview ? (
            <ItemPreview
              size="big"
              p={ev.preview}
              title={ev.label}
              subtitle={`${ev.fileCount > 0 ? `${ev.fileCount} file${ev.fileCount === 1 ? '' : 's'} · ${formatBytes(ev.totalBytes)}` : 'Text'} · sending…`}
            />
          ) : (
            <div className="flex items-center gap-4 pl-4 pr-6 py-4 w-[340px] rounded-[24px] bg-white/[0.96] text-[#1D1D1F] shadow-[0_30px_80px_rgba(0,0,0,0.28),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5">
              <div className="w-14 h-14 rounded-[18px] bg-gradient-to-br from-[#0A84FF] to-[#5E5CE6] text-white flex items-center justify-center shrink-0 shadow-[0_8px_20px_rgba(10,132,255,0.35)]">
                {icon}
              </div>
              <div className="min-w-0">
                <div className="text-[17px] font-semibold tracking-[-0.01em] truncate">{ev.label}</div>
                <div className="text-[13px] text-[#6E6E73]">
                  {ev.fileCount > 0 ? `${ev.fileCount} file${ev.fileCount === 1 ? '' : 's'} · ${formatBytes(ev.totalBytes)}` : 'Text'} · sending…
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, File, Folder, Link2 } from 'lucide-react';
import type { SendFxEvent } from './SendFx';

/*
 * v2 · Pro animation packs for sending (the phone plays the matching arrival).
 *   Paper Plane: the card folds into a paper plane that loops up to the pill, leaving a dashed trail.
 *   Portal:      a swirling portal opens at the pill; the card spirals into it and it closes.
 *   Comet:       the card shrinks to a glowing comet and streaks to the pill with a tail; it flashes on arrival.
 * Transform / opacity only. Total ≈ 1.6 s (the overlay is shown for 1.8 s).
 */

export const RISE_MS = 650;

export function ItemCard({ ev, note = 'sending…' }: { ev: SendFxEvent; note?: string }) {
  const icon = ev.fileCount === 0 ? <Link2 size={26} /> : ev.isFolder || ev.fileCount > 1 ? <Folder size={26} fill="currentColor" /> : <File size={26} />;
  return (
    <div className="flex items-center gap-3.5 pl-3.5 pr-5 py-3.5 w-[300px] rounded-[22px] bg-white/[0.96] text-[#1D1D1F] shadow-[0_30px_80px_rgba(0,0,0,0.28)] ring-1 ring-black/5">
      <div className="w-12 h-12 rounded-[16px] bg-gradient-to-br from-[#0A84FF] to-[#5E5CE6] text-white flex items-center justify-center shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[16px] font-semibold truncate">{ev.label}</div>
        <div className="text-[12.5px] text-[#6E6E73]">{note}</div>
      </div>
    </div>
  );
}

/** A paper plane, drawn (white sheet, blue fold). */
export function Plane({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M4 30 L60 6 L36 58 L28 36 Z" fill="#FFFFFF" stroke="#0A84FF" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 6 L28 36 L36 58" fill="#DCEBFF" stroke="#0A84FF" strokeWidth="2" strokeLinejoin="round" />
      <path d="M28 36 L22 50 L36 42" fill="#B9D6FF" stroke="#0A84FF" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function LaunchPack({ ev, pack }: { ev: SendFxEvent; pack: 'plane' | 'portal' | 'comet' }) {
  const [fly, setFly] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setFly(true), RISE_MS);
    return () => clearTimeout(t);
  }, []);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const tx = ev.target.x - window.screenX;
  const ty = ev.target.y - window.screenY;
  const cx = W / 2;
  const cy = H * 0.46;
  const dx = tx - cx;
  const dy = ty - cy;

  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* the card rises (same start for every pack), then hands over to the pack */}
      <motion.div
        className="absolute"
        // A zero-size anchor at the card's centre, so it spins and shrinks around its middle.
        style={{ left: cx, top: cy, width: 0, height: 0 }}
        initial={{ opacity: 0, scale: 0.7, y: 40 }}
        animate={
          fly
            ? pack === 'plane'
              ? { opacity: 0, scaleX: 0.2, scaleY: 0.6, rotate: -12, transition: { duration: 0.22, ease: 'easeIn' } }
              : pack === 'comet'
                ? { opacity: 0, scale: 0.15, transition: { duration: 0.25, ease: [0.5, 0, 0.75, 0] } }
                : { opacity: [1, 1, 0], scale: [1, 0.55, 0.05], rotate: [0, 240, 620], x: [0, dx * 0.55, dx], y: [0, (dy + 40) * 0.35, dy + 40], transition: { duration: 0.85, times: [0, 0.55, 1], ease: [0.45, 0, 0.3, 1] } }
            : { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 26 } }
        }
      >
        <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
          <ItemCard ev={ev} />
        </div>
      </motion.div>

      {pack === 'plane' && fly && <PlaneFlight cx={cx} cy={cy} dx={dx} dy={dy} />}
      {pack === 'portal' && <Portal x={tx} y={ty} open={true} />}
      {pack === 'comet' && fly && <CometFlight cx={cx} cy={cy} dx={dx} dy={dy} />}
    </div>
  );
}

function PlaneFlight({ cx, cy, dx, dy }: { cx: number; cy: number; dx: number; dy: number }) {
  // A loop up and to the side, then a glide into the pill.
  const xs = [0, -90, -40, dx * 0.45, dx];
  const ys = [0, -110, -200, dy * 0.6, dy];
  const path = `M ${cx} ${cy} C ${cx - 140} ${cy - 60}, ${cx - 80} ${cy - 260}, ${cx + dx * 0.45} ${cy + dy * 0.6} S ${cx + dx} ${cy + dy}, ${cx + dx} ${cy + dy}`;
  return (
    <>
      <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
        {/* the dashed trail is revealed by a mask that draws itself along the path */}
        <defs>
          <mask id="pd-plane-trail" maskUnits="userSpaceOnUse">
            <motion.path
              d={path}
              fill="none"
              stroke="#fff"
              strokeWidth="10"
              pathLength={1}
              strokeDasharray="1 1"
              initial={{ strokeDashoffset: 1 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 0.95, ease: [0.4, 0, 0.2, 1] }}
            />
          </mask>
        </defs>
        <motion.path
          d={path}
          fill="none"
          stroke="rgba(255,255,255,0.95)"
          strokeWidth="4"
          strokeDasharray="3 12"
          style={{ filter: 'drop-shadow(0 0 6px rgba(10,132,255,0.9))' }}
          strokeLinecap="round"
          mask="url(#pd-plane-trail)"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 1, 0] }}
          transition={{ duration: 1.1, times: [0, 0.75, 1] }}
        />
      </svg>
      <motion.div
        className="absolute"
        style={{ left: cx - 48, top: cy - 48 }}
        initial={{ x: 0, y: 0, scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ x: xs, y: ys, scale: [0.7, 1.25, 1.1, 0.85, 0.35], rotate: [-20, -150, -250, -330, -340], opacity: [1, 1, 1, 1, 0] }}
        transition={{ duration: 0.95, times: [0, 0.25, 0.45, 0.75, 1], ease: 'easeInOut' }}
      >
        <div className="drop-shadow-[0_8px_16px_rgba(10,132,255,0.35)]">
          <Plane size={96} />
        </div>
      </motion.div>
    </>
  );
}

/** A swirling ring: opens, spins, closes. */
export function Portal({ x, y, open }: { x: number; y: number; open: boolean }) {
  const size = 150;
  return (
    <motion.div
      className="absolute"
      style={{ left: x - size / 2, top: y - size / 2 + 40, width: size, height: size }}
      initial={{ scale: 0, opacity: 0 }}
      animate={open ? { scale: [0, 1.08, 1, 1, 0], opacity: [0, 1, 1, 1, 0] } : { scale: 0 }}
      transition={{ duration: 1.55, times: [0, 0.3, 0.4, 0.85, 1], ease: 'easeOut' }}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, #22D3EE, #8B5CF6, #EC4899, #22D3EE, #8B5CF6, #EC4899, #22D3EE)',
          WebkitMask: 'radial-gradient(circle, transparent 38%, #000 40%, #000 62%, transparent 64%)',
          mask: 'radial-gradient(circle, transparent 38%, #000 40%, #000 62%, transparent 64%)',
          filter: 'blur(1px)',
        }}
        animate={{ rotate: 720 }}
        transition={{ duration: 1.55, ease: 'linear' }}
      />
      <motion.div
        className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle,#1E1B4B_0%,#4C1D95_55%,transparent_72%)]"
        animate={{ rotate: -540, scale: [1, 0.9, 1.05] }}
        transition={{ duration: 1.55, ease: 'linear' }}
      />
      <div className="absolute inset-0 rounded-full shadow-[0_0_40px_rgba(139,92,246,0.7),0_0_80px_rgba(34,211,238,0.35)]" />
    </motion.div>
  );
}

function CometFlight({ cx, cy, dx, dy }: { cx: number; cy: number; dx: number; dy: number }) {
  const len = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <>
      {/* sparks shed along the way */}
      {Array.from({ length: 10 }, (_, i) => {
        const f = (i + 1) / 11;
        return (
          <motion.span
            key={i}
            className="absolute w-2 h-2 rounded-full bg-[#FFD27A] shadow-[0_0_8px_2px_rgba(255,200,90,0.8)]"
            style={{ left: cx + dx * f, top: cy + dy * f }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], x: (i % 2 ? 1 : -1) * 14, y: 18 }}
            transition={{ duration: 0.6, delay: 0.05 + f * 0.45, ease: 'easeOut' }}
          />
        );
      })}
      {/* the head, with its tail attached behind it (pointing back the way it came) */}
      <motion.div
        className="absolute"
        style={{ left: cx, top: cy, width: 0, height: 0 }}
        initial={{ x: 0, y: 0, opacity: 1 }}
        animate={{ x: dx, y: dy, opacity: [1, 1, 0] }}
        transition={{ duration: 0.6, ease: [0.6, 0, 0.3, 1], opacity: { duration: 0.7, times: [0, 0.85, 1] } }}
      >
        <motion.div
          className="absolute left-0 top-0 origin-left h-[16px] -mt-[8px] rounded-full"
          style={{
            width: Math.min(320, len * 0.7),
            rotate: `${angle + 180}deg`,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.95), rgba(255,170,60,0.6) 35%, rgba(255,200,87,0))',
            filter: 'blur(2px)',
          }}
          initial={{ scaleX: 0.1 }}
          animate={{ scaleX: [0.1, 1, 1] }}
          transition={{ duration: 0.6, times: [0, 0.5, 1], ease: 'easeOut' }}
        />
        <motion.div
          className="absolute w-10 h-10 -ml-5 -mt-5 rounded-full bg-white shadow-[0_0_30px_12px_rgba(255,190,80,0.9),0_0_80px_28px_rgba(255,140,40,0.5)]"
          initial={{ scale: 0.4 }}
          animate={{ scale: [0.4, 1, 0.8] }}
          transition={{ duration: 0.6 }}
        />
      </motion.div>
      {/* impact flash at the pill */}
      <motion.span
        className="absolute rounded-full border-2 border-[#FFC857]"
        style={{ left: cx + dx - 30, top: cy + dy - 30, width: 60, height: 60 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 2.6], opacity: [0.9, 0] }}
        transition={{ duration: 0.6, delay: 0.58, ease: 'easeOut' }}
      />
    </>
  );
}

/** A big send landed: the pack's own "done" at the pill. */
export function LandedPack({ ev, pack }: { ev: SendFxEvent; pack: 'plane' | 'portal' | 'comet' }) {
  const tx = ev.target.x - window.screenX;
  const ty = ev.target.y - window.screenY;
  const color = pack === 'plane' ? '#0A84FF' : pack === 'portal' ? '#8B5CF6' : '#FFB020';
  return (
    <div className="fixed inset-0 pointer-events-none">
      {pack === 'portal' && <Portal x={tx} y={ty - 40} open={true} />}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border-2"
          style={{ left: tx - 40, top: ty - 40, width: 80, height: 80, borderColor: color }}
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 1.1, delay: i * 0.15, ease: [0.2, 0, 0, 1] }}
        />
      ))}
      <motion.span
        className="absolute rounded-full text-white flex items-center justify-center"
        style={{ left: tx - 24, top: ty - 24, width: 48, height: 48, background: color, boxShadow: `0 10px 30px ${color}88` }}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.25, 1], opacity: [1, 1, 0] }}
        transition={{ duration: 1.2, times: [0, 0.3, 1], ease: 'easeOut' }}
      >
        {pack === 'plane' ? (
          <span className="scale-[0.45]">
            <Plane />
          </span>
        ) : (
          <Check size={26} strokeWidth={3} />
        )}
      </motion.span>
    </div>
  );
}

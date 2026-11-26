import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { FxPack } from '../shared/pillThemes';
import type { SendFxEvent } from './SendFx';
import { ItemCard, Plane, Portal, RISE_MS } from './PackFx';

/*
 * v2 · More Pro animation packs, and every pack's "arrive" (something caught from the phone lands
 * in the middle of the screen).
 *   Black Hole: the card is sucked into a black hole that zips up to the pill.
 *   Origami:    the card folds into a paper crane that flaps up to the pill.
 *   Pixel Beam: the card breaks into pixels that stream up to the pill.
 *   Ink Drop:   the card condenses into an ink drop that rises and blooms at the pill.
 *   Liquid:     the card melts into a blob that flows up to the pill and splashes.
 */

export const NEW_PACKS = ['blackhole', 'origami', 'pixel', 'ink', 'liquid'] as const;
export type NewPack = (typeof NEW_PACKS)[number];
export const isNewPack = (p: string): p is NewPack => (NEW_PACKS as readonly string[]).includes(p);

function stage(ev: SendFxEvent) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const tx = ev.target.x - window.screenX;
  const ty = ev.target.y - window.screenY;
  const cx = W / 2;
  const cy = H * 0.46;
  return { W, H, tx, ty, cx, cy, dx: tx - cx, dy: ty - cy };
}

function useAfter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

/** A zero-size anchor at (x, y): children are centred on it and spin / scale around it. */
function At({ x, y, children, ...motionProps }: { x: number; y: number; children: ReactNode } & React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div className="absolute" style={{ left: x, top: y, width: 0, height: 0 }} {...motionProps}>
      <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">{children}</div>
    </motion.div>
  );
}

/** A paper crane: two wings that flap, a body, a head. */
function Crane({ size = 90 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ overflow: 'visible' }}>
      <motion.path d="M50 55 L18 18 L44 52 Z" fill="#FDA4AF" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" style={{ originX: '50px', originY: '55px' }} animate={{ scaleY: [1, -0.6, 1] }} transition={{ duration: 0.32, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.path d="M50 55 L86 22 L56 52 Z" fill="#FB7185" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" style={{ originX: '50px', originY: '55px' }} animate={{ scaleY: [1, -0.6, 1] }} transition={{ duration: 0.32, repeat: Infinity, ease: 'easeInOut' }} />
      <path d="M24 60 L50 55 L76 60 L50 70 Z" fill="#FFE4E6" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M76 60 L92 44 L88 58 Z" fill="#FFE4E6" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M24 60 L10 52 L20 64 Z" fill="#FFE4E6" stroke="#E11D48" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function BlackHoleDisc({ size }: { size: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-[-30%] rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, rgba(249,115,22,0.95), rgba(168,85,247,0.85), rgba(249,115,22,0.2), rgba(250,204,21,0.9), rgba(249,115,22,0.95))',
          WebkitMask: 'radial-gradient(circle, transparent 44%, #000 50%, transparent 72%)',
          mask: 'radial-gradient(circle, transparent 44%, #000 50%, transparent 72%)',
          filter: 'blur(3px)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 rounded-full bg-black shadow-[0_0_30px_10px_rgba(0,0,0,0.6),inset_0_0_12px_rgba(249,115,22,0.6)]" />
    </div>
  );
}

const PIX_COLS = 12;
const PIX_ROWS = 4;
const PIX_COLORS = ['#0A84FF', '#5E5CE6', '#FFFFFF', '#64D2FF', '#BF5AF2'];

// ---------------------------------------------------------------- send (to the pill)

export function LaunchPack2({ ev, pack }: { ev: SendFxEvent; pack: NewPack }) {
  const fly = useAfter(RISE_MS);
  const { cx, cy, tx, ty, dx, dy } = stage(ev);
  const card = (exit: React.ComponentProps<typeof motion.div>['animate']) => (
    <At x={cx} y={cy} initial={{ opacity: 0, scale: 0.7, y: 40 }} animate={fly ? exit : { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 26 } }}>
      <ItemCard ev={ev} />
    </At>
  );
  return (
    <div className="fixed inset-0 pointer-events-none">
      {pack === 'blackhole' && (
        <>
          {fly && (
            <At
              x={cx}
              y={cy}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{ scale: [0, 1, 1, 0.12], x: [0, 0, 0, dx], y: [0, 0, 0, dy], opacity: [1, 1, 1, 0] }}
              transition={{ duration: 1.0, times: [0, 0.2, 0.62, 1], ease: 'easeInOut' }}
            >
              <BlackHoleDisc size={130} />
            </At>
          )}
          {card({ scale: [1, 0.55, 0], rotate: [0, 200, 620], skewX: [0, 18, 0], opacity: [1, 1, 0], transition: { duration: 0.6, ease: [0.55, 0, 0.75, 0.3], delay: 0.08 } })}
        </>
      )}

      {pack === 'origami' && (
        <>
          {card({ scaleX: [1, 0.5, 0.02], scaleY: [1, 1, 0.5], rotate: [0, -6, -18], opacity: [1, 1, 0], transition: { duration: 0.32, ease: 'easeIn' } })}
          {fly && (
            <At
              x={cx}
              y={cy}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.15, 1, 0.45], opacity: [0, 1, 1, 0], x: [0, dx * 0.2, dx * 0.6, dx], y: [0, -60, dy * 0.6 - 30, dy] }}
              transition={{ duration: 1.0, times: [0, 0.22, 0.65, 1], ease: 'easeInOut', delay: 0.18 }}
            >
              <Crane size={110} />
            </At>
          )}
        </>
      )}

      {pack === 'pixel' && (
        <>
          {card({ opacity: 0, transition: { duration: 0.12 } })}
          {fly &&
            Array.from({ length: PIX_COLS * PIX_ROWS }, (_, i) => {
              const col = i % PIX_COLS;
              const row = Math.floor(i / PIX_COLS);
              const x = cx - 150 + col * 25 + 12;
              const y = cy - 40 + row * 20 + 10;
              const delay = (PIX_COLS - col) * 0.022 + row * 0.03 + ((i * 37) % 7) * 0.01;
              return (
                <motion.span
                  key={i}
                  className="absolute w-[14px] h-[14px] rounded-[3px]"
                  style={{ left: x - 7, top: y - 7, background: PIX_COLORS[(i * 7) % PIX_COLORS.length], boxShadow: '0 0 8px rgba(10,132,255,0.6)' }}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{ x: tx - x, y: ty - y, opacity: [1, 1, 0], scale: [1, 0.8, 0.25] }}
                  transition={{ duration: 0.6, delay, ease: [0.5, 0, 0.25, 1] }}
                />
              );
            })}
        </>
      )}

      {pack === 'ink' && (
        <>
          {card({ scale: [1, 0.3, 0], opacity: [1, 1, 0], transition: { duration: 0.3, ease: 'easeIn' } })}
          {fly && (
            <At x={cx} y={cy} initial={{ scale: 0, x: 0, y: 0 }} animate={{ scale: [0, 1.1, 1, 0.8], x: [0, 0, dx * 0.5, dx], y: [0, 10, dy * 0.5, dy], scaleY: [1, 1, 1.35, 1] }} transition={{ duration: 0.85, times: [0, 0.3, 0.65, 1], ease: 'easeInOut', delay: 0.2 }}>
              <div className="w-10 h-14 bg-[radial-gradient(circle_at_35%_30%,#60A5FA,#1E3A8A_55%,#0B1437)] shadow-[0_8px_20px_rgba(30,58,138,0.55)]" style={{ borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%' }} />
            </At>
          )}
          {fly &&
            [0, 1, 2, 3].map((i) => (
              <motion.span
                key={i}
                className="absolute rounded-full"
                style={{ left: tx - 30, top: ty - 30, width: 60, height: 60, background: i % 2 ? 'rgba(30,58,138,0.55)' : 'rgba(59,130,246,0.45)', filter: 'blur(6px)' }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 2.2 + i * 0.5], opacity: [0.9, 0], x: (i - 1.5) * 12, y: (i % 2) * 10 }}
                transition={{ duration: 0.7, delay: 1.0 + i * 0.05, ease: 'easeOut' }}
              />
            ))}
        </>
      )}

      {pack === 'liquid' && (
        <>
          {card({ scaleY: [1, 0.25], scaleX: [1, 1.25], y: [0, 28], opacity: [1, 0], transition: { duration: 0.35, ease: 'easeIn' } })}
          {fly && (
            <motion.div
              className="absolute origin-left h-[14px] rounded-full"
              style={{ left: cx, top: cy - 7 + 28, width: Math.hypot(dx, dy - 28), rotate: `${(Math.atan2(dy - 28, dx) * 180) / Math.PI}deg`, background: 'linear-gradient(90deg, rgba(6,182,212,0), rgba(34,211,238,0.85), rgba(10,132,255,0.95))' }}
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
              transition={{ duration: 0.8, times: [0, 0.6, 1], ease: [0.5, 0, 0.3, 1], delay: 0.2 }}
            />
          )}
          {fly && (
            <At x={cx} y={cy + 28} initial={{ x: 0, y: 0, scale: 0 }} animate={{ x: dx, y: dy - 28, scale: [0, 1, 1, 0.6], scaleX: [1, 1.3, 0.8, 1.1], scaleY: [1, 0.8, 1.25, 0.9] }} transition={{ duration: 0.65, ease: [0.5, 0, 0.3, 1], delay: 0.2 }}>
              <div className="w-11 h-11 rounded-full bg-[radial-gradient(circle_at_35%_30%,#A5F3FC,#22D3EE_45%,#0A84FF)] shadow-[0_0_20px_rgba(34,211,238,0.7)]" />
            </At>
          )}
          {fly &&
            Array.from({ length: 7 }, (_, i) => {
              const a = -Math.PI + (i / 6) * Math.PI;
              return (
                <motion.span
                  key={i}
                  className="absolute w-2.5 h-2.5 rounded-full bg-[#22D3EE]"
                  style={{ left: tx - 5, top: ty - 5 }}
                  initial={{ opacity: 0, x: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], x: Math.cos(a) * 46, y: [0, Math.sin(a) * 40, Math.sin(a) * 40 + 30] }}
                  transition={{ duration: 0.55, delay: 0.85, ease: 'easeOut' }}
                />
              );
            })}
        </>
      )}
    </div>
  );
}

const LANDED_COLOR: Record<NewPack, string> = { blackhole: '#F97316', origami: '#E11D48', pixel: '#22C55E', ink: '#1E3A8A', liquid: '#06B6D4' };

export function LandedPack2({ ev, pack }: { ev: SendFxEvent; pack: NewPack }) {
  const { tx, ty } = stage(ev);
  const color = LANDED_COLOR[pack];
  return (
    <div className="fixed inset-0 pointer-events-none">
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
        className="absolute rounded-full flex items-center justify-center text-white text-[22px] font-bold"
        style={{ left: tx - 24, top: ty - 24, width: 48, height: 48, background: color, boxShadow: `0 10px 30px ${color}88` }}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.25, 1], opacity: [1, 1, 0] }}
        transition={{ duration: 1.2, times: [0, 0.3, 1], ease: 'easeOut' }}
      >
        ✓
      </motion.span>
    </div>
  );
}

// ---------------------------------------------------------------- arrive (from the phone, every pack)

/** Something caught from the phone lands in the middle of the screen, in the pack's style. */
export function ArrivePack({ ev, pack }: { ev: SendFxEvent; pack: Exclude<FxPack, 'default'> }) {
  const { cx, cy, W } = stage(ev);
  const from = { x: cx + W * 0.18, y: -80 };
  const REVEAL = 0.75; // when the card appears (s)
  const pop = { scale: [0, 1.12, 1], opacity: [0, 1, 1], transition: { duration: 0.45, delay: REVEAL, ease: 'easeOut' } };
  const leave = { opacity: 0, scale: 0.92, transition: { duration: 0.25, delay: 1.55 } };
  const note = 'from your phone';
  return (
    <div className="fixed inset-0 pointer-events-none">
      {pack === 'plane' && (
        <At x={from.x} y={from.y} initial={{ x: 0, y: 0, rotate: 140, opacity: 1 }} animate={{ x: [0, -W * 0.3, cx - from.x], y: [0, (cy - from.y) * 0.4, cy - from.y], rotate: [140, 200, 160], opacity: [1, 1, 0], scale: [0.6, 1.1, 0.8] }} transition={{ duration: 0.85, times: [0, 0.55, 1], ease: 'easeInOut' }}>
          <Plane size={96} />
        </At>
      )}
      {pack === 'portal' && <Portal x={cx} y={cy - 120} open={true} />}
      {pack === 'comet' && (
        <At x={from.x} y={from.y} initial={{ x: 0, y: 0 }} animate={{ x: cx - from.x, y: cy - from.y, opacity: [1, 1, 0] }} transition={{ duration: 0.6, ease: [0.6, 0, 0.3, 1] }}>
          <div className="w-10 h-10 rounded-full bg-white shadow-[0_0_30px_12px_rgba(255,190,80,0.9),0_0_80px_28px_rgba(255,140,40,0.5)]" />
        </At>
      )}
      {pack === 'blackhole' && (
        <At x={cx} y={cy} initial={{ scale: 0, opacity: 1 }} animate={{ scale: [0, 1.4, 2.4], opacity: [1, 1, 0] }} transition={{ duration: 1.0, ease: 'easeOut' }}>
          <div className="w-[120px] h-[120px] rounded-full bg-[radial-gradient(circle,#FFFFFF_0%,#FDE68A_30%,rgba(249,115,22,0.4)_55%,transparent_70%)]" />
        </At>
      )}
      {pack === 'origami' && (
        <At x={from.x} y={from.y} initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: [0, -W * 0.2, cx - from.x], y: [0, (cy - from.y) * 0.5 - 40, cy - from.y], opacity: [1, 1, 0], scale: [0.5, 1.1, 0.9] }} transition={{ duration: 0.85, ease: 'easeInOut' }}>
          <Crane size={110} />
        </At>
      )}
      {pack === 'pixel' &&
        Array.from({ length: PIX_COLS * PIX_ROWS }, (_, i) => {
          const col = i % PIX_COLS;
          const row = Math.floor(i / PIX_COLS);
          const x = cx - 150 + col * 25 + 12;
          const y = cy - 40 + row * 20 + 10;
          return (
            <motion.span
              key={i}
              className="absolute w-[14px] h-[14px] rounded-[3px]"
              style={{ left: x - 7, top: y - 7, background: PIX_COLORS[(i * 7) % PIX_COLORS.length] }}
              initial={{ y: -y - 40 - ((i * 53) % 120), opacity: 1 }}
              animate={{ y: 0, opacity: [1, 1, 0] }}
              transition={{ duration: 0.6, delay: ((i * 29) % 11) * 0.02, ease: [0.3, 0, 0.2, 1], opacity: { duration: 1.0, times: [0, 0.8, 1] } }}
            />
          );
        })}
      {pack === 'ink' &&
        [0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{ left: cx - 40, top: cy - 40, width: 80, height: 80, background: i % 2 ? 'rgba(30,58,138,0.5)' : 'rgba(59,130,246,0.42)', filter: 'blur(8px)' }}
            initial={{ scale: 0, opacity: 0.9 }}
            animate={{ scale: 3 + i * 0.5, opacity: 0, x: (i - 2) * 18, y: ((i * 3) % 5) * 6 - 12 }}
            transition={{ duration: 1.1, delay: 0.15 + i * 0.06, ease: 'easeOut' }}
          />
        ))}
      {pack === 'liquid' && (
        <>
          <motion.div
            className="absolute w-[14px] rounded-full bg-[linear-gradient(180deg,rgba(34,211,238,0),#22D3EE,#0A84FF)]"
            style={{ left: cx - 7, top: 0, height: cy, originY: 0 }}
            initial={{ scaleY: 0, opacity: 1 }}
            animate={{ scaleY: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 0.9, times: [0, 0.5, 1], ease: 'easeIn' }}
          />
          <At x={cx} y={cy + 30} initial={{ scaleX: 0, scaleY: 0 }} animate={{ scaleX: [0, 1, 1.1, 0], scaleY: [0, 0.4, 0.5, 0] }} transition={{ duration: 1.3, times: [0, 0.4, 0.7, 1], delay: 0.35 }}>
            <div className="w-[260px] h-[60px] rounded-[50%] bg-[radial-gradient(ellipse,#22D3EE,rgba(10,132,255,0.5)_60%,transparent_72%)]" />
          </At>
        </>
      )}
      <At x={cx} y={cy} initial={{ scale: 0, opacity: 0 }} animate={pop}>
        <motion.div animate={leave}>
          <ItemCard ev={ev} note={note} />
        </motion.div>
      </At>
    </div>
  );
}

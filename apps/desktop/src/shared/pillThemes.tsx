// v2 · Pill Studio: the pill's designed themes. Drawn with CSS only (no images, no CDN), animated
// with transforms and opacity so it stays smooth and cheap. Every theme reacts to what's going on:
// idle, a call ringing, music playing, something being sent.

import type { CSSProperties } from 'react';

export type PillThemeId = 'classic' | 'aurora' | 'glass' | 'neon' | 'cassette';
export type PillShape = 'pill' | 'soft' | 'notch';
export type PillMood = 'idle' | 'ring' | 'music' | 'busy';

export interface PillStyle {
  theme: PillThemeId;
  shape: PillShape;
  /** A clock at the start of the pill. */
  clock: boolean;
  /** Send / receive animation pack (the phone plays the matching arrival). */
  fx: FxPack;
}

export type FxPack = 'default' | 'plane' | 'portal' | 'comet';

export const DEFAULT_PILL_STYLE: PillStyle = { theme: 'classic', shape: 'pill', clock: false, fx: 'default' };

export const FX_PACKS: { id: FxPack; name: string; tagline: string; pro: boolean }[] = [
  { id: 'default', name: 'Lift-off', tagline: 'The item rises and streaks up into the pill. Free.', pro: false },
  { id: 'plane', name: 'Paper Plane', tagline: 'Folds into a paper plane that loops up to the pill; lands and unfolds on the phone.', pro: true },
  { id: 'portal', name: 'Portal', tagline: 'A swirling portal opens at the pill and pulls it in; it drops out of a portal on the phone.', pro: true },
  { id: 'comet', name: 'Comet', tagline: 'Shrinks to a glowing comet and streaks away; bursts into the file on the phone.', pro: true },
];

export interface ThemeMeta {
  id: PillThemeId;
  name: string;
  tagline: string;
  pro: boolean;
  /** Small swatch for buttons and lists. */
  swatch: string;
}

export const THEMES: ThemeMeta[] = [
  { id: 'classic', name: 'Classic', tagline: 'Pure black, like a phone notch. Free.', pro: false, swatch: '#000' },
  {
    id: 'aurora',
    name: 'Aurora',
    tagline: 'Northern lights drift inside the pill. Turns green and quickens when a call rings.',
    pro: true,
    swatch: 'radial-gradient(circle at 30% 40%, #22D3EE, transparent 60%), radial-gradient(circle at 75% 60%, #8B5CF6, transparent 60%), #050816',
  },
  {
    id: 'glass',
    name: 'Liquid Glass',
    tagline: 'Smoked glass with a highlight that follows your pointer and a slow shine.',
    pro: true,
    swatch: 'linear-gradient(135deg, rgba(255,255,255,0.55), rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.3)), #2A2E3A',
  },
  {
    id: 'neon',
    name: 'Neon Tokyo',
    tagline: 'A neon tube that flickers on. Glows cyan when a call comes in.',
    pro: true,
    swatch: 'radial-gradient(circle, rgba(255,43,214,0.5), transparent 70%), #07040D',
  },
  {
    id: 'cassette',
    name: 'Cassette',
    tagline: 'A warm retro tape. Its stripes roll and reels spin while music plays or files send.',
    pro: true,
    swatch: 'linear-gradient(180deg, #3A2E27 0 70%, #E86A33 70% 80%, #F2B544 80% 90%, #2F8F83 90%)',
  },
];

export const themeMeta = (id: string): ThemeMeta => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** Corner radius for the shell (CSS string), given its height and whether it's the Island. */
export function shellRadius(shape: PillShape, h: number, expanded: boolean, anchorTop: boolean): string {
  if (shape === 'soft') return expanded ? '24px' : `${Math.round(Math.min(14, h / 2))}px`;
  if (shape === 'notch') {
    const big = expanded ? 30 : h / 2;
    return anchorTop ? `6px 6px ${big}px ${big}px` : `${big}px ${big}px 6px 6px`;
  }
  return expanded ? '30px' : `${h / 2}px`;
}

/**
 * Per-theme colours for the shell itself: background, text colours (CSS variables the app's
 * `text-text` / `text-muted` classes read), and a class for theme-specific text effects.
 */
export function shellLook(theme: PillThemeId): { className: string; style: CSSProperties } {
  switch (theme) {
    case 'aurora':
      return { className: 'pd-theme-aurora', style: { background: '#050816' } };
    case 'glass':
      return { className: 'pd-theme-glass', style: { background: 'rgba(26, 28, 38, 0.9)' } };
    case 'neon':
      return { className: 'pd-theme-neon', style: { background: '#07040D' } };
    case 'cassette':
      return {
        className: 'pd-theme-cassette',
        style: {
          background: 'linear-gradient(180deg, #3B2F28, #261E1A)',
          ['--text' as string]: '246 236 218',
          ['--soft' as string]: '226 210 186',
          ['--muted' as string]: '186 164 138',
        },
      };
    default:
      return { className: '', style: { background: '#000' } };
  }
}

/** The theme's living background. Sits behind the pill / Island content; never takes clicks. */
export function ThemeLayer({ theme, mood, expanded }: { theme: PillThemeId; mood: PillMood; expanded: boolean }) {
  if (theme === 'classic') return null;
  return (
    <div aria-hidden="true" className={`pd-layer pd-mood-${mood} absolute inset-0 overflow-hidden pointer-events-none`} style={{ borderRadius: 'inherit' }}>
      {theme === 'aurora' && <Aurora />}
      {theme === 'glass' && <Glass />}
      {theme === 'neon' && <Neon />}
      {theme === 'cassette' && <Cassette expanded={expanded} />}
    </div>
  );
}

function Aurora() {
  return (
    <>
      <div className="pd-aur pd-aur-a" />
      <div className="pd-aur pd-aur-b" />
      <div className="pd-aur pd-aur-c" />
      {/* a dark veil keeps text readable over the brightest colour, a sheen on top, a hairline edge */}
      <div className="absolute inset-0 bg-[rgba(5,8,22,0.14)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),transparent_45%)]" />
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]" style={{ borderRadius: 'inherit' }} />
    </>
  );
}

function Glass() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.20),rgba(255,255,255,0.04)_42%,rgba(255,255,255,0.02)_60%,rgba(255,255,255,0.12))]" />
      {/* the gloss on the upper half, like light on a curved glass surface */}
      <div className="absolute inset-x-[6%] top-[2px] h-[46%] rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.30),rgba(255,255,255,0.04))]" style={{ borderRadius: 'inherit' }} />
      {/* the highlight that follows the pointer (--mx / --my are set by the shell) */}
      <div className="pd-glass-spec absolute inset-0" />
      <div className="pd-glass-shine absolute inset-y-0 -left-1/2 w-1/3" />
      <div
        className="absolute inset-0"
        style={{
          borderRadius: 'inherit',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -1px 0 rgba(255,255,255,0.18), inset 0 0 0 1px rgba(255,255,255,0.20), inset 0 -8px 16px rgba(0,0,0,0.25)',
        }}
      />
    </>
  );
}

function Neon() {
  return (
    <>
      <div className="absolute inset-0 opacity-60 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0_1px,transparent_1px_3px)]" />
      <div className="pd-neon-haze absolute inset-0" />
      <div className="pd-neon-tube absolute inset-[3px]" style={{ borderRadius: 'inherit' }} />
    </>
  );
}

function Cassette({ expanded }: { expanded: boolean }) {
  return (
    <>
      {/* fine grain */}
      <div className="absolute inset-0 opacity-[0.18] bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.05)_0_1px,transparent_1px_4px)]" />
      {/* the retro stripes along the bottom edge; they roll while something's going on */}
      <div className="pd-cas-stripes absolute inset-x-0 bottom-0 h-[5px]" />
      {expanded && (
        // the tape window, a slim strip along the top of the Island (above its content)
        <div className="absolute left-1/2 -translate-x-1/2 top-[3px] w-[96px] h-[15px] rounded-[8px] bg-[#16110E] shadow-[inset_0_1px_3px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.06)] flex items-center justify-between px-1">
          <Reel />
          <span className="flex-1 mx-1 h-[5px] rounded-sm bg-[#4A3426]" />
          <Reel />
        </div>
      )}
    </>
  );
}

function Reel() {
  return (
    <span className="pd-reel relative w-[12px] h-[12px] rounded-full bg-[#E9DFCB] flex items-center justify-center">
      <span className="absolute inset-[1.5px] rounded-full bg-[conic-gradient(#2A211C_0_20deg,transparent_20deg_120deg,#2A211C_120deg_140deg,transparent_140deg_240deg,#2A211C_240deg_260deg,transparent_260deg)]" />
      <span className="w-[3px] h-[3px] rounded-full bg-[#2A211C]" />
    </span>
  );
}

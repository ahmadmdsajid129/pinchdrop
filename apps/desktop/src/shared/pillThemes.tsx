// v2 · Pill Studio: the pill's designed themes. Drawn with CSS only (no images, no CDN), animated
// with transforms and opacity so it stays smooth and cheap. Every theme reacts to what's going on:
// idle, a call ringing, music playing, something being sent.

import type { CSSProperties } from 'react';

export type PillThemeId = 'classic' | 'aurora' | 'glass' | 'neon' | 'cassette' | 'terminal' | 'paper' | 'orbit' | 'diwali' | 'holi' | 'eid' | 'xmas';
export type PillShape = 'pill' | 'soft' | 'notch';
export type PillMood = 'idle' | 'ring' | 'music' | 'busy';

export interface PillStyle {
  theme: PillThemeId;
  shape: PillShape;
  /** A clock at the start of the pill. */
  clock: boolean;
  /** Send / receive animation pack (the phone plays the matching arrival). */
  fx: FxPack;
  /** Pro: the screen's edges glow for calls and messages. */
  edge?: boolean;
  /** Pro: a second theme for the evening (19:00–07:00); '' = off. */
  night?: PillThemeId | '';
  /** Pro: the festival theme around Diwali, Holi, Eid and Christmas. */
  festive?: boolean;
}

export type FxPack = 'default' | 'plane' | 'portal' | 'comet' | 'blackhole' | 'origami' | 'pixel' | 'ink' | 'liquid';

export const DEFAULT_PILL_STYLE: PillStyle = { theme: 'classic', shape: 'pill', clock: false, fx: 'default' };

export const FX_PACKS: { id: FxPack; name: string; tagline: string; pro: boolean }[] = [
  { id: 'default', name: 'Lift-off', tagline: 'The item rises and streaks up into the pill. Free.', pro: false },
  { id: 'plane', name: 'Paper Plane', tagline: 'Folds into a paper plane that loops up to the pill; lands and unfolds on the phone.', pro: true },
  { id: 'portal', name: 'Portal', tagline: 'A swirling portal opens at the pill and pulls it in; it drops out of a portal on the phone.', pro: true },
  { id: 'comet', name: 'Comet', tagline: 'Shrinks to a glowing comet and streaks away; bursts into the file on the phone.', pro: true },
  { id: 'blackhole', name: 'Black Hole', tagline: 'Sucked into a black hole that zips to the pill; a white hole spits it out on the phone.', pro: true },
  { id: 'origami', name: 'Origami', tagline: 'Folds into a paper crane that flaps away; the crane lands and unfolds on the phone.', pro: true },
  { id: 'pixel', name: 'Pixel Beam', tagline: 'Breaks into pixels that stream up; they rain down and rebuild it on the phone.', pro: true },
  { id: 'ink', name: 'Ink Drop', tagline: 'Condenses into an ink drop that blooms at the pill; ink blooms into the file on the phone.', pro: true },
  { id: 'liquid', name: 'Liquid', tagline: 'Melts and flows up to the pill; fills the phone and settles into the file.', pro: true },
];

export interface ThemeMeta {
  id: PillThemeId;
  name: string;
  tagline: string;
  pro: boolean;
  /** Small swatch for buttons and lists. */
  swatch: string;
  /** Festival themes are grouped apart and can switch on by themselves (Festival drops). */
  festival?: boolean;
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
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'Green phosphor, scanlines and a blinking cursor. Turns amber when a call rings.',
    pro: true,
    swatch: '#031006',
  },
  {
    id: 'paper',
    name: 'Paper & Ink',
    tagline: 'Cream paper and fountain-pen ink. An ink blot blooms when a call comes in.',
    pro: true,
    swatch: '#F3ECDD',
  },
  {
    id: 'orbit',
    name: 'Orbit',
    tagline: 'A tiny planet circles the pill through deep space; it speeds up for calls.',
    pro: true,
    swatch: 'radial-gradient(circle at 70% 40%, #7DD3FC 0 3px, transparent 4px), #04060F',
  },
  { id: 'diwali', name: 'Diwali', tagline: 'A string of diyas flickers along the pill, with sparks.', pro: true, festival: true, swatch: '#2A0A12' },
  { id: 'holi', name: 'Holi', tagline: 'Clouds of gulal drift through the pill in every colour.', pro: true, festival: true, swatch: '#1A1030' },
  { id: 'eid', name: 'Eid', tagline: 'A crescent moon, twinkling stars and a row of lanterns.', pro: true, festival: true, swatch: '#06212A' },
  { id: 'xmas', name: 'Christmas', tagline: 'Falling snow and a row of twinkling lights.', pro: true, festival: true, swatch: '#0D2A1B' },
];

/**
 * Festival drops: roughly when each festival falls (a few days either side). Lunar festivals
 * move every year, so the dates are listed for the next few years.
 */
const FESTIVALS: { theme: PillThemeId; days: string[] }[] = [
  { theme: 'diwali', days: ['2026-11-08', '2027-10-29', '2028-10-17', '2029-11-05', '2030-10-26'] },
  { theme: 'holi', days: ['2027-03-22', '2028-03-11', '2029-03-01', '2030-03-20'] },
  { theme: 'eid', days: ['2027-03-10', '2027-05-17', '2028-02-27', '2028-05-05', '2029-02-15', '2029-04-24', '2030-02-05', '2030-04-13'] },
];

/** The festival theme for this date, if one is on (Christmas: 20–26 December). */
export function festivalOn(now = new Date()): PillThemeId | null {
  if (now.getMonth() === 11 && now.getDate() >= 20 && now.getDate() <= 26) return 'xmas';
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  for (const f of FESTIVALS) {
    for (const d of f.days) {
      const [y, m, dd] = d.split('-').map(Number);
      const diff = (day - Date.UTC(y, m - 1, dd)) / 86400000;
      if (diff >= -2 && diff <= 2) return f.theme;
    }
  }
  return null;
}

/** The theme to show now: the festival (if on), the evening theme (19:00–07:00), or the chosen one. */
export function themeNow(style: PillStyle, now = new Date()): PillThemeId {
  if (style.festive) {
    const f = festivalOn(now);
    if (f) return f;
  }
  const h = now.getHours();
  if (style.night && (h >= 19 || h < 7)) return style.night;
  return style.theme;
}

const THEME_IDS = new Set<string>(['classic', 'aurora', 'glass', 'neon', 'cassette', 'terminal', 'paper', 'orbit', 'diwali', 'holi', 'eid', 'xmas']);
const SHAPES = new Set<string>(['pill', 'soft', 'notch']);

/** Share a look as a short code anyone can paste into their Pill Studio. */
export function styleCode(s: PillStyle): string {
  const j = JSON.stringify({ t: s.theme, s: s.shape, c: s.clock ? 1 : 0, f: s.fx, e: s.edge ? 1 : 0, n: s.night || '', v: s.festive ? 1 : 0 });
  return 'PDS1-' + btoa(j).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reads a shared look; null if the code isn't one. Unknown values are ignored, never trusted. */
export function parseStyleCode(code: string): PillStyle | null {
  const m = code.trim().match(/^PDS1-([A-Za-z0-9_-]{8,400})$/);
  if (!m) return null;
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(atob(b + '==='.slice((b.length + 3) % 4))) as Record<string, unknown>;
    const t = String(j.t ?? '');
    const sh = String(j.s ?? 'pill');
    const f = String(j.f ?? 'default');
    const n = String(j.n ?? '');
    if (!THEME_IDS.has(t)) return null;
    return {
      theme: t as PillThemeId,
      shape: (SHAPES.has(sh) ? sh : 'pill') as PillShape,
      clock: j.c === 1,
      fx: (FX_PACKS.some((p) => p.id === f) ? f : 'default') as FxPack,
      edge: j.e === 1,
      night: (THEME_IDS.has(n) ? n : '') as PillThemeId | '',
      festive: j.v === 1,
    };
  } catch {
    return null;
  }
}

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
    case 'terminal':
      return {
        className: 'pd-theme-terminal',
        style: { background: '#031006', ['--text' as string]: '134 255 160', ['--soft' as string]: '110 220 135', ['--muted' as string]: '70 160 95' },
      };
    case 'paper':
      return {
        className: 'pd-theme-paper',
        style: { background: '#F3ECDD', ['--text' as string]: '28 26 46', ['--soft' as string]: '58 54 80', ['--muted' as string]: '110 102 120' },
      };
    case 'orbit':
      return { className: 'pd-theme-orbit', style: { background: '#04060F' } };
    case 'diwali':
      return { className: 'pd-theme-diwali', style: { background: '#2A0A12', ['--muted' as string]: '230 180 160' } };
    case 'holi':
      return { className: 'pd-theme-holi', style: { background: '#1A1030' } };
    case 'eid':
      return { className: 'pd-theme-eid', style: { background: '#06212A', ['--muted' as string]: '170 210 205' } };
    case 'xmas':
      return { className: 'pd-theme-xmas', style: { background: '#0D2A1B', ['--muted' as string]: '175 215 190' } };
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
      {theme === 'terminal' && <Terminal />}
      {theme === 'paper' && <Paper />}
      {theme === 'orbit' && <Orbit />}
      {theme === 'diwali' && <Diwali />}
      {theme === 'holi' && <Holi />}
      {theme === 'eid' && <Eid />}
      {theme === 'xmas' && <Xmas />}
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

function Terminal() {
  return (
    <>
      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.35)_0_1px,transparent_1px_3px)]" />
      <div className="pd-term-scan absolute inset-x-0 h-1/3" />
      <div className="absolute inset-0 shadow-[inset_0_0_18px_rgba(60,255,120,0.18),inset_0_0_0_1px_rgba(90,255,140,0.22)]" style={{ borderRadius: 'inherit' }} />
      <span className="pd-term-cursor absolute right-[10px] bottom-[7px] w-[7px] h-[3px]" />
    </>
  );
}

function Paper() {
  return (
    <>
      {/* paper fibres */}
      <div className="absolute inset-0 opacity-50 bg-[repeating-linear-gradient(115deg,rgba(120,100,70,0.06)_0_1px,transparent_1px_5px)]" />
      <div className="pd-paper-blot absolute" />
      {/* a hand-drawn ink underline that writes itself */}
      <svg className="absolute left-[12%] right-[12%] bottom-[3px] h-[5px] w-[76%]" viewBox="0 0 100 5" preserveAspectRatio="none">
        <path className="pd-paper-line" d="M1 3 C 20 1, 40 4.5, 60 2.5 S 90 2, 99 3" fill="none" stroke="#1C1A2E" strokeWidth="1.2" strokeLinecap="round" pathLength={100} />
      </svg>
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(28,26,46,0.18)]" style={{ borderRadius: 'inherit' }} />
    </>
  );
}

const STARS = [[8, 30], [18, 70], [27, 22], [41, 60], [52, 35], [63, 78], [71, 20], [83, 55], [92, 30], [35, 85], [76, 88]];

function Orbit() {
  return (
    <>
      {STARS.map(([x, y], i) => (
        <span key={i} className="pd-star absolute w-[2px] h-[2px] rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 5) * 0.6}s` }} />
      ))}
      <div className="pd-orbit-path absolute inset-[3px]" style={{ borderRadius: 'inherit' }}>
        <span className="pd-orbit-planet" />
      </div>
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.18)]" style={{ borderRadius: 'inherit' }} />
    </>
  );
}

function Diwali() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_130%,rgba(255,150,40,0.35),transparent_60%)]" />
      <div className="absolute inset-x-[8%] bottom-[2px] flex justify-between">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="pd-diya" style={{ animationDelay: `${(i * 0.37) % 1.6}s` }} />
        ))}
      </div>
      {[15, 38, 62, 85].map((x, i) => (
        <span key={x} className="pd-spark absolute top-[30%] w-[3px] h-[3px] rounded-full" style={{ left: `${x}%`, animationDelay: `${i * 0.7}s` }} />
      ))}
    </>
  );
}

const GULAL = ['#FF3EA5', '#FFD60A', '#22C55E', '#3B82F6', '#A855F7', '#FF7A00'];

function Holi() {
  return (
    <>
      {GULAL.map((c, i) => (
        <span
          key={c}
          className="pd-gulal absolute rounded-full"
          style={{ background: c, left: `${(i * 17) % 90}%`, top: `${i % 2 ? 10 : 40}%`, animationDelay: `${i * 0.9}s` }}
        />
      ))}
      <div className="absolute inset-0 bg-[rgba(26,16,48,0.35)]" />
    </>
  );
}

function Eid() {
  return (
    <>
      {STARS.slice(0, 8).map(([x, y], i) => (
        <span key={i} className="pd-star absolute w-[2px] h-[2px] rounded-full bg-[#FDE68A]" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 4) * 0.5}s` }} />
      ))}
      <span className="pd-crescent absolute right-[12px] top-1/2 -translate-y-1/2" />
      <div className="absolute left-[10%] right-[18%] top-0 flex justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="pd-lantern" style={{ animationDelay: `${i * 0.4}s` }} />
        ))}
      </div>
    </>
  );
}

const SNOW = [5, 14, 23, 31, 40, 48, 57, 66, 74, 83, 91, 97];

function Xmas() {
  return (
    <>
      {SNOW.map((x, i) => (
        <span key={x} className="pd-snow absolute top-0 w-[3px] h-[3px] rounded-full bg-white" style={{ left: `${x}%`, animationDelay: `${(i * 0.53) % 3}s`, animationDuration: `${2.6 + (i % 4) * 0.5}s` }} />
      ))}
      <div className="absolute left-[6%] right-[6%] top-[1px] flex justify-between">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="pd-bulb" style={{ background: ['#EF4444', '#FACC15', '#22C55E', '#3B82F6'][i % 4], animationDelay: `${i * 0.25}s` }} />
        ))}
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Check, Crown, MessageSquare, Music2, Phone, PhoneOff, Smartphone, Upload } from 'lucide-react';
import {
  DEFAULT_PILL_STYLE,
  THEMES,
  ThemeLayer,
  shellLook,
  shellRadius,
  type PillMood,
  type PillShape,
  type PillStyle,
  type PillThemeId,
} from '../shared/pillThemes';
import { askUpgrade, usePro } from '../shared/pro';
import { Battery } from '../shared/Battery';
import { useApp } from './context';
import { Button, Card, PageTitle, Segmented, Toggle } from './ui';
import { ProTag } from './Pro';

/** The pill as it will look, drawn with the same theme pieces as the real one. */
function PreviewPill({ style, mood, expanded, scale = 1 }: { style: PillStyle; mood: PillMood; expanded: boolean; scale?: number }) {
  const look = shellLook(style.theme);
  const h = 36;
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setTime(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const clock = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const shell: CSSProperties = {
    ...look.style,
    borderRadius: shellRadius(style.shape, h, expanded, true),
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'top center',
  };
  return (
    <div className="pill-page inline-block" data-theme="dark" style={{ background: 'transparent' }}>
      <div
        className={`relative overflow-hidden text-text transition-[border-radius] duration-300 ${look.className} ${style.theme === 'classic' ? 'ring-1 ring-inset ring-white/[0.09]' : ''}`}
        style={shell}
        onPointerMove={(e) => {
          if (style.theme !== 'glass') return;
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mx', `${(e.clientX - r.left) / scale}px`);
          e.currentTarget.style.setProperty('--my', `${(e.clientY - r.top) / scale}px`);
        }}
      >
        <ThemeLayer theme={style.theme} mood={mood} expanded={expanded} />
        <div className="relative">
          {expanded ? <MiniIsland mood={mood} /> : <MiniPill clock={style.clock ? clock : null} mood={mood} />}
        </div>
      </div>
    </div>
  );
}

function MiniPill({ clock, mood }: { clock: string | null; mood: PillMood }) {
  return (
    <div className="inline-flex items-center h-9">
      <div className="inline-flex items-center gap-2.5 px-3.5 text-[13px] font-semibold whitespace-nowrap">
        {clock && <span className="tabular-nums">{clock}</span>}
        <span className="w-2 h-2 rounded-full bg-success" />
        <Smartphone size={16} className="text-accent" aria-hidden="true" />
        <span>POCO F7</span>
        <span className="w-px h-4 bg-line" />
        <Battery level={82} charging={false} size={18} />
        <span>82%</span>
      </div>
      {mood === 'ring' && (
        <span className="mr-1.5 inline-flex items-center gap-1 rounded-full px-2 h-[70%] text-[13px] font-semibold bg-[#30D158]/20 text-[#5BE07F]">
          <Phone size={14} className="pd-shake" aria-hidden="true" /> Mom
        </span>
      )}
      {mood === 'music' && (
        <span className="mr-2 inline-flex items-end gap-[2px] h-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="pd-bar w-[3px] h-3 rounded-sm bg-[#5BE07F]" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      )}
      {mood === 'idle' && (
        <span className="mr-1.5 inline-flex items-center gap-1 rounded-full px-2 h-[70%] text-[13px] font-semibold bg-[#0A84FF]/20 text-[#64B5FF]">
          <MessageSquare size={14} aria-hidden="true" /> 2
        </span>
      )}
    </div>
  );
}

function MiniIsland({ mood }: { mood: PillMood }) {
  return (
    <div className="w-[360px] p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-[16px] bg-white/[0.08] text-accent flex items-center justify-center">
          <Smartphone size={22} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold text-[18px]">{mood === 'ring' ? 'Mom' : 'POCO F7'}</div>
          <div className="text-[12px] text-muted">{mood === 'ring' ? 'Incoming call · POCO F7' : 'Connected · Home Wi-Fi'}</div>
        </div>
        {mood !== 'ring' && (
          <div className="text-right">
            <div className="text-[20px] font-semibold text-success">82%</div>
            <div className="text-[11px] text-muted">Battery</div>
          </div>
        )}
      </div>
      {mood === 'ring' && (
        <div className="flex gap-2">
          <span className="flex-1 h-10 rounded-full bg-[#FF3B30] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <PhoneOff size={15} /> Reject
          </span>
          <span className="flex-1 h-10 rounded-full bg-[#34C759] text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <Phone size={15} /> Answer
          </span>
        </div>
      )}
      {mood === 'music' && (
        <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.06]">
          <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F97316] to-[#DB2777] flex items-center justify-center text-white">
            <Music2 size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Kesariya</div>
            <div className="text-[12px] text-muted">Arijit Singh · Spotify</div>
          </div>
        </div>
      )}
      {mood === 'busy' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Upload size={13} /> Holiday photos
            </span>
            <span className="text-muted">64%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-full bg-primary origin-left" style={{ transform: 'scaleX(0.64)' }} />
          </div>
        </div>
      )}
      {mood === 'idle' && (
        <div className="flex gap-2">
          <span className="flex-1 h-10 rounded-full bg-primary text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <Upload size={15} /> Send files…
          </span>
          <span className="flex-1 h-10 rounded-full bg-white/[0.08] text-[13px] font-semibold inline-flex items-center justify-center">Gestures: On</span>
        </div>
      )}
    </div>
  );
}

const WALLPAPERS: Record<string, string> = {
  dusk: 'radial-gradient(circle at 20% 20%, #F9A8D4 0, transparent 40%), radial-gradient(circle at 80% 30%, #93C5FD 0, transparent 45%), radial-gradient(circle at 50% 90%, #FDE68A 0, transparent 50%), linear-gradient(160deg, #C4B5FD, #60A5FA)',
  night: 'radial-gradient(circle at 70% 20%, #312E81 0, transparent 50%), radial-gradient(circle at 20% 80%, #0F766E 0, transparent 50%), linear-gradient(180deg, #0B1020, #111827)',
  light: 'linear-gradient(180deg, #F5F5F7, #E5E7EB)',
};

function Choice({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`h-8 px-3 rounded-full text-[12.5px] font-semibold transition-colors ${on ? 'bg-text text-bg' : 'bg-bg2 text-soft hover:text-text'}`}
    >
      {children}
    </button>
  );
}

/** Route "studio": choose the pill's theme, shape and clock, with a live preview. */
export function StudioPage() {
  const { settings, update } = useApp();
  const pro = usePro();
  const saved: PillStyle = { ...DEFAULT_PILL_STYLE, ...(settings.pill.style ?? {}) };
  /** What the preview shows: the saved style, or a Pro theme being tried without Pro. */
  const [trying, setTrying] = useState<PillStyle | null>(null);
  const shown = trying ?? saved;
  const [mood, setMood] = useState<PillMood>('idle');
  const [expanded, setExpanded] = useState(false);
  const [wall, setWall] = useState<keyof typeof WALLPAPERS>('dusk');

  const needsPro = (s: PillStyle) => s.theme !== 'classic' || s.shape !== 'pill' || s.clock;
  const choose = (patch: Partial<PillStyle>) => {
    const next = { ...shown, ...patch };
    if (needsPro(next) && !pro.active) {
      setTrying(next); // show it in the preview; the pill keeps its free look
      return;
    }
    setTrying(null);
    void update({ pill: { style: next } });
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <PageTitle>Pill Studio</PageTitle>
        {!pro.active && <ProTag />}
      </div>

      {/* Live preview */}
      <section className="relative overflow-hidden rounded-[22px] border border-line" style={{ background: WALLPAPERS[wall] }}>
        <div className="h-[300px] flex justify-center pt-0">
          <div className="pt-2">
            <PreviewPill style={shown} mood={mood} expanded={expanded} />
          </div>
        </div>
        <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1.5 flex-wrap p-1 rounded-full bg-white/70 backdrop-blur-sm">
            {(
              [
                ['idle', 'Idle'],
                ['ring', 'Call ringing'],
                ['music', 'Music'],
                ['busy', 'Sending'],
              ] as const
            ).map(([m, l]) => (
              <Choice key={m} on={mood === m} onClick={() => setMood(m)} label={`Preview: ${l}`}>
                {l}
              </Choice>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap p-1 rounded-full bg-white/70 backdrop-blur-sm">
            <Choice on={!expanded} onClick={() => setExpanded(false)} label="Preview the pill">
              Pill
            </Choice>
            <Choice on={expanded} onClick={() => setExpanded(true)} label="Preview the Island">
              Island
            </Choice>
            <span className="w-px bg-line mx-0.5" />
            {(['dusk', 'night', 'light'] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`${w} wallpaper`}
                aria-pressed={wall === w}
                onClick={() => setWall(w)}
                className={`w-8 h-8 rounded-full border-2 ${wall === w ? 'border-text' : 'border-transparent'}`}
                style={{ background: WALLPAPERS[w] }}
              />
            ))}
          </div>
        </div>
      </section>

      {trying && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/40 flex-wrap" role="status">
          <Crown size={20} className="text-[#D97706]" aria-hidden="true" />
          <div className="flex-1 min-w-[240px] text-[14px]">
            <b>You're previewing a Pro look.</b> <span className="text-muted">Your pill keeps Classic until you have PinchDrop Pro.</span>
          </div>
          <Button size="sm" onClick={() => setTrying(null)}>Back to my look</Button>
          <Button size="sm" variant="primary" onClick={() => askUpgrade('themes')}>
            <Crown size={14} aria-hidden="true" /> Unlock with Pro
          </Button>
        </div>
      )}

      {/* Themes */}
      <div className="font-semibold text-[15px]">Themes</div>
      <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {THEMES.map((t) => {
          const on = shown.theme === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => choose({ theme: t.id as PillThemeId })}
                className={`w-full text-left rounded-[20px] border-2 p-3 flex flex-col gap-3 bg-surface transition-colors ${on ? 'border-primary' : 'border-transparent hover:border-line'}`}
              >
                <div className="h-[92px] rounded-2xl flex items-center justify-center overflow-hidden" style={{ background: WALLPAPERS.night }}>
                  <PreviewPill style={{ theme: t.id, shape: 'pill', clock: false }} mood="idle" expanded={false} scale={0.86} />
                </div>
                <div className="flex items-center gap-2 px-1">
                  <span className="font-semibold text-[15px]">{t.name}</span>
                  {t.pro && <ProTag />}
                  <span className="flex-1" />
                  {on && (
                    <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="px-1 text-[12.5px] text-muted leading-snug min-h-[34px]">{t.tagline}</div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Shape and clock */}
      <Card className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="font-semibold text-[14px] flex items-center gap-2">Shape {!pro.active && <ProTag />}</div>
            <div className="text-[12.5px] text-muted">Notch sits flush against the top of the screen, like a phone's.</div>
          </div>
          <Segmented<PillShape>
            label="Pill shape"
            value={shown.shape}
            onChange={(v) => choose({ shape: v })}
            options={[
              { value: 'pill', label: 'Pill' },
              { value: 'soft', label: 'Soft' },
              { value: 'notch', label: 'Notch' },
            ]}
          />
        </div>
        <div className="h-px bg-line" />
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="font-semibold text-[14px] flex items-center gap-2">Clock on the pill {!pro.active && <ProTag />}</div>
            <div className="text-[12.5px] text-muted">The time, right before your phone's name.</div>
          </div>
          <Toggle label="Clock on the pill" checked={shown.clock} onChange={(v) => choose({ clock: v })} />
        </div>
      </Card>
      <p className="m-0 text-[13px] text-muted">
        Changes show on your pill straight away. Every theme reacts to what's happening: try "Call ringing", "Music" and "Sending" above.
      </p>
    </>
  );
}

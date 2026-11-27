import { Check, Hand, Play } from 'lucide-react';
import { askUpgrade, usePro } from '../shared/pro';
import { useApp } from './context';
import { Button, Card, PageTitle, Select } from './ui';
import { ProTag } from './Pro';
import { GESTURES, GESTURE_ACTIONS, GESTURE_PACKS, runGestureAction } from '../shared/gestureMap';

/** Route "gestures": choose what each hand gesture does when nothing else is on the Island. */
export function GestureStudioPage() {
  const { settings, update } = useApp();
  const pro = usePro();
  const map: Record<string, string> = settings.gestures.map ?? {};
  const set = (next: Record<string, string>) => {
    if (!pro.active) {
      askUpgrade('gestures');
      return;
    }
    // Replace the whole map (a pack clears gestures it doesn't use).
    void update({ gestures: { map: Object.fromEntries(GESTURES.map((g) => [g.id, next[g.id] ?? ''])) } });
  };
  const packOn = (p: (typeof GESTURE_PACKS)[number]) => GESTURES.every((g) => (map[g.id] || '') === (p.map[g.id] || ''));
  const actionOpts = [{ value: '', label: 'Built-in (phone music)' }, ...GESTURE_ACTIONS.map((a) => ({ value: a.id, label: a.label }))];

  return (
    <>
      <div className="flex items-center gap-3">
        <PageTitle>Gesture Studio</PageTitle>
        {!pro.active && <ProTag />}
      </div>
      <p className="m-0 -mt-2 text-[14px] text-muted max-w-[720px]">
        Your hand can drive your PC. Pick a pack or set each gesture yourself. They work while the camera is on (click the pill, or Ctrl + Shift + Space).
        Calls, notifications and catches on the Island still come first.
      </p>

      <div className="font-semibold text-[15px]">Gesture packs</div>
      <ul className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {GESTURE_PACKS.map((p) => {
          const on = packOn(p);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => set(p.map)}
                className={`w-full h-full text-left rounded-[20px] border-2 p-4 flex flex-col gap-2 bg-surface transition-colors ${on ? 'border-primary' : 'border-transparent hover:border-line'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[22px]" aria-hidden="true">{p.icon}</span>
                  <span className="font-semibold text-[15px]">{p.name}</span>
                  <span className="flex-1" />
                  {on && (
                    <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="text-[12.5px] text-muted leading-snug">{p.line}</div>
                <ul className="m-0 mt-1 p-0 list-none flex flex-col gap-1">
                  {GESTURES.filter((g) => p.map[g.id]).map((g) => (
                    <li key={g.id} className="text-[12.5px] flex gap-2">
                      <span aria-hidden="true">{g.emoji}</span>
                      <span className="text-soft">{GESTURE_ACTIONS.find((a) => a.id === p.map[g.id])?.label}</span>
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          );
        })}
      </ul>

      <Card className="p-5 flex flex-col gap-1">
        <div className="font-semibold text-[15px] flex items-center gap-2 mb-2">
          <Hand size={17} className="text-accent" aria-hidden="true" /> Your gestures
        </div>
        {GESTURES.map((g, i) => (
          <div key={g.id} className={`flex items-center gap-4 py-3 flex-wrap ${i ? 'border-t border-line' : ''}`}>
            <span className="w-11 h-11 rounded-2xl bg-bg2 flex items-center justify-center text-[22px]" aria-hidden="true">
              {g.emoji}
            </span>
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold text-[14px]">{g.name}</div>
              <div className="text-[12.5px] text-muted">{g.how}</div>
            </div>
            <Select<string> label={`${g.name} does`} value={map[g.id] ?? ''} options={actionOpts} onChange={(v) => set({ ...map, [g.id]: v })} />
            <Button size="sm" disabled={!map[g.id]} onClick={() => void runGestureAction(map[g.id])} aria-label={`Try ${g.name}`}>
              <Play size={14} aria-hidden="true" /> Try
            </Button>
          </div>
        ))}
      </Card>
      <p className="m-0 text-[13px] text-muted">
        "Mute microphone" uses Windows 11's call shortcut, so it works in Teams, Zoom, Meet and most call apps. Slide controls work in PowerPoint, Google Slides, Keynote on the web and PDF viewers.
      </p>
    </>
  );
}

import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { api } from '../shared/api';
import type { PhoneLive } from '../shared/types';

type Media = NonNullable<PhoneLive['media']>;

/** v2 · What's playing on the phone, with play / pause / next. ✋ palm = pause, 👉 swipe = next. */
export function NowPlaying({ media, deviceId }: { media: Media; deviceId: string }) {
  const act = (a: 'toggle' | 'next' | 'previous') => void api.mediaCmd(a, deviceId).catch(() => undefined);
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-[18px] bg-white/[0.06]">
      {media.art ? (
        <img src={media.art} alt="" className="w-11 h-11 rounded-[10px] object-cover shrink-0" />
      ) : (
        <span className="w-11 h-11 rounded-[10px] shrink-0 bg-gradient-to-br from-[#FF2D55] to-[#AF52DE] text-white flex items-center justify-center">
          <Music size={20} />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-semibold truncate">{media.title}</div>
        <div className="text-[11.5px] text-muted truncate">
          {[media.artist, media.app].filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" aria-label="Previous" onClick={() => act('previous')} className="w-8 h-8 rounded-full hover:bg-white/10 text-soft hover:text-text flex items-center justify-center">
          <SkipBack size={15} fill="currentColor" />
        </button>
        <button
          type="button"
          aria-label={media.playing ? 'Pause' : 'Play'}
          onClick={() => act('toggle')}
          className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition"
        >
          {media.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>
        <button type="button" aria-label="Next" onClick={() => act('next')} className="w-8 h-8 rounded-full hover:bg-white/10 text-soft hover:text-text flex items-center justify-center">
          <SkipForward size={15} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

/** Three little bars that dance while music plays (on the pill). */
export function PlayingBars({ size = 12 }: { size?: number }) {
  return (
    <span className="inline-flex items-end gap-[2px]" style={{ height: size }} aria-label="Playing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="pd-bar w-[2.5px] rounded-full bg-[#FF375F]" style={{ height: size, animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

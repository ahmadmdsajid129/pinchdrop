import { AppWindow, Archive, File, FileText, Folder, Globe, Music, Play } from 'lucide-react';
import type { ItemPreviewData } from './types';

/** Fits a w×h picture inside a box of `max` on its longest side, keeping its shape. */
function fit(w: number, h: number, max: number) {
  if (!w || !h) return { w: max, h: max };
  const k = max / Math.max(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const KIND_TINT: Record<string, string> = {
  pdf: '#FF3B30',
  doc: '#007AFF',
  sheet: '#34C759',
  slides: '#FF9500',
  archive: '#8E8E93',
  app: '#5856D6',
  audio: '#FF2D55',
  video: '#AF52DE',
  image: '#32ADE6',
  file: '#8E8E93',
  text: '#8E8E93',
  code: '#5856D6',
  note: '#FFCC00',
};

/** The big visual on the floating card: the item itself, in its own shape. */
function Visual({ p, max, compact = false }: { p: ItemPreviewData; max: number; compact?: boolean }) {
  const base = p.kind.replace(/^multi:/, '');
  const tint = KIND_TINT[base] ?? '#8E8E93';

  if (p.thumb) {
    const s = fit(p.width, p.height, max);
    const page = base === 'pdf' || base === 'doc' || base === 'sheet' || base === 'slides';
    return (
      <div className="relative" style={{ width: s.w, height: s.h }}>
        <img
          src={p.thumb}
          alt=""
          draggable={false}
          width={s.w}
          height={s.h}
          className={`block w-full h-full object-cover ${page ? 'rounded-[6px] ring-1 ring-black/10 bg-white' : 'rounded-[14px]'}`}
        />
        {base === 'video' && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center ring-1 ring-white/40">
              <Play size={20} fill="currentColor" className="ml-0.5" />
            </span>
          </span>
        )}
        {p.ext && base !== 'image' && (
          <span className="absolute left-2 bottom-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ background: tint }}>
            {p.ext}
          </span>
        )}
      </div>
    );
  }

  if (base === 'folder') {
    const w = Math.min(max, 190);
    return (
      <div style={{ width: w }} className="flex flex-col gap-2">
        <svg viewBox="0 0 190 130" width={w} height={(w * 130) / 190} aria-hidden="true">
          <defs>
            <linearGradient id="pd-fold-back" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6FC3FF" />
              <stop offset="1" stopColor="#2F8EF5" />
            </linearGradient>
            <linearGradient id="pd-fold-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8FD3FF" />
              <stop offset="1" stopColor="#3A9BFF" />
            </linearGradient>
          </defs>
          <path d="M8 22a10 10 0 0 1 10-10h46l14 14h94a10 10 0 0 1 10 10v80a10 10 0 0 1-10 10H18a10 10 0 0 1-10-10z" fill="url(#pd-fold-back)" />
          {/* sheets peeking out */}
          <rect x="30" y="30" width="110" height="60" rx="5" fill="#fff" opacity="0.95" transform="rotate(-4 85 60)" />
          <rect x="48" y="34" width="110" height="60" rx="5" fill="#F2F2F7" transform="rotate(3 103 64)" />
          <path d="M8 50a10 10 0 0 1 10-10h154a10 10 0 0 1 10 10v66a10 10 0 0 1-10 10H18a10 10 0 0 1-10-10z" fill="url(#pd-fold-front)" />
        </svg>
        {!compact && p.children.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-[11.5px] text-[#3A3A3C]">
            {p.children.slice(0, 4).map((c) => (
              <li key={c} className="flex items-center gap-1.5 min-w-0">
                {c.endsWith('/') ? <Folder size={12} className="text-[#2F8EF5] shrink-0" fill="currentColor" /> : <File size={12} className="text-[#8E8E93] shrink-0" />}
                <span className="truncate">{c.replace(/\/$/, '')}</span>
              </li>
            ))}
            {p.childCount > 4 && <li className="text-[#8E8E93]">+ {p.childCount - 4} more</li>}
          </ul>
        )}
      </div>
    );
  }

  if (base === 'link') {
    const letter = (p.host || '?').charAt(0).toUpperCase();
    return (
      <div className="flex items-center gap-3" style={{ width: Math.min(max + 60, 260) }}>
        <span className="w-14 h-14 rounded-[16px] shrink-0 flex items-center justify-center text-white text-[24px] font-bold bg-gradient-to-br from-[#5AC8FA] to-[#007AFF] shadow-[0_6px_16px_rgba(0,122,255,0.35)]">
          {p.host ? letter : <Globe size={26} />}
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-[#1D1D1F] truncate">{p.host || 'Link'}</div>
          <div className="text-[11.5px] text-[#6C6C70] break-all line-clamp-2">{p.lines[0]}</div>
        </div>
      </div>
    );
  }

  if (base === 'text' || base === 'code' || base === 'note') {
    const w = Math.min(max + 20, 230);
    const mono = base === 'code';
    return (
      <div
        className={`relative overflow-hidden rounded-[10px] ${base === 'note' ? 'bg-[#FFF9DB]' : 'bg-white'} ring-1 ring-black/10 px-3 pt-2.5 pb-3`}
        style={{ width: w, height: Math.round(w * 0.72) }}
      >
        <div className={`flex flex-col gap-[3px] text-[10.5px] leading-[14px] text-[#3A3A3C] ${mono ? 'font-mono' : ''}`}>
          {(p.lines.length ? p.lines : ['(empty)']).map((l, i) => (
            <div key={i} className={`whitespace-pre truncate ${i === 0 && !mono ? 'font-semibold text-[#1D1D1F]' : ''}`}>
              {l}
            </div>
          ))}
        </div>
        <div className={`absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t ${base === 'note' ? 'from-[#FFF9DB]' : 'from-white'} to-transparent`} />
        {p.ext && (
          <span className="absolute right-2 bottom-2 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold text-white bg-[#8E8E93]">{p.ext}</span>
        )}
      </div>
    );
  }

  // No thumbnail: a document tile in the kind's colour with its extension.
  const Icon = base === 'audio' ? Music : base === 'archive' ? Archive : base === 'app' ? AppWindow : base === 'video' ? Play : FileText;
  const w = Math.min(max, 120);
  return (
    <div
      className="relative rounded-[16px] flex flex-col items-center justify-center gap-1.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
      style={{ width: w, height: Math.round(w * 1.2), background: `linear-gradient(160deg, ${tint}CC, ${tint})` }}
    >
      <Icon size={34} strokeWidth={1.8} />
      {p.ext && <span className="text-[13px] font-bold tracking-wide">{p.ext}</span>}
    </div>
  );
}

/**
 * The floating card that rides under your fingers: the item's real look (photo, video frame,
 * PDF page, folder, first lines, link…) on a white card, Apple-style.
 */
export function ItemPreview({
  p,
  title,
  subtitle,
  hint,
  size = 'icon',
}: {
  p: ItemPreviewData;
  title: string;
  subtitle: string;
  hint?: string;
  /** icon: about the size of a desktop icon (the card under your fingers). big: the send animation. */
  size?: 'icon' | 'big';
}) {
  const multi = p.kind.startsWith('multi:');
  if (size === 'icon') {
    // Drawn at full size, then zoomed down so every kind keeps its proportions at icon scale.
    return (
      <div className="relative w-[112px]">
        {multi && (
          <>
            <div className="absolute inset-0 rounded-[14px] bg-white/90 shadow-[0_6px_16px_rgba(0,0,0,0.18)] -rotate-[6deg]" />
            <div className="absolute inset-0 rounded-[14px] bg-[#F5F5F7] shadow-[0_6px_16px_rgba(0,0,0,0.14)] rotate-[5deg]" />
          </>
        )}
        <div className="relative rounded-[14px] bg-white/95 p-1.5 pb-1 shadow-[0_12px_30px_rgba(0,0,0,0.28),0_1px_4px_rgba(0,0,0,0.12)] ring-1 ring-black/5 flex flex-col items-center">
          <div className="h-[64px] flex items-center justify-center overflow-hidden">
            <div style={{ zoom: 64 / 200 }}>
              <Visual p={p} max={200} compact />
            </div>
          </div>
          <div className="w-full pt-1 text-center leading-tight">
            <div className="text-[11.5px] font-semibold text-[#1D1D1F] truncate">{title}</div>
            <div className="text-[10px] text-[#6C6C70] truncate">{subtitle}</div>
          </div>
          {multi && (
            <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FFC53D] text-[#15130F] text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
              {p.childCount}
            </span>
          )}
        </div>
        {hint && <div className="mt-1 text-center text-[10px] font-medium text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{hint}</div>}
      </div>
    );
  }
  return (
    <div className="relative">
      {multi && (
        <>
          <div className="absolute inset-0 rounded-[22px] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.18)] -rotate-[5deg] translate-x-[-6px]" />
          <div className="absolute inset-0 rounded-[22px] bg-[#F5F5F7] shadow-[0_10px_30px_rgba(0,0,0,0.14)] rotate-[4deg] translate-x-[6px]" />
        </>
      )}
      <div className="relative rounded-[22px] bg-white p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.30),0_2px_8px_rgba(0,0,0,0.12)] ring-1 ring-black/5 flex flex-col items-center">
        <div className="flex items-center justify-center p-1">
          <Visual p={p} max={200} />
        </div>
        <div className="w-full max-w-[240px] px-1.5 pt-2 pb-0.5 text-center">
          <div className="text-[14px] font-semibold text-[#1D1D1F] truncate">{title}</div>
          <div className="text-[11.5px] text-[#6C6C70] truncate">{subtitle}</div>
          {hint && <div className="text-[11.5px] font-medium text-[#B07400] mt-0.5">{hint}</div>}
        </div>
        {multi && (
          <span className="absolute -top-2 -right-2 min-w-7 h-7 px-2 rounded-full bg-[#FFC53D] text-[#15130F] text-[13px] font-bold flex items-center justify-center ring-[3px] ring-white">
            {p.childCount}
          </span>
        )}
      </div>
    </div>
  );
}

/** A small square version for the Island: the thumbnail if there is one, else the kind's tile. */
export function ItemThumb({ p, size = 44 }: { p: ItemPreviewData | undefined; size?: number }) {
  if (!p) return null;
  const base = p.kind.replace(/^multi:/, '');
  if (p.thumb) {
    const s = fit(p.width, p.height, size);
    return (
      <span className="shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
        <img src={p.thumb} alt="" width={s.w} height={s.h} className="rounded-[8px] ring-1 ring-white/15 object-cover" style={{ width: s.w, height: s.h }} />
      </span>
    );
  }
  const tint = base === 'folder' ? '#2F8EF5' : base === 'link' ? '#007AFF' : KIND_TINT[base] ?? '#8E8E93';
  const Icon = base === 'folder' ? Folder : base === 'link' ? Globe : base === 'audio' ? Music : base === 'archive' ? Archive : base === 'app' ? AppWindow : FileText;
  return (
    <span className="shrink-0 rounded-[10px] flex items-center justify-center text-white" style={{ width: size, height: size, background: tint }}>
      <Icon size={size * 0.5} fill={base === 'folder' ? 'currentColor' : 'none'} />
    </span>
  );
}

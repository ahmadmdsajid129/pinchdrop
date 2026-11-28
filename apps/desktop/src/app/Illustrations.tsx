import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  Camera,
  Check,
  Clipboard,
  FileText,
  FolderOpen,
  Hand,
  Image as ImageIcon,
  Keyboard,
  Laptop,
  MessageSquare,
  MousePointerClick,
  Phone,
  Share2,
  Smartphone,
  Upload,
  Wifi,
} from 'lucide-react';

/**
 * v2 · The welcome / guide artwork, drawn with HTML + CSS (no image files, works offline).
 * A file lifts off the laptop in a pinched hand, arcs over and lands in the phone. Loops.
 */
export function FlyHero({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`relative w-[460px] max-w-full ${compact ? 'h-[200px] scale-[0.8] origin-top' : 'h-[240px]'} select-none`}
    >
      {/* soft background glow */}
      <div className="absolute inset-0 rounded-[40px] bg-[radial-gradient(ellipse_at_center,rgb(var(--primary)/0.14),transparent_70%)]" />
      {/* Laptop */}
      <div className="absolute left-[18px] bottom-[34px]">
        <div className="w-[190px] h-[120px] rounded-[12px] border-[6px] border-text/85 bg-surface flex items-center justify-center overflow-hidden">
          <div className="grid grid-cols-3 gap-2 opacity-80">
            {[FolderOpen, ImageIcon, FileText, ImageIcon, FolderOpen, FileText].map((I, i) => (
              <span key={i} className={`w-9 h-9 rounded-lg flex items-center justify-center ${i === 1 ? 'bg-primary/15 text-primary-ink ring-2 ring-primary' : 'bg-bg2 text-muted'}`}>
                <I size={16} />
              </span>
            ))}
          </div>
        </div>
        <div className="w-[220px] -ml-[15px] h-[10px] rounded-b-[10px] bg-text/85" />
        {/* webcam dot */}
        <span className="absolute top-[2px] left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-success" />
      </div>
      {/* Phone */}
      <div className="absolute right-[26px] bottom-[30px] pd-glow rounded-[20px]">
        <div className="w-[78px] h-[146px] rounded-[20px] border-[5px] border-text/85 bg-surface flex flex-col items-center justify-center gap-1">
          <span className="pd-land w-9 h-9 rounded-full bg-success text-white flex items-center justify-center">
            <Check size={20} strokeWidth={3} />
          </span>
        </div>
      </div>
      {/* The file in the air */}
      <div className="absolute left-[92px] top-[64px] pd-fly">
        <div className="w-[46px] h-[56px] rounded-[12px] bg-[#FFC53D] text-[#15130F] flex items-center justify-center shadow-[0_10px_24px_rgba(255,197,61,0.4)]">
          <ImageIcon size={22} />
        </div>
      </div>
      {/* The hand that carries it */}
      <div className="absolute left-[118px] top-[100px] pd-hand text-primary-ink">
        <Hand size={34} strokeWidth={2.2} />
      </div>
    </div>
  );
}

/** A small step card with an icon bubble. */
function StepCard({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5 p-4 rounded-2xl bg-surface border border-line">
      <span className="relative w-11 h-11 shrink-0 rounded-xl bg-primary/10 text-primary-ink flex items-center justify-center">
        {icon}
        <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">{n}</span>
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-[15px]">{title}</div>
        <div className="text-[13px] text-muted leading-relaxed mt-0.5">{children}</div>
      </div>
    </li>
  );
}

const PC_GUIDE: { icon: ReactNode; title: string; body: ReactNode }[] = [
  { icon: <MousePointerClick size={20} />, title: 'The pill', body: <>The small pill at the top of your screen shows your phones. <b className="text-text">Click</b> it to open the Island (calls, messages, music, photos). <b className="text-text">Double-click</b> opens this window, <b className="text-text">drag</b> moves it.</> },
  { icon: <Hand size={20} />, title: 'Pinch to grab', body: <>Select files in Explorer, then <b className="text-text">pinch</b> (thumb + index) in front of the webcam. The camera wakes up when you click the pill or press <b className="text-text">Ctrl + Shift + Space</b>.</> },
  { icon: <Smartphone size={20} />, title: 'Open your hand over the phone', body: <>Move your pinched hand towards the top of the screen and <b className="text-text">open it</b>. The phone shows its catch screen: hold your open hand over it and the file lands.</> },
  { icon: <Upload size={20} />, title: 'Send without gestures', body: <>Drag files onto this window, or right-click any file → <b className="text-text">Send to → PinchDrop</b>. Drop on a phone's chip to pick the phone.</> },
  { icon: <Phone size={20} />, title: 'Calls', body: <>When a phone rings, the pill shows the caller. <b className="text-text">Hold your palm</b> still to answer, <b className="text-text">swipe</b> to reject, <b className="text-text">hold a fist</b> to silence. Or click.</> },
  { icon: <MessageSquare size={20} />, title: 'Messages and notifications', body: <>Reply from the pill or the Messages page. Notifications wait in the Notifications page until you open, reply to or clear them.</> },
  { icon: <FolderOpen size={20} />, title: 'Phone files', body: <>Browse each phone's folders, drag files between phones, or drop files from Explorer straight into a phone folder.</> },
  { icon: <Clipboard size={20} />, title: 'Clipboard', body: <>Turn on Clipboard sync in Settings: copy on one, paste on the other. Codes from texts are copied for you.</> },
];

const PHONE_GUIDE: { icon: ReactNode; title: string; body: ReactNode }[] = [
  { icon: <Smartphone size={20} />, title: 'Install the phone app', body: <>Install <b className="text-text">PinchDrop</b> on your Android phone and open it. It shows a short setup.</> },
  { icon: <Wifi size={20} />, title: 'Pair once', body: <>On this PC open <b className="text-text">Devices → Pair a new phone</b> and scan the QR code with the phone. After that they find each other on the same Wi-Fi by themselves.</> },
  { icon: <Camera size={20} />, title: 'Catch with your hand', body: <>When the PC sends, the phone's camera turns on for a moment. Hold your <b className="text-text">open hand</b> over it to catch, or tap Accept.</> },
  { icon: <Share2 size={20} />, title: 'Send from the phone', body: <>In any app tap <b className="text-text">Share → PinchDrop</b>, pinch the screen to lift it, then open your hand at the PC (or click Catch on the pill).</> },
  { icon: <Bell size={20} />, title: 'Turn on what you want', body: <>In the phone app, <b className="text-text">Settings → Features</b>: notifications, messages, calls, photos, files and Find my phone. Each is optional.</> },
  { icon: <Keyboard size={20} />, title: 'Where things go', body: <>Photos and videos land in the Gallery (PinchDrop album), everything else in <b className="text-text">Downloads/PinchDrop</b>. All are listed under Received.</> },
];

/** v2 · How to use PinchDrop, on the PC and on the phone (setup's last step and the Guide page). */
export function Guide({ initial = 'pc' }: { initial?: 'pc' | 'phone' }) {
  const [tab, setTab] = useState<'pc' | 'phone'>(initial);
  const list = tab === 'pc' ? PC_GUIDE : PHONE_GUIDE;
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Guide for" className="inline-flex self-start p-1 rounded-full bg-bg2 gap-1">
        {(
          [
            ['pc', 'On this PC', <Laptop key="l" size={15} />],
            ['phone', 'On your phone', <Smartphone key="s" size={15} />],
          ] as const
        ).map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-9 px-4 rounded-full text-[13px] font-semibold inline-flex items-center gap-2 transition-colors ${
              tab === k ? 'bg-surface text-text shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'text-muted hover:text-soft'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <ol key={tab} className="m-0 p-0 list-none grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 animate-[pd-page_200ms_cubic-bezier(0.2,0,0,1)]">
        {list.map((s, i) => (
          <StepCard key={s.title} n={i + 1} icon={s.icon} title={s.title}>
            {s.body}
          </StepCard>
        ))}
      </ol>
    </div>
  );
}

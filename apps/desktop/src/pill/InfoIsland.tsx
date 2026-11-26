import { motion } from 'framer-motion';
import { BatteryFull, BatteryLow, ClipboardCheck, KeyRound } from 'lucide-react';

/** v2 · Something small to tell: a one-time code copied, battery low / full, clipboard arrived. */
export type Info =
  | { kind: 'otp'; code: string; from: string; deviceName: string }
  | { kind: 'battery_low' | 'battery_full'; level: number; deviceName: string }
  | { kind: 'clip'; deviceName: string; chars: number };

export function InfoIsland({ info, width, showDevice }: { info: Info; width: number; showDevice: boolean }) {
  let icon: React.ReactNode;
  let tint: string;
  let title: string;
  let sub: string;
  switch (info.kind) {
    case 'otp':
      icon = <KeyRound size={20} />;
      tint = 'bg-[#0A84FF]';
      title = `Code ${info.code} · copied`;
      sub = `Paste it anywhere (Ctrl+V)${info.from ? ` · from ${info.from}` : ''}${showDevice ? ` · ${info.deviceName}` : ''}`;
      break;
    case 'battery_low':
      icon = <BatteryLow size={20} />;
      tint = 'bg-[#FF453A]';
      title = `${info.deviceName} at ${info.level}%`;
      sub = 'Battery low. Plug it in soon.';
      break;
    case 'battery_full':
      icon = <BatteryFull size={20} />;
      tint = 'bg-[#30D158]';
      title = `${info.deviceName} is fully charged`;
      sub = 'You can unplug it.';
      break;
    case 'clip':
      icon = <ClipboardCheck size={20} />;
      tint = 'bg-[#5E5CE6]';
      title = `Copied from ${info.deviceName}`;
      sub = `${info.chars} character${info.chars === 1 ? '' : 's'} · paste with Ctrl+V`;
      break;
  }
  return (
    <section aria-live="polite" style={{ width }} className="p-4 flex items-center gap-3 text-text">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
        className={`w-10 h-10 rounded-full ${tint} text-white flex items-center justify-center shrink-0`}
      >
        {icon}
      </motion.span>
      <div className="min-w-0">
        <div className={`font-semibold ${info.kind === 'otp' ? 'text-[17px] tabular-nums tracking-wide' : 'text-[15px]'} truncate`}>{title}</div>
        <div className="text-[12px] text-muted truncate">{sub}</div>
      </div>
    </section>
  );
}

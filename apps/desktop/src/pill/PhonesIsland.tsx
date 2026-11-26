import { motion } from 'framer-motion';
import { Check, MessageSquare, PhoneMissed, Smartphone } from 'lucide-react';
import { Battery } from '../shared/Battery';
import type { PhoneLive, PhoneStatus } from '../shared/types';

/**
 * v2 · "+1 ⌄" on the pill: every connected phone, with battery, unread texts and missed calls.
 * Tap one and the pill shows it (its badge, Messages, Contacts follow).
 */
export function PhonesIsland({
  phone,
  lives,
  width,
  onPick,
}: {
  phone: PhoneStatus;
  lives: PhoneLive[];
  width: number;
  onPick: (id: string) => void;
}) {
  const rows = [
    { id: phone.deviceId ?? '', name: phone.name ?? 'Phone', battery: phone.battery, charging: phone.charging, current: true },
    ...(phone.others ?? []).map((o) => ({ ...o, current: false })),
  ];
  return (
    <section aria-label="Your phones" style={{ width }} className="p-3 flex flex-col gap-1 text-text">
      <div className="px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Your phones</div>
      {rows.map((r, i) => {
        const live = lives.find((l) => l.deviceId === r.id);
        return (
          <motion.button
            key={r.id || i}
            type="button"
            onClick={() => onPick(r.id)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.04 * i } }}
            className={`flex items-center gap-3 px-2.5 py-2.5 rounded-[16px] text-left transition-colors ${r.current ? 'bg-white/[0.08]' : 'hover:bg-white/[0.06]'}`}
          >
            <span className={`w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 ${r.current ? 'bg-[#0A84FF] text-white' : 'bg-white/[0.08] text-soft'}`}>
              <Smartphone size={19} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14.5px] font-semibold truncate">{r.name}</span>
              <span className="flex items-center gap-2.5 text-[12px] text-muted">
                {r.battery != null && (
                  <span className="inline-flex items-center gap-1">
                    <Battery level={r.battery} charging={r.charging} size={14} />
                    {r.battery}%
                  </span>
                )}
                {live && live.unread > 0 && (
                  <span className="inline-flex items-center gap-1 text-[#64B5FF]">
                    <MessageSquare size={12} /> {live.unread > 9 ? '9+' : live.unread}
                  </span>
                )}
                {live?.missed && (
                  <span className="inline-flex items-center gap-1 text-[#FF6961]">
                    <PhoneMissed size={12} /> {live.missed}
                  </span>
                )}
              </span>
            </span>
            {r.current ? (
              <span className="text-[11px] font-semibold text-[#64B5FF] inline-flex items-center gap-1">
                <Check size={14} strokeWidth={3} /> On the pill
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-soft">Show</span>
            )}
          </motion.button>
        );
      })}
    </section>
  );
}

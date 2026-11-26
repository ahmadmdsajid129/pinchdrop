import { motion } from 'framer-motion';
import { Smartphone } from 'lucide-react';
import { useDevices } from '../shared/api';
import { Battery } from '../shared/Battery';

/** The connected phones (not paired PCs). */
export function useConnectedPhones() {
  return useDevices().filter((d) => d.connected && d.model !== 'Windows PC');
}

/**
 * v2 · Pick a phone when more than one is connected (Home, Messages, Contacts). A sliding
 * highlight, each phone with its battery. Renders nothing with one phone.
 */
export function PhoneChips({ value, onChange, layoutId = 'phone-chip' }: { value: string | null; onChange: (id: string) => void; layoutId?: string }) {
  const phones = useConnectedPhones();
  if (phones.length < 2) return null;
  const current = value ?? phones[0].id;
  return (
    <div role="radiogroup" aria-label="Which phone" className="inline-flex p-1 rounded-full bg-bg2 gap-1">
      {phones.map((p) => {
        const on = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p.id)}
            className={`relative h-9 px-3.5 rounded-full text-[13px] font-semibold inline-flex items-center gap-2 transition-colors ${on ? 'text-text' : 'text-muted hover:text-soft'}`}
          >
            {on && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.10)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              <Smartphone size={14} aria-hidden="true" />
              {p.name}
              {p.battery != null && (
                <span className="inline-flex items-center gap-0.5 text-[11.5px] font-medium text-muted">
                  <Battery level={p.battery} charging={p.charging} size={13} />
                  {p.battery}%
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

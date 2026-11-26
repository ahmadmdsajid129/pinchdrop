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
export function PhoneChips({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const phones = useConnectedPhones();
  if (phones.length < 2) return null;
  const current = value ?? phones[0].id;
  return (
    <div role="radiogroup" aria-label="Which phone" className="flex w-full max-w-[520px] p-1 rounded-full bg-bg2 gap-1">
      {phones.map((p) => {
        const on = p.id === current;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(p.id)}
            className={`relative flex-1 min-w-0 h-9 px-3 rounded-full text-[13px] font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${on ? 'text-text' : 'text-muted hover:text-soft'}`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-full transition-all duration-200 ${on ? 'bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.10)] opacity-100' : 'opacity-0'}`}
            />
            <span className="relative flex items-center gap-2 min-w-0">
              <Smartphone size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{p.name}</span>
              {p.battery != null && (
                <span className="shrink-0 inline-flex items-center gap-0.5 text-[11.5px] font-medium text-muted">
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

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export function Card({ children, className = '', as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' } & Record<string, unknown>) {
  return (
    <Tag className={`rounded-[22px] bg-surface border border-line/70 shadow-[var(--shadow)] ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110 shadow-[0_1px_2px_rgba(0,0,0,0.08)] disabled:opacity-50',
  secondary: 'bg-surface2 text-text hover:bg-line/70 disabled:opacity-50',
  ghost: 'bg-transparent text-soft hover:text-text hover:bg-surface2 disabled:opacity-50',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10 disabled:opacity-50',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px]' : size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-[14px]';
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none transition-[background-color,border-color,color,transform,filter] duration-150 ease-out active:scale-[0.97] disabled:active:scale-100 disabled:cursor-not-allowed ${sz} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Accessible on/off switch (a real checkbox with role="switch"). */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`relative inline-flex items-center shrink-0 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="w-11 h-6 rounded-full bg-surface2 border border-line peer-checked:bg-primary peer-checked:border-primary transition-colors duration-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
      <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.3,1.4,0.6,1)] peer-checked:translate-x-5 peer-active:scale-x-110" />
    </label>
  );
}

/**
 * A designed dropdown (replaces the plain Windows one): rounded button, a soft popover list
 * with a check on the chosen item; keyboard: ↑ ↓ Enter Esc.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!open) return setOpen(true);
            setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            pick(active);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        className={`h-9 pl-3.5 pr-2.5 rounded-full bg-bg2 hover:bg-surface2 text-text text-[13px] font-medium inline-flex items-center gap-1.5 transition disabled:opacity-50 ${
          open ? 'ring-2 ring-primary/40' : ''
        }`}
      >
        <span className="truncate max-w-[160px]">{current?.label ?? '—'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="absolute z-50 right-0 mt-1.5 min-w-[170px] max-h-[280px] overflow-auto p-1.5 rounded-[16px] bg-surface border border-line/70 shadow-[0_18px_50px_rgba(0,0,0,0.18)] origin-top-right animate-[pd-pop_140ms_ease-out]"
        >
          {options.map((o, i) => {
            const chosen = o.value === value;
            return (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={chosen}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(i);
                }}
                className={`flex items-center gap-2 h-9 px-3 rounded-[10px] text-[13px] cursor-default select-none ${
                  i === active ? 'bg-bg2' : ''
                } ${chosen ? 'font-semibold text-text' : 'text-soft'}`}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {chosen && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="text-primary" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A small styled label that appears beside an element on hover (wrap the element; needs a relative parent). */
export function HoverTip({ text, side = 'right' }: { text: string; side?: 'right' | 'bottom' }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 whitespace-nowrap px-2.5 py-1 rounded-full bg-[#1D1D1F] text-white text-[12px] font-medium shadow-[0_8px_24px_rgba(0,0,0,0.22)] opacity-0 scale-95 transition duration-150 group-hover:opacity-100 group-hover:scale-100 group-focus-visible:opacity-100 ${
        side === 'right' ? 'left-full top-1/2 -translate-y-1/2 ml-2.5 origin-left' : 'top-full left-1/2 -translate-x-1/2 mt-2 origin-top'
      }`}
    >
      {text}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 p-1 rounded-xl bg-bg2 border border-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-7 min-w-9 px-3 rounded-lg text-[13px] font-semibold ${value === o.value ? 'bg-primary text-white' : 'text-soft hover:text-text'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One line in a settings card: title + optional description on the left, control on the right. */
export function Row({ title, description, children, last }: { title: ReactNode; description?: ReactNode; children?: ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center gap-4 py-3.5 ${last ? '' : 'border-b border-surface2'}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] text-text">{title}</div>
        {description && <div className="text-[12px] text-muted mt-0.5">{description}</div>}
      </div>
      {children}
    </div>
  );
}

export function Radio({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex gap-2.5 items-start text-[14px] text-soft cursor-pointer">
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[rgb(var(--primary))]" />
      <span>{children}</span>
    </label>
  );
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="m-0 font-display text-[26px] font-semibold">{children}</h1>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Marks something that's designed but only becomes real in a later build phase. */
export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-md bg-warn/15 text-warn text-[11px] font-bold whitespace-nowrap">
      Coming in Phase {phase}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-12 px-6">
      <div className="w-14 h-14 rounded-2xl bg-surface2 text-primary-ink flex items-center justify-center">{icon}</div>
      <div className="font-display text-[18px] font-semibold">{title}</div>
      {children && <div className="text-[14px] text-muted max-w-md">{children}</div>}
      {action}
    </div>
  );
}

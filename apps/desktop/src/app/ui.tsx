import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export function Card({ children, className = '', as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' } & Record<string, unknown>) {
  return (
    <Tag className={`rounded-[20px] bg-surface border border-line ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110 disabled:opacity-50',
  secondary: 'bg-surface2 text-text border border-line hover:border-primary/60 disabled:opacity-50',
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed ${sz} ${VARIANTS[variant]} ${className}`}
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
      <span className="w-11 h-6 rounded-full bg-surface2 border border-line peer-checked:bg-primary peer-checked:border-primary transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent" />
      <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition peer-checked:translate-x-5" />
    </label>
  );
}

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
  return (
    <select
      aria-label={label}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => {
        const found = options.find((o) => String(o.value) === e.target.value);
        if (found) onChange(found.value);
      }}
      className="h-9 px-3 rounded-xl bg-bg2 border border-line text-text text-[13px] disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
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

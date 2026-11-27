import { useId, useRef } from 'react';
import type { ReactNode, PointerEvent } from 'react';

/**
 * The PinchDrop "pass": a printed ticket instead of a gradient banner. Warm paper, mono ticket
 * labels, a perforated tear line with punched notches, a stub with one big number and an ink
 * stamp, and a drop that travels the dashed route from one end to the other.
 * Used for Pro, Huddle and the upgrade prompt.
 */
export type PassField = { k: string; v: ReactNode };

export function Pass({
  eyebrow,
  serial,
  title,
  subtitle,
  from,
  to,
  fields = [],
  stubValue,
  stubLabel,
  stamp,
  punches,
  action,
  footer,
  tone = 'amber',
  compact = false,
}: {
  eyebrow: string;
  serial?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  from?: PassField;
  to?: PassField;
  fields?: PassField[];
  stubValue?: ReactNode;
  stubLabel?: string;
  stamp?: string;
  /** A row of punched holes: `left` of `total` still open (e.g. trial days). */
  punches?: { total: number; left: number };
  action?: ReactNode;
  footer?: ReactNode;
  tone?: 'amber' | 'blue' | 'green';
  compact?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // A gentle tilt toward the pointer, like holding a real ticket.
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || reduced) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 3).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 4).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  const hasStub = stubValue != null || stamp || action;
  return (
    <section ref={ref} className={`pd-pass pd-pass-${tone} ${compact ? 'pd-pass-compact' : ''}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="pd-pass-body">
        <div className="pd-pass-main">
          <div className="pd-pass-top">
            <span className="pd-pass-eyebrow">
              <span className="pd-pass-dot" aria-hidden="true" />
              {eyebrow}
            </span>
            {serial && <span className="pd-pass-serial">{serial}</span>}
          </div>
          <div className="pd-pass-title">{title}</div>
          {subtitle && <div className="pd-pass-sub">{subtitle}</div>}
          {(from || to) && <PassRoute from={from} to={to} still={reduced} />}
          {fields.length > 0 && (
            <dl className="pd-pass-fields">
              {fields.map((f) => (
                <div key={f.k}>
                  <dt>{f.k}</dt>
                  <dd>{f.v}</dd>
                </div>
              ))}
            </dl>
          )}
          {punches && (
            <div className="pd-pass-punches" aria-label={`${punches.left} of ${punches.total} left`}>
              {Array.from({ length: punches.total }, (_, i) => (
                <span key={i} className={i < punches.left ? 'on' : ''} style={{ animationDelay: `${300 + i * 70}ms` }} />
              ))}
            </div>
          )}
          {footer && <div className="pd-pass-footer">{footer}</div>}
        </div>
        {hasStub && (
          <div className="pd-pass-stub">
            {stamp && <Stamp text={stamp} still={reduced} />}
            {stubValue != null && <div className="pd-pass-big">{stubValue}</div>}
            {stubLabel && <div className="pd-pass-biglabel">{stubLabel}</div>}
            {action && <div className="pd-pass-action">{action}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

/** FROM ——◦—— TO with a drop travelling the dashed arc. */
function PassRoute({ from, to, still }: { from?: PassField; to?: PassField; still: boolean }) {
  const id = useId().replace(/:/g, '');
  const d = 'M8 30 C 70 -2, 170 -2, 232 30';
  return (
    <div className="pd-pass-route">
      {from && (
        <div className="pd-pass-end">
          <span>{from.k}</span>
          <b>{from.v}</b>
        </div>
      )}
      <svg viewBox="0 0 240 36" className="pd-pass-arc" aria-hidden="true">
        <path id={`r${id}`} d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 5" strokeLinecap="round" />
        <circle cx="8" cy="30" r="3.5" className="pd-pass-node" />
        <circle cx="232" cy="30" r="3.5" className="pd-pass-node" />
        <g className="pd-pass-drop">
          <path d="M0 -9 C 0 -9 -6 -2 -6 2 A 6 6 0 0 0 6 2 C 6 -2 0 -9 0 -9 Z" />
          {!still && <animateMotion dur="3.4s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.72;1" calcMode="spline" keySplines="0.5 0 0.2 1;0 0 1 1">
            <mpath href={`#r${id}`} />
          </animateMotion>}
        </g>
      </svg>
      {to && (
        <div className="pd-pass-end pd-pass-end-r">
          <span>{to.k}</span>
          <b>{to.v}</b>
        </div>
      )}
    </div>
  );
}

/** A round ink stamp with the word in the middle and text running round the rim. */
function Stamp({ text, still }: { text: string; still: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className="pd-pass-stamp" aria-hidden="true">
      <svg viewBox="0 0 100 100" className={still ? '' : 'pd-pass-stamp-spin'}>
        <defs>
          <path id={`c${id}`} d="M50 50 m -36 0 a 36 36 0 1 1 72 0 a 36 36 0 1 1 -72 0" />
        </defs>
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <text fontSize="9.2" letterSpacing="2.4" fontWeight="700" fill="currentColor">
          <textPath href={`#c${id}`}>PINCHDROP · PINCH · DROP · PINCHDROP ·</textPath>
        </text>
      </svg>
      <span>{text}</span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { onEvent } from '../shared/api';
import { markOverlayBusy } from './busy';

/**
 * v2 Pro · Edge lighting: when a call or message comes in, the screen's edges glow in the
 * event's colour and a bright streak runs once around the border, like a phone's edge lighting.
 * Click-through, shown for ~1.6 s (the pill repeats it while a call rings).
 */
type Glow = { kind: 'call' | 'message' | 'sms'; at: number };

const COLORS: Record<Glow['kind'], string> = {
  call: '#30D158',
  message: '#0A84FF',
  sms: '#FFB020',
};

export function EdgeGlow() {
  const [glow, setGlow] = useState<Glow | null>(null);
  useEffect(() => {
    const off = onEvent<Glow>('edge-glow', (g) => {
      markOverlayBusy(2500);
      setGlow(g);
    });
    return () => void off.then((u) => u());
  }, []);
  useEffect(() => {
    if (!glow) return;
    const t = window.setTimeout(() => setGlow(null), 1600);
    return () => window.clearTimeout(t);
  }, [glow]);
  if (!glow) return null;
  const c = COLORS[glow.kind] ?? COLORS.message;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div key={glow.at} className="pd-edge fixed inset-0 pointer-events-none" style={{ ['--edge' as string]: c }} aria-hidden="true">
      <div className="pd-edge-halo absolute inset-0" />
      {!reduced && (
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <filter id="pd-edge-blur" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          {/* the soft glow under the streak, then the streak itself */}
          <rect className="pd-edge-run" x="3" y="3" style={{ width: 'calc(100% - 6px)', height: 'calc(100% - 6px)' }} rx="14" pathLength={100} filter="url(#pd-edge-blur)" strokeWidth="16" />
          <rect className="pd-edge-run" x="3" y="3" style={{ width: 'calc(100% - 6px)', height: 'calc(100% - 6px)' }} rx="14" pathLength={100} strokeWidth="4" />
        </svg>
      )}
    </div>
  );
}

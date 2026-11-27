/** The PinchDrop mark (same drawing as the app icon): thumb and finger opening over a drop. */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="48 48 928 928" className={className} aria-hidden="true">
      <rect x="48" y="48" width="928" height="928" rx="236" fill="#0A66F0" />
      <g fill="none" stroke="#fff" strokeWidth="88" strokeLinecap="round">
        <path d="M300 196 C 330 300 390 372 466 404" />
        <path d="M724 196 C 694 300 634 372 558 404" />
      </g>
      <path d="M512 486 C 512 486 382 630 382 724 A 130 130 0 0 0 642 724 C 642 630 512 486 512 486 Z" fill="#FFC53D" />
      <path d="M466 700 A 52 52 0 0 0 500 776" fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="22" strokeLinecap="round" />
    </svg>
  );
}

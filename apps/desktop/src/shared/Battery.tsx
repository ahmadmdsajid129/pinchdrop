interface Props {
  level: number; // 0..100
  charging?: boolean;
  size?: number;
  className?: string;
}

/** Battery glyph whose fill matches the level; turns amber under 20%. */
export function Battery({ level, charging = false, size = 18, className = '' }: Props) {
  const clamped = Math.max(0, Math.min(100, level));
  const color = clamped < 20 && !charging ? 'rgb(var(--warn))' : 'rgb(var(--success))';
  const w = Math.max(1.5, (clamped / 100) * 13);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" className={className} aria-hidden="true">
      <rect x="2" y="7" width="18" height="10" rx="2" />
      <path d="M22 11v2" />
      <rect x="4" y="9" width={w} height="6" rx="1" fill={color} stroke="none" />
      {charging && <path d="M11.5 8.5 9 12.5h3l-1.5 3" stroke="rgb(var(--bg))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

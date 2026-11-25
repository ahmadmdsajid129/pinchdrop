import React from 'react';

interface PointerRingProps {
  x: number;
  y: number;
  isGrabbing: boolean;
  holdProgress?: number;
  reducedMotion?: boolean;
}

export const PointerRing: React.FC<PointerRingProps> = ({
  x,
  y,
  isGrabbing,
  holdProgress = 0,
  reducedMotion = false,
}) => {
  return (
    <div
      style={{
        transform: `translate(${x - 24}px, ${y - 24}px)`,
      }}
      className={`fixed top-0 left-0 pointer-events-none z-50 flex items-center justify-center ${
        reducedMotion ? 'transition-none' : 'transition-transform duration-75 ease-out'
      }`}
    >
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
        {/* Background track */}
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          className={isGrabbing ? 'stroke-[#34D399]/30' : 'stroke-[#7C5CFF]/30'}
          strokeWidth="3.5"
        />

        {/* Dynamic fill ring */}
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={isGrabbing ? '#34D399' : '#7C5CFF'}
          strokeWidth="4"
          strokeDasharray="125"
          strokeDashoffset={125 - 125 * (holdProgress > 0 ? holdProgress : isGrabbing ? 1 : 0.2)}
          strokeLinecap="round"
        />
      </svg>

      {/* Center dot */}
      <div
        className={`absolute w-2 h-2 rounded-full ${
          isGrabbing ? 'bg-[#34D399] scale-150' : 'bg-[#22D3EE]'
        } transition-transform`}
      />
    </div>
  );
};


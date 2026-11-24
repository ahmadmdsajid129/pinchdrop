import React from 'react';
import { Smartphone, Inbox, Edit3, Trash2 } from 'lucide-react';

export type ZoneType = 'phone' | 'inbox' | 'rename' | 'trash';

interface ZoneProps {
  type: ZoneType;
  label: string;
  sublabel: string;
  isHovered: boolean;
  isActive: boolean;
  holdProgress?: number; // 0.0 to 1.0
}

export const EdgeZone: React.FC<ZoneProps> = ({
  type,
  label,
  sublabel,
  isHovered,
  holdProgress = 0,
}) => {
  const getZoneStyles = () => {
    switch (type) {
      case 'phone':
        return {
          icon: <Smartphone className="w-6 h-6 text-[#22D3EE]" />,
          border: isHovered ? 'border-[#22D3EE] shadow-[0_0_24px_rgba(34,211,238,0.3)]' : 'border-[#1C2547]',
          bg: isHovered ? 'bg-[#1C2547]/90' : 'bg-[#141B34]/60',
          accent: '#22D3EE',
        };
      case 'inbox':
        return {
          icon: <Inbox className="w-6 h-6 text-[#7C5CFF]" />,
          border: isHovered ? 'border-[#7C5CFF] shadow-[0_0_24px_rgba(124,92,255,0.3)]' : 'border-[#1C2547]',
          bg: isHovered ? 'bg-[#1C2547]/90' : 'bg-[#141B34]/60',
          accent: '#7C5CFF',
        };
      case 'rename':
        return {
          icon: <Edit3 className="w-6 h-6 text-[#FBBF24]" />,
          border: isHovered ? 'border-[#FBBF24] shadow-[0_0_24px_rgba(251,191,36,0.3)]' : 'border-[#1C2547]',
          bg: isHovered ? 'bg-[#1C2547]/90' : 'bg-[#141B34]/60',
          accent: '#FBBF24',
        };
      case 'trash':
        return {
          icon: <Trash2 className="w-6 h-6 text-[#FB7185]" />,
          border: isHovered ? 'border-[#FB7185] shadow-[0_0_24px_rgba(251,113,133,0.3)]' : 'border-[#1C2547]',
          bg: isHovered ? 'bg-[#1C2547]/90' : 'bg-[#141B34]/60',
          accent: '#FB7185',
        };
    }
  };

  const styles = getZoneStyles();

  return (
    <div
      className={`relative w-44 h-32 rounded-3xl border-2 backdrop-blur-md p-4 flex flex-col justify-between transition-all duration-200 select-none ${styles.border} ${styles.bg} ${
        isHovered ? 'scale-105' : 'scale-100'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="p-2.5 rounded-2xl bg-[#0B1020]/60">{styles.icon}</div>
        {holdProgress > 0 && (
          <div className="relative w-6 h-6 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="#1C2547"
                strokeWidth="4"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke={styles.accent}
                strokeWidth="4"
                strokeDasharray="88"
                strokeDashoffset={88 - 88 * holdProgress}
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>

      <div>
        <div className="text-sm font-semibold text-[#E8ECFF]">{label}</div>
        <div className="text-[11px] text-[#8B94B8]">{sublabel}</div>
      </div>
    </div>
  );
};

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Image, Film, File } from 'lucide-react';

export interface FileCardData {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'image' | 'video' | 'doc';
}

interface FileCardProps {
  file: FileCardData;
  isHovered: boolean;
  isGrabbed: boolean;
  position?: { x: number; y: number };
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  isHovered,
  isGrabbed,
}) => {
  const getIcon = () => {
    switch (file.type) {
      case 'image':
        return <Image className="w-6 h-6 text-[#22D3EE]" />;
      case 'video':
        return <Film className="w-6 h-6 text-[#7C5CFF]" />;
      case 'pdf':
        return <FileText className="w-6 h-6 text-[#FB7185]" />;
      default:
        return <File className="w-6 h-6 text-[#34D399]" />;
    }
  };

  return (
    <motion.div
      animate={{
        scale: isGrabbed ? 1.15 : isHovered ? 1.08 : 1.0,
        boxShadow: isGrabbed
          ? '0 16px 36px rgba(124, 92, 255, 0.4)'
          : isHovered
          ? '0 8px 24px rgba(34, 211, 238, 0.2)'
          : '0 4px 12px rgba(0, 0, 0, 0.3)',
      }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className={`w-36 h-28 rounded-2xl p-3 flex flex-col justify-between border select-none transition-colors ${
        isGrabbed
          ? 'bg-[#1C2547] border-[#34D399]'
          : isHovered
          ? 'bg-[#1C2547] border-[#22D3EE]'
          : 'bg-[#141B34] border-[#1C2547]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="p-2 rounded-xl bg-[#0B1020]/50">{getIcon()}</div>
        <span className="text-[10px] font-mono text-[#8B94B8]">{file.size}</span>
      </div>

      <div>
        <div className="text-xs font-semibold text-[#E8ECFF] truncate">{file.name}</div>
        <div className="text-[10px] text-[#22D3EE]">
          {isGrabbed ? 'HELD ✓' : isHovered ? 'Pinch to Grab' : 'Oversized (96px)'}
        </div>
      </div>
    </motion.div>
  );
};

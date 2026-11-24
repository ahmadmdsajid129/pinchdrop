import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw } from 'lucide-react';

interface UndoToastProps {
  visible: boolean;
  message: string;
  remainingSeconds: number;
  onUndo: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  visible,
  message,
  remainingSeconds,
  onUndo,
}) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-4 bg-[#141B34]/95 backdrop-blur-md border border-[#FBBF24]/40 px-6 py-3.5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
        >
          <div className="flex items-center space-x-3">
            {/* Radial countdown ring */}
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  className="stroke-[#1C2547]"
                  strokeWidth="3.5"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  className="stroke-[#FBBF24]"
                  strokeWidth="3.5"
                  strokeDasharray="88"
                  strokeDashoffset={88 - (88 * remainingSeconds) / 8}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[10px] font-mono font-bold text-[#FBBF24]">
                {Math.ceil(remainingSeconds)}s
              </span>
            </div>

            <span className="text-sm font-medium text-[#E8ECFF]">{message}</span>
          </div>

          <button
            onClick={onUndo}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#FBBF24] hover:bg-[#E5AC1C] text-black font-semibold text-xs rounded-xl shadow transition active:scale-95"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>UNDO (8s)</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


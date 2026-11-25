import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Folder, Camera, Wifi, Check, Sparkles, MoveRight, ArrowDown } from 'lucide-react';

interface DynamicIslandProps {
  isArmed: boolean;
  heldItemName?: string | null;
  onDropToPhone?: () => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  isArmed,
  heldItemName = 'CPP (Folder)',
  onDropToPhone,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [simulatedGrab, setSimulatedGrab] = useState(false);
  const [transferred, setTransferred] = useState(false);

  const handlePinchGrab = () => {
    setSimulatedGrab(true);
    setTransferred(false);
  };

  const handleDrop = () => {
    setTransferred(true);
    setTimeout(() => {
      setSimulatedGrab(false);
      setTransferred(false);
      if (onDropToPhone) onDropToPhone();
    }, 2500);
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 select-none">
      <motion.div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        layout
        initial={{ y: -40, opacity: 0 }}
        animate={{
          y: 0,
          opacity: 1,
          width: simulatedGrab ? 520 : isHovered ? 440 : 360,
          height: simulatedGrab ? 84 : 44,
        }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="bg-[#0B1020]/95 backdrop-blur-2xl border border-[#7C5CFF]/50 rounded-full px-5 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-between overflow-hidden"
      >
        {/* State 1: Active Grab (Item Held in Mid-Air) */}
        {simulatedGrab ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-[#7C5CFF]/20 border border-[#7C5CFF]/40 flex items-center justify-center text-[#A78BFA] shadow-inner">
                <Folder className="w-5 h-5 text-[#22D3EE]" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-[#E8ECFF]">{heldItemName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#34D399]/20 text-[#34D399] font-mono font-bold">
                    HELD IN AIR
                  </span>
                </div>
                <p className="text-[10px] text-[#8B94B8]">
                  Laptop camera sees Pinch (G2) · Open hand over phone to drop
                </p>
              </div>
            </div>

            {/* Drop Action Button */}
            <div className="flex items-center space-x-2">
              {transferred ? (
                <div className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/40 text-xs font-bold">
                  <Check className="w-4 h-4" />
                  <span>Dropped to Pixel 9!</span>
                </div>
              ) : (
                <button
                  onClick={handleDrop}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white text-xs font-bold shadow-lg hover:brightness-110 active:scale-95 transition"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Drop to Phone</span>
                </button>
              )}
            </div>
          </motion.div>
        ) : (
          /* State 2: Sleek Idle Island */
          <div className="flex items-center justify-between w-full">
            {/* Left: Camera & Phone Status */}
            <div className="flex items-center space-x-2.5">
              <div className="flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-[#34D399] animate-pulse" />
                <Camera className="w-3.5 h-3.5 text-[#8B94B8]" />
              </div>
              <span className="text-xs font-semibold text-[#E8ECFF]">PinchDrop Island</span>
            </div>

            {/* Middle: Phone Connection */}
            <div className="flex items-center space-x-1.5 text-[11px] text-[#22D3EE] bg-[#141B34] px-2.5 py-1 rounded-full border border-[#1C2547]">
              <Smartphone className="w-3 h-3" />
              <span>Pixel 9 Pro Connected</span>
              <Wifi className="w-3 h-3 text-[#34D399]" />
            </div>

            {/* Right: Quick Grab Trigger */}
            <button
              onClick={handlePinchGrab}
              title="Click to simulate selecting CPP folder on Desktop & pinching in air"
              className="flex items-center space-x-1 text-[10px] font-semibold text-[#A78BFA] hover:text-white bg-[#7C5CFF]/20 hover:bg-[#7C5CFF]/30 px-2 py-1 rounded-lg border border-[#7C5CFF]/30 transition"
            >
              <Sparkles className="w-3 h-3" />
              <span>Pinch "CPP"</span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

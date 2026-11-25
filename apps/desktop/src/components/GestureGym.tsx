import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Dumbbell, Shield, X, Sparkles } from 'lucide-react';

interface GestureGymProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GestureStep {
  id: string;
  name: string;
  instruction: string;
  glyph: string;
  completed: boolean;
}

export const GestureGym: React.FC<GestureGymProps> = ({ isOpen, onClose }) => {
  const [steps, setSteps] = useState<GestureStep[]>([
    { id: 'g1', name: 'G1: Point & Hover', instruction: 'Extend index finger to guide the pointer cursor', glyph: '👆', completed: true },
    { id: 'g2', name: 'G2: Pinch-Grab', instruction: 'Pinch thumb and index tips together to pick up items', glyph: '🤏', completed: true },
    { id: 'g3', name: 'G3: Release-Drop', instruction: 'Open all fingers to drop items onto folders or zones', glyph: '🖐', completed: false },
    { id: 'g3b', name: 'G3b: Ballistic Throw', instruction: 'Flick quickly toward an edge to throw instantly', glyph: '💨', completed: false },
    { id: 'g4', name: 'G4: Peace-Hold', instruction: 'Hold a peace sign for 600ms over a card to rename it', glyph: '✌️', completed: false },
    { id: 'g5', name: 'G5: Fist-Hold (Lock)', instruction: 'Close fist for 800ms to put camera tracking to sleep', glyph: '✊', completed: false },
  ]);

  const [activeStepIndex, setActiveStepIndex] = useState(2); // Current practice step

  const completeCurrentStep = () => {
    setSteps((prev) =>
      prev.map((step, idx) => (idx === activeStepIndex ? { ...step, completed: true } : step))
    );
    if (activeStepIndex < steps.length - 1) {
      setActiveStepIndex((prev) => prev + 1);
    }
  };

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-[#0B1020]/90 backdrop-blur-xl flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-2xl bg-[#141B34] border border-[#1C2547] rounded-3xl p-8 shadow-2xl flex flex-col space-y-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1C2547] pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-[#7C5CFF]/20 text-[#7C5CFF]">
                  <Dumbbell className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-display text-[#E8ECFF]">Gesture Gym · Calibration</h2>
                  <p className="text-xs text-[#8B94B8]">Practice and calibrate all 6 hand gestures</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-[#1C2547] text-[#8B94B8] hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overall Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-[#8B94B8]">Calibration Mastery</span>
                <span className="text-[#34D399] font-mono">{progressPercent}%</span>
              </div>
              <div className="h-2 w-full bg-[#0B1020] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Gesture Steps Grid */}
            <div className="grid grid-cols-2 gap-3">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center space-x-3 ${
                    activeStepIndex === idx
                      ? 'bg-[#1C2547] border-[#22D3EE] shadow-[0_0_16px_rgba(34,211,238,0.2)]'
                      : step.completed
                      ? 'bg-[#141B34]/60 border-[#34D399]/40'
                      : 'bg-[#141B34]/30 border-[#1C2547]'
                  }`}
                >
                  <span className="text-2xl">{step.glyph}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#E8ECFF] truncate">{step.name}</div>
                    <div className="text-[10px] text-[#8B94B8] truncate">{step.instruction}</div>
                  </div>
                  {step.completed && <CheckCircle2 className="w-4 h-4 text-[#34D399] shrink-0" />}
                </div>
              ))}
            </div>

            {/* Active Training Stage Card */}
            <div className="p-6 bg-[#0B1020] border border-[#1C2547] rounded-2xl flex flex-col items-center text-center space-y-4">
              <span className="text-5xl animate-bounce">{steps[activeStepIndex].glyph}</span>
              <div>
                <h3 className="text-base font-bold text-[#E8ECFF]">{steps[activeStepIndex].name}</h3>
                <p className="text-xs text-[#8B94B8] max-w-sm mt-1">{steps[activeStepIndex].instruction}</p>
              </div>

              <button
                onClick={completeCurrentStep}
                className="px-6 py-2.5 bg-[#7C5CFF] hover:bg-[#6A4FE0] text-white font-semibold text-xs rounded-xl shadow-lg transition flex items-center space-x-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Mark Calibrated ✓</span>
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-[#8B94B8] pt-2">
              <div className="flex items-center space-x-1.5">
                <Shield className="w-4 h-4 text-[#34D399]" />
                <span>Zero vision frames stored or logged</span>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#1C2547] hover:bg-[#25325E] text-[#E8ECFF] rounded-xl font-semibold transition"
              >
                Enter Air Workspace
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

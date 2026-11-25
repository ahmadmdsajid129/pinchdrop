import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Video, VideoOff, Wifi, HardDrive, Lock, X } from 'lucide-react';

interface PrivacyDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  cameraActive: boolean;
  onToggleCamera: () => void;
}

export const PrivacyDashboard: React.FC<PrivacyDashboardProps> = ({
  isOpen,
  onClose,
  cameraActive,
  onToggleCamera,
}) => {
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
            className="w-full max-w-xl bg-[#141B34] border border-[#1C2547] rounded-3xl p-8 shadow-2xl flex flex-col space-y-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1C2547] pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-[#34D399]/20 text-[#34D399]">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold font-display text-[#E8ECFF]">Privacy &amp; Camera Dashboard</h2>
                  <p className="text-xs text-[#8B94B8]">Verified local-first security guarantees</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-[#1C2547] text-[#8B94B8] hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Hard Switch Card */}
            <div className="p-5 bg-[#0B1020] border border-[#1C2547] rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className={`p-3 rounded-2xl ${
                    cameraActive ? 'bg-[#34D399]/20 text-[#34D399]' : 'bg-[#FB7185]/20 text-[#FB7185]'
                  }`}
                >
                  {cameraActive ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#E8ECFF]">
                    Camera Tracking: {cameraActive ? 'ACTIVE (In-Memory)' : 'DISABLED (0% CPU)'}
                  </div>
                  <div className="text-xs text-[#8B94B8]">
                    {cameraActive ? 'Processing 21 landmarks via local GPU' : 'Webcam hardware feed fully detached'}
                  </div>
                </div>
              </div>

              <button
                onClick={onToggleCamera}
                className={`px-4 py-2 rounded-xl text-xs font-semibold shadow transition ${
                  cameraActive
                    ? 'bg-[#FB7185] hover:bg-[#E05368] text-white'
                    : 'bg-[#34D399] hover:bg-[#28B882] text-black'
                }`}
              >
                {cameraActive ? 'Kill Camera Feed' : 'Enable Camera'}
              </button>
            </div>

            {/* Privacy Commitments Checklist */}
            <div className="space-y-3">
              <div className="text-xs font-bold text-[#8B94B8] uppercase tracking-wider">
                Audited Privacy Guarantees
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-xl bg-[#1C2547]/40 border border-[#1C2547]">
                <HardDrive className="w-4 h-4 text-[#34D399] shrink-0" />
                <span className="text-xs text-[#E8ECFF]">
                  <strong>Zero Disk Storage:</strong> Raw camera frames exist only in volatile GPU memory and are immediately wiped.
                </span>
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-xl bg-[#1C2547]/40 border border-[#1C2547]">
                <Wifi className="w-4 h-4 text-[#22D3EE] shrink-0" />
                <span className="text-xs text-[#E8ECFF]">
                  <strong>Local LAN Only:</strong> Transfers stay inside your home/office Wi-Fi. No data routes through external cloud servers.
                </span>
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-xl bg-[#1C2547]/40 border border-[#1C2547]">
                <Lock className="w-4 h-4 text-[#7C5CFF] shrink-0" />
                <span className="text-xs text-[#E8ECFF]">
                  <strong>Mutual TLS 1.3:</strong> Paired devices pin Ed25519 certificates. Unrecognized devices on LAN are instantly rejected.
                </span>
              </div>
            </div>

            {/* Done button */}
            <button
              onClick={onClose}
              className="w-full py-3 bg-[#7C5CFF] hover:bg-[#6A4FE0] text-white font-semibold text-xs rounded-xl shadow-lg transition"
            >
              Close Dashboard
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

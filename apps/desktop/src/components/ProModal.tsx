import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, Key, ShieldCheck, Zap, X, Copy } from 'lucide-react';
import { useLicense } from '../hooks/useLicense';

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProModal: React.FC<ProModalProps> = ({ isOpen, onClose }) => {
  const { isPro, tier, activateLicense, deactivateLicense } = useLicense();
  const [licenseInput, setLicenseInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleActivate = async (keyToUse?: string) => {
    const key = keyToUse || licenseInput;
    setLoading(true);
    setStatusMessage(null);

    const result = await activateLicense(key);
    setLoading(false);

    if (result.success) {
      setStatusMessage({ text: '🎉 Pro Tier successfully activated offline!', isError: false });
      setLicenseInput('');
    } else {
      setStatusMessage({ text: result.error || 'Activation failed', isError: true });
    }
  };

  const handleDemoKey = () => {
    const demoKey = 'PDROP-PRO-LIFETIME-DEMO-2026';
    setLicenseInput(demoKey);
    handleActivate(demoKey);
  };

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
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            className="w-full max-w-2xl bg-[#141B34] border border-[#7C5CFF]/40 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between"
          >
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#7C5CFF]/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-[#22D3EE]/20 blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between relative z-10">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded-xl bg-[#7C5CFF]/20 text-[#A78BFA] border border-[#7C5CFF]/40">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl font-bold text-[#E8ECFF]">PinchDrop Pro Tier</h2>
                  {isPro && (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#34D399]/20 text-[#34D399] border border-[#34D399]/40 font-bold uppercase tracking-wider">
                      {tier === 'pro_lifetime' ? 'Lifetime Active' : 'Active'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8B94B8] mt-1.5">
                  Unlock advanced spatial productivity with 100% offline cryptographic licensing.
                </p>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-[#1C2547] text-[#8B94B8] hover:text-[#E8ECFF] border border-[#1C2547] hover:border-[#7C5CFF]/40 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Pro Features Showcase */}
            <div className="grid grid-cols-2 gap-3.5 my-6 relative z-10">
              <div className="p-3.5 rounded-2xl bg-[#0B1020]/60 border border-[#1C2547] flex items-start space-x-3">
                <div className="p-1.5 rounded-lg bg-[#7C5CFF]/20 text-[#A78BFA]">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#E8ECFF]">Two-Hand Lasso Select</div>
                  <div className="text-[11px] text-[#8B94B8] mt-0.5">Grab &amp; fling 10+ items simultaneously with two hands.</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0B1020]/60 border border-[#1C2547] flex items-start space-x-3">
                <div className="p-1.5 rounded-lg bg-[#22D3EE]/20 text-[#22D3EE]">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#E8ECFF]">Multi-Device Mesh Pairing</div>
                  <div className="text-[11px] text-[#8B94B8] mt-0.5">Sync unlimited phones, tablets, and second PCs simultaneously.</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0B1020]/60 border border-[#1C2547] flex items-start space-x-3">
                <div className="p-1.5 rounded-lg bg-[#34D399]/20 text-[#34D399]">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#E8ECFF]">Smart Auto-Routing</div>
                  <div className="text-[11px] text-[#8B94B8] mt-0.5">Automated rename templates and auto-sorting folder rules.</div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0B1020]/60 border border-[#1C2547] flex items-start space-x-3">
                <div className="p-1.5 rounded-lg bg-[#FBBF24]/20 text-[#FBBF24]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#E8ECFF]">Unlimited Undo Journal</div>
                  <div className="text-[11px] text-[#8B94B8] mt-0.5">Persistent multi-session file operation undo and restore.</div>
                </div>
              </div>
            </div>

            {/* Pricing Tiers Carousel / Badges */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#0B1020]/80 border border-[#1C2547] mb-6 relative z-10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#FBBF24]">Best Value</span>
                <div className="text-base font-bold text-[#E8ECFF]">Lifetime License</div>
                <div className="text-xs text-[#8B94B8]">One-time payment · Own it forever</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-mono font-bold text-[#22D3EE]">$59.00</div>
                <div className="text-[10px] text-[#8B94B8]">or $29/year</div>
              </div>
            </div>

            {/* License Key Activation Section */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-[#E8ECFF] flex items-center space-x-1.5">
                  <Key className="w-3.5 h-3.5 text-[#7C5CFF]" />
                  <span>Activate with License Key</span>
                </label>
                <button
                  onClick={handleDemoKey}
                  className="text-[11px] text-[#22D3EE] hover:underline flex items-center space-x-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Pre-fill Demo Key</span>
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={licenseInput}
                  onChange={(e) => setLicenseInput(e.target.value)}
                  placeholder="PDROP-PRO-LIFETIME-XXXX-XXXX"
                  className="flex-1 bg-[#0B1020] border border-[#1C2547] focus:border-[#7C5CFF] rounded-xl px-4 py-2.5 text-xs font-mono text-[#E8ECFF] placeholder-[#8B94B8]/40 outline-none transition"
                />

                <button
                  onClick={() => handleActivate()}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white text-xs font-bold shadow-lg shadow-[#7C5CFF]/20 hover:opacity-90 active:scale-95 transition disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Activate'}
                </button>
              </div>

              {statusMessage && (
                <div
                  className={`mt-2.5 p-2.5 rounded-xl text-xs font-medium border flex items-center space-x-2 ${
                    statusMessage.isError
                      ? 'bg-[#FB7185]/10 text-[#FB7185] border-[#FB7185]/30'
                      : 'bg-[#34D399]/10 text-[#34D399] border-[#34D399]/30'
                  }`}
                >
                  <span>{statusMessage.text}</span>
                </div>
              )}

              {isPro && (
                <div className="mt-3 flex items-center justify-between text-xs text-[#8B94B8]">
                  <span>Status: Pro Active (Verified 100% Offline)</span>
                  <button
                    onClick={deactivateLicense}
                    className="text-[#FB7185] hover:underline"
                  >
                    Deactivate License
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

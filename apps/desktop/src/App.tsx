import { useState, useEffect, useRef } from 'react';
import { EdgeZone, ZoneType } from './components/EdgeZone';
import { FileCard, FileCardData } from './components/FileCard';
import { PointerRing } from './components/PointerRing';
import { UndoToast } from './components/UndoToast';
import { GestureGym } from './components/GestureGym';
import { PrivacyDashboard } from './components/PrivacyDashboard';
import { ProModal } from './components/ProModal';
import { soundEngine } from './utils/audio';
import { useMotionPreference } from './hooks/useMotionPreference';
import { useLicense } from './hooks/useLicense';
import { Smartphone, ShieldCheck, Folder, Globe, Award, Volume2, VolumeX, Sparkles, Crown } from 'lucide-react';
import { GestureStateMachine, ThrowDetector } from '@pinchdrop/gesture-core';

export default function App() {
  const fsmRef = useRef<GestureStateMachine>(new GestureStateMachine());
  const throwDetectorRef = useRef<ThrowDetector>(new ThrowDetector(0.60));
  const { reducedMotion, toggleReducedMotion } = useMotionPreference();
  const { isPro, tier } = useLicense();
  const [isMuted, setIsMuted] = useState(soundEngine.isMuted());

  // Workspace Files (including URLs and text notes)
  const [files, setFiles] = useState<FileCardData[]>([
    { id: 'f1', name: 'Annual_Report.pdf', size: '14 MB', type: 'pdf' },
    { id: 'f2', name: 'Hero_Broll.mp4', size: '1.2 GB', type: 'video' },
    { id: 'f3', name: 'Design_System.png', size: '4.8 MB', type: 'image' },
    { id: 'f4', name: 'https://pinchdrop.app', size: 'Web Link', type: 'doc' },
  ]);

  // Pointer & Interaction State
  const [pointerPos, setPointerPos] = useState({ x: 600, y: 400 });
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [grabbedCardId, setGrabbedCardId] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<ZoneType | null>(null);

  // Modals state
  const [isGymOpen, setIsGymOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);

  // Undo Toast state
  const [undoToast, setUndoToast] = useState({
    visible: false,
    message: '',
    remaining: 8,
    file: null as FileCardData | null,
  });

  // Phone ARMED Simulation state
  const [phoneArmed, setPhoneArmed] = useState(false);
  const [armedCountdown, setArmedCountdown] = useState(30);

  // Track pointer motion for G3b Throw evaluation
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;

      setPointerPos({ x: e.clientX, y: e.clientY });

      // Add sample to ThrowDetector while holding an item
      if (isGrabbing) {
        throwDetectorRef.current.addSample(normX, normY, now);
      }

      // Hit-test edge zones
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (e.clientX < 220 && e.clientY < 180) {
        setActiveZone('phone');
      } else if (e.clientX > w - 220 && e.clientY < 180) {
        setActiveZone('inbox');
      } else if (e.clientX < 220 && e.clientY > h - 180) {
        setActiveZone('rename');
      } else if (e.clientX > w - 220 && e.clientY > h - 180) {
        setActiveZone('trash');
      } else {
        setActiveZone(null);
      }
    };

    const handleMouseDown = () => {
      setIsGrabbing(true);
      throwDetectorRef.current.reset();
      soundEngine.playGrabPop();
    };

    const handleMouseUp = () => {
      const now = performance.now();
      const throwResult = throwDetectorRef.current.evaluateRelease(now);

      if (throwResult.isThrow && grabbedCardId) {
        soundEngine.playThrowWhoosh();
        const thrownFile = files.find((f) => f.id === grabbedCardId);
        if (thrownFile) {
          const target = throwResult.direction === 'LEFT_PHONE' ? 'Phone' : 'Inbox';
          setFiles((prev) => prev.filter((f) => f.id !== grabbedCardId));
          setUndoToast({
            visible: true,
            message: `💨 Threw "${thrownFile.name}" to ${target} (${throwResult.velocity}x speed)`,
            remaining: 8,
            file: thrownFile,
          });
        }
      } else {
        soundEngine.playDropClick();
      }

      setIsGrabbing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isGrabbing, grabbedCardId, files]);

  // Handle Drop Action when grabbing ends normally
  useEffect(() => {
    if (!isGrabbing && grabbedCardId) {
      const droppedFile = files.find((f) => f.id === grabbedCardId);

      if (activeZone === 'trash' && droppedFile) {
        soundEngine.playTrashThud();
        setFiles((prev) => prev.filter((f) => f.id !== grabbedCardId));
        setUndoToast({
          visible: true,
          message: `Moved "${droppedFile.name}" to Recycle Bin`,
          remaining: 8,
          file: droppedFile,
        });
      } else if (activeZone === 'phone' && droppedFile) {
        soundEngine.playCatchSuccess();
        if (droppedFile.name.startsWith('http')) {
          alert(`Pushed URL "${droppedFile.name}" to Phone Clipboard!`);
        } else {
          alert(`Streamed "${droppedFile.name}" to Paired Phone via Local TLS!`);
        }
      }

      setGrabbedCardId(null);
    }
  }, [isGrabbing, grabbedCardId, activeZone, files]);

  // Undo Timer countdown
  useEffect(() => {
    let timer: number;
    if (undoToast.visible && undoToast.remaining > 0) {
      timer = window.setInterval(() => {
        setUndoToast((prev) => ({
          ...prev,
          remaining: prev.remaining - 0.1,
          visible: prev.remaining > 0.1,
        }));
      }, 100);
    }
    return () => clearInterval(timer);
  }, [undoToast.visible, undoToast.remaining]);

  const handleUndo = () => {
    if (undoToast.file) {
      soundEngine.playDropClick();
      setFiles((prev) => [undoToast.file!, ...prev]);
      setUndoToast((prev) => ({ ...prev, visible: false }));
    }
  };

  const triggerPhoneGrab = () => {
    soundEngine.playCatchSuccess();
    setPhoneArmed(true);
    setArmedCountdown(30);
    fsmRef.current.transition({
      type: 'PHONE_HELD',
      itemId: 'phone_link_49',
      timestampMs: performance.now(),
    });
  };

  return (
    <div className="relative w-screen h-screen bg-[#0B1020] text-[#E8ECFF] flex flex-col justify-between p-6 overflow-hidden">
      {/* Dynamic Pointer Ring */}
      <PointerRing
        x={pointerPos.x}
        y={pointerPos.y}
        isGrabbing={isGrabbing}
        reducedMotion={reducedMotion}
      />

      {/* Header Bar */}
      <header className="flex items-center justify-between z-10 bg-[#141B34]/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-[#1C2547]">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34D399] animate-pulse" />
            <span className="text-sm font-semibold text-[#22D3EE]">PinchDrop Air Workspace</span>
          </div>
          <span className="text-xs text-[#8B94B8]">Stage 12 · Pro Tier &amp; Cryptographic Licensing</span>
        </div>

        {/* Center Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-[#8B94B8] bg-[#0B1020]/60 px-3 py-1.5 rounded-xl border border-[#1C2547]">
          <Folder className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span>/Users/Alex/Projects/ActiveSprint</span>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2.5">
          {/* Pro Upgrade / Tier Badge */}
          <button
            onClick={() => setIsProModalOpen(true)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              isPro
                ? 'bg-[#FBBF24]/20 text-[#FBBF24] border-[#FBBF24]/40 hover:bg-[#FBBF24]/30'
                : 'bg-[#7C5CFF]/20 text-[#A78BFA] border-[#7C5CFF]/40 hover:bg-[#7C5CFF]/30'
            }`}
          >
            <Crown className="w-3.5 h-3.5" />
            <span>{isPro ? (tier === 'pro_lifetime' ? 'PRO LIFETIME' : 'PRO ACTIVE') : 'Upgrade Pro'}</span>
          </button>

          {/* Reduced Motion Toggle */}
          <button
            onClick={() => {
              toggleReducedMotion();
              soundEngine.playHoverTick();
            }}
            title={
              reducedMotion
                ? 'Reduced Motion Active (Click for 60fps Springs)'
                : '60fps Springs Active (Click for Reduced Motion)'
            }
            className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              reducedMotion
                ? 'bg-[#1C2547] text-[#8B94B8] border-[#1C2547]'
                : 'bg-[#7C5CFF]/20 text-[#A78BFA] border-[#7C5CFF]/40 hover:bg-[#7C5CFF]/30'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{reducedMotion ? 'Reduced Motion' : '60fps Springs'}</span>
          </button>

          {/* Sound Mute Toggle */}
          <button
            onClick={() => {
              const next = !isMuted;
              soundEngine.setMuted(next);
              setIsMuted(next);
              if (!next) soundEngine.playHoverTick();
            }}
            title={isMuted ? 'Unmute Audio Feedback' : 'Mute Audio Feedback'}
            className={`p-2 rounded-xl border transition ${
              isMuted
                ? 'bg-[#1C2547] text-[#8B94B8] border-[#1C2547]'
                : 'bg-[#1C2547] text-[#22D3EE] border-[#22D3EE]/30 hover:bg-[#25325E]'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setIsGymOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#7C5CFF]/20 text-[#A78BFA] border border-[#7C5CFF]/40 hover:bg-[#7C5CFF]/30 transition"
          >
            <Award className="w-3.5 h-3.5" />
            <span>Gesture Gym</span>
          </button>

          <button
            onClick={triggerPhoneGrab}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              phoneArmed
                ? 'bg-[#FBBF24] text-black border-[#FBBF24]'
                : 'bg-[#1C2547] text-[#22D3EE] border-[#22D3EE]/30 hover:bg-[#25325E]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{phoneArmed ? `ARMED (${armedCountdown}s)` : 'Simulate Phone Grab'}</span>
          </button>

          <button
            onClick={() => setIsPrivacyOpen(true)}
            title="Open Zero-Storage Privacy Dashboard"
            className="p-2 rounded-xl bg-[#1C2547] text-[#34D399] border border-[#34D399]/30 hover:bg-[#34D399]/10 transition"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Layout (4 Edge Zones + Center File Grid) */}
      <div className="relative flex-1 my-6 flex items-center justify-between">
        {/* Left Zones Column */}
        <div className="flex flex-col justify-between h-full z-10">
          <EdgeZone
            type="phone"
            label="Phone Zone"
            sublabel="Drop to Send / Clipboard"
            isHovered={activeZone === 'phone'}
          />
          <EdgeZone
            type="rename"
            label="Rename Zone"
            sublabel="Peace-Hold (600ms)"
            isHovered={activeZone === 'rename'}
          />
        </div>

        {/* Center File Cards Grid */}
        <div className="flex-1 flex flex-wrap items-center justify-center gap-6 px-12 z-10">
          {files.map((file) => {
            const isCardGrabbed = grabbedCardId === file.id;
            return (
              <div
                key={file.id}
                onMouseDown={() => setGrabbedCardId(file.id)}
                className="cursor-pointer"
              >
                <FileCard
                  file={file}
                  isHovered={false}
                  isGrabbed={isCardGrabbed}
                  reducedMotion={reducedMotion}
                />
              </div>
            );
          })}
        </div>

        {/* Right Zones Column */}
        <div className="flex flex-col justify-between h-full z-10">
          <EdgeZone
            type="inbox"
            label="Inbox Zone"
            sublabel="💨 Flick to Throw (Instant)"
            isHovered={activeZone === 'inbox'}
          />
          <EdgeZone
            type="trash"
            label="Recycle Bin"
            sublabel="Hold 600ms to Trash"
            isHovered={activeZone === 'trash'}
          />
        </div>
      </div>

      {/* Footer Stage Tray */}
      <footer className="h-14 bg-[#141B34]/80 backdrop-blur-md px-6 rounded-2xl border border-[#1C2547] flex items-center justify-between z-10">
        <div className="flex items-center space-x-3 text-xs">
          <span className="font-semibold text-[#8B94B8]">Stage Tray:</span>
          {phoneArmed ? (
            <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-[#FBBF24]/20 border border-[#FBBF24] text-[#FBBF24]">
              <Globe className="w-3.5 h-3.5 text-[#22D3EE]" />
              <span>🔗 Link Ready from Phone</span>
              <span className="font-mono text-[10px] font-bold">Pinch anywhere to Catch</span>
            </div>
          ) : (
            <span className="text-[#8B94B8]/60 italic">Tray is empty — items caught from phone appear here</span>
          )}
        </div>

        <div className="text-[11px] text-[#8B94B8] flex items-center space-x-4">
          <span>💨 G3b Ballistic Throw Active (≥ 0.6x speed)</span>
          <span className="text-[#34D399]">● Air Clipboard Ready</span>
        </div>
      </footer>

      {/* Floating Undo Toast */}
      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        remainingSeconds={undoToast.remaining}
        onUndo={handleUndo}
      />

      {/* Stage 9 Gesture Gym Modal */}
      <GestureGym isOpen={isGymOpen} onClose={() => setIsGymOpen(false)} />

      {/* Stage 9 Privacy Dashboard Modal */}
      <PrivacyDashboard
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
        cameraActive={cameraActive}
        onToggleCamera={() => setCameraActive(!cameraActive)}
      />

      {/* Stage 12 Pro Tier Modal */}
      <ProModal isOpen={isProModalOpen} onClose={() => setIsProModalOpen(false)} />
    </div>
  );
}

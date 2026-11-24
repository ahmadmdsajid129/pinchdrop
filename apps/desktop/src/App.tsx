import { useState, useEffect, useRef } from 'react';
import { EdgeZone, ZoneType } from './components/EdgeZone';
import { FileCard, FileCardData } from './components/FileCard';
import { PointerRing } from './components/PointerRing';
import { UndoToast } from './components/UndoToast';
import { Smartphone, ShieldCheck, Folder } from 'lucide-react';
import { GestureStateMachine } from '@pinchdrop/gesture-core';

export default function App() {
  const fsmRef = useRef<GestureStateMachine>(new GestureStateMachine());

  // Workspace Files
  const [files, setFiles] = useState<FileCardData[]>([
    { id: 'f1', name: 'Annual_Report.pdf', size: '14 MB', type: 'pdf' },
    { id: 'f2', name: 'Hero_Broll.mp4', size: '1.2 GB', type: 'video' },
    { id: 'f3', name: 'Design_System.png', size: '4.8 MB', type: 'image' },
    { id: 'f4', name: 'Sprint_Notes.docx', size: '820 KB', type: 'doc' },
  ]);

  // Pointer & Interaction State (Driven by Mouse / Gesture FSM)
  const [pointerPos, setPointerPos] = useState({ x: 600, y: 400 });
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [grabbedCardId, setGrabbedCardId] = useState<string | null>(null);
  const [activeZone, setActiveZone] = useState<ZoneType | null>(null);

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

  // Simulate Mouse Movement as Air Pointer
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY });

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
    };

    const handleMouseUp = () => {
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
  }, []);

  // Handle Drop Action when grabbing ends
  useEffect(() => {
    if (!isGrabbing && grabbedCardId) {
      const droppedFile = files.find((f) => f.id === grabbedCardId);

      if (activeZone === 'trash' && droppedFile) {
        // Move to Recycle Bin with Undo Toast
        setFiles((prev) => prev.filter((f) => f.id !== grabbedCardId));
        setUndoToast({
          visible: true,
          message: `Moved "${droppedFile.name}" to Recycle Bin`,
          remaining: 8,
          file: droppedFile,
        });
      } else if (activeZone === 'phone' && droppedFile) {
        alert(`Streamed "${droppedFile.name}" to Paired Phone via Local TLS!`);
      }

      setGrabbedCardId(null);
    }
  }, [isGrabbing, grabbedCardId, activeZone]);

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

  // Undo Action
  const handleUndo = () => {
    if (undoToast.file) {
      setFiles((prev) => [undoToast.file!, ...prev]);
      setUndoToast((prev) => ({ ...prev, visible: false }));
    }
  };

  // Simulate Phone "Grab" button (triggers ARMED state)
  const triggerPhoneGrab = () => {
    setPhoneArmed(true);
    setArmedCountdown(30);
    fsmRef.current.transition({
      type: 'PHONE_HELD',
      itemId: 'phone_photo_49',
      timestampMs: performance.now(),
    });
  };

  return (
    <div className="relative w-screen h-screen bg-[#0B1020] text-[#E8ECFF] flex flex-col justify-between p-6 overflow-hidden">
      {/* Dynamic Pointer Ring */}
      <PointerRing x={pointerPos.x} y={pointerPos.y} isGrabbing={isGrabbing} />

      {/* Header Bar */}
      <header className="flex items-center justify-between z-10 bg-[#141B34]/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-[#1C2547]">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34D399] animate-pulse" />
            <span className="text-sm font-semibold text-[#22D3EE]">PinchDrop Air Workspace</span>
          </div>
          <span className="text-xs text-[#8B94B8]">Stage 3 Desktop Shell</span>
        </div>

        {/* Center Breadcrumb */}
        <div className="flex items-center space-x-2 text-xs text-[#8B94B8] bg-[#0B1020]/60 px-3 py-1.5 rounded-xl border border-[#1C2547]">
          <Folder className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span>/Users/Alex/Projects/ActiveSprint</span>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
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

          <div className="p-2 rounded-xl bg-[#1C2547] text-[#8B94B8]">
            <ShieldCheck className="w-4 h-4 text-[#34D399]" />
          </div>
        </div>
      </header>

      {/* Main Workspace Layout (4 Edge Zones + Center File Grid) */}
      <div className="relative flex-1 my-6 flex items-center justify-between">
        {/* Left Zones Column */}
        <div className="flex flex-col justify-between h-full z-10">
          <EdgeZone
            type="phone"
            label="Phone Zone"
            sublabel="Drop to Send to Phone"
            isHovered={activeZone === 'phone'}
            isActive={true}
          />
          <EdgeZone
            type="rename"
            label="Rename Zone"
            sublabel="Peace-Hold (600ms)"
            isHovered={activeZone === 'rename'}
            isActive={false}
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
            sublabel="Drop or Throw (Flick)"
            isHovered={activeZone === 'inbox'}
            isActive={true}
          />
          <EdgeZone
            type="trash"
            label="Recycle Bin"
            sublabel="Hold 600ms to Trash"
            isHovered={activeZone === 'trash'}
            isActive={false}
          />
        </div>
      </div>

      {/* Footer Stage Tray */}
      <footer className="h-14 bg-[#141B34]/80 backdrop-blur-md px-6 rounded-2xl border border-[#1C2547] flex items-center justify-between z-10">
        <div className="flex items-center space-x-3 text-xs">
          <span className="font-semibold text-[#8B94B8]">Stage Tray:</span>
          {phoneArmed ? (
            <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-[#FBBF24]/20 border border-[#FBBF24] text-[#FBBF24]">
              <span>📷 1 Photo Ready from Phone</span>
              <span className="font-mono text-[10px] font-bold">Pinch to Catch</span>
            </div>
          ) : (
            <span className="text-[#8B94B8]/60 italic">Tray is empty — items caught from phone appear here</span>
          )}
        </div>

        <div className="text-[11px] text-[#8B94B8] flex items-center space-x-4">
          <span>✋ Air Gestures + Mouse Fallback Active</span>
          <span className="text-[#34D399]">● 60 FPS Spring UI</span>
        </div>
      </footer>

      {/* Floating Undo Toast */}
      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        remainingSeconds={undoToast.remaining}
        onUndo={handleUndo}
      />
    </div>
  );
}

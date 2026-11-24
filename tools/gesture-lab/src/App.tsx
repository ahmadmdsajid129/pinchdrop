import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  GESTURE_CONFIG,
  LandmarkSmoother,
  calculatePinchRatio,
  Landmark3D,
} from '@pinchdrop/gesture-core';

interface PerfMetrics {
  fps: number;
  latencyMs: number;
  jitterPx: number;
  pinchRatio: number;
  handPresent: boolean;
  isGrabbing: boolean;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother(GESTURE_CONFIG.ONE_EURO));

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recording, setRecording] = useState<boolean>(false);
  const [recordedFrames, setRecordedFrames] = useState<any[]>([]);

  const [metrics, setMetrics] = useState<PerfMetrics>({
    fps: 0,
    latencyMs: 0,
    jitterPx: 0,
    pinchRatio: 1.0,
    handPresent: false,
    isGrabbing: false,
  });

  // Target card position for interactive pinch test
  const [targetPos, setTargetPos] = useState({ x: 400, y: 300 });
  const [isHoldingCard, setIsHoldingCard] = useState<boolean>(false);

  // Initialize MediaPipe Tasks-Vision with offline models
  useEffect(() => {
    async function initVision() {
      try {
        setModelLoading(true);
        const vision = await FilesetResolver.forVisionTasks('/wasm');
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
        });

        landmarkerRef.current = landmarker;
        setModelLoading(false);
      } catch (err: any) {
        console.error('Failed to initialize MediaPipe:', err);
        setErrorMsg(`Failed to initialize local vision model: ${err.message || err}`);
        setModelLoading(false);
      }
    }

    initVision();
  }, []);

  // Start webcam stream
  const startCamera = async () => {
    try {
      setErrorMsg(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: { ideal: 30 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraActive(true);
        };
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setErrorMsg(`Webcam access denied: ${err.message || err}`);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  // Main Detection Loop
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(performance.now());
  const prevTipRef = useRef<{ x: number; y: number } | null>(null);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !landmarkerRef.current || !cameraActive) return;

    const now = performance.now();
    const startTime = performance.now();

    const results = landmarkerRef.current.detectForVideo(videoRef.current, now);
    const latency = performance.now() - startTime;

    frameCountRef.current++;
    if (now - lastFpsUpdateRef.current >= 500) {
      const fps = Math.round((frameCountRef.current * 1000) / (now - lastFpsUpdateRef.current));
      setMetrics((m) => ({ ...m, fps }));
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (canvas && ctx && videoRef.current) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks && results.landmarks.length > 0) {
        const rawLandmarks: Landmark3D[] = results.landmarks[0];
        const smoothed = smootherRef.current.smooth(rawLandmarks, now);

        const pinchRatio = calculatePinchRatio(smoothed);
        const isGrabbing = pinchRatio <= GESTURE_CONFIG.PINCH_ENTER_THRESHOLD;

        // Fingertip (index tip index 8)
        const indexTip = smoothed[8];
        const tipX = (1 - indexTip.x) * canvas.width; // mirror view
        const tipY = indexTip.y * canvas.height;

        // Calculate jitter (displacement between frames at low speed)
        let jitter = 0;
        if (prevTipRef.current) {
          jitter = Math.hypot(tipX - prevTipRef.current.x, tipY - prevTipRef.current.y);
        }
        prevTipRef.current = { x: tipX, y: tipY };

        setMetrics((m) => ({
          ...m,
          latencyMs: Math.round(latency),
          jitterPx: Number(jitter.toFixed(1)),
          pinchRatio: Number(pinchRatio.toFixed(2)),
          handPresent: true,
          isGrabbing,
        }));

        // Draw Skeleton Ghost Overlay
        ctx.strokeStyle = '#22D3EE';
        ctx.lineWidth = 3;
        ctx.fillStyle = isGrabbing ? '#34D399' : '#7C5CFF';

        for (let i = 0; i < smoothed.length; i++) {
          const pt = smoothed[i];
          const px = (1 - pt.x) * canvas.width;
          const py = pt.y * canvas.height;

          ctx.beginPath();
          ctx.arc(px, py, i === 8 || i === 4 ? 6 : 4, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Draw Interactive Pointer Ring
        ctx.beginPath();
        ctx.arc(tipX, tipY, isGrabbing ? 20 : 30, 0, 2 * Math.PI);
        ctx.strokeStyle = isGrabbing ? '#34D399' : '#7C5CFF';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Interactive Card Snapping Logic
        const distToCard = Math.hypot(tipX - targetPos.x, tipY - targetPos.y);
        if (distToCard < GESTURE_CONFIG.TARGETS.MIN_INTERACTIVE_PX && isGrabbing) {
          setIsHoldingCard(true);
          setTargetPos({ x: tipX, y: tipY });
        } else if (!isGrabbing) {
          setIsHoldingCard(false);
        }

        // Record frame if recording is active
        if (recording) {
          setRecordedFrames((prev) => [
            ...prev,
            { timestamp: now, landmarks: smoothed, pinchRatio, isGrabbing },
          ]);
        }
      } else {
        setMetrics((m) => ({
          ...m,
          handPresent: false,
          isGrabbing: false,
          jitterPx: 0,
        }));
      }
    }

    requestAnimationFrame(processFrame);
  }, [cameraActive, recording, targetPos]);

  useEffect(() => {
    let animId: number;
    if (cameraActive) {
      animId = requestAnimationFrame(processFrame);
    }
    return () => cancelAnimationFrame(animId);
  }, [cameraActive, processFrame]);

  // Export JSON Fixture
  const exportFixture = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(recordedFrames, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `gesture-session-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setRecordedFrames([]);
  };

  return (
    <div className="relative w-screen h-screen bg-[#0B1020] text-[#E8ECFF] flex flex-col font-sans">
      {/* Top Header */}
      <header className="h-16 px-6 border-b border-[#1C2547] flex items-center justify-between bg-[#141B34]">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-[#7C5CFF] animate-pulse" />
          <h1 className="text-lg font-bold font-display text-[#22D3EE]">PinchDrop · Gesture Lab</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-[#1C2547] text-[#8B94B8]">Stage 1 Testbed</span>
        </div>

        <div className="flex items-center space-x-4">
          {!cameraActive ? (
            <button
              onClick={startCamera}
              disabled={modelLoading}
              className="px-4 py-2 bg-[#7C5CFF] hover:bg-[#6A4FE0] text-white text-sm font-semibold rounded-lg shadow-md transition disabled:opacity-50"
            >
              {modelLoading ? 'Loading Model...' : 'Start Camera'}
            </button>
          ) : (
            <button
              onClick={stopCamera}
              className="px-4 py-2 bg-[#FB7185] hover:bg-[#E05368] text-white text-sm font-semibold rounded-lg shadow-md transition"
            >
              Stop Camera
            </button>
          )}

          {cameraActive && (
            <button
              onClick={() => {
                if (recording) {
                  setRecording(false);
                } else {
                  setRecordedFrames([]);
                  setRecording(true);
                }
              }}
              className={`px-3 py-2 text-sm font-semibold rounded-lg transition ${
                recording ? 'bg-[#FBBF24] text-black' : 'bg-[#1C2547] text-[#E8ECFF] hover:bg-[#2A3764]'
              }`}
            >
              {recording ? `● Stop (${recordedFrames.length})` : 'Record Session'}
            </button>
          )}

          {recordedFrames.length > 0 && !recording && (
            <button
              onClick={exportFixture}
              className="px-3 py-2 bg-[#34D399] hover:bg-[#28B882] text-black text-sm font-semibold rounded-lg transition"
            >
              Export JSON Fixture
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <div className="relative flex-1 bg-[#0B1020] overflow-hidden flex items-center justify-center">
        {/* Hidden video element feeding MediaPipe */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
          width={1280}
          height={720}
        />

        {/* Mirrored Canvas for Landmark & Skeleton Overlay */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Interactive Target File Card (Grab/Drop Test) */}
        <div
          style={{
            transform: `translate(${targetPos.x - 70}px, ${targetPos.y - 45}px)`,
            transition: isHoldingCard ? 'none' : 'transform 0.2s ease-out',
          }}
          className={`absolute w-36 h-24 rounded-2xl p-3 flex flex-col justify-between border cursor-pointer select-none transition-shadow ${
            isHoldingCard
              ? 'bg-[#1C2547] border-[#34D399] shadow-[0_0_24px_rgba(52,211,153,0.3)] scale-110'
              : 'bg-[#141B34] border-[#7C5CFF] shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xl">📁</span>
            <span className="text-[10px] text-[#8B94B8]">96px Card</span>
          </div>
          <div>
            <div className="text-xs font-semibold text-[#E8ECFF] truncate">Sample_File.pdf</div>
            <div className="text-[10px] text-[#22D3EE]">{isHoldingCard ? 'HELD ✓' : 'Pinch to Grab'}</div>
          </div>
        </div>

        {/* Central Interaction Box Guide */}
        <div className="absolute w-[65vw] h-[65vh] border-2 border-dashed border-[#1C2547] rounded-3xl pointer-events-none flex items-start justify-end p-4">
          <span className="text-[11px] text-[#8B94B8]">Interaction Box (Central 65%)</span>
        </div>

        {/* Error Overlay */}
        {errorMsg && (
          <div className="absolute z-50 p-4 bg-[#FB7185]/20 border border-[#FB7185] rounded-xl text-[#FB7185] max-w-md text-sm text-center">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Floating Performance HUD */}
      <div className="absolute bottom-6 left-6 bg-[#141B34]/90 backdrop-blur-md border border-[#1C2547] p-4 rounded-2xl shadow-xl flex items-center space-x-6">
        <div>
          <div className="text-[10px] text-[#8B94B8]">FRAME RATE</div>
          <div className="text-lg font-bold font-mono text-[#34D399]">{metrics.fps} FPS</div>
        </div>

        <div className="h-8 w-[1px] bg-[#1C2547]" />

        <div>
          <div className="text-[10px] text-[#8B94B8]">LATENCY (GPU)</div>
          <div className="text-lg font-bold font-mono text-[#22D3EE]">{metrics.latencyMs} ms</div>
        </div>

        <div className="h-8 w-[1px] bg-[#1C2547]" />

        <div>
          <div className="text-[10px] text-[#8B94B8]">PINCH RATIO</div>
          <div
            className={`text-lg font-bold font-mono ${
              metrics.isGrabbing ? 'text-[#34D399]' : 'text-[#E8ECFF]'
            }`}
          >
            {metrics.pinchRatio} {metrics.isGrabbing ? '(GRAB)' : ''}
          </div>
        </div>

        <div className="h-8 w-[1px] bg-[#1C2547]" />

        <div>
          <div className="text-[10px] text-[#8B94B8]">REST JITTER</div>
          <div className="text-lg font-bold font-mono text-[#FBBF24]">{metrics.jitterPx} px</div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

export interface Camera {
  deviceId: string;
  label: string;
}

/** Lists webcams. Labels are only available after camera permission was granted once. */
export async function listCameras(): Promise<Camera[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

/** Asks Windows/WebView2 for camera access, then immediately releases the camera. */
export async function requestCameraAccess(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * Live webcam preview. Frames go straight from the camera to the <video>
 * element in memory; nothing is recorded or saved. The camera turns off when
 * the preview is closed.
 */
export function CameraPreview({ deviceId, onClose }: { deviceId: string | null; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Camera access was refused.' : `Couldn't open the camera: ${e.message}`));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceId]);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-bg2 border border-line">
      {error ? (
        <div className="text-[13px] text-danger">{error}</div>
      ) : (
        <video ref={videoRef} muted playsInline className="w-full max-w-[420px] aspect-video rounded-xl bg-black -scale-x-100" aria-label="Webcam preview" />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-muted">Preview only — nothing is recorded or saved.</span>
        <Button size="sm" onClick={onClose}>Close preview</Button>
      </div>
    </div>
  );
}

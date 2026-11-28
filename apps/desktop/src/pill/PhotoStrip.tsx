import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../shared/api';
import type { PhonePhoto } from '../shared/types';

let cache: { device: string; at: number; photos: PhonePhoto[] } | null = null;

/**
 * v2 · The phone's latest photos on the Island. Click one and it comes to the PC (lands in
 * Downloads\PinchDrop and opens). Small previews only; asked from the phone when the Island opens.
 */
export function PhotoStrip({ deviceId }: { deviceId: string }) {
  const [photos, setPhotos] = useState<PhonePhoto[] | null>(cache?.device === deviceId ? cache.photos : null);
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    if (cache && cache.device === deviceId && Date.now() - cache.at < 15_000) return; // a photo just taken shows up
    let live = true;
    api
      .phonePhotos(deviceId)
      .then((p) => {
        cache = { device: deviceId, at: Date.now(), photos: p };
        if (live) setPhotos(p);
      })
      .catch(() => live && setPhotos([]));
    return () => {
      live = false;
    };
  }, [deviceId]);

  if (!photos || photos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Recent photos · click to bring over</div>
      <div className="flex gap-1.5 overflow-hidden">
        {photos.slice(0, 6).map((p) => (
          <motion.button
            key={p.id}
            type="button"
            title={`${p.name} — bring to this PC`}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              setSent(p.id);
              void api.phonePhotoSend(p.id, deviceId).catch(() => setSent(null));
            }}
            className={`relative w-[56px] h-[56px] rounded-[12px] overflow-hidden shrink-0 ring-2 ${sent === p.id ? 'ring-[#30D158]' : 'ring-transparent'}`}
          >
            <img src={p.thumb} alt="" className="w-full h-full object-cover" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { inTauri } from '../shared/api';

type Link = { url: string; qrSvgDataUrl: string };

/**
 * "Get the phone app": a QR code the phone's camera opens straight to the download (the
 * website's get page shows Android the APK / Play Store). PinchDrop works in pairs, so the PC
 * tells people about the phone app, and the phone app tells them about this one.
 */
export function GetPhoneApp({ compact = false }: { compact?: boolean }) {
  const [link, setLink] = useState<Link | null>(null);
  useEffect(() => {
    if (!inTauri) return;
    void import('@tauri-apps/api/core').then(({ invoke }) => invoke<Link>('get_app_link').then(setLink).catch(() => undefined));
  }, []);
  const short = link?.url.replace(/^https:\/\//, '') ?? 'ahmadmdsajid129.github.io/pinchdrop/get.html';
  return (
    <div className={`flex items-center gap-4 rounded-[18px] bg-surface border border-line ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`shrink-0 rounded-xl bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${compact ? 'w-[92px] h-[92px]' : 'w-[116px] h-[116px]'}`}>
        {link?.qrSvgDataUrl ? (
          <img src={link.qrSvgDataUrl} alt={`QR code: ${link.url}`} className="w-full h-full" />
        ) : (
          <div className="w-full h-full rounded-lg bg-bg2 flex items-center justify-center text-muted">
            <Smartphone size={28} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex flex-col gap-1">
        <div className="text-[11px] font-bold tracking-wider text-accent">NO PHONE APP YET?</div>
        <div className={`font-semibold ${compact ? 'text-[14px]' : 'text-[15.5px]'}`}>Scan to get PinchDrop for Android</div>
        <div className="text-[12.5px] text-muted leading-snug">
          Point your phone's camera at the code. It opens the download; then open the app and tap <b className="text-soft">Pair with PC</b>.
        </div>
        <div className="text-[11.5px] text-muted font-mono truncate" title={link?.url}>{short}</div>
      </div>
    </div>
  );
}

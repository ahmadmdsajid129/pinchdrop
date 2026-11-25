import { useState, useEffect } from 'react';

export interface QrPairingPayload {
  device_id: string;
  device_name: string;
  public_key: string;
  cert_fingerprint: string;
  nonce: string;
  addresses: string[];
  port: number;
}

export function usePairing() {
  const [pairingPayload, setPairingPayload] = useState<QrPairingPayload | null>(null);
  const [isPhoneConnected, setIsPhoneConnected] = useState<boolean>(true);
  const [connectedDeviceName] = useState<string>('Pixel 9 Pro');

  useEffect(() => {
    async function fetchPayload() {
      try {
        if ((window as any).__TAURI_INTERNALS__) {
          const { invoke } = await import('@tauri-apps/api/core');
          const payload = await invoke<QrPairingPayload>('get_pairing_qr_payload');
          setPairingPayload(payload);
        } else {
          // Dev fallback
          setPairingPayload({
            device_id: 'pc_desktop_primary',
            device_name: 'PinchDrop Windows PC',
            public_key: 'ed25519_pub_sample_key_4821',
            cert_fingerprint: 'SHA256:7C:5C:FF:22:D3:EE:34:D3:99',
            nonce: `nonce_${Date.now()}`,
            addresses: ['192.168.1.105'],
            port: 49152,
          });
        }
      } catch (err) {
        console.error('Failed to load pairing payload:', err);
      }
    }

    fetchPayload();
  }, []);

  return {
    pairingPayload,
    isPhoneConnected,
    connectedDeviceName,
    setIsPhoneConnected,
  };
}

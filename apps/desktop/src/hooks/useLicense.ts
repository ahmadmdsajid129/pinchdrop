import { useState, useEffect } from 'react';

export type LicenseTier = 'free' | 'pro_lifetime' | 'pro_annual';

export interface LicenseInfo {
  is_pro: boolean;
  tier: LicenseTier;
  key?: string | null;
  email?: string | null;
  activated_at?: string | null;
  pro_features: string[];
}

export function useLicense() {
  const [license, setLicense] = useState<LicenseInfo>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pinchdrop_license_cache');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // fallback
        }
      }
    }
    return {
      is_pro: false,
      tier: 'free',
      pro_features: [],
    };
  });

  useEffect(() => {
    async function loadLicense() {
      try {
        if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
          const { invoke } = await import('@tauri-apps/api/core');
          const info = await invoke<LicenseInfo>('get_license_info');
          setLicense(info);
          localStorage.setItem('pinchdrop_license_cache', JSON.stringify(info));
        }
      } catch (err) {
        console.error('Failed to query license state:', err);
      }
    }
    loadLicense();
  }, []);

  const activateLicense = async (key: string): Promise<{ success: boolean; error?: string }> => {
    const cleanKey = key.trim().toUpperCase();
    if (!cleanKey) {
      return { success: false, error: 'License key cannot be empty' };
    }

    try {
      if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<LicenseInfo>('activate_license_key', { key: cleanKey });
        setLicense(info);
        localStorage.setItem('pinchdrop_license_cache', JSON.stringify(info));
        return { success: true };
      } else {
        // Dev offline validation
        if (cleanKey.startsWith('PDROP-PRO-LIFETIME') || cleanKey.startsWith('PDROP-PRO-ANNUAL')) {
          const info: LicenseInfo = {
            is_pro: true,
            tier: cleanKey.startsWith('PDROP-PRO-LIFETIME') ? 'pro_lifetime' : 'pro_annual',
            key: cleanKey,
            email: 'demo.developer@pinchdrop.local',
            activated_at: new Date().toISOString(),
            pro_features: [
              'two_hand_lasso_select',
              'unlimited_paired_devices',
              'smart_folder_routing',
              'custom_gesture_trainer',
              'explorer_desktop_mode',
              'unlimited_undo_history',
            ],
          };
          setLicense(info);
          localStorage.setItem('pinchdrop_license_cache', JSON.stringify(info));
          return { success: true };
        } else {
          return { success: false, error: 'Invalid key. Must start with PDROP-PRO-LIFETIME or PDROP-PRO-ANNUAL' };
        }
      }
    } catch (err: unknown) {
      const errorMsg = typeof err === 'string' ? err : 'License activation failed';
      return { success: false, error: errorMsg };
    }
  };

  const deactivateLicense = async () => {
    try {
      if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const info = await invoke<LicenseInfo>('deactivate_license');
        setLicense(info);
        localStorage.setItem('pinchdrop_license_cache', JSON.stringify(info));
      } else {
        const info: LicenseInfo = { is_pro: false, tier: 'free', pro_features: [] };
        setLicense(info);
        localStorage.removeItem('pinchdrop_license_cache');
      }
    } catch (err) {
      console.error('Failed to deactivate license:', err);
    }
  };

  const hasFeature = (feature: string): boolean => {
    return license.is_pro && license.pro_features.includes(feature);
  };

  return {
    isPro: license.is_pro,
    tier: license.tier,
    key: license.key,
    email: license.email,
    proFeatures: license.pro_features,
    activateLicense,
    deactivateLicense,
    hasFeature,
  };
}

// Thin wrapper over the Rust commands. Outside Tauri (plain browser during
// UI development) it falls back to a localStorage mock so screens still work.

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from './types';
import type { DeepPartial, PathInfo, PhoneStatus, Settings } from './types';

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

// ---------- browser mock ----------
const MOCK_KEY = 'pd-mock-settings';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pd-mock') : null;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
  return out as T;
}

function mockSettings(): Settings {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    return raw ? deepMerge(DEFAULT_SETTINGS, JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function mockPhone(s: Settings): PhoneStatus {
  return s.demoPhone
    ? {
        state: 'connected',
        name: 'Demo phone',
        model: 'Preview only · not a real connection',
        battery: 78,
        charging: true,
        network: 'Same Wi-Fi',
        freeSpaceGb: 82,
        isDemo: true,
      }
    : { state: 'none', name: null, model: null, battery: null, charging: false, network: null, freeSpaceGb: null, isDemo: false };
}

// ---------- commands ----------
export const api = {
  getSettings: (): Promise<Settings> => (inTauri ? invoke('get_settings') : Promise.resolve(mockSettings())),

  updateSettings: async (patch: DeepPartial<Settings>): Promise<Settings> => {
    if (inTauri) return invoke('update_settings', { patch });
    const next = deepMerge(mockSettings(), patch);
    localStorage.setItem(MOCK_KEY, JSON.stringify(next));
    channel?.postMessage({ type: 'settings', next });
    window.dispatchEvent(new CustomEvent('pd-settings', { detail: next }));
    return next;
  },

  getPhoneStatus: (): Promise<PhoneStatus> =>
    inTauri ? invoke('get_phone_status') : Promise.resolve(mockPhone(mockSettings())),

  getAutostart: (): Promise<boolean> => (inTauri ? invoke('get_autostart') : Promise.resolve(false)),
  setAutostart: (enabled: boolean): Promise<boolean> =>
    inTauri ? invoke('set_autostart', { enabled }) : Promise.resolve(enabled),

  pillResize: (width: number, height: number) =>
    inTauri ? invoke<void>('pill_resize', { width, height }) : Promise.resolve(),
  pillDragEnd: () => (inTauri ? invoke<void>('pill_drag_end') : Promise.resolve()),
  pillResetPosition: () => (inTauri ? invoke<void>('pill_reset_position') : Promise.resolve()),
  pillHideFor: (minutes: number) => (inTauri ? invoke<void>('pill_hide_for', { minutes }) : Promise.resolve()),

  openMain: (route = 'home') => {
    if (inTauri) return invoke<void>('open_main', { route });
    window.open(`/index.html#${route}`, 'pinchdrop-main');
    return Promise.resolve();
  },
  quit: () => (inTauri ? invoke<void>('quit_app') : Promise.resolve()),

  getAppInfo: (): Promise<{ version: string; configDir: string }> =>
    inTauri ? invoke('get_app_info') : Promise.resolve({ version: '0.1.0 (browser preview)', configDir: '—' }),
  openConfigFolder: () => (inTauri ? invoke<void>('open_config_folder') : Promise.resolve()),

  inspectPaths: (paths: string[]): Promise<PathInfo[]> =>
    inTauri
      ? invoke('inspect_paths', { paths })
      : Promise.resolve(
          paths.map((p) => ({
            path: p,
            name: p.split(/[\\/]/).pop() || p,
            isDir: !p.includes('.'),
            sizeBytes: 0,
            fileCount: 1,
            partial: false,
            error: null,
          })),
        ),

  resetApp: async (): Promise<Settings> => {
    if (inTauri) return invoke('reset_app');
    localStorage.removeItem(MOCK_KEY);
    return api.updateSettings({});
  },
};

// ---------- event helpers ----------
export async function onEvent<T>(name: string, handler: (payload: T) => void): Promise<() => void> {
  if (!inTauri) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(name, (e) => handler(e.payload));
}

function useAsyncSubscription(effect: () => Promise<() => void>, deps: unknown[]) {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    effect().then((c) => {
      if (cancelled) c();
      else cleanup = c;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Live settings shared across both windows. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings);
    const onLocal = (e: Event) => setSettings((e as CustomEvent<Settings>).detail);
    const onChannel = (e: MessageEvent) => e.data?.type === 'settings' && setSettings(e.data.next);
    window.addEventListener('pd-settings', onLocal);
    channel?.addEventListener('message', onChannel);
    return () => {
      window.removeEventListener('pd-settings', onLocal);
      channel?.removeEventListener('message', onChannel);
    };
  }, []);

  useAsyncSubscription(() => onEvent<Settings>('settings-changed', setSettings), []);

  const update = useCallback(async (patch: DeepPartial<Settings>) => {
    const next = await api.updateSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, update };
}

/** Live phone status (connected / none / offline). */
export function usePhone() {
  const [phone, setPhone] = useState<PhoneStatus | null>(null);
  useEffect(() => {
    api.getPhoneStatus().then(setPhone);
    const refresh = () => api.getPhoneStatus().then(setPhone);
    window.addEventListener('pd-settings', refresh);
    channel?.addEventListener('message', refresh);
    return () => {
      window.removeEventListener('pd-settings', refresh);
      channel?.removeEventListener('message', refresh);
    };
  }, []);
  useAsyncSubscription(() => onEvent<PhoneStatus>('phone-status', setPhone), []);
  return phone;
}

/** Applies the theme setting to <html data-theme>. Pass `force` to pin one (the pill is always dark). */
export function useTheme(theme: Settings['theme'] | undefined, force?: 'dark' | 'light') {
  useEffect(() => {
    const root = document.documentElement;
    if (force) {
      root.dataset.theme = force;
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      root.dataset.theme = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme ?? 'dark';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, force]);
}

/** True when animations should be minimal (setting, or Windows "animation effects" off). */
export function useReducedMotion(motion: Settings['motion'] | undefined): boolean {
  const [systemReduced, setSystemReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystemReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  return systemReduced;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

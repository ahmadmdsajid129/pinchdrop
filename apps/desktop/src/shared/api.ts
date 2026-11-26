// Thin wrapper over the Rust commands. Outside Tauri (plain browser during
// UI development) it falls back to a localStorage mock so screens still work.

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from './types';
import type { Contact, FoundPc, PhonePhoto, PlaceView, PhoneLive, DeepPartial, DeviceView, HoldView, ItemPreviewData, LiftView, NotifView, SmsThread, SmsThreadDetail, PairInfo, PairRequest, PathInfo, PhoneStatus, SessionView, Settings, TransferView } from './types';

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

  getAppInfo: (): Promise<{ version: string; configDir: string; fingerprint: string | null }> =>
    inTauri ? invoke('get_app_info') : Promise.resolve({ version: '0.1.0 (browser preview)', configDir: '—', fingerprint: null }),
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

  // Phase 3 link. In a plain browser there is no network side, so these report "unavailable".
  pairingOpen: (): Promise<PairInfo> =>
    inTauri
      ? invoke('pairing_open')
      : Promise.resolve({
          url: '',
          qrSvgDataUrl: '',
          pcName: mockSettings().profile.pcName,
          hosts: [],
          port: null,
          fingerprint: '',
          expiresInSecs: 0,
          listenError: 'Pairing works only in the PinchDrop app, not in a browser preview.',
        }),
  pairingClose: () => (inTauri ? invoke<void>('pairing_close') : Promise.resolve()),
  pairingRequest: (): Promise<PairRequest | null> => (inTauri ? invoke('pairing_request') : Promise.resolve(null)),
  pairingRespond: (accept: boolean) => (inTauri ? invoke<void>('pairing_respond', { accept }) : Promise.resolve()),
  /** v2 · Dropped on a device chip: straight to that device. */
  sendToDevice: (items: unknown, deviceId: string): Promise<string> => (inTauri ? invoke('send_to_device', { items, deviceId }) : Promise.resolve('')),
  listDevices: (): Promise<DeviceView[]> => (inTauri ? invoke('list_devices') : Promise.resolve([])),
  unpairDevice: (id: string) => (inTauri ? invoke<void>('unpair_device', { id }) : Promise.resolve()),

  // Phase 4 transfers.
  sendItems: (paths: string[], texts: string[], destination: 'auto' | 'downloads', deviceId?: string | null): Promise<string> =>
    inTauri
      ? invoke('send_items', { paths, texts, destination, deviceId: deviceId ?? null })
      : Promise.reject(new Error('Sending works only in the PinchDrop app, not in a browser preview.')),
  listTransfers: (): Promise<TransferView[]> => (inTauri ? invoke('list_transfers') : Promise.resolve([])),
  cancelTransfer: (id: string) => (inTauri ? invoke<void>('cancel_transfer', { id }) : Promise.resolve()),
  clearTransferHistory: () => (inTauri ? invoke<void>('clear_transfer_history') : Promise.resolve()),

  // Camera session: starts when the pill is clicked, ends after 30 s without activity.
  gestureSessionStart: (): Promise<SessionView> =>
    inTauri ? invoke('gesture_session_start') : Promise.reject(new Error('Hand tracking works only in the PinchDrop app.')),
  gestureSessionStop: () => (inTauri ? invoke<void>('gesture_session_stop') : Promise.resolve()),
  gestureSessionState: (): Promise<SessionView | null> => (inTauri ? invoke('gesture_session_state') : Promise.resolve(null)),

  /** Plays a full-screen send animation on the click-through overlay. */
  playSendFx: async (detail: Record<string, unknown>) => {
    if (!inTauri) return;
    await invoke<void>('overlay_flash', { ms: detail.kind === 'landed' ? 1500 : 1800 });
    const { emitTo } = await import('@tauri-apps/api/event');
    // Give the just-shown overlay a frame to wake up before it starts animating.
    window.setTimeout(() => void emitTo('overlay', 'send-fx', detail), 140);
  },

  /** The look of a send (thumbnail, folder…) for its lift-off animation. */
  transferPreview: (id: string): Promise<ItemPreviewData | null> =>
    inTauri ? invoke<ItemPreviewData | null>('transfer_preview', { id }).catch(() => null) : Promise.resolve(null),

  // v2 · The phone's notifications, messages and contacts (asked from the phone; nothing kept on disk).
  phoneNotifications: (): Promise<NotifView[]> => (inTauri ? invoke('phone_notifications') : Promise.resolve([])),
  notifDismiss: (key: string) => (inTauri ? invoke<void>('notif_dismiss', { key }) : Promise.resolve()),
  notifReply: (key: string, text: string) => (inTauri ? invoke<void>('notif_reply', { key, text }) : Promise.resolve()),
  smsThreads: async (deviceId?: string | null): Promise<SmsThread[]> =>
    inTauri ? ((await invoke<{ threads: SmsThread[] }>('sms_threads', { deviceId: deviceId ?? null })).threads ?? []) : DEMO_THREADS,
  smsThread: (threadId: number, deviceId?: string | null): Promise<SmsThreadDetail> =>
    inTauri ? invoke('sms_thread', { threadId, deviceId: deviceId ?? null }) : Promise.resolve(demoThread(threadId)),
  smsSend: (address: string, text: string, deviceId?: string | null) =>
    inTauri ? invoke<void>('sms_send', { address, text, deviceId: deviceId ?? null }) : Promise.resolve(),
  contacts: async (deviceId?: string | null): Promise<Contact[]> =>
    inTauri ? ((await invoke<{ contacts: Contact[] }>('contacts_list', { deviceId: deviceId ?? null })).contacts ?? []) : DEMO_CONTACTS,
  dial: (number: string, deviceId?: string | null): Promise<{ how: string }> =>
    inTauri ? invoke('phone_dial', { number, deviceId: deviceId ?? null }) : Promise.resolve({ how: 'calling' }),

  // v2 · Map and photos.
  phonePlaces: (): Promise<PlaceView[]> => (inTauri ? invoke('phone_places') : Promise.resolve([])),
  phonePhotos: async (deviceId?: string | null): Promise<PhonePhoto[]> =>
    inTauri ? ((await invoke<{ photos: PhonePhoto[] }>('phone_photos', { deviceId: deviceId ?? null })).photos ?? []) : [],
  phonePhotoSend: (id: number, deviceId?: string | null) => (inTauri ? invoke<void>('phone_photo_send', { id, deviceId: deviceId ?? null }) : Promise.resolve()),

  // v2 · Laptop ↔ laptop.
  peerDiscover: (): Promise<FoundPc[]> => (inTauri ? invoke('peer_discover') : Promise.resolve([{ pcId: 'demo', name: 'Office laptop', hosts: ['192.168.1.20'], port: 47821, fingerprint: '', paired: false }])),
  peerPairStart: (pcId: string) => (inTauri ? invoke<void>('peer_pair_start', { pcId }) : Promise.resolve()),
  peerPairAnswer: (ok: boolean) => (inTauri ? invoke<void>('peer_pair_answer', { ok }) : Promise.resolve()),

  // v2 · Calls, unread badge, find my phone.
  phoneLive: (): Promise<PhoneLive[]> => (inTauri ? invoke('phone_live') : Promise.resolve([])),
  clearMissed: (deviceId?: string | null) => (inTauri ? invoke<void>('clear_missed', { deviceId: deviceId ?? null }) : Promise.resolve()),
  callAction: (action: 'answer' | 'reject' | 'silence', deviceId?: string | null) =>
    inTauri ? invoke<void>('call_action', { action, deviceId: deviceId ?? null }) : Promise.resolve(),
  mediaCmd: (action: 'play' | 'pause' | 'toggle' | 'next' | 'previous', deviceId?: string | null) =>
    inTauri ? invoke<void>('media_cmd', { action, deviceId: deviceId ?? null }) : Promise.resolve(),
  findPhone: (stop = false) => (inTauri ? invoke<void>('find_phone', { stop }) : Promise.resolve()),

  // v2 · Lift (phone → PC).
  liftState: (): Promise<LiftView | null> => (inTauri ? invoke<LiftView | null>('lift_state') : Promise.resolve(null)),
  liftCatch: (id?: string) => (inTauri ? invoke<void>('lift_catch', { id: id ?? null }) : Promise.resolve()),
  liftDismiss: () => (inTauri ? invoke<void>('lift_dismiss') : Promise.resolve()),

  // Phase 5 grab-and-hold.
  holdState: (): Promise<HoldView | null> => (inTauri ? invoke('hold_state') : Promise.resolve(null)),
  holdCancel: () => (inTauri ? invoke<void>('hold_cancel') : Promise.resolve()),
  holdSendNow: (): Promise<string> => (inTauri ? invoke('hold_send_now') : Promise.reject(new Error('Only in the app'))),

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

/** Live list of paired phones (Phase 3). */
export function useDevices() {
  const [devices, setDevices] = useState<DeviceView[]>([]);
  useEffect(() => {
    api.listDevices().then(setDevices);
  }, []);
  useAsyncSubscription(() => onEvent<DeviceView[]>('devices-changed', setDevices), []);
  return devices;
}

/** v2 · Unread texts and calls of every connected phone, live (for the pill). */
export function usePhoneLive() {
  const [live, setLive] = useState<PhoneLive[]>([]);
  useEffect(() => {
    api.phoneLive().then(setLive);
  }, []);
  useAsyncSubscription(() => onEvent<PhoneLive[]>('phone-live', setLive), []);
  useEffect(() => {
    if (inTauri) return;
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { type: string; live?: PhoneLive | PhoneLive[] };
      if (d.type === 'live' && d.live) setLive(Array.isArray(d.live) ? d.live : [d.live]);
    };
    window.addEventListener('pd-demo', on);
    return () => window.removeEventListener('pd-demo', on);
  }, []);
  return live;
}

/** v2 · The phone's current notifications, live. */
export function useNotifications() {
  const [items, setItems] = useState<NotifView[]>([]);
  useEffect(() => {
    api.phoneNotifications().then(setItems);
  }, []);
  useAsyncSubscription(() => onEvent<NotifView[]>('phone-notifs', setItems), []);
  return items;
}

// Design-preview data for the plain browser only (never shown in the app).
const DEMO_THREADS: SmsThread[] = [
  { threadId: 1, address: '+919800000001', name: 'Ammi', snippet: 'Khana kha liya?', date: Date.now() - 5 * 60e3, unread: 2, outgoing: false },
  { threadId: 2, address: 'AX-HDFCBK', name: null, snippet: 'OTP for your transaction is 482913. Do not share.', date: Date.now() - 3600e3, unread: 0, outgoing: false },
  { threadId: 3, address: '+919800000002', name: 'Rahul', snippet: 'See you at 7', date: Date.now() - 86400e3, unread: 0, outgoing: true },
];
function demoThread(threadId: number): SmsThreadDetail {
  const t = DEMO_THREADS.find((x) => x.threadId === threadId) ?? DEMO_THREADS[0];
  return {
    threadId,
    address: t.address,
    name: t.name,
    messages: [
      { id: 1, body: 'Kab aa rahe ho ghar?', date: Date.now() - 30 * 60e3, outgoing: false, status: 'received' },
      { id: 2, body: 'Shaam tak, inshallah', date: Date.now() - 25 * 60e3, outgoing: true, status: 'sent' },
      { id: 3, body: t.snippet, date: t.date, outgoing: t.outgoing, status: t.outgoing ? 'sent' : 'received' },
    ],
  };
}
const DEMO_CONTACTS: Contact[] = [
  { id: 1, name: 'Ammi', starred: true, numbers: [{ number: '+919800000001', label: 'Mobile' }] },
  { id: 2, name: 'Rahul Sharma', starred: false, numbers: [{ number: '+919800000002', label: 'Mobile' }, { number: '+911140000000', label: 'Work' }] },
  { id: 3, name: 'Zoya', starred: false, numbers: [{ number: '+919800000003', label: 'Mobile' }] },
];

/** Live list of sends, newest first (Phase 4). */
export function useTransfers() {
  const [transfers, setTransfers] = useState<TransferView[]>([]);
  useEffect(() => {
    api.listTransfers().then(setTransfers);
  }, []);
  useAsyncSubscription(() => onEvent<TransferView[]>('transfers-changed', setTransfers), []);
  return transfers;
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
      root.dataset.theme = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme ?? 'light';
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

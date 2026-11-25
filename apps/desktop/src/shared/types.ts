// Mirrors src-tauri/src/settings.rs and phone.rs (camelCase over IPC).

export interface PillSettings {
  visible: boolean;
  x: number | null;
  y: number | null;
  anchorH: 'left' | 'center' | 'right';
  anchorV: 'top' | 'bottom';
  shows: 'name_battery' | 'battery' | 'dot';
  size: 's' | 'm' | 'l';
  islandAutoCloseSecs: number;
  hideInFullscreen: boolean;
}

export interface GestureSettings {
  enabled: boolean;
  cameraId: string | null;
  /** on_click: camera only after clicking the pill, off after 30 s idle (default). */
  cameraMode: 'on_click' | 'hotkey' | 'on_select';
  sensitivity: number;
  catchSecs: number;
  showHandRing: boolean;
  sounds: boolean;
}

export interface TransferSettings {
  mode: 'copy' | 'move';
  nameClash: 'keep_both' | 'replace';
  autoResume: boolean;
  openFirst: boolean;
}

export interface Settings {
  onboarded: boolean;
  keepRunningOnClose: boolean;
  theme: 'dark' | 'light' | 'system';
  motion: 'system' | 'full' | 'reduced';
  pill: PillSettings;
  gestures: GestureSettings;
  transfers: TransferSettings;
  notifications: { onFinish: boolean; onDisconnect: boolean };
  crashReports: boolean;
  profile: { pcName: string; avatarColor: string };
  demoPhone: boolean;
}

export interface PhoneStatus {
  state: 'none' | 'connected' | 'offline';
  name: string | null;
  model: string | null;
  battery: number | null;
  charging: boolean;
  network: string | null;
  freeSpaceGb: number | null;
  isDemo: boolean;
}

/** Phase 3 pairing: what the Pair screen shows. Mirrors link::PairInfo. */
export interface PairInfo {
  url: string;
  qrSvgDataUrl: string;
  pcName: string;
  hosts: string[];
  port: number | null;
  fingerprint: string;
  expiresInSecs: number;
  listenError: string | null;
}

/** A phone asking to pair, with the 6-digit code both screens show. Mirrors link::PairRequestView. */
export interface PairRequest {
  phoneName: string;
  phoneModel: string;
  code: string;
  phoneConfirmed: boolean;
  pcConfirmed: boolean;
}

export interface PairResult {
  outcome: 'paired' | 'cancelled' | 'mismatch' | 'phone_left';
  phoneName: string;
}

/** One paired phone. Mirrors link::DeviceView. */
export interface DeviceView {
  id: string;
  name: string;
  model: string;
  pairedAt: number;
  lastSeen: number;
  connected: boolean;
  battery: number | null;
  charging: boolean;
  network: string | null;
  freeSpaceGb: number | null;
}

/** One send, as the Transfers screen shows it. Mirrors link::transfer::TransferView. */
export interface TransferView {
  id: string;
  deviceName: string;
  label: string;
  createdAt: number;
  finishedAt: number | null;
  state: 'offered' | 'sending' | 'paused' | 'done' | 'declined' | 'failed' | 'cancelled';
  error: string | null;
  mode: 'copy' | 'move';
  fileCount: number;
  textCount: number;
  totalBytes: number;
  filesDone: number;
  bytesDone: number;
  moved: boolean;
  firstName: string | null;
}

/** The click-started camera session. Mirrors grab::SessionView. */
export interface SessionView {
  active: boolean;
  endsInMs: number;
  idleSecs: number;
  reason: 'idle' | 'stopped' | 'holding' | 'error' | 'disabled' | null;
}

/** Something grabbed by pinch and held, counting down on the Island. Mirrors grab::HoldView. */
export interface HoldView {
  id: string;
  label: string;
  fileCount: number;
  totalBytes: number;
  isFolder: boolean;
  expiresInMs: number;
  totalMs: number;
  phoneName: string | null;
}

export interface PathInfo {
  path: string;
  name: string;
  isDir: boolean;
  sizeBytes: number;
  fileCount: number;
  partial: boolean;
  error: string | null;
}

/** Recursive partial, for settings patches. */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  keepRunningOnClose: true,
  theme: 'dark',
  motion: 'system',
  pill: {
    visible: true,
    x: null,
    y: null,
    anchorH: 'center',
    anchorV: 'top',
    shows: 'name_battery',
    size: 'm',
    islandAutoCloseSecs: 4,
    hideInFullscreen: true,
  },
  gestures: {
    enabled: true,
    cameraId: null,
    cameraMode: 'on_click',
    sensitivity: 55,
    catchSecs: 30,
    showHandRing: true,
    sounds: true,
  },
  transfers: { mode: 'copy', nameClash: 'keep_both', autoResume: true, openFirst: false },
  notifications: { onFinish: true, onDisconnect: false },
  crashReports: false,
  profile: { pcName: 'My PC', avatarColor: '#22D3EE' },
  demoPhone: false,
};

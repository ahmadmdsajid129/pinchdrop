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
  cameraMode: 'on_select' | 'hotkey' | 'always';
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
    cameraMode: 'on_select',
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

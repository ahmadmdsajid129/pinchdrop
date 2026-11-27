// v2 · Updates from GitHub Releases (signed; the app checks the signature before installing).
// The Microsoft Store version has no updater plugin: every call here fails quietly there.

import { useEffect, useState } from 'react';
import { inTauri } from './api';

export interface UpdateInfo {
  version: string;
  notes: string;
}

type State =
  | { stage: 'idle' }
  | { stage: 'checking' }
  | { stage: 'none' }
  | { stage: 'available'; info: UpdateInfo }
  | { stage: 'downloading'; info: UpdateInfo; pct: number }
  | { stage: 'ready'; info: UpdateInfo }
  | { stage: 'error'; message: string };

let state: State = { stage: 'idle' };
const listeners = new Set<(s: State) => void>();
const set = (s: State) => {
  state = s;
  listeners.forEach((l) => l(s));
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pending: any = null;

/** Looks for a newer version. `quiet`: no error state (background checks). */
export async function checkForUpdate(quiet = false): Promise<void> {
  if (!inTauri || state.stage === 'downloading') return;
  if (!quiet) set({ stage: 'checking' });
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const u = await check();
    if (u) {
      pending = u;
      set({ stage: 'available', info: { version: u.version, notes: u.body ?? '' } });
    } else if (!quiet) set({ stage: 'none' });
  } catch (e) {
    if (!quiet) set({ stage: 'error', message: String(e instanceof Error ? e.message : e) });
  }
}

/** Downloads and installs the update, then restarts PinchDrop. */
export async function installUpdate(): Promise<void> {
  if (!pending || state.stage !== 'available') return;
  const info = state.info;
  let total = 0;
  let got = 0;
  set({ stage: 'downloading', info, pct: 0 });
  try {
    await pending.downloadAndInstall((ev: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => {
      if (ev.event === 'Started') total = ev.data?.contentLength ?? 0;
      else if (ev.event === 'Progress') {
        got += ev.data?.chunkLength ?? 0;
        if (total > 0) set({ stage: 'downloading', info, pct: Math.min(99, Math.round((got / total) * 100)) });
      }
    });
    set({ stage: 'ready', info });
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    set({ stage: 'error', message: String(e instanceof Error ? e.message : e) });
  }
}

export function useUpdate(): State {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    listeners.add(setS);
    return () => void listeners.delete(setS);
  }, []);
  return s;
}

/** Background checks: shortly after start, then every 6 hours. */
export function startUpdateChecks() {
  if (!inTauri) return;
  window.setTimeout(() => void checkForUpdate(true), 20_000);
  window.setInterval(() => void checkForUpdate(true), 6 * 60 * 60 * 1000);
}

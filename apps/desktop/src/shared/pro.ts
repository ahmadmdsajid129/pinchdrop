// v2 · PinchDrop Pro: status, feature names and the upgrade prompt (shared by all windows).

import { useEffect, useState } from 'react';

export const inTauriPro = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface ProStatus {
  /** "pro" (a valid key), "trial" or "free". */
  plan: 'pro' | 'trial' | 'free';
  /** Pro features are on (a key, or the trial). */
  active: boolean;
  trialDaysLeft: number;
  kind: 'lifetime' | 'year' | 'month' | null;
  licensee: string | null;
  expires: number | null;
  problem: string | null;
}

/** Where people buy a key. Empty until the payment page exists; then the Buy button appears. */
export const BUY_URL = '';

/** The trial length and free send limit live in Rust (license.rs); these are the words for them. */
export const TRIAL_DAYS_TEXT = '7 days';
export const FREE_LIMIT_TEXT = '2 GB';

/** Every Pro feature, as the upgrade prompt names it. Keys match the Rust `license::need(…)` names. */
export const PRO_FEATURES: Record<string, { title: string; line: string }> = {
  phones: { title: 'More than one phone', line: 'Connect all your phones and drag files between them.' },
  reply: { title: 'Reply from your PC', line: 'Answer WhatsApp, Instagram and text messages with your keyboard.' },
  calls: { title: 'Answer calls from your PC', line: 'Answer, reject or silence calls with a click or your palm.' },
  files: { title: 'Phone files', line: "Browse your phone's folders and drop files straight into them." },
  photos: { title: 'Photo strip', line: 'Your latest photos on the pill; click one to bring it over.' },
  music: { title: 'Now Playing', line: "Control your phone's music from the pill." },
  map: { title: 'Find my phones', line: 'See where your phones are, and where they were last seen.' },
  otp: { title: 'Codes copied for you', line: 'One-time codes from texts land on your PC clipboard.' },
  large: { title: `Sends over ${FREE_LIMIT_TEXT}`, line: 'Send whole projects, films and backups in one go.' },
  themes: { title: 'Pill Studio', line: 'Designed pill themes (Aurora, Liquid Glass, Neon Tokyo, Cassette), shapes and a clock.' },
};

/** The order the Pro page lists them in. */
export const PRO_LIST = ['themes', 'phones', 'reply', 'calls', 'files', 'photos', 'music', 'map', 'otp', 'large'];

const FREE: ProStatus = { plan: 'free', active: false, trialDaysLeft: 0, kind: null, licensee: null, expires: null, problem: null };
/** Outside the app (UI preview in a browser): pretend the trial is on. */
const MOCK: ProStatus = { ...FREE, plan: 'trial', active: true, trialDaysLeft: 7 };

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export const proApi = {
  get: (): Promise<ProStatus> => (inTauriPro ? call<ProStatus>('get_pro') : Promise.resolve(MOCK)),
  activate: (key: string): Promise<ProStatus> => call<ProStatus>('activate_license', { key }),
  remove: (): Promise<ProStatus> => call<ProStatus>('remove_license'),
};

/** Live Pro status. Re-checked every 10 minutes (the trial ends by the clock) and on any change. */
export function usePro(): ProStatus {
  const [s, setS] = useState<ProStatus>(inTauriPro ? { ...FREE, active: true } : MOCK);
  useEffect(() => {
    let alive = true;
    const refresh = () => void proApi.get().then((v) => alive && setS(v)).catch(() => undefined);
    refresh();
    const t = window.setInterval(refresh, 10 * 60 * 1000);
    window.addEventListener('focus', refresh);
    let off: (() => void) | undefined;
    if (inTauriPro) {
      void import('@tauri-apps/api/event').then(({ listen }) =>
        listen<ProStatus>('pro-changed', (e) => alive && setS(e.payload)).then((u) => {
          if (alive) off = u;
          else u();
        }),
      );
    }
    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener('focus', refresh);
      off?.();
    };
  }, []);
  return s;
}

/** Shows the upgrade prompt for a feature: in the main window directly, from the pill by opening it. */
export function askUpgrade(feature: string) {
  const isMain = !/pill|overlay/.test(window.location.pathname);
  if (isMain) {
    window.dispatchEvent(new CustomEvent('pd-upgrade', { detail: feature }));
  } else if (inTauriPro) {
    void call('open_main', { route: 'pro' }).catch(() => undefined);
  }
}

/** A Rust "PRO:<feature>" error → open the upgrade prompt and return a friendly message. */
export function proErrorMessage(err: unknown): string | null {
  const m = /^PRO:(\w+)/.exec(String(err instanceof Error ? err.message : err));
  if (!m) return null;
  askUpgrade(m[1]);
  const f = PRO_FEATURES[m[1]];
  return `${f ? f.title : 'This'} is part of PinchDrop Pro.`;
}

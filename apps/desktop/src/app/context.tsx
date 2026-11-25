import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, onEvent, usePhone, useSettings } from '../shared/api';
import type { DeepPartial, PathInfo, PhoneStatus, Settings } from '../shared/types';

export type Route = 'onboarding' | 'home' | 'send' | 'transfers' | 'messages' | 'contacts' | 'notifications' | 'devices' | 'pair' | 'settings' | 'profile';
const ROUTES: Route[] = ['onboarding', 'home', 'send', 'transfers', 'messages', 'contacts', 'notifications', 'devices', 'pair', 'settings', 'profile'];

export interface QueueItem {
  id: string;
  kind: 'file' | 'folder' | 'text';
  info?: PathInfo;
  text?: string;
}

interface Ctx {
  route: Route;
  go: (r: Route) => void;
  settings: Settings;
  update: (patch: DeepPartial<Settings>) => Promise<Settings>;
  phone: PhoneStatus;
  queue: QueueItem[];
  addPaths: (paths: string[]) => Promise<void>;
  addText: (text: string) => void;
  removeItem: (id: string) => void;
  clearQueue: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

function routeFromHash(): Route {
  const h = window.location.hash.replace('#', '') as Route;
  return ROUTES.includes(h) ? h : 'home';
}

let seq = 0;
const newId = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;

export function AppProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  const phone = usePhone();
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  const go = useCallback((r: Route) => {
    setRoute(r);
    window.history.replaceState(null, '', `#${r}`);
  }, []);

  // Rust (tray, pill, second launch) asks the window to show a screen.
  useEffect(() => {
    let off: (() => void) | undefined;
    void onEvent<string>('navigate', (r) => ROUTES.includes(r as Route) && go(r as Route)).then((u) => (off = u));
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => {
      off?.();
      window.removeEventListener('hashchange', onHash);
    };
  }, [go]);

  const addPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    const infos = await api.inspectPaths(paths);
    setQueue((q) => {
      const have = new Set(q.map((i) => i.info?.path));
      const fresh = infos
        .filter((i) => !have.has(i.path))
        .map<QueueItem>((info) => ({ id: newId(), kind: info.isDir ? 'folder' : 'file', info }));
      return [...q, ...fresh];
    });
  }, []);

  const addText = useCallback((text: string) => {
    const t = text.trim();
    if (t) setQueue((q) => [...q, { id: newId(), kind: 'text', text: t }]);
  }, []);

  const removeItem = useCallback((id: string) => setQueue((q) => q.filter((i) => i.id !== id)), []);
  const clearQueue = useCallback(() => setQueue([]), []);

  const value = useMemo(
    () =>
      settings && phone
        ? { route, go, settings, update, phone, queue, addPaths, addText, removeItem, clearQueue }
        : null,
    [route, go, settings, update, phone, queue, addPaths, addText, removeItem, clearQueue],
  );

  if (!value) return <div className="h-full bg-bg" aria-busy="true" />;
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

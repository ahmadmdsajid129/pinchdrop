import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import { inTauri, useReducedMotion, useTheme } from '../shared/api';
import { useApp } from './context';
import { Sidebar } from './Sidebar';
import { Onboarding } from './screens/Onboarding';
import { Home } from './screens/Home';
import { Send } from './screens/Send';
import { Transfers } from './screens/Transfers';
import { Devices } from './screens/Devices';
import { Pair } from './screens/Pair';
import { SettingsScreen } from './screens/Settings';
import { Profile } from './screens/Profile';
import { Messages } from './screens/Messages';
import { Contacts } from './screens/Contacts';
import { PhoneNotifications } from './screens/PhoneNotifications';
import { MapScreen } from './screens/MapScreen';
import { PhoneFiles } from './screens/PhoneFiles';

export function App() {
  const { route, go, settings, addPaths } = useApp();
  useTheme(settings.theme);
  const reduced = useReducedMotion(settings.motion);
  const [dragOver, setDragOver] = useState(false);

  // Files dragged from Explorer onto any screen go into the send list.
  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    void import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
      off = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'enter' || p.type === 'over') setDragOver(true);
        else if (p.type === 'leave') setDragOver(false);
        else if (p.type === 'drop') {
          setDragOver(false);
          void addPaths(p.paths).then(() => go('send'));
        }
      });
    });
    return () => off?.();
  }, [addPaths, go]);

  // v2: the window appears only once this page has drawn (no blank flash on first run).
  useEffect(() => {
    if (!inTauri) return;
    requestAnimationFrame(() => void import('@tauri-apps/api/core').then(({ invoke }) => invoke('main_ready').catch(() => undefined)));
  }, []);

  if (!settings.onboarded || route === 'onboarding') return <Onboarding />;

  const screen = {
    home: <Home />,
    send: <Send />,
    transfers: <Transfers />,
    messages: <Messages />,
    contacts: <Contacts />,
    notifications: <PhoneNotifications />,
    map: <MapScreen />,
    files: <PhoneFiles />,
    devices: <Devices />,
    pair: <Pair />,
    settings: <SettingsScreen />,
    profile: <Profile />,
    onboarding: null,
  }[route];

  return (
    <div className="h-screen flex overflow-hidden bg-bg text-text">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto [scrollbar-gutter:stable]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route}
            className="max-w-[1100px] mx-auto px-8 py-7 flex flex-col gap-5"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0.08 : 0.18, ease: [0.2, 0, 0, 1] } }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0.05 : 0.08 } }}
          >
            {screen}
          </motion.div>
        </AnimatePresence>
      </main>
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-bg/90 flex items-center justify-center pointer-events-none animate-[pd-fade_120ms_ease-out]">
          <div className="rounded-3xl border-2 border-dashed border-primary px-16 py-12 flex flex-col items-center gap-3 bg-surface">
            <Upload size={36} className="text-primary-ink" aria-hidden="true" />
            <div className="font-display text-[20px] font-semibold">Drop to add to the send list</div>
          </div>
        </div>
      )}
    </div>
  );
}

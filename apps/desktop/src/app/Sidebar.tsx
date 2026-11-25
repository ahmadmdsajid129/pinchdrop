import { Clock, Hand, Home, SlidersHorizontal, Smartphone, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from './context';
import type { Route } from './context';
import { Battery } from '../shared/Battery';

const NAV: { route: Route; label: string; icon: ReactNode }[] = [
  { route: 'home', label: 'Home', icon: <Home size={18} aria-hidden="true" /> },
  { route: 'send', label: 'Send', icon: <Upload size={18} aria-hidden="true" /> },
  { route: 'transfers', label: 'Transfers', icon: <Clock size={18} aria-hidden="true" /> },
  { route: 'devices', label: 'Devices', icon: <Smartphone size={18} aria-hidden="true" /> },
  { route: 'settings', label: 'Settings', icon: <SlidersHorizontal size={18} aria-hidden="true" /> },
];

export function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return 'PC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Sidebar() {
  const { route, go, phone, settings, queue } = useApp();
  const active = (r: Route) => route === r || (r === 'devices' && route === 'pair');

  return (
    <nav aria-label="Main" className="w-[248px] h-full shrink-0 bg-bg2 border-r border-surface2 px-3.5 py-5 flex flex-col gap-1.5 overflow-hidden [@media(max-height:640px)]:py-3 [@media(max-height:640px)]:gap-0.5 max-[860px]:w-[72px] max-[860px]:px-2.5">
      <div className="flex items-center gap-2.5 px-2.5 pb-5 shrink-0 [@media(max-height:640px)]:pb-2 max-[860px]:px-1.5">
        <span className="w-8 h-8 rounded-[10px] bg-primary flex items-center justify-center text-white">
          <Hand size={18} aria-hidden="true" />
        </span>
        <span className="font-display font-bold text-[17px] max-[860px]:hidden">PinchDrop</span>
      </div>

      {NAV.map((n) => (
        <button
          key={n.route}
          type="button"
          onClick={() => go(n.route)}
          aria-current={active(n.route) ? 'page' : undefined}
          title={n.label}
          className={`flex items-center gap-3 h-[42px] shrink-0 px-3 rounded-xl text-[14px] text-left [@media(max-height:640px)]:h-[36px] max-[860px]:justify-center max-[860px]:px-0 max-[860px]:relative ${
            active(n.route) ? 'bg-surface2 text-text font-semibold' : 'text-soft hover:bg-surface hover:text-text'
          }`}
        >
          {n.icon}
          <span className="flex-1 max-[860px]:hidden">{n.label}</span>
          {n.route === 'send' && queue.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full max-[860px]:absolute max-[860px]:-top-1 max-[860px]:-right-1 bg-primary text-white text-[11px] font-bold flex items-center justify-center">{queue.length}</span>
          )}
        </button>
      ))}

      <div className="flex-1 min-h-2" />

      <button
        type="button"
        onClick={() => go(phone.state === 'none' ? 'pair' : 'devices')}
        title={phone.state === 'none' ? 'Pair a phone' : phone.name ?? 'Phone'}
        className="p-3 shrink-0 rounded-[14px] bg-surface border border-line flex items-center gap-2.5 text-left hover:border-primary/60 [@media(max-height:640px)]:p-2 max-[860px]:justify-center max-[860px]:p-2"
      >
        <Smartphone size={16} aria-hidden="true" className="hidden max-[860px]:block text-soft" />
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${phone.state === 'connected' ? 'bg-success' : phone.state === 'offline' ? 'bg-warn' : 'bg-muted'}`}
        />
        <span className="flex-1 min-w-0 max-[860px]:hidden">
          <span className="block text-[13px] font-semibold truncate">{phone.state === 'none' ? 'No phone yet' : phone.name}</span>
          <span className="block text-[11px] text-muted">
            {phone.state === 'none' ? 'Pair a phone' : phone.state === 'connected' ? `Connected${phone.isDemo ? ' · demo' : ''}` : 'Offline'}
          </span>
        </span>
        {phone.state === 'connected' && phone.battery != null && (
          <span className="flex items-center gap-1 text-[12px] font-semibold max-[860px]:hidden">
            <Battery level={phone.battery} charging={phone.charging} size={16} />
            {phone.battery}%
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => go('profile')}
        aria-current={route === 'profile' ? 'page' : undefined}
        title={settings.profile.pcName}
        className={`flex items-center gap-2.5 px-3 py-2.5 shrink-0 rounded-xl text-left [@media(max-height:640px)]:py-1.5 max-[860px]:justify-center max-[860px]:px-0 ${route === 'profile' ? 'bg-surface2' : 'hover:bg-surface'}`}
      >
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] text-[#0B1020] shrink-0"
          style={{ background: settings.profile.avatarColor }}
        >
          {initials(settings.profile.pcName)}
        </span>
        <span className="min-w-0 max-[860px]:hidden">
          <span className="block text-[13px] font-semibold truncate">{settings.profile.pcName}</span>
          <span className="block text-[11px] text-muted">Profile</span>
        </span>
      </button>
    </nav>
  );
}

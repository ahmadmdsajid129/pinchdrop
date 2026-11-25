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
    <nav aria-label="Main" className="w-[248px] shrink-0 bg-bg2 border-r border-surface2 px-3.5 py-5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <span className="w-8 h-8 rounded-[10px] bg-primary flex items-center justify-center text-white">
          <Hand size={18} aria-hidden="true" />
        </span>
        <span className="font-display font-bold text-[17px]">PinchDrop</span>
      </div>

      {NAV.map((n) => (
        <button
          key={n.route}
          type="button"
          onClick={() => go(n.route)}
          aria-current={active(n.route) ? 'page' : undefined}
          className={`flex items-center gap-3 h-[42px] px-3 rounded-xl text-[14px] text-left ${
            active(n.route) ? 'bg-surface2 text-text font-semibold' : 'text-soft hover:bg-surface hover:text-text'
          }`}
        >
          {n.icon}
          <span className="flex-1">{n.label}</span>
          {n.route === 'send' && queue.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">{queue.length}</span>
          )}
        </button>
      ))}

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => go(phone.state === 'none' ? 'pair' : 'devices')}
        className="p-3 rounded-[14px] bg-surface border border-line flex items-center gap-2.5 text-left hover:border-primary/60"
      >
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${phone.state === 'connected' ? 'bg-success' : phone.state === 'offline' ? 'bg-warn' : 'bg-muted'}`}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold truncate">{phone.state === 'none' ? 'No phone yet' : phone.name}</span>
          <span className="block text-[11px] text-muted">
            {phone.state === 'none' ? 'Pair a phone' : phone.state === 'connected' ? `Connected${phone.isDemo ? ' · demo' : ''}` : 'Offline'}
          </span>
        </span>
        {phone.state === 'connected' && phone.battery != null && (
          <span className="flex items-center gap-1 text-[12px] font-semibold">
            <Battery level={phone.battery} charging={phone.charging} size={16} />
            {phone.battery}%
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => go('profile')}
        aria-current={route === 'profile' ? 'page' : undefined}
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left ${route === 'profile' ? 'bg-surface2' : 'hover:bg-surface'}`}
      >
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] text-[#0B1020] shrink-0"
          style={{ background: settings.profile.avatarColor }}
        >
          {initials(settings.profile.pcName)}
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold truncate">{settings.profile.pcName}</span>
          <span className="block text-[11px] text-muted">Profile</span>
        </span>
      </button>
    </nav>
  );
}

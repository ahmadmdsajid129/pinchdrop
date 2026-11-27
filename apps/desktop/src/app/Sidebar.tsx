import { Bell, Clock, FolderOpen, Hand, Home, MapPin, MessageSquare, SlidersHorizontal, Smartphone, Upload, Users, LifeBuoy, Crown, Palette, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePro } from '../shared/pro';
import { ProTag, proSummary } from './Pro';
import { useApp } from './context';
import type { Route } from './context';
import { Battery } from '../shared/Battery';
import { Logo } from '../shared/Logo';
import { HoverTip } from './ui';
import { useConnectedPhones } from './PhoneChips';

const NAV: { route: Route; label: string; icon: ReactNode }[] = [
  { route: 'home', label: 'Home', icon: <Home size={18} aria-hidden="true" /> },
  { route: 'send', label: 'Send', icon: <Upload size={18} aria-hidden="true" /> },
  { route: 'transfers', label: 'Transfers', icon: <Clock size={18} aria-hidden="true" /> },
  { route: 'messages', label: 'Messages', icon: <MessageSquare size={18} aria-hidden="true" /> },
  { route: 'contacts', label: 'Contacts', icon: <Users size={18} aria-hidden="true" /> },
  { route: 'notifications', label: 'Notifications', icon: <Bell size={18} aria-hidden="true" /> },
  { route: 'files', label: 'Phone files', icon: <FolderOpen size={18} aria-hidden="true" /> },
  { route: 'map', label: 'Find my phones', icon: <MapPin size={18} aria-hidden="true" /> },
  { route: 'devices', label: 'Devices', icon: <Smartphone size={18} aria-hidden="true" /> },
  { route: 'huddle', label: 'Huddle', icon: <UsersRound size={18} aria-hidden="true" /> },
  { route: 'studio', label: 'Pill Studio', icon: <Palette size={18} aria-hidden="true" /> },
  { route: 'gestures', label: 'Gesture Studio', icon: <Hand size={18} aria-hidden="true" /> },
  { route: 'settings', label: 'Settings', icon: <SlidersHorizontal size={18} aria-hidden="true" /> },
  { route: 'guide', label: 'How to use', icon: <LifeBuoy size={18} aria-hidden="true" /> },
];

export function initials(name: string): string {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return 'PC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Sidebar() {
  const { route, go, phone, settings, queue, update } = useApp();
  const phones = useConnectedPhones();
  const pro = usePro();
  const active = (r: Route) => route === r || (r === 'devices' && route === 'pair');

  return (
    <nav aria-label="Main" className="pd-side w-[248px] h-full min-h-0 shrink-0 bg-bg2 border-r border-surface2 px-3.5 py-5 flex flex-col gap-1.5 overflow-visible relative z-20 max-[860px]:w-[72px] max-[860px]:px-2.5">
      <div className="pd-side-logo flex items-center gap-2.5 px-2.5 pb-5 shrink-0 max-[860px]:px-1.5">
        <Logo size={32} className="shrink-0" />
        <span className="font-display font-bold text-[17px] max-[860px]:hidden">PinchDrop</span>
      </div>

      <div className="pd-side-links flex-1 min-h-0 flex flex-col gap-1 overflow-y-auto overflow-x-hidden -mx-1 px-1 max-[860px]:overflow-visible">
      {NAV.map((n) => (
        <button
          key={n.route}
          type="button"
          onClick={() => go(n.route)}
          aria-current={active(n.route) ? 'page' : undefined}
          className={`pd-side-item group relative flex items-center gap-3 shrink-0 px-3 rounded-xl text-[14px] text-left max-[860px]:justify-center max-[860px]:px-0 max-[860px]:relative ${
            active(n.route) ? 'bg-surface2 text-text font-semibold' : 'text-soft hover:bg-surface hover:text-text'
          }`}
        >
          {n.icon}
          <span className="flex-1 max-[860px]:hidden">{n.label}</span>
          <span className="hidden max-[860px]:contents">
            <HoverTip text={n.label} />
          </span>
          {!pro.active && (n.route === 'files' || n.route === 'map' || n.route === 'huddle') && <ProTag className="max-[860px]:hidden" />}
          {n.route === 'send' && queue.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full max-[860px]:absolute max-[860px]:-top-1 max-[860px]:-right-1 bg-primary text-white text-[11px] font-bold flex items-center justify-center">{queue.length}</span>
          )}
        </button>
      ))}
      </div>

      <div className="h-px shrink-0 bg-line/70 mx-2 my-1" />

      {/* v2 Pro: plan at a glance (trial countdown, or an invitation once it's over) */}
      <button
        type="button"
        onClick={() => go('pro')}
        aria-current={route === 'pro' ? 'page' : undefined}
        className={`pd-side-item group relative shrink-0 flex items-center gap-2.5 px-3 rounded-xl text-left text-[13px] max-[860px]:justify-center max-[860px]:px-0 ${
          route === 'pro' ? 'bg-surface2 font-semibold' : 'hover:bg-surface'
        }`}
      >
        <span className="w-6 h-6 shrink-0 rounded-lg pd-pro-chip flex items-center justify-center">
          <Crown size={14} aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0 truncate max-[860px]:hidden">
          {pro.plan === 'pro' ? 'PinchDrop Pro' : pro.plan === 'trial' ? `Pro trial · ${pro.trialDaysLeft}d left` : 'Upgrade to Pro'}
        </span>
        <span className="hidden max-[860px]:contents">
          <HoverTip text={proSummary(pro)} />
        </span>
      </button>

      {phones.length > 1 ? (
        <div className="shrink-0 rounded-[14px] bg-surface border border-line p-1.5 flex flex-col gap-0.5">
          {phones.map((d) => {
            const shownOnPill = d.id === phone.deviceId;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => void update({ phone: { selected: d.id } })}
                aria-label={`${d.name}${shownOnPill ? ', shown on the pill' : '. Show it on the pill'}`}
                className={`group relative flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left max-[860px]:justify-center ${shownOnPill ? 'bg-bg2' : 'hover:bg-bg2/70'}`}
              >
                <span className="w-2 h-2 rounded-full shrink-0 bg-success" />
                <span className="flex-1 min-w-0 max-[860px]:hidden">
                  <span className="block text-[13px] font-semibold truncate">{d.name}</span>
                  <span className="block text-[11px] text-muted">{shownOnPill ? 'On the pill' : 'Connected'}</span>
                </span>
                {d.battery != null && (
                  <span className="flex items-center gap-1 text-[12px] font-semibold max-[860px]:hidden">
                    <Battery level={d.battery} charging={d.charging} size={16} />
                    {d.battery}%
                  </span>
                )}
                <span className="hidden max-[860px]:contents">
                  <HoverTip text={`${d.name}${d.battery != null ? ` · ${d.battery}%` : ''}`} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
      <button
        type="button"
        onClick={() => go(phone.state === 'none' ? 'pair' : 'devices')}
        className="pd-side-phone group relative p-3 shrink-0 rounded-[14px] bg-surface border border-line flex items-center gap-2.5 text-left hover:border-primary/60 max-[860px]:justify-center max-[860px]:p-2"
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
        <span className="hidden max-[860px]:contents">
          <HoverTip text={phone.state === 'none' ? 'Pair a phone' : phone.name ?? 'Phone'} />
        </span>
      </button>
      )}

      <button
        type="button"
        onClick={() => go('profile')}
        aria-current={route === 'profile' ? 'page' : undefined}
        className={`pd-side-profile group relative flex items-center gap-2.5 px-3 py-2.5 shrink-0 rounded-xl text-left max-[860px]:justify-center max-[860px]:px-0 ${route === 'profile' ? 'bg-surface2' : 'hover:bg-surface'}`}
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

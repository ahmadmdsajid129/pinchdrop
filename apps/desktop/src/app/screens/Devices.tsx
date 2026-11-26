import { useState } from 'react';
import { Laptop, Smartphone } from 'lucide-react';
import { PeerPair } from '../PeerPair';
import { api, useDevices } from '../../shared/api';
import type { DeviceView } from '../../shared/types';
import { useApp } from '../context';
import { Battery } from '../../shared/Battery';
import { Button, Card, EmptyState, PageTitle } from '../ui';
import { confirm } from '../pickers';

function ago(secs: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - secs);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(secs * 1000).toLocaleDateString();
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-bg2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-semibold flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function DeviceCard({ d }: { d: DeviceView }) {
  async function unpair() {
    const ok = await confirm(
      `${d.name} will forget this PC and this PC will forget it. To use it again, scan a new pairing QR code.`,
      `Unpair ${d.name}?`,
      'Unpair',
    );
    if (ok) await api.unpairDevice(d.id);
  }
  return (
    <Card className={`p-[22px] flex flex-col gap-[18px] ${d.connected ? 'border-success/60' : ''}`}>
      <div className="flex items-center gap-3.5 flex-wrap">
        <div className="w-[52px] h-[52px] rounded-2xl bg-surface2 text-accent flex items-center justify-center">
          {d.model === 'Windows PC' ? <Laptop size={26} aria-hidden="true" /> : <Smartphone size={26} aria-hidden="true" />}
        </div>
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2.5">
            <span className="font-display font-semibold text-[18px]">{d.name}</span>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${d.connected ? 'bg-success/15 text-success' : 'bg-surface2 text-muted'}`}>
              {d.connected ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <div className="text-[13px] text-muted">{d.model || 'Android phone'} · paired {new Date(d.pairedAt * 1000).toLocaleDateString()}</div>
        </div>
        <Button size="sm" variant="danger" onClick={() => void unpair()}>Unpair</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Status">
          <span className={d.connected ? 'text-success' : 'text-muted'}>{d.connected ? 'Online' : `Last seen ${ago(d.lastSeen)}`}</span>
        </Stat>
        <Stat label="Battery">
          {d.battery != null && <Battery level={d.battery} charging={d.charging} size={16} />}
          {d.battery != null ? `${d.battery}%${d.charging ? ' · charging' : ''}` : '—'}
        </Stat>
        <Stat label="Network">{d.network ?? '—'}</Stat>
        <Stat label="Free space">{d.freeSpaceGb != null ? `${d.freeSpaceGb} GB` : '—'}</Stat>
      </div>
    </Card>
  );
}

export function Devices() {
  const { phone, go, update } = useApp();
  const devices = useDevices();
  const [pairPc, setPairPc] = useState(false);

  return (
    <>
      <PageTitle
        actions={
          <>
            <Button onClick={() => setPairPc(true)}>
              <Laptop size={15} /> Pair with another PC
            </Button>
            <Button variant="primary" onClick={() => go('pair')}>+ Pair a new phone</Button>
          </>
        }
      >
        Devices
      </PageTitle>

      {pairPc && <PeerPair onClose={() => setPairPc(false)} />}

      {devices.map((d) => <DeviceCard key={d.id} d={d} />)}

      {devices.length === 0 && phone.isDemo && (
        <Card className="p-[22px] flex items-center gap-3.5 flex-wrap">
          <div className="w-[52px] h-[52px] rounded-2xl bg-surface2 text-accent flex items-center justify-center">
            <Smartphone size={26} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2.5">
              <span className="font-display font-semibold text-[18px]">{phone.name}</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn">DEMO</span>
            </div>
            <div className="text-[13px] text-muted">{phone.model}</div>
          </div>
          <Button onClick={() => void update({ demoPhone: false })}>Turn off demo</Button>
        </Card>
      )}

      {devices.length === 0 && !phone.isDemo && (
        <Card>
          <EmptyState
            icon={<Smartphone size={26} aria-hidden="true" />}
            title="No phones paired"
            action={<Button variant="primary" onClick={() => go('pair')}>Pair a phone</Button>}
          >
            Pair your Android phone once. After that it reconnects on its own whenever both are on the same Wi-Fi.
          </EmptyState>
        </Card>
      )}

      <p className="m-0 text-[13px] text-muted">
        The pill shows the phone that connected most recently. Unpairing deletes the shared security key on both sides; the phone has to scan a new QR code to come back.
      </p>
    </>
  );
}

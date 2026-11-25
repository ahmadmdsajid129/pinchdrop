import { Smartphone } from 'lucide-react';
import { useApp } from '../context';
import { Battery } from '../../shared/Battery';
import { Button, Card, EmptyState, PageTitle } from '../ui';

export function Devices() {
  const { phone, go, update } = useApp();

  return (
    <>
      <PageTitle actions={<Button variant="primary" onClick={() => go('pair')}>+ Pair a new phone</Button>}>Devices</PageTitle>

      {phone.state === 'none' ? (
        <Card>
          <EmptyState
            icon={<Smartphone size={26} aria-hidden="true" />}
            title="No phones paired"
            action={<Button variant="primary" onClick={() => go('pair')}>Pair a phone</Button>}
          >
            Pair your Android phone once. After that it reconnects on its own whenever both are on the same Wi-Fi.
          </EmptyState>
        </Card>
      ) : (
        <Card className={`p-[22px] flex flex-col gap-[18px] ${phone.state === 'connected' ? 'border-success/60' : ''}`}>
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="w-[52px] h-[52px] rounded-2xl bg-surface2 text-accent flex items-center justify-center">
              <Smartphone size={26} aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2.5">
                <span className="font-display font-semibold text-[18px]">{phone.name}</span>
                {phone.isDemo ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warn/15 text-warn">DEMO</span>
                ) : (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/15 text-success">ACTIVE</span>
                )}
              </div>
              <div className="text-[13px] text-muted">{phone.model}</div>
            </div>
            {phone.isDemo ? (
              <Button onClick={() => void update({ demoPhone: false })}>Turn off demo</Button>
            ) : (
              <>
                <Button size="sm">Rename</Button>
                <Button size="sm" variant="danger">Unpair</Button>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-bg2"><div className="text-[11px] text-muted">Status</div><div className="font-semibold text-success">{phone.state === 'connected' ? 'Online' : 'Offline'}</div></div>
            <div className="p-3 rounded-xl bg-bg2">
              <div className="text-[11px] text-muted">Battery</div>
              <div className="font-semibold flex items-center gap-1.5">
                {phone.battery != null && <Battery level={phone.battery} charging={phone.charging} size={16} />}
                {phone.battery != null ? `${phone.battery}%${phone.charging ? ' · charging' : ''}` : '—'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-bg2"><div className="text-[11px] text-muted">Network</div><div className="font-semibold">{phone.network ?? '—'}</div></div>
            <div className="p-3 rounded-xl bg-bg2"><div className="text-[11px] text-muted">Free space</div><div className="font-semibold">{phone.freeSpaceGb != null ? `${phone.freeSpaceGb} GB` : '—'}</div></div>
          </div>
        </Card>
      )}

      <p className="m-0 text-[13px] text-muted">
        Version 1 sends to one active phone at a time. Unpairing deletes the shared security key on both sides; the phone has to scan a new QR code to come back.
      </p>
    </>
  );
}

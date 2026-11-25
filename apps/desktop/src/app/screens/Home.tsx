import { CheckCircle2, Clock, File, Folder, Hand, Link2, PauseCircle, Smartphone, Upload, XCircle } from 'lucide-react';
import { formatBytes, useTransfers } from '../../shared/api';
import type { TransferView } from '../../shared/types';
import { useApp } from '../context';
import { Battery } from '../../shared/Battery';
import { Button, Card, PageTitle, Toggle } from '../ui';
import { pickFiles, pickFolder } from '../pickers';

const ACTIVE = new Set<TransferView['state']>(['offered', 'sending', 'paused']);

function ago(secs: number) {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - secs);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(secs * 1000).toLocaleDateString();
}

/** One line in Recent: what, where to, and how it went. */
function RecentRow({ t }: { t: TransferView }) {
  const icon =
    t.state === 'done' ? <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
    : t.state === 'paused' ? <PauseCircle size={18} className="text-warn" aria-hidden="true" />
    : ACTIVE.has(t.state) ? <Clock size={18} className="text-accent" aria-hidden="true" />
    : <XCircle size={18} className="text-danger" aria-hidden="true" />;
  const kind = t.fileCount > 1 ? <Folder size={18} className="text-muted" aria-hidden="true" />
    : t.fileCount === 1 ? <File size={18} className="text-muted" aria-hidden="true" />
    : <Link2 size={18} className="text-muted" aria-hidden="true" />;
  const pct = t.totalBytes > 0 ? Math.floor((t.bytesDone / t.totalBytes) * 100) : 0;
  const detail = [
    t.fileCount ? `${t.fileCount} file${t.fileCount === 1 ? '' : 's'} · ${formatBytes(t.totalBytes)}` : `${t.textCount} note${t.textCount === 1 ? '' : 's'}`,
    t.state === 'sending' ? `${pct}%` : t.state === 'done' ? `${t.direction === 'in' ? 'from' : 'to'} ${t.deviceName}` : t.state,
  ].join(' · ');
  return (
    <li className="flex items-center gap-3 py-2.5 border-b border-line/70 last:border-0">
      {kind}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold truncate">{t.label}</div>
        <div className="text-[12px] text-muted truncate">{detail}</div>
      </div>
      <span className="text-[12px] text-muted shrink-0">{ago(t.finishedAt ?? t.createdAt)}</span>
      {icon}
    </li>
  );
}

export function Home() {
  const { phone, go, settings, update, addPaths } = useApp();
  const recent = useTransfers().slice(0, 4);
  const connected = phone.state === 'connected';
  const target = connected ? phone.name : 'your phone';

  return (
    <>
      <PageTitle>Home</PageTitle>

      <div className="flex flex-wrap gap-5">
        {/* Manual send drop area */}
        <section className="flex-[999_1_420px] min-w-0 min-h-[280px] p-7 rounded-[20px] border-2 border-dashed border-line bg-bg2 flex flex-col items-center justify-center gap-3.5 text-center">
          <div className="w-[60px] h-[60px] rounded-[18px] bg-surface2 text-primary-ink flex items-center justify-center">
            <Upload size={28} aria-hidden="true" />
          </div>
          <div className="font-display text-[20px] font-semibold">Send to {target}</div>
          <p className="m-0 text-[14px] text-muted max-w-[400px]">
            Drag files or folders onto this window, or pick them. Photos go to the phone's Gallery, everything else to Downloads/PinchDrop.
          </p>
          <div className="flex gap-2.5 flex-wrap justify-center">
            <Button variant="primary" onClick={async () => { await addPaths(await pickFiles()); go('send'); }}>
              Choose files
            </Button>
            <Button onClick={async () => { await addPaths(await pickFolder()); go('send'); }}>Choose folder</Button>
            <Button onClick={() => go('send')}>Send text or link</Button>
          </div>
        </section>

        {/* Connected phone panel */}
        <Card className="flex-[1_1_300px] p-[22px] flex flex-col gap-3.5" aria-label="Connected phone">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-muted tracking-wide">CONNECTED PHONE</span>
            {connected ? (
              <span className="text-[12px] font-semibold text-success flex items-center gap-1.5">
                <span className="w-[7px] h-[7px] rounded-full bg-success" />
                {phone.isDemo ? 'Demo' : 'Online'}
              </span>
            ) : (
              <span className="text-[12px] font-semibold text-muted">None</span>
            )}
          </div>

          {connected ? (
            <>
              <div className="flex items-center gap-3.5">
                <div className="w-[52px] h-[52px] rounded-2xl bg-surface2 text-accent flex items-center justify-center">
                  <Smartphone size={26} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="font-display font-semibold text-[18px] truncate">{phone.name}</div>
                  <div className="text-[13px] text-muted truncate">{phone.model}</div>
                </div>
              </div>
              {phone.battery != null && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted">Battery</span>
                    <span className="font-semibold flex items-center gap-1.5">
                      <Battery level={phone.battery} charging={phone.charging} size={16} />
                      {phone.battery}%{phone.charging ? ' · charging' : ''}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-1.5 w-full bg-success origin-left transition-transform duration-500 ease-out" style={{ transform: `scaleX(${phone.battery / 100})` }} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5 text-[13px]">
                <div className="p-2.5 rounded-xl bg-bg2"><div className="text-muted text-[11px]">Network</div><div className="font-semibold">{phone.network ?? '—'}</div></div>
                <div className="p-2.5 rounded-xl bg-bg2"><div className="text-muted text-[11px]">Free space</div><div className="font-semibold">{phone.freeSpaceGb != null ? `${phone.freeSpaceGb} GB` : '—'}</div></div>
              </div>
              <button type="button" className="self-start text-[13px] font-semibold text-accent hover:underline" onClick={() => go('devices')}>
                Manage devices
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center gap-3.5">
                <div className="w-[52px] h-[52px] rounded-2xl bg-surface2 text-muted flex items-center justify-center">
                  <Smartphone size={26} aria-hidden="true" />
                </div>
                <div>
                  <div className="font-display font-semibold text-[17px]">No phone paired</div>
                  <div className="text-[13px] text-muted">Pair your Android phone to start sending.</div>
                </div>
              </div>
              <Button variant="primary" onClick={() => go('pair')}>Pair a phone</Button>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-5">
        <Card className="flex-[1_1_300px] p-5 flex flex-col gap-3">
          <div className="flex justify-between items-center gap-3">
            <span className="font-semibold flex items-center gap-2"><Hand size={17} className="text-accent" aria-hidden="true" /> Air gestures</span>
            <Toggle label="Air gestures" checked={settings.gestures.enabled} onChange={(v) => void update({ gestures: { enabled: v } })} />
          </div>
          <p className="m-0 text-[13px] text-muted leading-relaxed">
            Click the pill (or press Ctrl + Shift + Space) → select a file or folder → pinch in front of your webcam → open your hand over your phone.
          </p>
        </Card>

        <Card className="flex-[999_1_420px] min-w-0 p-5 flex flex-col gap-2">
          <div className="flex justify-between items-center mb-1">
            <span className="font-semibold">Recent</span>
            <button type="button" className="text-[13px] font-semibold text-accent hover:underline" onClick={() => go('transfers')}>See all</button>
          </div>
          {recent.length === 0 ? (
            <div className="flex items-center gap-3 text-[14px] text-muted py-6 justify-center">
              <Clock size={18} aria-hidden="true" /> Nothing sent yet. Your sends will show up here.
            </div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {recent.map((t) => <RecentRow key={t.id} t={t} />)}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

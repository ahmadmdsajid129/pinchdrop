import { useState } from 'react';
import { File, Folder, Image, Link2, Type, Video, X } from 'lucide-react';
import { api, formatBytes, useDevices } from '../../shared/api';
import { useApp } from '../context';
import type { QueueItem } from '../context';
import { Button, Card, PageTitle, Radio, Toggle } from '../ui';
import { pickFiles, pickFolder } from '../pickers';

const IMAGE = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
const VIDEO = /\.(mp4|mov|mkv|avi|webm|m4v|3gp|wmv)$/i;
const isLink = (t: string) => /^https?:\/\/\S+$/i.test(t.trim());

/** Where the phone will save this item (shown before sending). */
export function destinationFor(item: QueueItem, allToDownloads: boolean): string {
  if (item.kind === 'text') return isLink(item.text ?? '') ? 'Phone clipboard + Received (with Open button)' : 'Phone clipboard + Received';
  const name = item.info?.name ?? '';
  if (item.kind === 'folder') return `Downloads/PinchDrop/${name}`;
  if (!allToDownloads && IMAGE.test(name)) return 'Gallery · Pictures/PinchDrop';
  if (!allToDownloads && VIDEO.test(name)) return 'Gallery · Movies/PinchDrop';
  return 'Downloads/PinchDrop';
}

function ItemIcon({ item }: { item: QueueItem }) {
  const name = item.info?.name ?? '';
  if (item.kind === 'folder') return <Folder size={24} className="text-warn" fill="rgb(var(--warn))" aria-hidden="true" />;
  if (item.kind === 'text') return isLink(item.text ?? '') ? <Link2 size={22} className="text-accent" aria-hidden="true" /> : <Type size={22} className="text-soft" aria-hidden="true" />;
  if (IMAGE.test(name)) return <Image size={22} className="text-accent" aria-hidden="true" />;
  if (VIDEO.test(name)) return <Video size={22} className="text-primary-ink" aria-hidden="true" />;
  return <File size={22} className="text-soft" aria-hidden="true" />;
}

function describe(item: QueueItem): string {
  if (item.kind === 'text') return isLink(item.text ?? '') ? 'Link' : `Text · ${item.text?.length ?? 0} characters`;
  const i = item.info!;
  if (i.error) return `Can't read: ${i.error}`;
  if (item.kind === 'folder') return `Folder · ${i.fileCount}${i.partial ? '+' : ''} files · ${formatBytes(i.sizeBytes)}`;
  return formatBytes(i.sizeBytes);
}

export function Send() {
  const { phone, settings, update, queue, addPaths, addText, removeItem, clearQueue, go } = useApp();
  // v2: with several phones / tablets connected, pick which one gets it.
  const connectedDevices = useDevices().filter((d) => d.connected);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const chosen = connectedDevices.find((d) => d.id === deviceId) ?? (connectedDevices.length > 1 ? connectedDevices[0] : null);
  const [text, setText] = useState('');
  const [allToDownloads, setAllToDownloads] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const paths = queue.filter((i) => i.kind !== 'text' && i.info).map((i) => i.info!.path);
      const texts = queue.filter((i) => i.kind === 'text').map((i) => i.text ?? '');
      await api.sendItems(paths, texts, allToDownloads ? 'downloads' : 'auto', chosen?.id ?? null);
      clearQueue();
      go('transfers');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSending(false);
    }
  }

  const totalBytes = queue.reduce((n, i) => n + (i.info?.sizeBytes ?? 0), 0);
  const unreadable = queue.some((i) => i.info?.error);
  const connected = phone.state === 'connected';
  const target = connected ? phone.name : 'phone';

  let blocker: string | null = null;
  if (queue.length === 0) blocker = 'Add something to send first.';
  else if (phone.state === 'none') blocker = 'Pair a phone first.';
  else if (phone.state === 'offline') blocker = `${phone.name} is offline.`;
  else if (phone.isDemo) blocker = 'That is the demo phone — pair your real phone to send.';

  return (
    <>
      <PageTitle
        actions={
          <span className="text-[13px] text-muted flex items-center gap-2">
            To <strong className="text-text">{connected ? phone.name : 'no phone paired'}</strong>
            {phone.state === 'none' && <Button size="sm" variant="primary" onClick={() => go('pair')}>Pair</Button>}
          </span>
        }
      >
        Send to phone
      </PageTitle>

      <div className="flex flex-wrap gap-5 items-start">
        <Card className="flex-[999_1_440px] min-w-0 p-5 flex flex-col gap-2">
          <div className="flex justify-between items-center gap-3 flex-wrap mb-2">
            <span className="font-semibold">
              {queue.length === 0 ? 'Nothing added yet' : `${queue.length} item${queue.length > 1 ? 's' : ''}${totalBytes ? ` · ${formatBytes(totalBytes)}` : ''}`}
            </span>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={async () => addPaths(await pickFiles())}>+ Files</Button>
              <Button size="sm" onClick={async () => addPaths(await pickFolder())}>+ Folder</Button>
              {queue.length > 0 && <Button size="sm" variant="ghost" onClick={clearQueue}>Clear</Button>}
            </div>
          </div>

          {queue.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-bg2">
              <ItemIcon item={item} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold truncate">{item.kind === 'text' ? item.text : item.info?.name}</div>
                <div className={`text-[12px] truncate ${item.info?.error ? 'text-danger' : 'text-muted'}`}>
                  {describe(item)} → {destinationFor(item, allToDownloads)}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${item.kind === 'text' ? 'text' : item.info?.name}`}
                onClick={() => removeItem(item.id)}
                className="w-8 h-8 rounded-lg text-muted hover:text-text hover:bg-surface2 flex items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}

          {queue.length === 0 && (
            <div className="p-6 rounded-xl border border-dashed border-line text-center text-[14px] text-muted">
              Drag files or folders onto this window, or use the buttons above.
            </div>
          )}

          <form
            className="flex gap-2 mt-2"
            onSubmit={(e) => {
              e.preventDefault();
              addText(text);
              setText('');
            }}
          >
            <label htmlFor="send-text" className="sr-only">Text or link to send</label>
            <input autoComplete="off" spellCheck={false}
              id="send-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a link or type a note…"
              className="flex-1 h-10 px-3.5 rounded-xl bg-bg2 border border-line text-[14px] text-text placeholder:text-muted"
            />
            <Button type="submit" disabled={!text.trim()}>Add</Button>
          </form>
        </Card>

        <Card className="flex-[1_1_300px] p-5 flex flex-col gap-5">
          <fieldset className="border-0 m-0 p-0 flex flex-col gap-2.5">
            <legend className="font-semibold mb-2.5">Where on the phone</legend>
            <Radio name="dest" checked={!allToDownloads} onChange={() => setAllToDownloads(false)}>
              Automatic — photos &amp; videos to Gallery, the rest to Downloads/PinchDrop
            </Radio>
            <Radio name="dest" checked={allToDownloads} onChange={() => setAllToDownloads(true)}>
              Everything to Downloads/PinchDrop
            </Radio>
          </fieldset>
          <fieldset className="border-0 m-0 p-0 flex flex-col gap-2.5">
            <legend className="font-semibold mb-2.5">After sending</legend>
            <Radio name="after" checked={settings.transfers.mode === 'copy'} onChange={() => void update({ transfers: { mode: 'copy' } })}>
              Keep on this PC (copy)
            </Radio>
            <Radio name="after" checked={settings.transfers.mode === 'move'} onChange={() => void update({ transfers: { mode: 'move' } })}>
              Move — PC copy goes to the Recycle Bin once the phone confirms
            </Radio>
          </fieldset>
          <div className="flex items-center justify-between gap-3 text-[14px] text-soft">
            <span>Open the first file on the phone when it arrives</span>
            <Toggle label="Open first file on phone" checked={settings.transfers.openFirst} onChange={(v) => void update({ transfers: { openFirst: v } })} />
          </div>

          {connectedDevices.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Send to which device">
              <span className="text-[13px] text-muted">Send to</span>
              {connectedDevices.map((d) => {
                const on = (chosen?.id ?? connectedDevices[0].id) === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDeviceId(d.id)}
                    className={`h-9 px-4 rounded-full text-[13px] font-semibold transition ${on ? 'bg-primary text-on-primary' : 'bg-bg2 text-soft hover:text-text'}`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          )}
          <Button variant="primary" size="lg" disabled={blocker !== null || unreadable || sending} onClick={() => void send()}>
            {sending ? 'Starting…' : `Send ${queue.length || ''} item${queue.length === 1 ? '' : 's'} to ${chosen?.name ?? target}`}
          </Button>
          {error ? (
            <div className="text-[12px] text-danger" role="alert">{error}</div>
          ) : blocker ? (
            <div className="text-[12px] text-warn">{blocker}</div>
          ) : (
            <div className="text-[12px] text-muted">Manual sends skip the catch gesture. The phone may ask first, depending on its settings.</div>
          )}
        </Card>
      </div>
    </>
  );
}

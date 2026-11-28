import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownToLine, ChevronRight, File, FileText, Film, Folder, FolderOpen, Image as ImageIcon, Music, RefreshCw, Smartphone } from 'lucide-react';
import { api, formatBytes, useTransfers } from '../../shared/api';
import type { PhoneFileEntry } from '../../shared/types';
import { Button, Card, EmptyState, PageTitle, Select } from '../ui';
import { useConnectedPhones } from '../PhoneChips';

type Drag = { from: string; fromName: string; path: string; entry: PhoneFileEntry; x: number; y: number };

const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

function kindIcon(e: PhoneFileEntry, size = 20) {
  if (e.dir) return <Folder size={size} className="text-[#2F8EF5]" fill="currentColor" />;
  if (e.mime.startsWith('image/')) return <ImageIcon size={size} className="text-[#32ADE6]" />;
  if (e.mime.startsWith('video/')) return <Film size={size} className="text-[#AF52DE]" />;
  if (e.mime.startsWith('audio/')) return <Music size={size} className="text-[#FF2D55]" />;
  if (e.mime.includes('pdf') || e.mime.startsWith('text/')) return <FileText size={size} className="text-[#FF9500]" />;
  return <File size={size} className="text-muted" />;
}

/** A picture / video preview, asked from the phone when the tile comes into view. */
function Thumb({ deviceId, path, entry }: { deviceId: string; path: string; entry: PhoneFileEntry }) {
  const [src, setSrc] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const media = entry.mime.startsWith('image/') || entry.mime.startsWith('video/');
  useEffect(() => {
    if (!media || !ref.current) return;
    let alive = true;
    const io = new IntersectionObserver((items) => {
      if (items.some((i) => i.isIntersecting)) {
        io.disconnect();
        void api.phoneFileThumb(deviceId, path).then((t) => alive && setSrc(t), () => undefined);
      }
    });
    io.observe(ref.current);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [deviceId, path, media]);
  return (
    <div ref={ref} className="w-full aspect-square rounded-[12px] bg-bg2 flex items-center justify-center overflow-hidden">
      {src ? <img src={src} alt="" className="w-full h-full object-cover" draggable={false} /> : kindIcon(entry, 30)}
    </div>
  );
}

/** One phone's files: folders, previews, drag a file onto the other phone, or bring it to the PC. */
function Pane({
  deviceId,
  deviceName,
  choices,
  onPick,
  onStartDrag,
  dropHot,
}: {
  deviceId: string;
  deviceName: string;
  choices: { value: string; label: string }[];
  onPick: (id: string) => void;
  onStartDrag: (d: Drag) => void;
  dropHot: boolean;
}) {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<PhoneFileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(
    async (p: string) => {
      setEntries(null);
      setError(null);
      try {
        const r = await api.phoneFiles(deviceId, p);
        setPath(r.path);
        setEntries(r.entries);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      }
    },
    [deviceId],
  );
  useEffect(() => {
    void load('');
  }, [load]);

  // A send to this phone just finished (dropped from Explorer, or from the other phone): show it.
  const transfers = useTransfers();
  const seenDone = useRef<Set<string>>(new Set());
  const pathRef = useRef(path);
  pathRef.current = path;
  useEffect(() => {
    let fresh = false;
    for (const t of transfers) {
      if (t.deviceId === deviceId && t.state === 'done' && !seenDone.current.has(t.id)) {
        if (seenDone.current.size > 0) fresh = true;
        seenDone.current.add(t.id);
      }
    }
    if (seenDone.current.size === 0) seenDone.current.add('_');
    if (fresh) void load(pathRef.current);
  }, [transfers, deviceId, load]);

  const crumbs = path ? path.split('/') : [];
  const toPc = async (e: PhoneFileEntry) => {
    setNote(null);
    try {
      await api.phoneFileSend(deviceId, join(path, e.name));
      setNote(`Bringing “${e.name}” to this PC…`);
    } catch (err) {
      setNote(String(err instanceof Error ? err.message : err));
    }
  };

  return (
    <Card
      data-drop-device={deviceId}
      data-drop-name={deviceName}
      data-drop-path={path}
      className={`flex-1 min-w-[320px] p-0 overflow-hidden flex flex-col transition-shadow ${dropHot ? 'ring-4 ring-primary/50 shadow-[0_20px_60px_rgba(255,197,61,0.22)]' : ''}`}
    >
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Smartphone size={16} className="text-primary shrink-0" />
        {choices.length > 1 ? <Select label="Phone" value={deviceId} options={choices} onChange={onPick} /> : <span className="font-semibold text-[14px]">{deviceName}</span>}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => void load(path)} aria-label="Refresh">
          <RefreshCw size={14} />
        </Button>
      </div>
      <nav aria-label="Folder" className="px-4 py-2 flex items-center gap-1 text-[12.5px] text-muted flex-wrap">
        <button type="button" className="hover:text-text font-medium" onClick={() => void load('')}>
          Phone
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight size={12} />
            <button type="button" className="hover:text-text" onClick={() => void load(crumbs.slice(0, i + 1).join('/'))}>
              {c}
            </button>
          </span>
        ))}
      </nav>
      {note && <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-primary/10 text-[12.5px]">{note}</div>}
      <div className="flex-1 overflow-y-auto px-3 pb-3 min-h-[360px] max-h-[calc(100vh-300px)]">
        {error ? (
          <EmptyState icon={<FolderOpen size={26} />} title="Can't open this phone's files">
            {error.includes('Allow') ? (
              <>
                On {deviceName}: PinchDrop → Settings → Permissions → <b>All files on your PC</b>.
              </>
            ) : (
              error
            )}
          </EmptyState>
        ) : entries === null ? (
          <div className="p-4 text-[13px] text-muted">Asking {deviceName}…</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-[13px] text-muted">This folder is empty.</div>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5">
            {entries.map((e) => (
              <li
                key={e.name}
                className="group relative p-2 rounded-[14px] hover:bg-bg2 cursor-default select-none"
                onDoubleClick={() => e.dir && void load(join(path, e.name))}
                onPointerDown={(ev) => {
                  if (e.dir || ev.button !== 0) return;
                  const start = { x: ev.clientX, y: ev.clientY };
                  const move = (m: PointerEvent) => {
                    if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > 6) {
                      window.removeEventListener('pointermove', move);
                      window.removeEventListener('pointerup', up);
                      onStartDrag({ from: deviceId, fromName: deviceName, path: join(path, e.name), entry: e, x: m.clientX, y: m.clientY });
                    }
                  };
                  const up = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                  };
                  window.addEventListener('pointermove', move);
                  window.addEventListener('pointerup', up);
                }}
                title={e.dir ? `${e.name} · ${e.count} items` : `${e.name} · ${formatBytes(e.size)}`}
              >
                {e.dir ? (
                  <button type="button" className="w-full" onClick={() => void load(join(path, e.name))}>
                    <div className="w-full aspect-square rounded-[12px] bg-[#2F8EF5]/10 flex items-center justify-center">{kindIcon(e, 34)}</div>
                  </button>
                ) : (
                  <Thumb deviceId={deviceId} path={join(path, e.name)} entry={e} />
                )}
                <div className="mt-1.5 text-[12px] font-medium truncate text-center">{e.name}</div>
                <div className="text-[11px] text-muted truncate text-center">{e.dir ? `${e.count} items` : formatBytes(e.size)}</div>
                {!e.dir && (
                  <button
                    type="button"
                    aria-label={`Bring ${e.name} to this PC`}
                    onClick={() => void toPc(e)}
                    className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 text-[#1D1D1F] shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <ArrowDownToLine size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * v2 · Phone files: each connected phone's files side by side. Drag a file from one phone onto
 * the other and it goes across (through this PC, which keeps no copy); or bring it to this PC.
 */
export function PhoneFiles() {
  const phones = useConnectedPhones();
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [osHot, setOsHot] = useState<string | null>(null);
  useEffect(() => {
    const over = (e: Event) => setOsHot((e as CustomEvent<string | null>).detail);
    const dropped = (e: Event) => {
      const d = (e as CustomEvent<{ name: string; path: string; count?: number; error?: string }>).detail;
      setToast(d.error ?? `Sending ${d.count} item${d.count === 1 ? '' : 's'} to ${d.name} · ${d.path || 'top folder'}…`);
      window.setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener('pd-os-drag', over);
    window.addEventListener('pd-os-drop', dropped);
    return () => {
      window.removeEventListener('pd-os-drag', over);
      window.removeEventListener('pd-os-drop', dropped);
    };
  }, []);

  const l = phones.find((p) => p.id === left) ?? phones[0];
  const r = phones.find((p) => p.id === right && p.id !== l?.id) ?? phones.find((p) => p.id !== l?.id);
  const choices = phones.map((p) => ({ value: p.id, label: p.name }));

  // Dragging: a card follows the pointer; the phone pane under it lights up.
  useEffect(() => {
    if (!drag) return;
    const target = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-drop-device]') as HTMLElement | null;
      const id = el?.dataset.dropDevice ?? null;
      return id && id !== drag.from ? { id, name: el!.dataset.dropName ?? 'phone' } : null;
    };
    const move = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      setHot(target(e.clientX, e.clientY)?.id ?? null);
    };
    const up = (e: PointerEvent) => {
      const t = target(e.clientX, e.clientY);
      const d = drag;
      setDrag(null);
      setHot(null);
      if (!t) return;
      setToast(`Sending “${d.entry.name}” from ${d.fromName} to ${t.name}…`);
      void api.phoneFileSend(d.from, d.path, t.id).catch((err) => setToast(String(err instanceof Error ? err.message : err)));
      window.setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag?.from, drag?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageTitle>Phone files</PageTitle>
      {phones.length === 0 ? (
        <Card>
          <EmptyState icon={<FolderOpen size={26} />} title="Connect a phone to browse its files">
            Then allow <b>All files on your PC</b> on the phone (PinchDrop → Settings → Permissions).
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="m-0 text-[13px] text-muted">
            {phones.length > 1
              ? 'Drag a file from one phone onto the other, or drop files from Explorer onto a phone to put them in the folder it shows. Hover a file and click ↓ to bring it to this PC.'
              : 'Drop files from Explorer onto the phone to put them in the folder it shows. Hover a file and click ↓ to bring it to this PC.'}
          </p>
          <div className="flex gap-4 flex-wrap">
            {l && <Pane key={l.id} deviceId={l.id} deviceName={l.name} choices={choices} onPick={setLeft} onStartDrag={setDrag} dropHot={hot === l.id || osHot === l.id} />}
            {r && <Pane key={r.id} deviceId={r.id} deviceName={r.name} choices={choices} onPick={setRight} onStartDrag={setDrag} dropHot={hot === r.id || osHot === r.id} />}
          </div>
        </>
      )}

      {/* the file being dragged */}
      {drag && (
        <div className="fixed z-[100] pointer-events-none" style={{ left: drag.x + 14, top: drag.y + 14 }}>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-[14px] bg-surface shadow-[0_18px_50px_rgba(0,0,0,0.28)] ring-1 ring-black/5 rotate-[-3deg]">
            {kindIcon(drag.entry)}
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate max-w-[200px]">{drag.entry.name}</div>
              <div className="text-[11px] text-muted">{hot ? 'Drop to send' : `From ${drag.fromName}`}</div>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-[100] px-4 py-2.5 rounded-full bg-[#1D1D1F] text-white text-[13px] shadow-lg"
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 12, x: '-50%' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

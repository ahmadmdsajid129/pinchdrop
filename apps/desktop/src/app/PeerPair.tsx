import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Laptop, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, onEvent } from '../shared/api';
import type { FoundPc, PeerPairView } from '../shared/types';
import { Button, Card } from './ui';

/**
 * v2 · Pair with another laptop. This PC finds the other one on the Wi-Fi, both screens show
 * the same 6-digit code, you confirm here and press Pair there. One pairing works both ways.
 */
export function PeerPair({ onClose }: { onClose: () => void }) {
  const [found, setFound] = useState<FoundPc[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<PeerPairView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setSearching(true);
    setError(null);
    try {
      setFound(await api.peerDiscover());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    void search();
    const off = onEvent<PeerPairView>('peer-pair', setView);
    return () => {
      void off.then((u) => u());
    };
  }, []);

  async function pair(pc: FoundPc) {
    setError(null);
    setView({ stage: 'connecting', pcName: pc.name, code: null, message: null });
    try {
      await api.peerPairStart(pc.pcId);
    } catch (e) {
      setView(null);
      setError(String(e instanceof Error ? e.message : e));
    }
  }

  const stage = view?.stage;
  return (
    <Card className="p-[22px] flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-[52px] h-[52px] rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
          <Laptop size={26} aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="font-display font-semibold text-[18px]">Pair with another PC</div>
          <div className="text-[13px] text-muted">
            Send to another laptop with a pinch, and catch from it with an open hand. Both PCs need PinchDrop and the same Wi-Fi.
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {!view || stage === 'failed' ? (
          <motion.div key="list" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
            <ol className="m-0 pl-5 text-[13.5px] text-soft flex flex-col gap-1">
              <li>
                On the <b>other PC</b>: open PinchDrop → <b>Devices</b> → <b>+ Pair a new phone</b> (that opens its pairing screen).
              </li>
              <li>Here: pick that PC below and press <b>Pair</b>.</li>
            </ol>
            {view?.stage === 'failed' && (
              <div className="px-3 py-2 rounded-xl bg-danger/10 text-danger text-[13px]" role="alert">
                {view.message}
              </div>
            )}
            {error && (
              <div className="px-3 py-2 rounded-xl bg-danger/10 text-danger text-[13px]" role="alert">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">PCs on this Wi-Fi</span>
              <Button size="sm" onClick={() => void search()} disabled={searching}>
                <RefreshCw size={13} className={searching ? 'animate-spin' : ''} /> {searching ? 'Searching…' : 'Search again'}
              </Button>
            </div>
            {found && found.length === 0 && !searching && (
              <div className="text-[13px] text-muted">
                No other PC found. Check that PinchDrop is running on it and both are on the same Wi-Fi (guest and office Wi-Fi often block this).
              </div>
            )}
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {(found ?? []).map((pc) => (
                <li key={pc.pcId} className="flex items-center gap-3 p-3 rounded-2xl bg-bg2">
                  <Laptop size={20} className="text-soft" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px] truncate">{pc.name}</div>
                    <div className="text-[12px] text-muted">{pc.hosts[0] ?? ''}</div>
                  </div>
                  {pc.paired ? (
                    <span className="text-[12px] text-success font-semibold">Paired</span>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => void pair(pc)}>
                      Pair
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        ) : stage === 'done' ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center gap-2 py-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
              <CheckCircle2 size={56} className="text-success" />
            </motion.div>
            <div className="font-display font-semibold text-[20px]">{view.pcName} is paired</div>
            <div className="text-[13px] text-muted max-w-md">
              Pinch something on either PC and open your hand at the other one's camera, or drop it on the PC's chip at the top of the screen.
            </div>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </motion.div>
        ) : (
          <motion.div key="code" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col items-center text-center gap-3 py-2">
            {stage === 'connecting' ? (
              <div className="text-[14px] text-soft py-6">Connecting to {view.pcName}…</div>
            ) : (
              <>
                <div className="text-[14px] text-soft">
                  Does <b>{view.pcName}</b> show this code?
                </div>
                <div className="font-display font-bold text-[44px] tracking-[0.18em] tabular-nums">
                  {view.code?.slice(0, 3)} {view.code?.slice(3)}
                </div>
                {stage === 'code' ? (
                  <div className="flex gap-2">
                    <Button onClick={() => void api.peerPairAnswer(false)}>No, cancel</Button>
                    <Button variant="primary" onClick={() => void api.peerPairAnswer(true)}>
                      Codes match
                    </Button>
                  </div>
                ) : (
                  <div className="text-[13px] text-primary font-medium" role="status">
                    {view.message ?? 'Now press Pair on the other PC.'}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                  <ShieldCheck size={13} /> Matching codes prove the two PCs are talking to each other and nobody else.
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

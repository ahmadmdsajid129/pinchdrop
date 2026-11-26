import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin } from 'lucide-react';
import { api, onEvent } from '../../shared/api';
import type { PlaceView } from '../../shared/types';
import { Button, Card, EmptyState, PageTitle } from '../ui';

function ago(ms: number): string {
  const d = Math.max(0, Date.now() - ms) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function pin(p: PlaceView): L.DivIcon {
  const color = p.connected ? '#007AFF' : '#8E8E93';
  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-100%)">
      <div style="padding:4px 10px;border-radius:999px;background:white;color:#1d1d1f;font:600 12px Inter,system-ui;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap">
        ${p.deviceName.replace(/[<>&]/g, '')}
      </div>
      <div style="width:18px;height:18px;margin-top:4px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
    </div>`;
  return L.divIcon({ html, className: '', iconSize: [0, 0] });
}

/**
 * v2 · Where your phones are, on a real map. Connected phones update about once a minute;
 * the others show the last place this PC saw them (handy if one goes missing).
 * Street images come from OpenStreetMap; the phones' positions never leave this PC.
 */
export function MapScreen() {
  const [places, setPlaces] = useState<PlaceView[]>([]);
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    void api.phonePlaces().then(setPlaces);
    const off = onEvent<PlaceView[]>('phone-places', setPlaces);
    return () => void off.then((u) => u());
  }, []);

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([20.6, 78.9], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const p of places) {
      L.circle([p.lat, p.lon], { radius: Math.max(15, p.accuracy), color: p.connected ? '#007AFF' : '#8E8E93', weight: 1, fillOpacity: 0.12 }).addTo(g);
      L.marker([p.lat, p.lon], { icon: pin(p) })
        .bindTooltip(`${p.deviceName} · ${p.connected ? 'live' : 'last seen'} ${ago(p.time)}`)
        .addTo(g);
    }
    if (!fitted.current && places.length > 0) {
      fitted.current = true;
      if (places.length === 1) m.setView([places[0].lat, places[0].lon], 16);
      else m.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number])), { padding: [60, 60], maxZoom: 16 });
    }
  }, [places]);

  const focus = (p: PlaceView) => map.current?.setView([p.lat, p.lon], 17, { animate: true });

  return (
    <>
      <PageTitle>Find my phones</PageTitle>
      <Card className="p-0 overflow-hidden relative">
        <div ref={box} className="h-[calc(100vh-260px)] min-h-[360px] w-full" />
        {places.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/90">
            <EmptyState icon={<MapPin size={26} />} title="No location yet">
              On the phone: PinchDrop → Settings → Permissions → <b>Location on your PC</b> (and “Allow all the time” so it keeps
              updating). The phone shows up here within a minute.
            </EmptyState>
          </div>
        )}
      </Card>
      {places.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {places.map((p) => (
            <Card key={p.deviceId} className="px-4 py-3 flex items-center gap-3 min-w-[260px] flex-1">
              <span className={`w-2.5 h-2.5 rounded-full ${p.connected ? 'bg-success' : 'bg-muted'}`} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] truncate">{p.deviceName}</div>
                <div className="text-[12px] text-muted">
                  {p.connected ? `Live · updated ${ago(p.time)}` : `Last seen ${ago(p.time)}`} · ±{Math.round(p.accuracy)} m
                </div>
              </div>
              <Button size="sm" onClick={() => focus(p)}>
                <LocateFixed size={14} /> Show
              </Button>
            </Card>
          ))}
        </div>
      )}
      <p className="m-0 text-[12.5px] text-muted">
        Positions come straight from your phones over your Wi-Fi and are kept only on this PC. If a phone is switched off or
        leaves your Wi-Fi, you see the last place it was seen.
      </p>
    </>
  );
}

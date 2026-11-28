// While a send animation or edge glow plays, the overlay page must not reload to free memory.
let busyUntil = 0;

export function markOverlayBusy(ms: number) {
  busyUntil = Math.max(busyUntil, Date.now() + ms);
}

export function overlayBusy() {
  return Date.now() < busyUntil;
}

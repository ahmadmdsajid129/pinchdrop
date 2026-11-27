// The "Get PinchDrop" page the apps link to: puts the right download first for this device.
(() => {
  const c = window.PINCHDROP || {};
  const safe = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
  document.querySelectorAll('[data-link]').forEach((el) => {
    const url = safe(c[el.dataset.link]);
    if (url) el.href = url;
    else el.remove();
  });
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const windows = /Windows/i.test(ua);
  const list = document.querySelector('.choices');
  const first = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('main');
    list.prepend(el);
  };
  if (android) {
    // Play first when it's live, else the APK.
    first(document.getElementById('play') ? 'play' : 'android');
    document.getElementById('title').textContent = 'PinchDrop for your phone';
    document.getElementById('lede').textContent = 'Install it here, then open it and tap Pair with PC.';
  } else if (windows) {
    first('windows');
    document.getElementById('title').textContent = 'PinchDrop for your PC';
    document.getElementById('lede').textContent = 'Install it on this PC, then pair your phone with the QR code it shows.';
  }
})();

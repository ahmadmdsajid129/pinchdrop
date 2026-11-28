// PinchDrop website: links from config.js, and the animations (no libraries).
(() => {
  'use strict';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------------------------------------------------------------- links and prices
  const c = window.PINCHDROP || {};
  // Only open web links we expect (never javascript: or data: URLs from a bad config).
  const safe = (u) => (typeof u === 'string' && /^(https:\/\/|mailto:)/i.test(u) ? u : '');
  $$('[data-price]').forEach((el) => (el.textContent = (c.prices || {})[el.dataset.price] || ''));
  $$('[data-buy]').forEach((el) => {
    const url = safe((c.checkout || {})[el.dataset.buy]);
    if (url) {
      el.href = url;
      el.rel = 'noopener';
    } else {
      el.setAttribute('aria-disabled', 'true');
      el.textContent = 'Available soon';
    }
  });
  $$('[data-link]').forEach((el) => {
    const url = safe(c[el.dataset.link]);
    if (url) el.href = url;
    else el.style.display = 'none';
  });

  // ---------------------------------------------------------------- nav, reveals, headline
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        // siblings arriving together come in one after another
        const i = Array.from(el.parentElement?.children || []).filter((x) => x.classList.contains('reveal')).indexOf(el);
        el.style.transitionDelay = `${Math.max(0, i) * 70}ms`;
        el.classList.add('in');
        io.unobserve(el);
        if (el.querySelector('[data-count]') || el.matches('[data-count]')) count(el);
      }
    },
    { threshold: 0.15 },
  );
  $$('.reveal').forEach((el) => io.observe(el));

  const head = $('.headline');
  $$('.w', head).forEach((w, i) => (w.style.transitionDelay = `${120 + i * 70}ms`));
  requestAnimationFrame(() => head.classList.add('in'));

  // ---------------------------------------------------------------- counters
  function count(scope) {
    $$('[data-count]', scope).forEach((el) => {
      const to = Number(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      // "0 bytes to the cloud" counts down from a big number to nothing
      const from = to === 0 && el.closest('.private') ? 4096 : 0;
      if (reduced || from === to) {
        el.textContent = to + suffix;
        return;
      }
      const t0 = performance.now();
      const dur = from ? 1800 : 1200;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(from + (to - from) * e).toLocaleString() + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------------------------------------------------------------- bento: light follows the pointer
  $$('.tile-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  // Pill Studio demo: the pill changes theme
  const pill = $('#miniPill');
  const themeName = $('#themeName');
  const THEMES = [
    ['aurora', 'Aurora'],
    ['neon', 'Neon Tokyo'],
    ['terminal', 'Terminal'],
    ['paper', 'Paper & Ink'],
    ['cassette', 'Cassette'],
    ['orbit', 'Orbit'],
    ['diwali', 'Diwali'],
  ];
  let ti = 0;
  const setTheme = () => {
    const [cls, name] = THEMES[ti % THEMES.length];
    pill.className = `mini-pill ${cls}`;
    themeName.textContent = name;
    ti++;
  };
  setTheme();
  if (!reduced) setInterval(setTheme, 2200);

  // Gesture Studio demo
  const G = [
    ['✋', 'Play / pause'],
    ['👉', 'Next slide'],
    ['✊', 'Mute microphone'],
    ['👍', 'Volume up'],
    ['✌️', 'Screenshot'],
  ];
  let gi = 0;
  const gBox = $('.gesture');
  if (!reduced)
    setInterval(() => {
      gBox.classList.add('swap');
      setTimeout(() => {
        gi = (gi + 1) % G.length;
        $('#gEmoji').textContent = G[gi][0];
        $('#gAct').textContent = G[gi][1];
        gBox.classList.remove('swap');
      }, 260);
    }, 2400);

  // ---------------------------------------------------------------- "How it works": the story follows the scroll
  const how = $('#how');
  const hv = $('#howVisual');
  const steps = $$('.how-steps li');
  const bar = $('#howBar');
  let step = -1;
  const setStep = (s) => {
    if (s === step) return;
    step = s;
    hv.classList.remove('s0', 's1', 's2');
    hv.classList.add(`s${s}`);
    steps.forEach((li) => li.classList.toggle('on', Number(li.dataset.step) === s));
  };
  // Follows the scroll on every screen size (phones too: the section pins while you scroll).
  const howScroll = () => {
    const r = how.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (r.height - window.innerHeight)));
    bar.style.width = `${p * 100}%`;
    setStep(p < 0.34 ? 0 : p < 0.67 ? 1 : 2);
  };
  window.addEventListener('scroll', howScroll, { passive: true });
  howScroll();
  setStep(0);

  // ---------------------------------------------------------------- hero: the live pinch and drop
  const stage = $('#stage');
  const canvas = $('#fx');
  const ctx = canvas.getContext('2d');
  const pick = $('#pick');
  const phone = $('#phone');
  const card = $('#phCard');
  const pinch = $('#pinch');
  let W = 0;
  let H = 0;
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  new ResizeObserver(fit).observe(stage);
  fit();

  const local = (el) => {
    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2, w: r.width, h: r.height };
  };
  const flights = [];
  const sparks = [];
  const rings = [];

  function throwFrom(x, y, withHand) {
    const to = local(phone);
    const target = { x: to.x, y: to.y - to.h * 0.12 };
    flights.push({ x0: x, y0: y, x1: target.x, y1: target.y, t0: performance.now(), dur: 1150, hand: withHand });
  }

  function drawDrop(x, y, s, angle, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255, 197, 61, 0.8)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#FFC53D';
    ctx.beginPath();
    ctx.moveTo(0, -1.6 * s);
    ctx.quadraticCurveTo(s * 1.05, -0.3 * s, s, 0.25 * s);
    ctx.arc(0, 0.25 * s, s, 0, Math.PI);
    ctx.quadraticCurveTo(-s * 1.05, -0.3 * s, 0, -1.6 * s);
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    // flights: an arc high over the gap, with a glowing trail
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      const p = Math.min(1, (now - f.t0) / f.dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const cx = (f.x0 + f.x1) / 2;
      const cy = Math.min(f.y0, f.y1) - H * 0.38;
      const bx = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * f.x1;
      const by = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * f.y1;
      const dx = 2 * (1 - e) * (cx - f.x0) + 2 * e * (f.x1 - cx);
      const dy = 2 * (1 - e) * (cy - f.y0) + 2 * e * (f.y1 - cy);
      for (let k = 0; k < 2; k++) {
        sparks.push({ x: bx + (Math.random() - 0.5) * 6, y: by + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, life: 1, r: 1 + Math.random() * 2.4 });
      }
      const size = 9 + 5 * Math.sin(Math.PI * e);
      drawDrop(bx, by, size, Math.atan2(dy, dx) - Math.PI / 2 + Math.PI, 1);
      if (f.hand) {
        pinch.style.transform = `translate(${bx - 45}px, ${by - 70}px)`;
        if (p > 0.82) pinch.classList.remove('closed');
      }
      if (p >= 1) {
        flights.splice(i, 1);
        land(f.x1, f.y1);
      }
    }
    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.life -= 0.022;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = s.life * 0.9;
      ctx.fillStyle = s.big ? '#FFF3C4' : '#FFC53D';
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0.1, s.r * s.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // landing ripples
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const p = (now - r.t0) / 900;
      if (p < 0) continue; // the second ring starts a moment later
      if (p >= 1) {
        rings.splice(i, 1);
        continue;
      }
      ctx.strokeStyle = `rgba(255, 197, 61, ${(1 - p) * 0.9})`;
      ctx.lineWidth = 2.5 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 8 + p * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    requestAnimationFrame(frame);
  }

  function land(x, y) {
    const now = performance.now();
    rings.push({ x, y, t0: now }, { x, y, t0: now + 160 });
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 3;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, r: 1.5 + Math.random() * 2, big: k % 3 === 0 });
    }
    phone.classList.add('hit');
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    setTimeout(() => phone.classList.remove('hit'), 700);
  }

  // The loop that plays by itself: select → pinch → fly → land.
  function cycle() {
    const p = local(pick);
    pick.classList.add('sel');
    setTimeout(() => {
      pinch.style.transition = 'opacity 300ms';
      pinch.style.transform = `translate(${p.x - 45}px, ${p.y - 80}px)`;
      pinch.style.opacity = '1';
    }, 450);
    setTimeout(() => {
      pinch.classList.add('closed');
      pick.classList.add('lift');
    }, 950);
    setTimeout(() => {
      pick.classList.add('gone');
      throwFrom(p.x, p.y - 10, true);
    }, 1300);
    setTimeout(() => {
      pinch.style.opacity = '0';
    }, 2700);
    setTimeout(() => {
      pick.classList.remove('sel', 'lift', 'gone');
      card.classList.remove('show');
    }, 4300);
  }

  if (reduced) {
    card.classList.add('show');
    pick.classList.add('sel');
  } else {
    requestAnimationFrame(frame);
    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(stage);
    setTimeout(cycle, 900);
    setInterval(() => visible && !document.hidden && cycle(), 5200);
    // Try it: click anywhere on the stage to throw one from there.
    stage.addEventListener('click', (e) => {
      const r = stage.getBoundingClientRect();
      throwFrom(e.clientX - r.left, e.clientY - r.top, false);
    });
  }
})();

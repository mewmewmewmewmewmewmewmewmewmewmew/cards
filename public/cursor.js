// Ported from mew.cards public/cursor.js — Font Awesome star replaced with an inline SVG star.
(() => {
  if (window.__mewCursor) return;
  window.__mewCursor = true;
  const ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };
  ready(() => {
    let layer = document.getElementById('cursor-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'cursor-layer';
      layer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(layer);
    }
    const start = Date.now();
    const origin = { x: 0, y: 0 };
    const last = { starTimestamp: start, starPosition: origin, mousePosition: origin };
    const config = {
      duration: 1500,
      minTimeBetween: 250,
      minDistBetween: 75,
      colors: ['238 185 213', '252 254 255'],
      sizes: ['1.0rem', '0.7rem', '0.4rem'],
      animations: ['fall-1', 'fall-2', 'fall-3'],
    };
    const STAR = '<svg viewBox="0 0 576 512" width="1em" height="1em" fill="currentColor" style="display:block"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>';
    let count = 0;
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const pick = (arr) => arr[rand(0, arr.length - 1)];
    const px = (v) => `${v}px`;
    const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const createStar = (pos) => {
      const el = document.createElement('i');
      el.className = 'cursor-star';
      el.innerHTML = STAR;
      const color = pick(config.colors);
      el.style.left = px(pos.x);
      el.style.top = px(pos.y);
      el.style.fontSize = pick(config.sizes);
      el.style.color = `rgb(${color})`;
      el.style.textShadow = `0 0 1.5rem rgb(${color} / 0.5)`;
      el.style.animationName = config.animations[count++ % config.animations.length];
      el.style.animationDuration = `${config.duration}ms`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), config.duration);
    };
    const handleMove = (e) => {
      const p = { x: e.clientX, y: e.clientY };
      if (last.mousePosition.x === 0 && last.mousePosition.y === 0) last.mousePosition = p;
      const now = Date.now();
      if (distance(last.starPosition, p) >= config.minDistBetween || now - last.starTimestamp > config.minTimeBetween) {
        createStar(p);
        last.starTimestamp = now; last.starPosition = p;
      }
      last.mousePosition = p;
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    document.body.addEventListener('mouseleave', () => { last.mousePosition = origin; });
  });
})();

(() => {
  const ready = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else fn();
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
      useEmoji: false,             // ✅ switch to Font Awesome
      faClass: 'fa-solid fa-star' // try 'fa-solid fa-star' if sparkles doesn't show
    };

    let count = 0;
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const pick = (arr) => arr[rand(0, arr.length - 1)];
    const px = (v) => `${v}px`;
    const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const elapsed = (t0, t1) => t1 - t0;

    const createStar = (pos) => {
  const el = document.createElement(config.useEmoji ? 'span' : 'i');

  // Build class list
  if (config.useEmoji) {
    el.className = 'cursor-star';
    el.textContent = '✨';
  } else {
    el.className = `cursor-star ${config.faClass}`;
  }

  const color = pick(config.colors);
  el.style.left = px(pos.x);
  el.style.top = px(pos.y);
  el.style.fontSize = pick(config.sizes);
  el.style.color = `rgb(${color})`;
  el.style.textShadow = `0 0 1.5rem rgb(${color} / 0.5)`;
  el.style.animationName = config.animations[count++ % config.animations.length];
  el.style.animationDuration = `${config.duration}ms`;

  layer.appendChild(el);

  // --- visibility fallback: if width is 0 (icon class not available), switch to emoji
  requestAnimationFrame(() => {
    if (!config.useEmoji && el.offsetWidth === 0) {
      el.className = 'cursor-star'; // remove FA classes
      el.textContent = '✨';         // fallback glyph
    }
  });

  setTimeout(() => el.remove(), config.duration);
};


    const updateLastStar = (p) => { last.starTimestamp = Date.now(); last.starPosition = p; };
    const updateLastMouse = (p) => { last.mousePosition = p; };
    const ensureInitialMouse = (p) => {
      if (last.mousePosition.x === 0 && last.mousePosition.y === 0) last.mousePosition = p;
    };

    const handleMove = (e) => {
      const p = { x: e.clientX, y: e.clientY };
      ensureInitialMouse(p);
      const now = Date.now();
      if (distance(last.starPosition, p) >= config.minDistBetween ||
          elapsed(last.starTimestamp, now) > config.minTimeBetween) {
        createStar(p);
        updateLastStar(p);
      }
      updateLastMouse(p);
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    document.body.addEventListener('mouseleave', () => updateLastMouse(origin));
  });
})();

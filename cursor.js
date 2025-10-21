(() => {
  const start = Date.now();
  const origin = { x: 0, y: 0 };
  const last = { starTimestamp: start, starPosition: origin, mousePosition: origin };

  const config = {
    duration: 1500,
    minTimeBetween: 250,
    minDistBetween: 75,
    colors: ["249 146 253", "252 254 255"],
    sizes: ["1.4rem", "1rem", "0.6rem"],
    animations: ["fall-1", "fall-2", "fall-3"],
    useEmoji: true,
  };

  let count = 0;
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = arr => arr[rand(0, arr.length - 1)];
  const px = v => `${v}px`;

  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const elapsed = (t0, t1) => t1 - t0;

  const layer = document.getElementById('cursor-layer');
  const append = el => layer.appendChild(el);
  const removeLater = (el, ms) => setTimeout(() => el.remove(), ms);

  const createStar = pos => {
    const el = document.createElement(config.useEmoji ? 'span' : 'i');
    el.className = 'cursor-star' + (config.useEmoji ? '' : ' fa-solid fa-sparkles');
    if (config.useEmoji) el.textContent = '✨';

    const color = pick(config.colors);
    el.style.left = px(pos.x);
    el.style.top = px(pos.y);
    el.style.fontSize = pick(config.sizes);
    el.style.color = `rgb(${color})`;
    el.style.textShadow = `0 0 1.5rem rgb(${color} / 0.5)`;
    el.style.animationName = config.animations[count++ % config.animations.length];
    el.style.animationDuration = `${config.duration}ms`;

    append(el);
    removeLater(el, config.duration);
  };

  const updateLastStar = pos => {
    last.starTimestamp = Date.now();
    last.starPosition = pos;
  };

  const updateLastMouse = pos => { last.mousePosition = pos; };
  const ensureInitialMouse = pos => {
    if (last.mousePosition.x === 0 && last.mousePosition.y === 0) last.mousePosition = pos;
  };

  const handleMove = e => {
    const p = { x: e.clientX, y: e.clientY };
    ensureInitialMouse(p);
    const now = Date.now();
    const farEnough = distance(last.starPosition, p) >= config.minDistBetween;
    const longEnough = elapsed(last.starTimestamp, now) > config.minTimeBetween;
    if (farEnough || longEnough) {
      createStar(p);
      updateLastStar(p);
    }
    updateLastMouse(p);
  };

  window.addEventListener('pointermove', handleMove, { passive: true });
  document.body.addEventListener('mouseleave', () => updateLastMouse(origin));
})();

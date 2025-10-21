(() => {
  const start = Date.now();
  const originPosition = { x: 0, y: 0 };

  const last = {
    starTimestamp: start,
    starPosition: originPosition,
    mousePosition: originPosition
  };

  const config = {
    starAnimationDuration: 1500,
    minimumTimeBetweenStars: 250,
    minimumDistanceBetweenStars: 75,
    colors: ["249 146 253", "252 254 255"],
    sizes: ["1.4rem", "1rem", "0.6rem"],
    animations: ["fall-1", "fall-2", "fall-3"]
  };

  let count = 0;

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const selectRandom = items => items[rand(0, items.length - 1)];
  const px = v => `${v}px`;
  const calcDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const calcElapsedTime = (start, end) => end - start;

  const appendElement = el => document.body.appendChild(el);
  const removeElement = (el, delay) => setTimeout(() => el.remove(), delay);

  const createStar = position => {
    const star = document.createElement("i");
    const color = selectRandom(config.colors);

    // FIX 1: correct FA class (plural)
    star.className = "star fa-solid fa-sparkles";

    star.style.left = px(position.x);
    star.style.top = px(position.y);
    star.style.fontSize = selectRandom(config.sizes);
    star.style.color = `rgb(${color})`;
    star.style.textShadow = `0 0 1.5rem rgb(${color} / 0.5)`;
    star.style.animationName = config.animations[count++ % 3];

    // FIX 2: correct property name
    star.style.animationDuration = `${config.starAnimationDuration}ms`;

    appendElement(star);
    removeElement(star, config.starAnimationDuration);
  };

  const updateLastStar = position => {
    last.starTimestamp = Date.now();
    last.starPosition = position;
  };

  const updateLastMousePosition = position => (last.mousePosition = position);

  const adjustLastMousePosition = position => {
    if (last.mousePosition.x === 0 && last.mousePosition.y === 0) {
      last.mousePosition = position;
    }
  };

  const handleOnMove = e => {
    const mousePosition = { x: e.clientX, y: e.clientY };
    adjustLastMousePosition(mousePosition);

    const now = Date.now();
    const hasMovedFarEnough =
      calcDistance(last.starPosition, mousePosition) >=
      config.minimumDistanceBetweenStars;
    const hasBeenLongEnough =
      calcElapsedTime(last.starTimestamp, now) >
      config.minimumTimeBetweenStars;

    if (hasMovedFarEnough || hasBeenLongEnough) {
      createStar(mousePosition);
      updateLastStar(mousePosition);
    }

    updateLastMousePosition(mousePosition);
  };

  // Use pointer events (covers mouse/touch/pen)
  window.addEventListener("pointermove", handleOnMove, { passive: true });
  // Touch fallback (if you want)
  window.addEventListener("touchmove", e => handleOnMove(e.touches[0]), { passive: true });
  document.body.addEventListener("mouseleave", () => updateLastMousePosition(originPosition));
})();

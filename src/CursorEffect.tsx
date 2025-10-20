import { proxy, useSnapshot } from 'valtio';

// --- Global State Management for Stars ---
interface Star {
  id: number;
  x: number;
  y: number;
  size: string;
  color: string;
  animationName: string;
  element: HTMLSpanElement;
}

const starState = proxy<{ stars: Star[] }>({
  stars: [],
});

let starCounter = 0;

// --- Configuration ---
const config = {
  starAnimationDuration: 1500,
  minimumTimeBetweenStars: 50,
  minimumDistanceBetweenStars: 50,
  colors: ["249 146 253", "252 254 255", "203 151 165"],
  sizes: ["1.2rem", "0.9rem", "0.6rem"],
  animations: ["fall-1", "fall-2", "fall-3"]
};

// --- Helper Functions ---
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const selectRandom = <T,>(items: T[]): T => items[rand(0, items.length - 1)];
const calcDistance = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const diffX = b.x - a.x;
  const diffY = b.y - a.y;
  return Math.sqrt(Math.pow(diffX, 2) + Math.pow(diffY, 2));
};

// --- Core Logic (No longer a React component) ---

const createStar = (position: { x: number; y: number }) => {
  const newStarId = starCounter++;
  
  const starElement = document.createElement('span');
  starElement.className = "star fa-solid fa-sparkle";
  
  const color = selectRandom(config.colors);
  
  starElement.style.left = `${position.x}px`;
  starElement.style.top = `${position.y}px`;
  starElement.style.fontSize = selectRandom(config.sizes);
  starElement.style.color = `rgb(${color})`;
  starElement.style.textShadow = `0 0 1rem rgba(${color}, 0.5)`;
  starElement.style.animationName = selectRandom(config.animations);
  
  document.body.appendChild(starElement);

  setTimeout(() => {
    document.body.removeChild(starElement);
  }, config.starAnimationDuration);
};

let last = {
  starTimestamp: new Date().getTime(),
  starPosition: { x: 0, y: 0 },
};

const handleOnMove = (e: MouseEvent | TouchEvent) => {
  const isTouchEvent = 'touches' in e;
  const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
  const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;

  const mousePosition = { x: clientX, y: clientY };

  const now = new Date().getTime();
  const hasMovedFarEnough = calcDistance(last.starPosition, mousePosition) >= config.minimumDistanceBetweenStars;
  const hasBeenLongEnough = (now - last.starTimestamp) > config.minimumTimeBetweenStars;

  if (hasMovedFarEnough || hasBeenLongEnough) {
    createStar(mousePosition);
    last.starTimestamp = now;
    last.starPosition = mousePosition;
  }
};

// --- Initializer Function ---
export const initializeCursorEffect = () => {
  window.addEventListener('mousemove', handleOnMove);
  window.addEventListener('touchmove', handleOnMove);

  // Return a cleanup function
  return () => {
    window.removeEventListener('mousemove', handleOnMove);
    window.removeEventListener('touchmove', handleOnMove);
  };
};


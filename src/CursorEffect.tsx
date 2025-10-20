import React, { useState, useEffect, useRef } from 'react';
import './CursorEffect.css';

// Define the shape of a star object
interface Star {
  id: number;
  x: number;
  y: number;
  size: string;
  color: string;
  animationName: string;
}

// Configuration for the star effect
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

const CursorEffect: React.FC = () => {
  const [stars, setStars] = useState<Star[]>([]);
  // FIX: Use useRef for the star counter to ensure it persists across re-renders
  const starCounter = useRef(0);

  // Use useRef to store the last known positions and timestamps without causing re-renders
  const last = useRef({
    starTimestamp: new Date().getTime(),
    starPosition: { x: 0, y: 0 },
  }).current;

  useEffect(() => {
    const createStar = (position: { x: number; y: number }) => {
      // Get a unique ID for the new star
      const newStarId = starCounter.current++;
      
      const newStar: Star = {
        id: newStarId,
        x: position.x,
        y: position.y,
        size: selectRandom(config.sizes),
        color: selectRandom(config.colors),
        animationName: selectRandom(config.animations),
      };

      setStars(prevStars => [...prevStars, newStar]);

      // Set a timer to remove the star after its animation completes
      setTimeout(() => {
        setStars(prev => prev.filter(s => s.id !== newStarId));
      }, config.starAnimationDuration);
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

    // Add event listeners
    window.addEventListener('mousemove', handleOnMove);
    window.addEventListener('touchmove', handleOnMove);

    // Cleanup function to remove listeners when the component unmounts
    return () => {
      window.removeEventListener('mousemove', handleOnMove);
      window.removeEventListener('touchmove', handleOnMove);
    };
  }, [last]); // Dependency array can be simplified

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {stars.map(star => (
        <span
          key={star.id}
          className="star fa-solid fa-sparkle"
          style={{
            left: `${star.x}px`,
            top: `${star.y}px`,
            fontSize: star.size,
            color: `rgb(${star.color})`,
            textShadow: `0 0 1rem rgba(${star.color}, 0.5)`,
            animationName: star.animationName,
          }}
        />
      ))}
    </div>
  );
};

export default CursorEffect;


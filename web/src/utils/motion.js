/**
 * GSAP wrappers that honour prefers-reduced-motion. Every animation route
 * through here becomes a no-op when the user has asked for reduced motion.
 */
import gsap from 'gsap';

export const reducedMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Run a GSAP factory only if motion is allowed; returns the resulting tween or null. */
export function tween(fn) {
  if (reducedMotion()) return null;
  return fn(gsap);
}

/** Animate a number from 0 up to `to`, calling `onUpdate(v)` at each frame. */
export function countTo(to, { duration = 1.1, onUpdate, ease = 'power2.out' } = {}) {
  if (reducedMotion() || !Number.isFinite(to)) {
    onUpdate?.(to);
    return null;
  }
  const obj = { v: 0 };
  return gsap.to(obj, {
    v: to,
    duration,
    ease,
    onUpdate: () => onUpdate?.(obj.v),
  });
}

export { gsap };

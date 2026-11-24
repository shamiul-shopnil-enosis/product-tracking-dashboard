import { Color } from 'three';

/** True when this browser can make a WebGL context. */
export function webglWorks(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/** Turns a CSS colour such as "var(--s1)" into a three.js colour using the page's current theme. */
export function cssColor(value: string, fallback = '#5d6bf0'): Color {
  const el = document.createElement('span');
  el.style.color = value; el.style.display = 'none';
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  el.remove();
  try { return new Color(resolved); } catch { return new Color(fallback); }
}

export const reducedMotionNow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

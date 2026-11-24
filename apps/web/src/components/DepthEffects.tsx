'use client';

import { useEffect } from 'react';

const MAX_TILT = 4; // degrees
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

/**
 * Makes the card under the mouse lean toward it, with a shine that follows. Only the card's glass layer moves (see the
 * .tile::before rule), so the numbers stay flat and sharp. Touch screens and the Reduced effects mode get nothing.
 */
export function DepthEffects() {
  useEffect(() => {
    if (!window.matchMedia?.(FINE_POINTER).matches) return;
    let current: HTMLElement | null = null;
    let raf = 0;

    const reset = (el: HTMLElement | null) => {
      if (!el) return;
      el.classList.remove('tilting');
      for (const v of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(v);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || document.documentElement.dataset.effects !== 'full') { reset(current); current = null; return; }
      const tile = (e.target as Element | null)?.closest?.('.tile') as HTMLElement | null;
      if (tile !== current) { reset(current); current = tile; }
      if (!tile || tile.classList.contains('leaving') || tile.classList.contains('skeleton-tile')) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = tile.getBoundingClientRect();
        const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        tile.classList.add('tilting');
        tile.style.setProperty('--rx', `${((0.5 - py) * 2 * MAX_TILT).toFixed(2)}deg`);
        tile.style.setProperty('--ry', `${((px - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`);
        tile.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        tile.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      });
    };
    const onLeave = () => { cancelAnimationFrame(raf); reset(current); current = null; };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      cancelAnimationFrame(raf); reset(current);
    };
  }, []);
  return null;
}

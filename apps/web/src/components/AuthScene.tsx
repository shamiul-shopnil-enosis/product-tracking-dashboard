'use client';

import { useEffect, useRef } from 'react';

/** A tilted glass slab of mini cards behind the sign-in text. Drifts a little with the mouse (fine pointers only); the CSS hides it when effects are Reduced or on small screens. */
export function AuthScene() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = ref.current; const host = scene?.parentElement;
    if (!scene || !host) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || document.documentElement.dataset.effects !== 'full') return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = host.getBoundingClientRect();
        scene.style.setProperty('--px', (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
        scene.style.setProperty('--py', (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
      });
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="auth-scene" ref={ref} aria-hidden="true">
      <div className="slab">
        <div className="mini m1"><i style={{ width: '50%' }} /><b>2,069</b></div>
        <div className="mini m2"><i style={{ width: '60%' }} /><b>12.8%</b></div>
        <div className="mini m3"><svg viewBox="0 0 120 40"><path d="M4 32 L22 24 L40 27 L60 12 L80 18 L116 4" /></svg></div>
      </div>
      <div className="orb-chip"><i style={{ width: '55%' }} /><b>Live</b></div>
    </div>
  );
}

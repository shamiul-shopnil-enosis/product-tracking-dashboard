'use client';

import { useEffect, useRef } from 'react';

/** Floating glass panes behind the sign-in text. Drifts a little with the mouse (fine pointers only); the CSS hides it when effects are Reduced or on small screens. */
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
      <div className="pane p3"><svg viewBox="0 0 120 50"><path d="M4 40 L22 30 L40 34 L60 18 L80 24 L116 6" /></svg></div>
      <div className="pane p2"><i style={{ width: '70%' }} /><i style={{ width: '45%' }} /><i style={{ width: '58%' }} /></div>
      <div className="pane p1"><b /><b /><b /></div>
    </div>
  );
}

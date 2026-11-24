'use client';

import { useEffect, useRef } from 'react';
import createGlobe, { type Marker } from 'cobe';

export type GlobeDot = { location: [number, number]; size: number; live: boolean };

/** The WebGL globe. Loaded on demand (see VisitorGlobe), never on the server. Turns slowly, can be dragged, pauses when off screen or when the tab is hidden. */
export default function GlobeCanvas({ dots, size, dark, onFail }: { dots: GlobeDot[]; size: number; dark: boolean; onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef(dots);
  dotsRef.current = dots;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr, width: size * dpr, height: size * dpr, phi: 4.2, theta: 0.25,
        dark: dark ? 1 : 0, diffuse: dark ? 1.1 : 1.3, mapSamples: 12000, mapBrightness: dark ? 5 : 6,
        baseColor: dark ? [0.14, 0.15, 0.3] : [0.93, 0.95, 0.98], markerColor: dark ? [0.45, 0.5, 1] : [0.16, 0.47, 0.84], glowColor: dark ? [0.15, 0.17, 0.5] : [0.85, 0.9, 0.98],
        markers: [],
      });
    } catch { onFail(); return; }

    let phi = 4.2; let drag = 0; let lastX = 0; let raf = 0; let visible = true; let last = performance.now();
    const markers = (t: number): Marker[] => dotsRef.current.map((d) => ({
      location: d.location,
      size: d.live ? d.size * (1 + 0.35 * Math.sin(t / 380)) : d.size,
      color: d.live ? [0.11, 0.69, 0.48] : dark ? [0.45, 0.5, 1] : [0.16, 0.47, 0.84],
    }));
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.visibilityState !== 'visible') { last = now; return; }
      if (!drag) phi += (now - last) * 0.00012;
      last = now;
      globe.update({ phi: phi + drag, markers: markers(now) });
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(canvas);
    const down = (e: PointerEvent) => { lastX = e.clientX; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; drag = 0.0001; };
    const move = (e: PointerEvent) => { if (!drag) return; phi += (e.clientX - lastX) / 120; lastX = e.clientX; };
    const up = () => { drag = 0; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); globe.destroy();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
    };
  }, [size, dark, onFail]);

  return <canvas ref={ref} className="globe-canvas" style={{ width: size, height: size }} role="img" aria-label="A globe with a dot for each country that visits the site" />;
}

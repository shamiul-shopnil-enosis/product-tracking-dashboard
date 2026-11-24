'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * A number that counts to its value. It counts up the first time it is seen, and counts from the old value to the new
 * one when the data changes. Cards off screen, and people who asked for less motion, get the final number at once.
 */
export function AnimatedNumber({ value, format, ms = 480 }: { value: number | null; format: (v: number | null) => string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    shown.current = value;
    const inView = !!el && (() => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; })();
    const start = from === null ? 0 : from;
    if (value === null || prefersReducedMotion() || !inView || start === value) { setText(format(value)); return; }
    let raf = 0; const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      setText(format(start + (value - start) * ease(t)));
      if (t < 1) raf = requestAnimationFrame(step); else setText(format(value));
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); shown.current = value; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span ref={ref}>{text}</span>;
}

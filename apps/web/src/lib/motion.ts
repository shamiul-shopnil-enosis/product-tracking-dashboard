'use client';

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Whether the person asked their system for less motion. Checked when a motion starts, never cached. */
export const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Keeps something on screen long enough to play its exit motion.
 * `mounted` says whether to render it; `closing` says it is on its way out (use it for a data-state attribute).
 */
export function usePresence(open: boolean, ms = 160): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    if (prefersReducedMotion()) { setMounted(false); return; }
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ms]);
  return { mounted: open || mounted, closing: !open && closing };
}

'use client';

import { useCallback, useEffect, useState } from 'react';

export type Effects = 'full' | 'reduced';
export type EffectsChoice = 'auto' | Effects;
const KEY = 'pt-effects';
const EVENT = 'pt-effects-change';

type NavExtra = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** What "auto" means: reduced when the person or the device asks for less, full otherwise. Mirrors the script in layout.tsx that runs before first paint. */
export function autoEffects(): Effects {
  if (typeof window === 'undefined') return 'full';
  const mq = (q: string) => !!window.matchMedia?.(q).matches;
  const nav = navigator as NavExtra;
  const weak = (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2);
  return mq('(prefers-reduced-motion: reduce)') || nav.connection?.saveData || weak ? 'reduced' : 'full';
}

export function storedChoice(): EffectsChoice {
  try { const v = localStorage.getItem(KEY); return v === 'full' || v === 'reduced' ? v : 'auto'; } catch { return 'auto'; }
}

export function effectiveEffects(choice: EffectsChoice = storedChoice()): Effects {
  return choice === 'auto' ? autoEffects() : choice;
}

/** Puts the result on <html>, where the styles read it. Someone who asked their system for reduced transparency keeps the depth but gets solid panels instead of glass. */
export function applyEffects(): Effects {
  const e = effectiveEffects();
  document.documentElement.dataset.effects = e;
  document.documentElement.dataset.solid = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches ? 'true' : 'false';
  return e;
}

/** The visual effects mode (depth, tilt, glass). "auto" follows the device and system settings. */
export function useEffects(): { effective: Effects; choice: EffectsChoice; set: (c: EffectsChoice) => void } {
  const [choice, setChoice] = useState<EffectsChoice>('auto');
  const [effective, setEffective] = useState<Effects>('full');

  useEffect(() => {
    const sync = () => { setChoice(storedChoice()); setEffective(applyEffects()); };
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const set = useCallback((c: EffectsChoice) => {
    try { if (c === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, c); } catch { /* not remembered in a private window */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { effective, choice, set };
}

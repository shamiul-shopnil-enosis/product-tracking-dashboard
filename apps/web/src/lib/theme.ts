'use client';

import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** The theme is chosen before first paint by a script in the layout; this reads and changes it. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('light');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }, []);
  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('pt-theme', next);
    } catch {
      /* private window: the choice just is not remembered */
    }
    setTheme(next);
  }, []);
  return [theme, toggle];
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';

/** The cards everyone starts with. The server has the same list and is the source of truth once someone saves. */
export const DEFAULT_CARDS = ['live', 'sessions', 'ga4Users', 'ga4Engagement', 'ga4KeyEvents', 'orgSessions'];

type Layout = {
  cards: string[];
  isDefault: boolean;
  ready: boolean;
  /** Whether this card is on the person's Overview */
  has: (key: string) => boolean;
  /** Add the card to the Overview, or take it off */
  toggle: (key: string) => void;
  /** Back to the default view */
  reset: () => void;
  error: string;
};

const Ctx = createContext<Layout>({ cards: DEFAULT_CARDS, isDefault: true, ready: false, has: () => false, toggle: () => undefined, reset: () => undefined, error: '' });
export const useLayout = () => useContext(Ctx);

type Saved = { cards: string[]; isDefault: boolean };

/** Each person's chosen Overview cards, kept on the server so they follow the person to any device. */
export function LayoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Saved>({ cards: DEFAULT_CARDS, isDefault: true });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    let cancelled = false;
    api<Saved>('/dashboard-layout')
      .then((s) => { if (!cancelled) { setState(s); setReady(true); } })
      .catch(() => { if (!cancelled) setReady(true); }); // keep the default view if the server cannot answer
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async (next: string[]) => {
    const before = latest.current;
    setState({ cards: next, isDefault: false }); // show the change at once
    setError('');
    try {
      setState(await api<Saved>('/dashboard-layout', { method: 'PUT', body: { cards: next } }));
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : 'Could not save your dashboard');
    }
  }, []);

  const toggle = useCallback((key: string) => {
    const cur = latest.current.cards;
    void save(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  }, [save]);

  const reset = useCallback(async () => {
    const before = latest.current;
    setState({ cards: DEFAULT_CARDS, isDefault: true });
    setError('');
    try {
      setState(await api<Saved>('/dashboard-layout', { method: 'DELETE' }));
    } catch (e) {
      setState(before);
      setError(e instanceof Error ? e.message : 'Could not reset your dashboard');
    }
  }, []);

  const value = useMemo<Layout>(() => ({ ...state, ready, has: (k) => state.cards.includes(k), toggle, reset: () => void reset(), error }), [state, ready, toggle, reset, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

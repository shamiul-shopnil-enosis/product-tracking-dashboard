'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

type Tone = 'ok' | 'info' | 'error';
type ToastOptions = { tone?: Tone; /** A button on the toast, for example Undo */ action?: { label: string; onClick: () => void }; ms?: number };
type Item = { id: number; message: string; tone: Tone; action?: ToastOptions['action']; closing: boolean };

const Ctx = createContext<(message: string, opts?: ToastOptions) => void>(() => undefined);
/** Show a small confirmation, for example "Added to your Overview". Safe to call anywhere; does nothing without a provider. */
export const useToast = () => useContext(Ctx);

const MAX = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 170);
  }, []);

  const arm = useCallback((id: number, ms: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => remove(id), ms));
  }, [remove]);

  const show = useCallback((message: string, opts: ToastOptions = {}) => {
    const id = next.current++;
    setItems((list) => [...list.slice(-(MAX - 1)), { id, message, tone: opts.tone ?? 'ok', action: opts.action, closing: false }]);
    arm(id, opts.ms ?? (opts.action ? 6000 : 3500));
  }, [arm]);

  const value = useMemo(() => show, [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => (
          <div className={`toast ${t.tone}`} key={t.id} data-state={t.closing ? 'closing' : 'open'}
            onMouseEnter={() => clearTimeout(timers.current.get(t.id))} onMouseLeave={() => arm(t.id, 2000)}>
            <Icon name={t.tone === 'error' ? 'error' : 'check'} size={16} />
            <span className="toast-msg">{t.message}</span>
            {t.action && <button type="button" className="toast-act" onClick={() => { t.action?.onClick(); remove(t.id); }}>{t.action.label}</button>}
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => remove(t.id)}><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

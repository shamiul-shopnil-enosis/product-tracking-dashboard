'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useAuth } from './AuthProvider';

const KEY = (userId: string) => `pt.dismissed.${userId}`;

function read(userId: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY(userId)) ?? '{}') as Record<string, string>; } catch { return {}; }
}

/**
 * An orange alert the person can close. It stays closed until what it says changes (`signature`), then comes back.
 * Remembered per person in this browser. `onHidden` tells the page when it is closed, so the message can be shown elsewhere.
 */
export function DismissibleAlert({ id, signature, onHidden, children }: { id: string; signature: string; onHidden?: (hidden: boolean) => void; children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? 'anonymous';
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const isHidden = read(userId)[id] === signature;
    setHidden(isHidden);
    onHidden?.(isHidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, id, signature]);

  function dismiss() {
    try { localStorage.setItem(KEY(userId), JSON.stringify({ ...read(userId), [id]: signature })); } catch { /* private window: it just comes back on reload */ }
    setHidden(true);
    onHidden?.(true);
  }

  if (hidden) return null;
  return (
    <div className="orange-alert" role="status">
      <span className="orange-ico"><Icon name="error" size={18} /></span>
      <div className="orange-body">{children}</div>
      <button type="button" className="orange-close" aria-label="Dismiss this alert" onClick={dismiss}><Icon name="close" size={18} /></button>
    </div>
  );
}

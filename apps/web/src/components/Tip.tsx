'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** An "i" icon that explains a number or block in a sentence or two. Opens on hover, tap or keyboard; Escape or a tap elsewhere closes it. */
export function Tip({ label, children, side = 'right', wide = false }: { label: string; children: ReactNode; /** Which edge of the "i" the popup lines up with; use left near the left edge of the page */ side?: 'left' | 'right'; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <span className="tip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button" className="info" aria-label={`What does “${label}” mean?`} aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >i</button>
      {open && <span role="tooltip" id={id} className={`tip-pop${side === 'left' ? ' left' : ''}${wide ? ' wide' : ''}`}>{children}</span>}
    </span>
  );
}

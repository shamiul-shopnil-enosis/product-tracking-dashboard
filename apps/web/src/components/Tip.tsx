'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * An "i" icon that explains a number or block in a sentence or two. Opens on hover, tap or keyboard; Escape or a tap
 * elsewhere closes it. On a wide screen the popup lines up with whichever edge of the "i" keeps it inside its own
 * card, so it never lands on a neighbouring tile; `side` is only the preference.
 */
export function Tip({ label, children, side = 'right', wide = false }: { label: string; children: ReactNode; /** Which edge of the "i" the popup lines up with; use left near the left edge of the page */ side?: 'left' | 'right'; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [align, setAlign] = useState(side);

  useLayoutEffect(() => {
    setAlign(side);
    const host = ref.current;
    const pop = popRef.current;
    if (!open || !host || !pop || window.matchMedia('(max-width: 860px)').matches) return; // phones use a bottom sheet
    const owner = host.closest('.tile, .block, .card, .chart, .headcard, .filterbar')?.getBoundingClientRect();
    const box = owner ?? { left: 0, right: window.innerWidth };
    const i = host.getBoundingClientRect();
    const w = pop.offsetWidth;
    const fitsRight = i.right - w >= box.left + 4; // popup ends at the right edge of the "i" and grows leftwards
    const fitsLeft = i.left + w <= box.right - 4; // popup starts at the left edge of the "i" and grows rightwards
    if (side === 'right' && !fitsRight && fitsLeft) setAlign('left');
    else if (side === 'left' && !fitsLeft && fitsRight) setAlign('right');
    else if (!fitsRight && !fitsLeft) setAlign(i.right - w < 8 ? 'left' : i.left + w > window.innerWidth - 8 ? 'right' : side);
  }, [open, side]);

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
      {open && <span role="tooltip" id={id} ref={popRef} className={`tip-pop${align === 'left' ? ' left' : ''}${wide ? ' wide' : ''}`}>{children}</span>}
    </span>
  );
}

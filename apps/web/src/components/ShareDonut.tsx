'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEffects } from '@/lib/effects';
import { formatValue } from '@/lib/dashboard';
import { webglWorks } from '@/lib/webgl';
import type { DonutItem } from '@/components/chart3d/DonutCanvas';

const DonutCanvas = dynamic(() => import('@/components/chart3d/DonutCanvas'), { ssr: false, loading: () => <div className="donut-wait" aria-hidden /> });
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', '#8a6fe0', 'var(--ink-3)'];

/** Share of sessions as a 3D ring with a colour key. Shown only with Full effects and WebGL; the table beside it always has the same numbers. */
export function ShareDonut({ rows, totalLabel = 'Sessions' }: { rows: { name: string; sessions: number }[]; totalLabel?: string }) {
  const fx = useEffects();
  const [gl, setGl] = useState(false);
  const [dark, setDark] = useState(false);
  const [wide, setWide] = useState(true);
  useEffect(() => { setGl(webglWorks()); }, []);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === 'dark');
    read(); const mo = new MutationObserver(read); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const q = matchMedia('(min-width: 700px)'); const w = () => setWide(q.matches); w(); q.addEventListener('change', w);
    return () => { mo.disconnect(); q.removeEventListener('change', w); };
  }, []);
  const items = useMemo<DonutItem[]>(() => {
    const sorted = rows.filter((r) => r.sessions > 0).sort((a, b) => b.sessions - a.sessions);
    const head = sorted.slice(0, 5); const rest = sorted.slice(5).reduce((a, r) => a + r.sessions, 0);
    const list = head.map((r, i) => ({ name: r.name || '(not set)', value: r.sessions, color: COLORS[i] }));
    if (rest > 0) list.push({ name: 'Other', value: rest, color: COLORS[5] });
    return list;
  }, [rows]);
  const format = useCallback((v: number) => formatValue(v, 'count'), []);
  if (fx.effective !== 'full' || !gl || !wide || items.length < 2) return null;
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <div className="donut-row">
      <DonutCanvas items={items} size={240} dark={dark} totalLabel={totalLabel} format={format} />
      <ul className="donut-key">
        {items.map((i) => <li key={i.name}><i style={{ background: i.color }} />{i.name}<em>{Math.round((i.value / total) * 100)}%</em></li>)}
      </ul>
    </div>
  );
}

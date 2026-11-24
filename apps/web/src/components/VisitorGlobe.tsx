'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tip } from '@/components/Tip';
import { countryPoint } from '@/lib/countries';
import { useEffects } from '@/lib/effects';
import { formatValue, type DemographicsResponse } from '@/lib/dashboard';
import { useApiData } from '@/lib/useApi';
import type { GlobeDot } from '@/components/GlobeCanvas';

const GlobeCanvas = dynamic(() => import('@/components/GlobeCanvas'), { ssr: false, loading: () => <div className="globe-wait" aria-hidden /> });

type Live = { available: true; activeUsers: number; countries?: { name: string; activeUsers: number }[] } | { available: false };

function webglWorks() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/** Where visitors are: a turning globe (dots sized by visits, green pulses for people on the site now), or a plain ranked list when effects are reduced or WebGL is missing. */
export function VisitorGlobe({ qs, size = 240, title = 'Where visitors are' }: { qs: string; size?: number; title?: string }) {
  const { data } = useApiData<DemographicsResponse>(`/dashboard/ga4-demographics?dimension=country&${qs}&organic=0`);
  const { data: live, reload } = useApiData<Live>('/dashboard/ga4-realtime');
  const fx = useEffects();
  const [broken, setBroken] = useState(false);
  const [gl, setGl] = useState(false);
  const [dark, setDark] = useState(false);
  const onFail = useCallback(() => setBroken(true), []);

  useEffect(() => { setGl(webglWorks()); }, []);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === 'dark');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 60_000);
    return () => clearInterval(id);
  }, [reload]);

  const rows = useMemo(() => (data?.connected ? data.rows.filter((r) => r.name && r.name !== '(other)' && r.name !== '(not set)') : []), [data]);
  const liveRows = live && live.available ? live.countries ?? [] : [];
  const dots = useMemo<GlobeDot[]>(() => {
    const top = Math.max(1, ...rows.map((r) => r.sessions));
    const out: GlobeDot[] = [];
    const liveNames = new Set(liveRows.map((c) => c.name));
    for (const r of rows) { const p = countryPoint(r.name); if (p) out.push({ location: p, size: 0.03 + 0.07 * Math.sqrt(r.sessions / top), live: liveNames.has(r.name) }); }
    for (const c of liveRows) { const p = countryPoint(c.name); if (p && !rows.some((r) => r.name === c.name)) out.push({ location: p, size: 0.04, live: true }); }
    return out;
  }, [rows, liveRows]);

  if (!data || !data.connected || rows.length === 0) return null;
  const useGlobe = fx.effective === 'full' && gl && !broken;
  const top = rows.slice(0, 5);
  const max = Math.max(1, ...top.map((r) => r.sessions));

  return (
    <section className="card globe-card" aria-label={title}>
      <h2>{title} <Tip label={title}>Each dot is a country that visited in the chosen dates; bigger means more visits. Green dots pulse for countries with people on the site right now. Drag to turn it. With Visual effects on Reduced it becomes a plain list.</Tip></h2>
      {useGlobe && <div className="globe-stage" style={{ height: size }}><GlobeCanvas dots={dots} size={size} dark={dark} onFail={onFail} /></div>}
      <ol className="globe-list">
        {top.map((r) => (
          <li key={r.name}>
            <span className="g-name">{liveRows.some((c) => c.name === r.name) && <i className="dot pulse" aria-label="active now" />}{r.name}</span>
            <span className="g-bar" aria-hidden><i style={{ width: `${(r.sessions / max) * 100}%` }} /></span>
            <span className="num">{formatValue(r.sessions, 'count')}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

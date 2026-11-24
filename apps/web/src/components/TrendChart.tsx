'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Tip } from './Tip';
import { formatValue, type Marker, type Unit } from '@/lib/dashboard';
import { fmtDate } from '@/lib/date';
import { useReducedMotion } from '@/lib/motion';
import { useEffects } from '@/lib/effects';
import { webglWorks } from '@/lib/webgl';

const BarsCanvas = dynamic(() => import('./chart3d/BarsCanvas'), { ssr: false, loading: () => <div className="chart3d-wait" aria-hidden /> });
const MODE_KEY = 'pt-chart3d';

type DataPoint = Record<string, string | number | null>;
export type SeriesDef = { key: string; label: string; color: string };
type Props = {
  title: string; /** Plain-language: what this chart shows and how to read it */ hint?: string; /** Chart height in pixels (default 230) */ height?: number; /** Show the hint as an "i" tooltip next to the title */ compactHint?: boolean; unit: Unit; points: DataPoint[]; series: SeriesDef[]; note?: string; markers?: Marker[];
  /** The previous period, day for day, drawn dashed behind the main line */
  prev?: { label: string; values: (number | null)[] };
};

const day = (d: string) => fmtDate(d);
const PREV = '__prev';

export function TrendChart({ title, hint, compactHint, height = 230, unit, points, series, note, markers = [], prev }: Props) {
  const [table, setTable] = useState(false);
  const reduced = useReducedMotion();
  const fx = useEffects();
  // 3D bars: Full effects, a browser with WebGL and enough width. The choice is remembered; flat lines are always one click away.
  const [gl, setGl] = useState(false); const [wide, setWide] = useState(false); const [dark, setDark] = useState(false); const [want3d, setWant3d] = useState(true);
  useEffect(() => {
    setGl(webglWorks());
    try { setWant3d(localStorage.getItem(MODE_KEY) !== 'flat'); } catch { /* ignore */ }
    const q = matchMedia('(min-width: 760px)'); const w = () => setWide(q.matches); w(); q.addEventListener('change', w);
    const read = () => setDark(document.documentElement.dataset.theme === 'dark'); read();
    const mo = new MutationObserver(read); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { q.removeEventListener('change', w); mo.disconnect(); };
  }, []);
  const can3d = fx.effective === 'full' && gl && wide && !markers.some((m) => points.some((p) => p.date === m.date));
  const show3d = can3d && want3d;
  const pick = (v: boolean) => { setWant3d(v); try { localStorage.setItem(MODE_KEY, v ? '3d' : 'flat'); } catch { /* ignore */ } };
  const data: DataPoint[] = points.map((p, i) => (prev ? { ...p, [PREV]: prev.values[i] ?? null } : p));
  const hasData = points.some((p) => series.some((s) => p[s.key] !== null));
  const visible = markers.filter((m) => points.some((p) => p.date === m.date)); // only days the chart shows
  const legendItems = series.length + (prev ? 1 : 0);

  return (
    <section className="chart" aria-label={title}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="chart-title">{title}{(hint || note) && <> <Tip label={title} side="left">{hint && <span className="tp">{hint}</span>}{note && <span className="tp">{note}</span>}</Tip></>}</span>
        <span className="row" style={{ gap: 10 }}>
          {hasData && can3d && !table && <span className="seg" role="group" aria-label="Chart style"><button type="button" aria-pressed={!want3d} onClick={() => pick(false)}>Lines</button><button type="button" aria-pressed={want3d} onClick={() => pick(true)}>3D</button></span>}
          {hasData && <button className="link" onClick={() => setTable(!table)}>{table ? 'View chart' : 'View as table'}</button>}
        </span>
      </div>
      {!hasData ? (
        <div className="empty"><b>No full days stored yet</b>This chart fills in after the nightly runs.</div>
      ) : table ? (
        <div className="table-scroll" style={{ maxHeight: 260 }}>
          <table>
            <thead><tr><th>Date</th>{series.map((s) => <th className="num" key={s.label}>{s.label}</th>)}{prev && <th className="num">{prev.label}</th>}</tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={String(p.date)}>
                  <td>{fmtDate(String(p.date))}</td>
                  {series.map((s) => <td className="num" key={s.label}>{formatValue(p[s.key] as number | null, unit)}</td>)}
                  {prev && <td className="num">{formatValue(p[PREV] as number | null, unit)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : show3d ? (
        <BarsCanvas points={points} series={series} prev={prev} unit={unit} height={height + 40} dark={dark} />
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="date" tickFormatter={day} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} minTickGap={40} />
              <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 12 }} axisLine={false} tickLine={false} width={46} tickFormatter={(v) => formatValue(v, unit)} />
              <Tooltip
                formatter={(v, name) => [formatValue(typeof v === 'number' ? v : null, unit), name]}
                labelFormatter={(l) => fmtDate(String(l))}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }}
                itemStyle={{ color: 'var(--ink-2)' }}
                labelStyle={{ color: 'var(--ink)', fontWeight: 600 }}
                cursor={{ stroke: 'var(--ink-3)' }}
              />
              {legendItems > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--ink-2)' }} />}
              {visible.map((m) => <ReferenceLine key={m.id} x={m.date} stroke="var(--ink-3)" strokeDasharray="3 3" />)}
              {prev && (
                <Line type="linear" dataKey={PREV} name={prev.label} className="chart-prev" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
              )}
              {series.map((s) => (
                <Line key={s.label} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  dot={false} activeDot={{ r: 5, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={!reduced} animationDuration={450} animationEasing="ease-out" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasData && !table && visible.length > 0 && (
        <div className="sub" style={{ margin: '4px 0 0' }}>Dashed vertical lines: {visible.map((m) => `${fmtDate(m.date)} ${m.label}`).join(' · ')}</div>
      )}
    </section>
  );
}

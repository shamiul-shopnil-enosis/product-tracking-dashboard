'use client';

import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Tip } from './Tip';
import { formatValue, type Marker, type Unit } from '@/lib/dashboard';

type DataPoint = Record<string, string | number | null>;
export type SeriesDef = { key: string; label: string; color: string };
type Props = {
  title: string; /** Plain-language: what this chart shows and how to read it */ hint?: string; /** Show the hint as an "i" tooltip next to the title */ compactHint?: boolean; unit: Unit; points: DataPoint[]; series: SeriesDef[]; note?: string; markers?: Marker[];
  /** The previous period, day for day, drawn dashed behind the main line */
  prev?: { label: string; values: (number | null)[] };
};

const day = (d: string) => d.slice(5);
const PREV = '__prev';

export function TrendChart({ title, hint, compactHint, unit, points, series, note, markers = [], prev }: Props) {
  const [table, setTable] = useState(false);
  const data: DataPoint[] = points.map((p, i) => (prev ? { ...p, [PREV]: prev.values[i] ?? null } : p));
  const hasData = points.some((p) => series.some((s) => p[s.key] !== null));
  const visible = markers.filter((m) => points.some((p) => p.date === m.date)); // only days the chart shows
  const legendItems = series.length + (prev ? 1 : 0);

  return (
    <section className="chart" aria-label={title}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="chart-title">{title}{compactHint && hint && <> <Tip label={title}>{hint}</Tip></>}</span>
        {hasData && <button className="link" onClick={() => setTable(!table)}>{table ? 'View chart' : 'View as table'}</button>}
      </div>
      {hint && !compactHint && <div className="sub">{hint}</div>}
      {note && <div className="sub">{note}</div>}
      {!hasData ? (
        <div className="empty"><b>No full days stored yet</b>This chart fills in after the nightly runs.</div>
      ) : table ? (
        <div className="table-scroll" style={{ maxHeight: 260 }}>
          <table>
            <thead><tr><th>Date</th>{series.map((s) => <th className="num" key={s.label}>{s.label}</th>)}{prev && <th className="num">{prev.label}</th>}</tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={String(p.date)}>
                  <td>{p.date}</td>
                  {series.map((s) => <td className="num" key={s.label}>{formatValue(p[s.key] as number | null, unit)}</td>)}
                  {prev && <td className="num">{formatValue(p[PREV] as number | null, unit)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height: 230 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="date" tickFormatter={day} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} axisLine={{ stroke: 'var(--grid)' }} tickLine={false} minTickGap={28} />
              <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 12 }} axisLine={false} tickLine={false} width={46} tickFormatter={(v) => formatValue(v, unit)} />
              <Tooltip
                formatter={(v, name) => [formatValue(typeof v === 'number' ? v : null, unit), name]}
                labelFormatter={(l) => String(l)}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' }}
                itemStyle={{ color: 'var(--ink-2)' }}
                labelStyle={{ color: 'var(--ink)', fontWeight: 600 }}
                cursor={{ stroke: 'var(--ink-3)' }}
              />
              {legendItems > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--ink-2)' }} />}
              {visible.map((m) => <ReferenceLine key={m.id} x={m.date} stroke="var(--ink-3)" strokeDasharray="3 3" />)}
              {prev && (
                <Line type="linear" dataKey={PREV} name={prev.label} stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
              )}
              {series.map((s) => (
                <Line key={s.label} type="linear" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                  dot={false} activeDot={{ r: 5, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasData && !table && visible.length > 0 && (
        <div className="sub" style={{ margin: '4px 0 0' }}>Dashed vertical lines: {visible.map((m) => `${m.date.slice(5)} ${m.label}`).join(' · ')}</div>
      )}
    </section>
  );
}

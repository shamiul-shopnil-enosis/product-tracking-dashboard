import { GAUGE_LIMITS } from '@/lib/speed';

const R = 38; const CX = 50; const CY = 46;
const pt = (t: number, r = R) => { const a = Math.PI * (1 - t); return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const; };
const arc = (t0: number, t1: number) => { const [x0, y0] = pt(t0); const [x1, y1] = pt(t1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };

/** A half-dial: green, amber and red zones from the metric's own limits, and a needle at the current value. Purely visual; the number and grade beside it say the same thing in words. */
export function VitalGauge({ metric, value }: { metric: string; value: number | null }) {
  const lim = GAUGE_LIMITS[metric];
  if (!lim || value === null) return null;
  const max = lim.higherIsBetter ? 100 : lim.poor * 1.5;
  const g = lim.higherIsBetter ? (100 - lim.good) / 100 : lim.good / max;           // share of the dial that is "good"
  const p = lim.higherIsBetter ? (lim.good - lim.poor) / 100 : (lim.poor - lim.good) / max; // share that is "needs work"
  const zones = lim.higherIsBetter
    ? [['poor', 0, lim.poor / 100], ['needs-improvement', lim.poor / 100, lim.good / 100], ['good', lim.good / 100, 1]] as const
    : [['good', 0, g], ['needs-improvement', g, g + p], ['poor', g + p, 1]] as const;
  void p;
  const t = Math.min(1, Math.max(0, value / max));
  const deg = -90 + t * 180;
  return (
    <svg className="gauge" viewBox="0 0 100 58" aria-hidden="true" focusable="false">
      <path className="g-track" d={arc(0, 1)} />
      {zones.map(([z, a, b]) => <path key={z} className={`g-zone ${z}`} d={arc(a + 0.008, b - 0.008)} />)}
      <g className="g-needle" style={{ transform: `rotate(${deg}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
        <path d={`M${CX - 2.4} ${CY} L${CX} ${CY - R + 6} L${CX + 2.4} ${CY} Z`} />
      </g>
      <circle className="g-hub" cx={CX} cy={CY} r="4.6" />
    </svg>
  );
}

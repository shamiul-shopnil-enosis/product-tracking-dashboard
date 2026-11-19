import { formatValue, type Alerts } from '@/lib/dashboard';
import { Delta } from './Delta';

/** The metrics that moved more than the chosen threshold, or why none can be judged. */
export function AlertsCard({ alerts }: { alerts: Alerts }) {
  return (
    <section className="card flush" aria-label="Needs attention">
      <h2>Needs attention</h2>
      <p className="sub">Moved {alerts.threshold}% or more against the previous period</p>
      {alerts.suppressed ? (
        <p className="muted">{alerts.suppressed}</p>
      ) : alerts.items.length === 0 ? (
        <p className="muted">Nothing moved that much. Rates with very few sessions are not flagged.</p>
      ) : (
        alerts.items.map((a) => (
          <div className="alert" key={a.key}>
            <b>{a.label}</b>
            <Delta change={a.change} trend={a.trend} />
            <small>{formatValue(a.previous, a.unit)} before, {formatValue(a.value, a.unit)} now</small>
          </div>
        ))
      )}
    </section>
  );
}

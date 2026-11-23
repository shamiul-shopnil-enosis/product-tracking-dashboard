import { formatValue, type Alerts } from '@/lib/dashboard';
import { Delta } from './Delta';
import { Tip } from './Tip';

/** Things that got worse come first, the biggest drops on top; improvements follow, the biggest gains first. */
function sortWorstFirst(items: Alerts['items']): Alerts['items'] {
  const rank = (t: string) => (t === 'worse' ? 0 : t === 'better' ? 2 : 1);
  return [...items].sort((a, b) => rank(a.trend) - rank(b.trend) || Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
}

/** The metrics that moved more than the chosen threshold, or why none can be judged. */
export function AlertsCard({ alerts }: { alerts: Alerts }) {
  return (
    <section className="card flush" aria-label="Needs attention">
      <h2>Needs attention <Tip label="Needs attention">Moved {alerts.threshold}% or more against the comparison period. Things that got worse are listed first.</Tip></h2>
      {alerts.suppressed ? (
        <p className="muted">{alerts.suppressed}</p>
      ) : alerts.items.length === 0 ? (
        <p className="muted">Nothing moved that much. Rates with very few sessions are not flagged.</p>
      ) : (
        <div className="alert-list" tabIndex={0} aria-label="Metrics that moved a lot, worst first">
          {sortWorstFirst(alerts.items).map((a) => (
            <div className="alert" key={a.key}>
              <b>{a.label}</b>
              <Delta change={a.change} trend={a.trend} />
              <small>{formatValue(a.previous, a.unit)} before, {formatValue(a.value, a.unit)} now</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

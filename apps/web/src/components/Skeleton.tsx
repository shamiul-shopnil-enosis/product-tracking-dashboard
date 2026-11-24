export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

/** A grey card with the same parts as a real one (name, number, change and trend), so nothing jumps when data arrives. */
export function TileSkeleton() {
  return (
    <div className="tile skeleton-tile" aria-hidden="true">
      <div className="tile-top"><span className="tile-label"><Skeleton height={24} width={24} /><Skeleton height={14} width="55%" /></span></div>
      <div className="tile-value"><Skeleton height={30} width="45%" /></div>
      <div className="tile-bottom"><Skeleton height={14} width="38%" /><Skeleton height={22} width={60} /></div>
      <div className="prev"><Skeleton height={12} width="30%" /></div>
    </div>
  );
}

/**
 * Placeholder while a page loads, shaped like the page it stands for.
 * `cards` is a title, a summary and a grid of cards; `table` is a title, a short intro and rows.
 */
export function PageSkeleton({ variant = 'cards' }: { variant?: 'cards' | 'table' }) {
  return (
    <div role="status" aria-label="Loading" className="page-skeleton">
      {variant === 'cards' ? (
        <>
          <div className="card headcard"><Skeleton height={14} width={180} /><div style={{ height: 14 }} /><Skeleton height={26} width="62%" /></div>
          <div className="tiles" style={{ marginTop: 16 }}>{Array.from({ length: 6 }, (_, i) => <TileSkeleton key={i} />)}</div>
          <div className="chart"><Skeleton height={14} width={200} /><div style={{ height: 14 }} /><Skeleton height={200} /></div>
        </>
      ) : (
        <>
          <div className="card"><Skeleton height={14} width={220} /><div style={{ height: 10 }} /><Skeleton height={16} width="70%" /></div>
          <div className="chart" style={{ marginTop: 16 }}><Skeleton height={160} /></div>
          <div className="card" style={{ marginTop: 16 }}>
            {Array.from({ length: 7 }, (_, i) => <div key={i} style={{ display: 'flex', gap: 16, padding: '10px 0' }}><Skeleton height={16} width="38%" /><Skeleton height={16} width="12%" /><Skeleton height={16} width="12%" /><Skeleton height={16} width="12%" /></div>)}
          </div>
        </>
      )}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

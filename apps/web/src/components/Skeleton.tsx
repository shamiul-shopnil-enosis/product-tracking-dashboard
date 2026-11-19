export function Skeleton({ height = 20, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

/** Placeholder while a page loads, shaped like the page so nothing jumps. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="card headcard"><Skeleton height={16} width={240} /><div style={{ height: 12 }} /><Skeleton height={26} width="70%" /></div>
      <div className="tiles" style={{ marginTop: 16 }}>
        {Array.from({ length: 6 }, (_, i) => <div className="tile" key={i}><Skeleton height={14} width="60%" /><Skeleton height={28} width="40%" /><Skeleton height={14} width="50%" /></div>)}
      </div>
      <div className="chart"><Skeleton height={220} /></div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

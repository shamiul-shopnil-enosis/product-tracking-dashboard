import Link from 'next/link';

/** Open findings for a page, and a shortcut to log a new one. */
export function FindingLinks({ url, open }: { url: string; open: number }) {
  const q = encodeURIComponent(url);
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {open > 0 && <><Link href={`/findings?pageUrl=${q}`}>{open} open</Link>{' · '}</>}
      <Link href={`/findings/new?pageUrl=${q}`}>Add</Link>
    </span>
  );
}

'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { filterQuery } from '@/lib/filters';
import { Icon, type IconName } from './Icon';

/** Links from a source page to its detail pages, keeping the chosen dates. */
export function HubLinks({ links }: { links: { href: string; label: string; text: string; icon: IconName }[] }) {
  const sp = useSearchParams();
  const keep = filterQuery(new URLSearchParams(sp.toString()));
  return (
    <div className="hub-links">
      {links.map((l) => (
        <Link key={l.href} href={l.href + keep} className="hub-link">
          <span className="tile-ico"><Icon name={l.icon} size={16} /></span>
          <span><b>{l.label}</b><small>{l.text}</small></span>
        </Link>
      ))}
    </div>
  );
}

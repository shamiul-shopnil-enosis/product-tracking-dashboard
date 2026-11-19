'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

type Summary = { new: number; planned: number; open: number; shipped: number; shippedLast30Days: number };

export function FindingsSummary() {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>('/findings/summary').then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  return (
    <div className="kv" style={{ marginTop: 8 }}>
      <span>Open</span><span className="num"><Link href="/findings">{s.open}</Link> ({s.new} new, {s.planned} planned)</span>
      <span>Shipped, last 30 days</span><span className="num">{s.shippedLast30Days}</span>
    </div>
  );
}

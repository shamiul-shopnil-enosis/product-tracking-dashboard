'use client';

import { useEffect, useState } from 'react';
import { onActivity } from '@/lib/api';

/** A thin bar at the top of the window while data is loading. It waits a moment first, so quick loads do not flash it. */
export function TopProgress() {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onActivity((count) => {
      clearTimeout(timer);
      if (count > 0) timer = setTimeout(() => setBusy(true), 140);
      else setBusy(false);
    });
    return () => { off(); clearTimeout(timer); };
  }, []);
  return <div className="topbar" data-active={busy} aria-hidden="true"><i /></div>;
}

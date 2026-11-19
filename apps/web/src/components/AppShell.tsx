'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { Sidebar } from './Sidebar';

// Analytics pages bring their own filter bar and padded body; every other page gets the padded body here.
const SELF_LAID_OUT = ['/', '/traffic', '/pages', '/friction'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  if (pathname === '/login') return <>{children}</>;
  if (loading || !user) return <div className="page"><p className="muted" role="status">Loading…</p></div>;
  return (
    <div className="shell">
      <Suspense fallback={<aside className="sidebar" aria-hidden="true" />}><Sidebar /></Suspense>
      <main className="main-col">
        <Suspense fallback={<div className="page"><p className="muted" role="status">Loading…</p></div>}>
          {SELF_LAID_OUT.includes(pathname) ? children : <div className="page">{children}</div>}
        </Suspense>
      </main>
    </div>
  );
}

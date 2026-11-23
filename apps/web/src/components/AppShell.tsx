'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { Sidebar } from './Sidebar';
import { isPublicPath } from '@/lib/publicPaths';
import { LayoutProvider } from '@/lib/layout';

// Analytics pages bring their own filter bar and padded body; every other page gets the padded body here.
const SELF_LAID_OUT = ['/', '/traffic', '/pages', '/friction', '/ga4', '/clarity'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  if (isPublicPath(pathname)) return <>{children}</>;
  if (loading || !user) return <div className="page"><p className="muted" role="status">Loading…</p></div>;
  return (
    <LayoutProvider>
    <div className="shell">
      <Suspense fallback={<aside className="sidebar" aria-hidden="true" />}><Sidebar /></Suspense>
      <main className="main-col">
        <Suspense fallback={<div className="page"><p className="muted" role="status">Loading…</p></div>}>
          {SELF_LAID_OUT.includes(pathname) ? children : <div className="page">{children}</div>}
        </Suspense>
      </main>
    </div>
    </LayoutProvider>
  );
}

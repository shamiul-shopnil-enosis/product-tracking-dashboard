'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { filterQuery } from '@/lib/filters';
import { useTheme } from '@/lib/theme';
import { useApiData } from '@/lib/useApi';
import { Icon, type IconName } from './Icon';

type Status = {
  clarity: { configured: boolean; lastRunAt: string | null; lastRunStatus: string | null; daysOfData: number; lastDay: string | null };
  ga4: { configured: boolean; lastRunAt: string | null; lastRunStatus: string | null; daysOfData: number };
};
type Summary = { open: number };

const ago = (iso: string | null) => {
  if (!iso) return 'never synced';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return h < 1 ? 'synced just now' : h < 36 ? `synced ${Math.round(h)} h ago` : `synced ${Math.round(h / 24)} days ago`;
};

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [theme, toggleTheme] = useTheme();
  const status = useApiData<Status>('/dashboard/status').data;
  const summary = useApiData<Summary>('/findings/summary').data;
  const keep = filterQuery(new URLSearchParams(sp.toString()));
  const current = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const Item = ({ href, label, count, filters, icon }: { href: string; label: string; count?: string; filters?: boolean; icon: IconName }) => (
    <Link href={filters ? href + keep : href} aria-current={current(href) ? 'page' : undefined}>
      <span className="navitem"><Icon name={icon} size={16} />{label}</span>{count && <span className="count">{count}</span>}
    </Link>
  );

  const c = status?.clarity;
  const g = status?.ga4;
  const fresh = c?.lastRunAt && Date.now() - new Date(c.lastRunAt).getTime() < 36 * 3600000 && c.lastRunStatus !== 'failed';
  return (
    <aside className="sidebar" aria-label="Sidebar">
      <Link href="/" className="brand"><span className="logo" aria-hidden="true" />Product Analytics</Link>
      <nav aria-label="Main">
        <div className="navlabel">Analytics</div>
        <Item href="/" label="Overview" icon="overview" filters />
        <Item href="/traffic" label="Traffic" icon="traffic" filters />
        <Item href="/pages" label="Pages" icon="pages" filters />
        <Item href="/friction" label="Friction" icon="friction" filters />
        <div className="navlabel">Work</div>
        <Item href="/findings" label="Findings" icon="findings" count={summary ? `${summary.open} open` : undefined} />
        <div className="navlabel">Help</div>
        <Item href="/help" label="How to read this" icon="help" />
        {user?.role === 'admin' && (
          <>
            <div className="navlabel">Admin</div>
            <Item href="/admin/data" label="Data sources" icon="database" />
            <Item href="/admin/users" label="Users" icon="users" />
          </>
        )}
      </nav>
      <div className="sidebar-foot">
        <div className="src"><i className="dot" style={{ background: fresh ? 'var(--good)' : 'var(--warn)' }} />Clarity · {c ? ago(c.lastRunAt) : '…'}</div>
        <div className="src">
          <i className="dot" style={{ background: !g?.configured ? 'var(--ink-3)' : g.lastRunStatus === 'failed' ? 'var(--bad)' : 'var(--good)' }} />
          GA4 · {!g ? '…' : !g.configured ? 'not connected' : ago(g.lastRunAt)}
        </div>
        <div className="who">
          <span>{user?.name} <span className="muted">({user?.role})</span></span>
          <span className="row">
            <button onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />{theme === 'dark' ? 'Light' : 'Dark'}</button>
            <button onClick={logout}><Icon name="logout" size={14} />Sign out</button>
          </span>
        </div>
      </div>
    </aside>
  );
}


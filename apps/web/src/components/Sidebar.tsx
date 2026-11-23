'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { filterQuery } from '@/lib/filters';
import { useTheme } from '@/lib/theme';
import { useApiData } from '@/lib/useApi';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';

type Status = {
  clarity: { configured: boolean; lastRunAt: string | null; lastRunStatus: string | null; daysOfData: number; lastDay: string | null };
  ga4: { configured: boolean; lastRunAt: string | null; lastRunStatus: string | null; daysOfData: number };
  pagespeed?: { configured: boolean; lastRunAt: string | null; lastRunStatus: string | null; daysOfData: number; pages: number };
};
type Summary = { open: number };

const ago = (iso: string | null) => {
  if (!iso) return 'never synced';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  return h < 1 ? 'synced just now' : h < 36 ? `synced ${Math.round(h)} h ago` : `synced ${Math.round(h / 24)} days ago`;
};

const SOURCE_GROUPS: { id: string; href: string; label: string; icon: IconName; children: { href: string; label: string }[] }[] = [
  { id: 'ga4', href: '/ga4', label: 'Google Analytics', icon: 'traffic', children: [{ href: '/traffic', label: 'Traffic' }, { href: '/pages', label: 'Pages' }, { href: '/seo', label: 'SEO' }, { href: '/audience', label: 'Audience' }] },
  { id: 'clarity', href: '/clarity', label: 'Clarity', icon: 'visitors', children: [{ href: '/friction', label: 'Friction' }] },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [theme, toggleTheme] = useTheme();
  const status = useApiData<Status>('/dashboard/status').data;
  const summary = useApiData<Summary>('/findings/summary').data;
  const keep = filterQuery(new URLSearchParams(sp.toString()));
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const current = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const Item = ({ href, label, count, filters, icon }: { href: string; label: string; count?: string; filters?: boolean; icon: IconName }) => (
    <Link href={filters ? href + keep : href} aria-current={current(href) ? 'page' : undefined}>
      <span className="navitem"><Icon name={icon} size={16} />{label}</span>{count && <span className="count">{count}</span>}
    </Link>
  );

  const c = status?.clarity;
  const g = status?.ga4;
  const p = status?.pagespeed;
  const fresh = c?.lastRunAt && Date.now() - new Date(c.lastRunAt).getTime() < 36 * 3600000 && c.lastRunStatus !== 'failed';
  return (
    <aside className="sidebar" aria-label="Sidebar">
      <Link href="/" className="brand" aria-label="Product Analytics, home"><Logo width={124} /><span className="brand-name">Product Analytics</span></Link>
      <nav aria-label="Main">
        <div className="navlabel">Analytics</div>
        <Item href="/" label="Overview" icon="overview" filters />
        <div className="navlabel">Sources</div>
        {SOURCE_GROUPS.map((g) => {
          const inside = current(g.href) || g.children.some((c) => current(c.href));
          const open = toggled[g.id] ?? inside;
          return (
            <div className="navgroup" key={g.id}>
              <div className="navgroup-head">
                <Link href={g.href + keep} aria-current={pathname === g.href ? 'page' : undefined} onClick={() => setToggled((t) => ({ ...t, [g.id]: true }))}>
                  <span className="navitem"><Icon name={g.icon} size={16} />{g.label}</span>
                </Link>
                <button type="button" className="navtoggle" aria-expanded={open} aria-controls={`sub-${g.id}`} aria-label={`${open ? 'Hide' : 'Show'} ${g.label} pages`} onClick={() => setToggled((t) => ({ ...t, [g.id]: !open }))}>
                  <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
                </button>
              </div>
              {open && (
                <div className="subnav" id={`sub-${g.id}`}>
                  {g.children.map((c) => (
                    <Link key={c.href} href={c.href + keep} aria-current={current(c.href) ? 'page' : undefined}><span className="navitem">{c.label}</span></Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <Item href="/speed" label="Core Web Vitals" icon="speed" />
        <div className="navlabel">Work</div>
        <Item href="/findings" label="Findings" icon="findings" count={summary ? `${summary.open} open` : undefined} />
        <div className="navlabel">Help</div>
        <Item href="/help" label="How to read this" icon="help" />
        <Item href="/account" label="Account" icon="account" />
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
        {p?.configured && (
          <div className="src">
            <i className="dot" style={{ background: p.lastRunStatus === 'failed' ? 'var(--bad)' : p.lastRunAt ? 'var(--good)' : 'var(--ink-3)' }} />
            PageSpeed · {p.pages === 0 ? 'no pages yet' : ago(p.lastRunAt)}
          </div>
        )}
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


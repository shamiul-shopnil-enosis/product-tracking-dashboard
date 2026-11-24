'use client';

import { Icon } from './Icon';
import { useEffect } from 'react';
import Link from 'next/link';
import { formatChange, formatValue, type KeyEventsResponse, type Overview, type PagesResponse, type SeoResponse } from '@/lib/dashboard';
import { BAND_LABEL, type FindingList } from '@/lib/findings';
import { useApiData } from '@/lib/useApi';
import { Tip } from './Tip';
import { Tile } from './Tile';
import { PinButton } from './PinButton';
import { SourceIcon } from './SourceIcon';

const label = (url: string) => { try { const u = new URL(url); return u.pathname === '/' ? u.host : u.pathname; } catch { return url; } };
const Empty = ({ children }: { children: string }) => <p className="muted" style={{ margin: 0 }}>{children}</p>;

/** How many times each important action (key event) happened, biggest first. */
export function KeyEventsBlock({ qs }: { qs: string }) {
  const { data } = useApiData<KeyEventsResponse>(`/dashboard/ga4-key-events?${qs}`);
  const top = data?.rows.slice(0, 5) ?? [];
  return (
    <section className="block" aria-label="Key events">
      <div className="block-head">
        <h2><span className="h-ico" style={{ color: 'var(--s4)' }}><Icon name="event" size={16} /></span>Key events <Tip label="Key events">Actions you marked as important in Google Analytics, such as signing up. The number is how many times each happened in this period; the arrow compares per-day counts with the period before.</Tip></h2>
      </div>
      {!data ? <Empty>Loading…</Empty> : top.length === 0 ? (
        <Empty>{data.connected ? 'No key events recorded in this range.' : 'Appears once Google Analytics has synced key events (the first sync after an update reads 90 days).'}</Empty>
      ) : (
        <ul className="mini">
          {top.map((r) => <li key={r.name}><span title={r.name}>{r.name}</span><span className="num">{formatValue(r.count, 'count')}</span><span className="muted">{formatChange(r.change)}</span></li>)}
        </ul>
      )}
    </section>
  );
}

/** The three pages with the most visits. */
export function TopPagesBlock({ qs }: { qs: string }) {
  const { data } = useApiData<PagesResponse>(`/dashboard/pages?${qs}&sort=sessions&minSessions=5`);
  const top = data?.pages.slice(0, 3) ?? [];
  return (
    <section className="block" aria-label="Top pages">
      <div className="block-head">
        <h2><span className="h-ico" style={{ color: 'var(--s3)' }}><Icon name="views" size={16} /></span>Top pages <Tip label="Top pages">The pages that most visits looked at in this period (real people only). The arrow compares with the period before.</Tip></h2>
        <Link href="/pages">See all</Link>
      </div>
      {!data ? <Empty>Loading…</Empty> : top.length === 0 ? <Empty>No page data in this range yet.</Empty> : (
        <ul className="mini">
          {top.map((p) => <li key={p.url}><span title={p.url}>{label(p.url)}</span><span className="num">{formatValue(p.humanSessions, 'count')}</span><span className="muted">{formatChange(p.change)}</span></li>)}
        </ul>
      )}
    </section>
  );
}

/** The three open findings with the highest priority. */
export function TopFindingsBlock() {
  const { data } = useApiData<FindingList>('/findings?sort=priority&limit=20');
  const open = data?.items.filter((f) => f.status === 'new' || f.status === 'planned').slice(0, 3) ?? [];
  return (
    <section className="block" aria-label="Top findings">
      <div className="block-head">
        <h2><span className="h-ico" style={{ color: 'var(--bad)' }}><Icon name="findings" size={16} /></span>Fix first <Tip label="Fix first">The three open findings with the highest priority. Priority is worked out from how bad the problem is, how many people it affects and how much work it takes to fix.</Tip></h2>
        <Link href="/findings">See all</Link>
      </div>
      {!data ? <Empty>Loading…</Empty> : open.length === 0 ? <Empty>No open findings.</Empty> : (
        <ul className="mini">
          {open.map((f) => <li key={f.id}><span title={f.title}><Link href={`/findings/${f.id}`}>F-{f.ref}</Link> {f.title}</span><span className="muted">{BAND_LABEL[f.priority.band]}</span><span /></li>)}
        </ul>
      )}
    </section>
  );
}

type Glance = { days: number; data: Overview | null };

/** Human sessions per day over the last 7, 14 and 30 days, side by side. */
export function GlanceBlock() {
  const seven = useApiData<Overview>('/dashboard/overview?days=7&traffic=human&threshold=20').data;
  const fourteen = useApiData<Overview>('/dashboard/overview?days=14&traffic=human&threshold=20').data;
  const thirty = useApiData<Overview>('/dashboard/overview?days=30&traffic=human&threshold=20').data;
  const cols: Glance[] = [{ days: 7, data: seven }, { days: 14, data: fourteen }, { days: 30, data: thirty }];
  const tile = (o: Overview | null, key: string) => o?.tiles.find((t) => t.key === key) ?? null;
  const rows: Array<[string, string, 'count' | 'percent']> = [['Human sessions per day', 'sessions', 'count'], ['Engagement rate (GA4)', 'ga4Engagement', 'percent']];
  return (
    <section className="block" aria-label="Last 7, 14 and 30 days">
      <div className="block-head">
        <h2><span className="h-ico" style={{ color: 'var(--s1)' }}><Icon name="time" size={16} /></span>7, 14 and 30 days <Tip label="7, 14 and 30 days">The same numbers over three time spans. If the short span is better than the long one, things are improving lately. Each arrow compares that span with the span of the same length just before it.</Tip></h2>
      </div>
      <table className="glance">
        <thead><tr><th />{cols.map((c) => <th key={c.days} className="num">{c.days} days</th>)}</tr></thead>
        <tbody>
          {rows.map(([name, key, unit]) => (
            <tr key={key}>
              <td>{name}</td>
              {cols.map((c) => { const t = tile(c.data, key); return <td key={c.days} className="num">{t ? <>{formatValue(t.value, unit)} <span className="muted">{formatChange(t.change)}</span></> : '–'}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type Realtime = { available: true; activeUsers: number; windowMinutes: number; asOf: string } | { available: false; reason: string };

/** People on the site right now (GA4 counts the last 30 minutes). Refreshes every minute while the page is open; hides itself if GA4 cannot answer. */
export function LiveTile() {
  const { data, reload } = useApiData<Realtime>('/dashboard/ga4-realtime');
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') reload(); }, 60_000);
    return () => clearInterval(id);
  }, [reload]);
  if (!data || !data.available) return null;
  return (
    <div className="tile live" aria-label="Active users right now">
      <div className="tile-top">
        <span className="tile-label"><span className="tile-ico"><Icon name="live" size={15} /></span><span className="tile-name">Active right now<SourceIcon source="ga4" /></span></span>
        <span className="tile-tools"><PinButton cardKey="live" label="Active right now" /><Tip label="Active right now">People using the site in the last {data.windowMinutes} minutes, according to Google Analytics. Updates every minute. It includes automated visitors GA4 does not recognise.</Tip></span>
      </div>
      <div className="tile-value"><i className="dot pulse" aria-hidden /> {formatValue(data.activeUsers, 'count')}</div>
      <div className="tile-bottom" aria-hidden="true" />
      <div className="prev">last {data.windowMinutes} minutes</div>
    </div>
  );
}

/** The search tiles for the Overview: organic sessions per day, organic share of traffic and new organic users. */
export function SeoTiles({ qs, only }: { qs: string; /** Show just these tiles */ only?: string[] }) {
  const { data } = useApiData<SeoResponse>(`/dashboard/seo?${qs}`);
  if (!data || !data.connected) return null;
  return (
    <>
      {data.tiles.filter((t) => (only ?? ['orgSessions', 'orgShare', 'orgNew']).includes(t.key)).map((t) => (
        <Tile key={t.key} tile={t} color="var(--s3)" spark={t.key === 'orgSessions' ? data.series.map((p) => p.organicSessions) : undefined} />
      ))}
    </>
  );
}

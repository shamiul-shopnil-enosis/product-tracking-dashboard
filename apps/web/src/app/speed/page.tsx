'use client';

import { useEffect, useMemo, useState } from 'react';
import { Delta } from '@/components/Delta';
import { Hint } from '@/components/Hint';
import { Icon } from '@/components/Icon';
import { VitalGauge } from '@/components/VitalGauge';
import { PageHead } from '@/components/PageHead';
import { Tip } from '@/components/Tip';
import { TrendChart } from '@/components/TrendChart';
import { TestPageModal } from '@/components/TestPageModal';
import { useAuth } from '@/components/AuthProvider';
import { api, ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/date';
import { useApiData } from '@/lib/useApi';
import {
  addDays, ALL_METRICS, clock12, FIELD_METRICS, FOCUS_CHIPS, formatMetric, GRADE_TEXT, LAB_METRICS, pctChange, todayBd,
  type Audit, type Grade, type MetricDef, type MetricKey, type SpeedJob, type SpeedPoint, type SpeedSummary, type SpeedTargets, type Strategy,
} from '@/lib/speed';

const GRADE_MARK: Record<Grade, string> = { good: '✓', 'needs-improvement': '!', poor: '✕' };
const TRIGGER_TEXT: Record<string, string> = { scheduled: 'daily check', added: 'first check', manual: 'manual test' };

function GradeChip({ grade }: { grade: Grade | null }) {
  if (!grade) return <span className="grade none">No data</span>;
  return <span className={`grade ${grade}`}><i aria-hidden="true">{GRADE_MARK[grade]}</i>{GRADE_TEXT[grade]}</span>;
}

/** Share of real visits that were good, needing work and poor, as a bar. */
function Bands({ dist }: { dist?: [number, number, number] | null }) {
  if (!dist) return null;
  const pct = dist.map((d) => Math.round(d * 100));
  return (
    <span className="bands" role="img" aria-label={`${pct[0]}% of visits good, ${pct[1]}% needed work, ${pct[2]}% poor`}>
      <i className="good" style={{ flex: dist[0] }} /><i className="needs-improvement" style={{ flex: dist[1] }} /><i className="poor" style={{ flex: dist[2] }} />
    </span>
  );
}

function Vital({ def, point, compare, compareDay, selected, onSelect }: {
  def: MetricDef; point: SpeedPoint; compare: SpeedPoint | null; compareDay: string; selected: boolean; onSelect: () => void;
}) {
  const now = def.read(point);
  const before = compare ? def.read(compare) : null;
  const change = pctChange(now, before);
  const grade = def.grade(point);
  // Real-user figures cover 28 days, so a day-to-day change is tiny: shown plainly, never as good or bad news.
  // A test run swings more, and for every metric except the score, lower is better.
  const trend = def.kind === 'field' || change === null ? (change === null ? 'unknown' : 'flat')
    : Math.abs(change) < 2 ? 'flat' : (def.unit === 'score' ? change > 0 : change < 0) ? 'better' : 'worse';
  const band = def.kind === 'field' ? point.field?.[def.key.slice(2) as 'lcp']?.dist : null;
  return (
    <div className={`tile clickable vital${selected ? ' selected' : ''}${now !== null && grade ? ` g-${grade}` : ''}`}>
      <span className="tile-top">
        <button type="button" className="vital-pick" aria-pressed={selected} onClick={onSelect}>{def.short}</button>
        <Tip label={def.label}>{def.help}</Tip>
      </span>
      <span className="tile-value">{formatMetric(now, def.unit)}</span>
      <VitalGauge metric={def.key} value={now} />
      <GradeChip grade={now === null ? null : grade} />
      <Bands dist={band} />
      {compare && before !== null && (
        <span className="prev">
          vs {fmtDate(compareDay)}: {formatMetric(before, def.unit)} {change !== null && <Delta change={change} trend={trend} wordless={def.kind === 'field'} />}
        </span>
      )}
    </div>
  );
}

function AuditRow({ a }: { a: Audit }) {
  const save = a.savingsMs ? `Save ${a.savingsMs >= 1000 ? `${(a.savingsMs / 1000).toFixed(1)} s` : `${Math.round(a.savingsMs)} ms`}` : a.savingsBytes ? `Save ${Math.round(a.savingsBytes / 1024)} KiB` : null;
  return (
    <details className="audit">
      <summary>
        <span className="audit-title">{a.title}</span>
        {a.displayValue && <span className="muted audit-val">{a.displayValue}</span>}
        {save && <span className="pill save">{save}</span>}
        {a.metrics.length > 0 && <span className="audit-metrics">{a.metrics.join(' · ')}</span>}
      </summary>
      <div className="audit-body">
        <p>{a.description}</p>
        {a.items.length > 0 && (
          <ul className="audit-items">
            {a.items.map((it, i) => <li key={i}><code>{it.label}</code>{it.value && <span className="muted"> {it.value}</span>}</li>)}
          </ul>
        )}
      </div>
    </details>
  );
}

export default function SpeedPage() {
  const { user } = useAuth();
  const canRun = user?.role === 'editor' || user?.role === 'admin';
  const isAdmin = user?.role === 'admin';

  const targets = useApiData<SpeedTargets>('/speed/targets');
  const dailyTime = targets.data?.dailyTime ?? '12:00';
  const [timeDraft, setTimeDraft] = useState('');
  const [url, setUrl] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('mobile');
  const [range, setRange] = useState<'7' | '30' | '90' | 'custom'>('30');
  const [from, setFrom] = useState(addDays(todayBd(), -29));
  const [to, setTo] = useState(todayBd());
  const [cmp, setCmp] = useState<'yesterday' | 'week' | 'date'>('yesterday');
  const [cmpDate, setCmpDate] = useState(addDays(todayBd(), -1));
  const [metric, setMetric] = useState<MetricKey>('f_lcp');
  const [focus, setFocus] = useState<(typeof FOCUS_CHIPS)[number]['key']>('ALL');

  useEffect(() => { setTimeDraft(dailyTime); }, [dailyTime]);

  useEffect(() => {
    if (!url && targets.data?.targets[0]) setUrl(targets.data.targets[0].url);
  }, [targets.data, url]);

  const span = range === 'custom' ? { from, to } : { from: addDays(todayBd(), -(Number(range) - 1)), to: todayBd() };
  const compareParam = cmp === 'date' ? cmpDate : cmp === 'week' ? addDays(todayBd(), -7) : '';
  const path = url ? `/speed/summary?url=${encodeURIComponent(url)}&strategy=${strategy}&from=${span.from}&to=${span.to}${compareParam ? `&compare=${compareParam}` : ''}` : null;
  const summary = useApiData<SpeedSummary>(path);
  const s = summary.data && summary.data.url === url ? summary.data : null;
  const latest = s?.latest ?? null;

  // A page with too little real-user traffic has no field data: open on the test-run score instead.
  useEffect(() => {
    if (latest && latest.field?.scope === 'none' && metric.startsWith('f_')) setMetric('l_score');
  }, [latest, metric]);

  // ---- test a page now ----
  const [testUrl, setTestUrl] = useState('');
  const [testOpen, setTestOpen] = useState(false);
  const [job, setJob] = useState<SpeedJob | null>(null);
  const [jobStart, setJobStart] = useState<number | null>(null);
  const [runError, setRunError] = useState('');
  const [bannerHidden, setBannerHidden] = useState(false);
  const running = job !== null && (job.status === 'queued' || job.status === 'running');

  function openTest() {
    if (!job && !testUrl) setTestUrl(url);
    setTestOpen(true);
  }

  async function runNow() {
    setRunError('');
    const target = testUrl.trim();
    try {
      const { jobId } = await api<{ jobId: string }>('/speed/run', { method: 'POST', body: { url: target, strategy: 'both' } });
      setJob({ id: jobId, url: target, strategies: ['mobile', 'desktop'], status: 'queued', results: [], error: null });
      setJobStart(Date.now());
      setBannerHidden(false);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Could not start the test');
    }
  }

  useEffect(() => {
    if (!job || !running) return;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      try {
        const j = await api<SpeedJob>(`/speed/jobs/${job.id}`);
        setJob(j);
        if (j.status === 'done' || j.status === 'failed') {
          clearInterval(t);
          if (j.status === 'done') { summary.reload(); targets.reload(); }
        }
      } catch { /* keep trying */ }
      if (n > 100) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, running]);

  // ---- admin: the daily list ----
  const [addUrl, setAddUrl] = useState('');
  const [addLabel, setAddLabel] = useState('');
  const [adminMsg, setAdminMsg] = useState('');
  async function admin(fn: () => Promise<unknown>, ok: string) {
    setAdminMsg('');
    try { await fn(); setAdminMsg(ok); targets.reload(); } catch (err) { setAdminMsg(err instanceof ApiError ? err.message : 'Request failed'); }
  }

  // ---- derived ----
  const def = ALL_METRICS.find((m) => m.key === metric)!;
  const chart = useMemo(() => {
    const scale = def.unit === 'ms' ? 1000 : 1;
    return (s?.series ?? []).map((p) => { const v = def.read(p); return { date: p.day, v: v === null ? null : v / scale }; });
  }, [s, def]);
  const unit = def.unit === 'ms' ? 'seconds' : def.unit === 'cls' ? 'ratio' : 'count';
  const verdictDays = s?.series ?? [];
  const verdict = latest?.verdict ?? 'none';
  const shown = (s?.audits ?? []).filter((a) => focus === 'ALL' || a.metrics.includes(focus));
  const canFilter = (s?.audits ?? []).some((a) => a.metrics.length > 0);

  const pickMetric = (d: MetricDef) => { setMetric(d.key); if (d.focus && d.focus !== 'SI') setFocus(d.focus as typeof focus); else if (d.kind === 'lab') setFocus('ALL'); };

  return (
    <>
      <PageHead title="Core Web Vitals" more={<>Core Web Vitals are Google’s three measures of how fast and steady a page feels. Google uses them in search ranking. This page keeps one reading per day, so you can see how they change and compare any two days.</>}>
        How fast the site loads, checked every day at {clock12(dailyTime)} Bangladesh time and kept for comparison.
      </PageHead>
      <Hint>Data comes from Google PageSpeed Insights, the same numbers as pagespeed.web.dev. Google does not keep history, so this dashboard saves each day’s result. History starts from the first day a page was checked. Days are Bangladesh days.</Hint>

      {canRun && (
        <div className="speed-actions">
          <button type="button" className="primary" onClick={openTest} disabled={running}><Icon name="speed" size={14} />{running ? 'Testing…' : 'Test a page'}</button>
          <span className="muted">Check any public page now, on mobile and desktop.</span>
        </div>
      )}
      {job && !testOpen && !bannerHidden && (
        running ? (
          <div className="notice speed-banner" role="status"><span className="spinner small" aria-hidden="true" />
            <span>Testing <b>{job.url}</b>. About a minute. You can keep using the page.</span>
            <button type="button" onClick={() => setTestOpen(true)}>Show progress</button></div>
        ) : job.status === 'done' ? (
          <div className="notice speed-banner ok" role="status"><Icon name="check" size={16} />
            <span>The test of <b>{job.url}</b> is done.</span>
            <button type="button" className="primary" onClick={() => setTestOpen(true)}>See the result</button>
            <button type="button" className="orange-close" aria-label="Dismiss" onClick={() => setBannerHidden(true)}><Icon name="close" size={16} /></button></div>
        ) : (
          <div className="notice bad speed-banner" role="alert"><Icon name="error" size={16} />
            <span>The test of <b>{job.url}</b> failed: {job.error ?? job.results.find((r) => r.error)?.error ?? 'unknown reason'}</span>
            <button type="button" onClick={() => setTestOpen(true)}>Details</button>
            <button type="button" className="orange-close" aria-label="Dismiss" onClick={() => setBannerHidden(true)}><Icon name="close" size={16} /></button></div>
        )
      )}
      <TestPageModal
        open={testOpen} onClose={() => setTestOpen(false)}
        url={testUrl} onUrl={setTestUrl} suggestions={targets.data?.targets.map((t) => t.url) ?? []}
        canStart={!!testUrl.trim() && !!targets.data?.configured && !running} notConfigured={!!targets.data && !targets.data.configured}
        job={job} running={running} startedAt={jobStart} error={runError}
        onRun={runNow}
        onNew={() => { setJob(null); setRunError(''); setTestUrl(''); }}
        onOpenInPage={(u) => { setUrl(u); setTestOpen(false); }}
      />

      {targets.data && !targets.data.configured && (
        <p className="notice" role="status">
          <b>Speed data is not connected yet.</b> {isAdmin ? <>Add a free PageSpeed API key as <code>PAGESPEED_API_KEY</code> in <code>.env</code> and restart (see the runbook).</> : 'Ask an admin to connect it.'}
        </p>
      )}

      {/* ---- what to look at ---- */}
      <div className="card speed-controls">
        <label className="field"><span>Page</span>
          <select value={url} onChange={(e) => setUrl(e.target.value)} disabled={!targets.data}>
            {targets.data?.targets.map((t) => <option key={t.id} value={t.url}>{t.label ? `${t.label}: ` : ''}{t.url}</option>)}
            {url && !targets.data?.targets.some((t) => t.url === url) && <option value={url}>{url} (tested manually)</option>}
          </select>
        </label>
        <div className="field"><span>Device</span>
          <div className="seg" role="group" aria-label="Device">
            {(['mobile', 'desktop'] as const).map((d) => <button key={d} type="button" aria-pressed={strategy === d} onClick={() => setStrategy(d)}>{d === 'mobile' ? 'Mobile' : 'Desktop'}</button>)}
          </div>
        </div>
        <label className="field"><span>Chart range</span>
          <select value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Choose dates…</option>
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label className="field"><span>From</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field"><span>To</span><input type="date" value={to} min={from} max={todayBd()} onChange={(e) => setTo(e.target.value)} /></label>
          </>
        )}
        <label className="field"><span>Compare latest with</span>
          <select value={cmp} onChange={(e) => setCmp(e.target.value as typeof cmp)}>
            <option value="yesterday">The day before</option><option value="week">7 days ago</option><option value="date">A date I choose…</option>
          </select>
        </label>
        {cmp === 'date' && <label className="field"><span>Date</span><input type="date" value={cmpDate} max={todayBd()} onChange={(e) => setCmpDate(e.target.value)} /></label>}
      </div>

      {!targets.data?.targets.length && targets.data && (
        <div className="card empty"><b>No pages are checked every day yet</b>{isAdmin ? 'Add the first page under “Pages checked every day” below.' : 'An admin can add pages to check.'}</div>
      )}

      {s && !latest && (
        <div className="card empty">
          <b>No result for this page yet</b>
          {s.lastTry && !s.lastTry.ok ? <>The last test failed: {s.lastTry.error}</> : 'The first check runs a moment after the page is added, then every day at ' + clock12(dailyTime) + '.'}
        </div>
      )}

      {s && latest && (
        <>
          {/* ---- real users ---- */}
          <section className="card" aria-label="Core Web Vitals, real visitors">
            <div className="speed-head">
              <h2>Core Web Vitals <span className="muted">· real visitors</span> <Tip label="Core Web Vitals" side="left" wide>
                <span className="tp">What real Chrome users experienced on this page over the last 28 days, from Google’s public user data. It refreshes daily, so one day’s change is small by design.</span>
                <span className="tp">Passed means Largest Contentful Paint, Interaction to Next Paint and Layout Shift are all Good for at least 3 in 4 visits.</span>
              </Tip></h2>
              <span className={`verdict ${verdict}`}>
                {verdict === 'pass' ? '✓ Passed' : verdict === 'fail' ? '✕ Not passed' : 'Not enough real-user data'}
              </span>
            </div>
            <p className="muted speed-note">
              {latest.field?.scope === 'url' && 'Based on real visits to this page, last 28 days.'}
              {latest.field?.scope === 'origin' && 'This page has too little traffic for its own figures, so these are for the whole site, last 28 days.'}
              {latest.field?.scope === 'none' && 'Google has too few real visits to report on this page or the site. The test-run results below still work.'}
              {' '}Latest check: {fmtDateTime(latest.runAt)} ({TRIGGER_TEXT[latest.trigger] ?? latest.trigger}).
            </p>
            {!s.compare && <p className="muted speed-note">No check was stored for {fmtDate(s.compareDay)}, so there is nothing to compare with yet. Comparisons appear from the second day, or pick another date above.</p>}
            {latest.field?.scope !== 'none' && !latest.field?.inp && (
              <p className="muted speed-note">INP (how fast the page reacts to clicks) is not shown: Google has too few real visits to measure it. The test run’s TBT is the closest stand-in.</p>
            )}
            {latest.field?.scope !== 'none' && (
              <div className={`vitals n${FIELD_METRICS.filter((d) => d.read(latest) !== null).length}`}>
                {FIELD_METRICS.map((d) => (d.read(latest) === null ? null : (
                  <Vital key={d.key} def={d} point={latest} compare={s.compare} compareDay={s.compareDay} selected={metric === d.key} onSelect={() => pickMetric(d)} />
                )))}
              </div>
            )}
            {verdictDays.length > 0 && (
              <div className="daystrip" aria-label="Core Web Vitals result for each day">
                <p className="daystrip-title"><b>Result for each day</b> <span className="muted">Did the page pass Google’s Core Web Vitals check that day?</span></p>
                <ol>
                  {verdictDays.map((p) => {
                    const word = p.verdict === 'pass' ? 'Passed' : p.verdict === 'fail' ? 'Not passed' : 'No data';
                    return (
                      <li key={p.day} className={`d ${p.verdict}`} title={`${fmtDate(p.day)}: ${word}`}>
                        <span className="d-date">{fmtDate(p.day).slice(0, -5)}</span>
                        <i aria-hidden="true">{p.verdict === 'pass' ? '✓' : p.verdict === 'fail' ? '✕' : '–'}</i>
                        <span className="d-word">{word}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="legend muted"><span className="d-key pass">✓ Passed</span> all three vitals were Good · <span className="d-key fail">✕ Not passed</span> at least one was not · <span className="d-key none">– No data</span> Google had too few real visits</p>
              </div>
            )}
          </section>

          {/* ---- lab ---- */}
          <section className="card" aria-label="Lab test">
            <div className="speed-head">
              <h2>Test run <span className="muted">· Lighthouse</span> <Tip label="Test run" side="left" wide>
                <span className="tp">One fresh test of the page on a simulated {strategy === 'mobile' ? 'mid-range phone on a slower connection' : 'desktop computer'}. It shows what to fix, but scores move 5 to 10 points from run to run, so look at the trend, not one number.</span>
              </Tip></h2>
            </div>
            <div className="vitals n6">
              {LAB_METRICS.map((d) => <Vital key={d.key} def={d} point={latest} compare={s.compare} compareDay={s.compareDay} selected={metric === d.key} onSelect={() => pickMetric(d)} />)}
            </div>
          </section>

          {/* ---- trend ---- */}
          <TrendChart
            title={`${def.label}${def.kind === 'field' ? ' (real visitors)' : ' (test run)'}, per day`}
            hint={def.help}
            unit={unit}
            points={chart}
            series={[{ key: 'v', label: def.short, color: 'var(--s1)' }]}
            note={`One reading per day, never averaged. The daily check at ${clock12(dailyTime)} Bangladesh time stands for the day.`}
          />

          {/* ---- what to fix ---- */}
          <section className="card" aria-label="Recommendations">
            <div className="speed-head">
              <h2>Diagnose performance <Tip label="Diagnose performance" side="left" wide>
                <span className="tp">What the latest test found that could make the page faster. Only the most recent test is kept, not a history. Pick a metric to see only the fixes that help it.</span>
              </Tip></h2>
              {s.auditsRunAt && <span className="muted">From the test of {fmtDateTime(s.auditsRunAt)}</span>}
            </div>
            {canFilter && (
              <div className="chips" role="group" aria-label="Show fixes for">
                <span className="muted">Show fixes for</span>
                {FOCUS_CHIPS.map((c) => <button key={c.key} type="button" className="chip" aria-pressed={focus === c.key} onClick={() => setFocus(c.key)}>{c.label}</button>)}
              </div>
            )}
            {shown.length === 0
              ? <div className="empty"><b>{s.audits.length === 0 ? 'Nothing to fix' : 'Nothing to fix for this metric'}</b>The latest test did not find anything worth changing{focus !== 'ALL' ? ' for it' : ''}.</div>
              : <div className="audits">{shown.map((a) => <AuditRow key={a.id} a={a} />)}</div>}
          </section>
        </>
      )}

      {s?.lastTry && !s.lastTry.ok && latest && (
        <p className="notice" role="status">The latest attempt ({fmtDateTime(s.lastTry.runAt)}) failed: {s.lastTry.error} The figures above are from the last test that worked.</p>
      )}
      {!s && summary.error && <p className="error" role="alert">{summary.error}</p>}
      {!s && summary.loading && url && <p className="muted" role="status">Loading…</p>}

      {/* ---- admin: the daily list ---- */}
      {isAdmin && targets.data && (
        <section className="card" aria-label="Pages checked every day">
          <strong>Pages checked every day</strong>
          <p className="muted">Each page is tested on mobile and desktop once a day at {clock12(dailyTime)} Bangladesh time. Up to 20 pages. Removing a page stops new checks and keeps its history.</p>
          <form className="time-row" onSubmit={(e) => { e.preventDefault(); admin(async () => { await api('/speed/settings', { method: 'PUT', body: { dailyTime: timeDraft } }); }, `Saved. The daily check now runs at ${clock12(timeDraft)} Bangladesh time. It runs once a day, a few minutes after that time.`); }}>
            <label className="field"><span>Daily check time (Bangladesh time)</span>
              <input type="time" required value={timeDraft} onChange={(e) => setTimeDraft(e.target.value)} />
            </label>
            <button disabled={!timeDraft || timeDraft === dailyTime}>Save time</button>
          </form>
          {targets.data.targets.length > 0 && (
            <ul className="targets">
              {targets.data.targets.map((t) => (
                <li key={t.id}><span>{t.label && <b>{t.label} </b>}<code>{t.url}</code></span>
                  <button type="button" onClick={() => admin(() => api(`/speed/targets/${t.id}`, { method: 'DELETE' }), 'Page removed from the daily check.')}>Remove</button></li>
              ))}
            </ul>
          )}
          <form className="form-grid target-grid" onSubmit={(e) => { e.preventDefault(); admin(async () => { await api('/speed/targets', { method: 'POST', body: { url: addUrl, label: addLabel || undefined } }); setAddUrl(''); setAddLabel(''); }, 'Page added. Its first check is running now.'); }}>
            <label className="field"><span>Page address</span><input type="text" inputMode="url" required placeholder="https://example.com/" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} autoComplete="off" /></label>
            <label className="field"><span>Name (optional)</span><input type="text" maxLength={80} placeholder="Home page" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} autoComplete="off" /></label>
            <button className="primary">Add page</button>
          </form>
          <p className="row">
            <button type="button" disabled={!targets.data.configured} onClick={() => admin(() => api('/speed/run-all', { method: 'POST' }), 'The daily check is running in the background.')}>Run the daily check now</button>
          </p>
          {adminMsg && <p role="status" className="muted">{adminMsg}</p>}
        </section>
      )}
    </>
  );
}

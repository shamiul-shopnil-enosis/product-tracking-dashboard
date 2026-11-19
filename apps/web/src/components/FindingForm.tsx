'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  BANDS, BAND_LABEL, EFFORTS, REACHES, SEVERITIES, SEVERITY_LABEL, STATUSES, TYPES,
  previewPriority, type Band, type Finding,
} from '@/lib/findings';

type Props = { initial?: Finding; canEdit: boolean; onSaved?: (f: Finding) => void; prefill?: { pageUrl?: string; where?: string } };

export function FindingForm({ initial, canEdit, onSaved, prefill }: Props) {
  const router = useRouter();
  const [f, setF] = useState({
    title: initial?.title ?? '',
    type: initial?.type ?? 'usability',
    where: initial?.where ?? prefill?.where ?? '',
    pageUrl: initial?.pageUrl ?? prefill?.pageUrl ?? '',
    surface: initial?.surface ?? '',
    description: initial?.description ?? '',
    whyItMatters: initial?.whyItMatters ?? '',
    severity: initial?.severity ?? 2,
    reach: initial?.reach ?? 'some',
    effort: initial?.effort ?? 'M',
    suggestedChange: initial?.suggestedChange ?? '',
    firstMetric: initial?.firstMetric ?? '',
    status: initial?.status ?? 'new',
    plannedRelease: initial?.plannedRelease ?? '',
    ignoredReason: initial?.ignoredReason ?? '',
    githubUrl: initial?.githubUrl ?? '',
    evidenceLinks: initial?.evidenceLinks ?? [],
    resultDate: initial?.resultCheck?.date?.slice(0, 10) ?? '',
    resultBefore: initial?.resultCheck?.before ?? '',
    resultAfter: initial?.resultCheck?.after ?? '',
    overrideScore: initial?.priority.overrideScore != null ? String(initial.priority.overrideScore) : '',
    overrideBand: (initial?.priority.overrideBand ?? '') as Band | '',
    overrideReason: initial?.priority.overrideReason ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setSaved(false);
    setF((p) => ({ ...p, [k]: v }));
  };
  const computed = previewPriority(f.severity, f.reach, f.effort);
  const effBand = f.overrideBand || computed.band;
  const effScore = f.overrideScore !== '' ? Number(f.overrideScore) : computed.score;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      title: f.title, type: f.type, where: f.where, surface: f.surface, description: f.description,
      whyItMatters: f.whyItMatters, severity: f.severity, reach: f.reach, effort: f.effort,
      suggestedChange: f.suggestedChange, firstMetric: f.firstMetric, status: f.status,
      plannedRelease: f.status === 'planned' || f.plannedRelease ? f.plannedRelease : '',
      ignoredReason: f.ignoredReason,
      githubUrl: f.githubUrl,
      pageUrl: f.pageUrl,
      evidenceLinks: f.evidenceLinks.filter((l) => l.url.trim()),
      resultCheck: f.resultDate || f.resultBefore || f.resultAfter
        ? { date: f.resultDate || undefined, before: f.resultBefore, after: f.resultAfter }
        : undefined,
      overrideScore: f.overrideScore === '' ? null : Number(f.overrideScore),
      overrideBand: f.overrideBand || null,
      overrideReason: f.overrideReason,
    };
    try {
      if (initial) {
        const updated = await api<Finding>(`/findings/${initial.id}`, { method: 'PATCH', body });
        setSaved(true);
        onSaved?.(updated);
      } else {
        // githubUrl must be omitted (not empty) on create
        const { githubUrl, ...rest } = body;
        const created = await api<Finding>('/findings', {
          method: 'POST',
          body: githubUrl ? body : rest,
        });
        router.replace(`/findings/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const ro = !canEdit;
  return (
    <form onSubmit={submit}>
      <label htmlFor="title">Title</label>
      <input id="title" type="text" required maxLength={200} disabled={ro} value={f.title} onChange={(e) => set('title', e.target.value)} />

      <div className="row">
        <div>
          <label htmlFor="type">Type</label>
          <select id="type" disabled={ro} value={f.type} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label htmlFor="where">Where (screen or email, and role)</label>
          <input id="where" type="text" required disabled={ro} value={f.where} onChange={(e) => set('where', e.target.value)} />
        </div>
        <div>
          <label htmlFor="surface">Area (e.g. Milestone)</label>
          <input id="surface" type="text" disabled={ro} value={f.surface} onChange={(e) => set('surface', e.target.value)} />
        </div>
      </div>

      <label htmlFor="pageurl">Page this is about (full address, optional; shows on the Pages and Friction tables)</label>
      <input id="pageurl" type="text" placeholder="https://…" disabled={ro} value={f.pageUrl} onChange={(e) => set('pageUrl', e.target.value)} />

      <label htmlFor="description">What happens (with numbers or a recording link)</label>
      <textarea id="description" rows={4} disabled={ro} value={f.description} onChange={(e) => set('description', e.target.value)} />
      <label htmlFor="why">Why it matters (user impact)</label>
      <textarea id="why" rows={2} disabled={ro} value={f.whyItMatters} onChange={(e) => set('whyItMatters', e.target.value)} />
      <label htmlFor="change">Suggested change (one decision, exact wording if text)</label>
      <textarea id="change" rows={2} disabled={ro} value={f.suggestedChange} onChange={(e) => set('suggestedChange', e.target.value)} />
      <label htmlFor="metric">Metric that first showed it</label>
      <input id="metric" type="text" disabled={ro} value={f.firstMetric} onChange={(e) => set('firstMetric', e.target.value)} />

      <fieldset className="card">
        <legend>Scorecard</legend>
        <div className="row">
          <div>
            <label htmlFor="sev">Severity</label>
            <select id="sev" disabled={ro} value={f.severity} onChange={(e) => set('severity', Number(e.target.value))}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="reach">Reach</label>
            <select id="reach" disabled={ro} value={f.reach} onChange={(e) => set('reach', e.target.value)}>
              {REACHES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="effort">Effort</label>
            <select id="effort" disabled={ro} value={f.effort} onChange={(e) => set('effort', e.target.value)}>
              {EFFORTS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <p>
          Computed priority: <strong>{BAND_LABEL[computed.band]}</strong>, score {computed.score}
          {(f.overrideScore !== '' || f.overrideBand) && (
            <> · Effective: <strong>{BAND_LABEL[effBand]}</strong>, score {effScore}</>
          )}
        </p>
        <details>
          <summary>Override priority</summary>
          <div className="row">
            <div>
              <label htmlFor="oband">Band</label>
              <select id="oband" disabled={ro} value={f.overrideBand} onChange={(e) => set('overrideBand', e.target.value as Band | '')}>
                <option value="">(computed)</option>
                {BANDS.map((b) => <option key={b} value={b}>{BAND_LABEL[b]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="oscore">Score (0–20)</label>
              <input id="oscore" type="number" min={0} max={20} step={0.1} disabled={ro} value={f.overrideScore} onChange={(e) => set('overrideScore', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="oreason">Reason</label>
              <input id="oreason" type="text" disabled={ro} value={f.overrideReason} onChange={(e) => set('overrideReason', e.target.value)} />
            </div>
          </div>
        </details>
      </fieldset>

      <fieldset className="card">
        <legend>Status</legend>
        <div className="row">
          <select aria-label="Status" disabled={ro} value={f.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {f.status === 'planned' && (
            <input type="text" placeholder="Release, e.g. 4.1.0" required disabled={ro} value={f.plannedRelease} onChange={(e) => set('plannedRelease', e.target.value)} />
          )}
          {f.status === 'ignored' && (
            <input type="text" style={{ flex: 1 }} placeholder="Why is it ignored?" required disabled={ro} value={f.ignoredReason} onChange={(e) => set('ignoredReason', e.target.value)} />
          )}
        </div>
        <label htmlFor="gh">GitHub issue or project item URL</label>
        <input id="gh" type="text" placeholder="https://github.com/…" disabled={ro} value={f.githubUrl} onChange={(e) => set('githubUrl', e.target.value)} />
        {f.status === 'shipped' && (
          <>
            <label>Result check (metric before and after)</label>
            <div className="row">
              <input type="date" aria-label="Result date" disabled={ro} value={f.resultDate} onChange={(e) => set('resultDate', e.target.value)} />
              <input type="text" placeholder="Before" disabled={ro} value={f.resultBefore} onChange={(e) => set('resultBefore', e.target.value)} />
              <input type="text" placeholder="After" disabled={ro} value={f.resultAfter} onChange={(e) => set('resultAfter', e.target.value)} />
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="card">
        <legend>Evidence links (Clarity, GA4, tickets)</legend>
        {f.evidenceLinks.map((l, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <input type="text" placeholder="Label" disabled={ro} value={l.label} onChange={(e) => set('evidenceLinks', f.evidenceLinks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input type="text" style={{ flex: 1 }} placeholder="https://…" disabled={ro} value={l.url} onChange={(e) => set('evidenceLinks', f.evidenceLinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
            {!ro && <button type="button" onClick={() => set('evidenceLinks', f.evidenceLinks.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        {!ro && <button type="button" onClick={() => set('evidenceLinks', [...f.evidenceLinks, { label: '', url: '' }])}>Add link</button>}
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      {canEdit && (
        <p className="row">
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create finding'}</button>
          {saved && <span className="muted">Saved</span>}
        </p>
      )}
    </form>
  );
}

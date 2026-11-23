'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useFilters } from '@/lib/filters';
import { fmtDate } from '@/lib/date';
import {
  COMPARE_MODES, MAX_RANGE_DAYS, PRESETS, daysInclusive, deriveCompare, isDay, monthGrid, presetLabel, presetRange, yesterdayOf,
  type CompareMode, type Day, type PresetId,
} from '@/lib/range';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Draft = { from: Day; to: Day; compare: boolean; mode: CompareMode; cFrom: Day; cTo: Day };
type Target = 'range' | 'compare';

const presetOf = (from: Day, to: Day): PresetId => PRESETS.find((p) => { const r = presetRange(p.id); return r && r.from === from && r.to === to; })?.id ?? 'custom';

function problem(d: Draft, yesterday: Day): string {
  if (!isDay(d.from) || !isDay(d.to)) return 'Choose a start and an end date.';
  if (d.from > d.to) return 'The start date is after the end date.';
  if (d.to > yesterday) return `Today is not finished yet. The latest day you can pick is ${fmtDate(yesterday)}.`;
  if (daysInclusive(d.from, d.to) > MAX_RANGE_DAYS) return `Pick at most ${MAX_RANGE_DAYS} days.`;
  if (d.compare) {
    const c = deriveCompare(d.from, d.to, d.mode, d.cFrom, d.cTo);
    if (!isDay(c.from) || !isDay(c.to)) return 'Choose a start and an end date to compare with.';
    if (c.from > c.to) return 'The comparison start date is after its end date.';
    if (c.to > yesterday) return 'The comparison period must be finished days too.';
  }
  return '';
}

/** Pick the dates and what to compare them with. Nothing changes until Apply, like in Google Analytics. */
export function DateRangePicker() {
  const f = useFilters();
  const r = f.range;
  const yesterday = useMemo(() => yesterdayOf(), []);
  const uid = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ from: r.from, to: r.to, compare: r.compare, mode: r.compareMode, cFrom: r.compareFrom, cTo: r.compareTo });
  const [target, setTarget] = useState<Target>('range');
  const [pending, setPending] = useState<Day | null>(null);
  const [view, setView] = useState({ y: 0, m: 0 }); // the left month shown

  const eff = deriveCompare(draft.from, draft.to, draft.mode, draft.cFrom, draft.cTo);
  const error = problem(draft, yesterday);
  const preset = presetOf(draft.from, draft.to);

  function openPicker() {
    const next: Draft = { from: r.from, to: r.to, compare: r.compare, mode: r.compareMode, cFrom: r.compareFrom, cTo: r.compareTo };
    setDraft(next);
    setTarget('range');
    setPending(null);
    const end = new Date(`${r.to}T00:00:00Z`);
    const left = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
    setView({ y: left.getUTCFullYear(), m: left.getUTCMonth() });
    setOpen(true);
  }
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function choosePreset(id: Exclude<PresetId, 'custom'>) {
    const p = presetRange(id);
    if (!p) return;
    setDraft((d) => ({ ...d, from: p.from, to: p.to }));
    setTarget('range');
    setPending(null);
    const end = new Date(`${p.to}T00:00:00Z`);
    const left = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
    setView({ y: left.getUTCFullYear(), m: left.getUTCMonth() });
  }

  function clickDay(day: Day) {
    if (day > yesterday) return;
    if (pending === null) {
      setPending(day);
      setDraft((d) => (target === 'range' ? { ...d, from: day, to: day } : { ...d, mode: 'custom', cFrom: day, cTo: day }));
      return;
    }
    const [a, b] = day < pending ? [day, pending] : [pending, day];
    setPending(null);
    setDraft((d) => (target === 'range' ? { ...d, from: a, to: b } : { ...d, mode: 'custom', cFrom: a, cTo: b }));
  }

  function apply() {
    if (error) return;
    const p = presetOf(draft.from, draft.to);
    const days = p === '7' || p === '14' || p === '30' || p === '90' ? p : '';
    f.set({
      days: days || '14',
      from: days ? '' : draft.from,
      to: days ? '' : draft.to,
      compare: draft.compare ? '1' : '0',
      cmp: draft.mode,
      cmpFrom: draft.compare && draft.mode === 'custom' ? eff.from : '',
      cmpTo: draft.compare && draft.mode === 'custom' ? eff.to : '',
    });
    close();
  }

  const left = view;
  const right = { y: view.m === 11 ? view.y + 1 : view.y, m: (view.m + 1) % 12 };
  const shift = (n: number) => setView((v) => { const d = new Date(Date.UTC(v.y, v.m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const canGoRight = `${right.y}-${String(right.m + 1).padStart(2, '0')}` < yesterday.slice(0, 7);

  const summary = `${fmtDate(r.from)}${r.from === r.to ? '' : ` – ${fmtDate(r.to)}`}`;
  const compareSummary = r.compare ? `Compared with ${fmtDate(r.compareFrom)}${r.compareFrom === r.compareTo ? '' : ` – ${fmtDate(r.compareTo)}`}` : 'Not compared';

  return (
    <div className="drp" ref={wrap}>
      <button ref={trigger} type="button" className="drp-btn" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${uid}-pop`} onClick={() => (open ? close(false) : openPicker())}>
        <Icon name="calendar" size={16} />
        <span className="drp-text">
          <span className="drp-main"><b>{presetLabel(r)}</b> {summary}</span>
          <span className="drp-sub">{compareSummary}</span>
        </span>
        <Icon name="chevronDown" size={18} />
      </button>

      {open && (
        <div className="drp-pop" id={`${uid}-pop`} role="dialog" aria-label="Choose dates">
          <div className="drp-side">
            <div className="drp-list" role="group" aria-label="Quick ranges">
              <button type="button" aria-pressed={preset === 'custom'} onClick={() => { setTarget('range'); setPending(null); }}>Custom</button>
              {PRESETS.map((p) => (
                <button key={p.id} type="button" aria-pressed={preset === p.id} disabled={!presetRange(p.id)} onClick={() => choosePreset(p.id)}>{p.label}</button>
              ))}
            </div>
            <label className="drp-switch">
              <span>Compare</span>
              <input type="checkbox" role="switch" checked={draft.compare} onChange={(e) => setDraft({ ...draft, compare: e.target.checked })} />
              <i aria-hidden="true" />
            </label>
            {draft.compare && (
              <div className="drp-list" role="group" aria-label="Compare with">
                {COMPARE_MODES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={draft.mode === m.id} onClick={() => { setDraft({ ...draft, mode: m.id, cFrom: m.id === 'custom' ? eff.from : draft.cFrom, cTo: m.id === 'custom' ? eff.to : draft.cTo }); if (m.id === 'custom') setTarget('compare'); setPending(null); }}>{m.label}</button>
                ))}
              </div>
            )}
          </div>

          <div className="drp-main-col">
            <div className="drp-fields">
              <label className={`field${target === 'range' ? ' active' : ''}`}><span>Start date</span>
                <input type="date" max={yesterday} value={isDay(draft.from) ? draft.from : ''} onFocus={() => { setTarget('range'); setPending(null); }} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </label>
              <label className={`field${target === 'range' ? ' active' : ''}`}><span>End date</span>
                <input type="date" max={yesterday} value={isDay(draft.to) ? draft.to : ''} onFocus={() => { setTarget('range'); setPending(null); }} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </label>
            </div>
            {draft.compare && (
              <>
                <div className="drp-label">Compare with</div>
                <div className="drp-fields">
                  <label className={`field${target === 'compare' ? ' active' : ''}`}><span>Start date</span>
                    <input type="date" max={yesterday} value={isDay(eff.from) ? eff.from : ''} onFocus={() => { setTarget('compare'); setPending(null); }} onChange={(e) => setDraft({ ...draft, mode: 'custom', cFrom: e.target.value, cTo: eff.to })} />
                  </label>
                  <label className={`field${target === 'compare' ? ' active' : ''}`}><span>End date</span>
                    <input type="date" max={yesterday} value={isDay(eff.to) ? eff.to : ''} onFocus={() => { setTarget('compare'); setPending(null); }} onChange={(e) => setDraft({ ...draft, mode: 'custom', cFrom: eff.from, cTo: e.target.value })} />
                  </label>
                </div>
              </>
            )}
            <p className="drp-hint">
              {pending ? 'Now click the last day.' : `Click a day to start the ${target === 'compare' ? 'comparison ' : ''}range, then click the last day.`}
              {' '}Today is not included because it is not finished.
            </p>

            <div className="drp-cals">
              <button type="button" className="drp-nav l" aria-label="Earlier months" onClick={() => shift(-1)}><Icon name="chevronLeft" size={18} /></button>
              <button type="button" className="drp-nav r" aria-label="Later months" disabled={!canGoRight} onClick={() => shift(1)}><Icon name="chevronRight" size={18} /></button>
              {[left, right].map((mo, i) => (
                <div className={`drp-month${i === 1 ? ' second' : ''}`} key={`${mo.y}-${mo.m}`}>
                  <div className="drp-mname">{MONTHS[mo.m]} {mo.y}</div>
                  <table>
                    <thead><tr>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, k) => <th key={k} scope="col">{d}</th>)}</tr></thead>
                    <tbody>
                      {monthGrid(mo.y, mo.m).map((week, wi) => (
                        <tr key={wi}>
                          {week.map((day, di) => {
                            if (!day) return <td key={di} />;
                            const off = day > yesterday;
                            const inMain = day >= draft.from && day <= draft.to;
                            const inCmp = draft.compare && isDay(eff.from) && isDay(eff.to) && day >= eff.from && day <= eff.to;
                            const cls = ['drp-day', off ? 'off' : '', inMain ? 'in' : '', inCmp ? 'cmp' : '', day === draft.from || day === draft.to ? 'edge' : '', draft.compare && (day === eff.from || day === eff.to) ? 'cedge' : ''].filter(Boolean).join(' ');
                            return (
                              <td key={di}>
                                <button type="button" className={cls} disabled={off} aria-label={fmtDate(day)} aria-pressed={inMain} onClick={() => clickDay(day)}>{Number(day.slice(8))}</button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div className="drp-legend" aria-hidden="true"><span><i className="sw main" />Selected</span>{draft.compare && <span><i className="sw cmp" />Compared with</span>}</div>

            {error && <p className="drp-error" role="alert">{error}</p>}
            <div className="drp-actions">
              <button type="button" onClick={() => close()}>Cancel</button>
              <button type="button" className="primary" disabled={!!error} onClick={apply}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { readFileSync } from 'fs';
import { join } from 'path';
import { addDays, BadUrl, bdDay, cwvVerdict, grade, gradeScore, LighthouseError, normalizeUrl, parsePsi, pickDaily } from './psi';

// A small response in Google's documented PageSpeed v5 format. Real responses are far larger; this keeps the shapes that matter.
const dist = (a: number, b: number, c: number) => [{ proportion: a }, { proportion: b }, { proportion: c }];
const metrics = {
  LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100, distributions: dist(0.8, 0.12, 0.08), category: 'FAST' },
  INTERACTION_TO_NEXT_PAINT: { percentile: 180, distributions: dist(0.85, 0.1, 0.05), category: 'FAST' },
  CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, distributions: dist(0.9, 0.06, 0.04), category: 'FAST' },
  FIRST_CONTENTFUL_PAINT_MS: { percentile: 1500, distributions: dist(0.8, 0.15, 0.05), category: 'FAST' },
  EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 700, distributions: dist(0.7, 0.2, 0.1), category: 'FAST' },
};
const audit = (over: Record<string, unknown>) => ({ scoreDisplayMode: 'numeric', score: 1, ...over });
const response = (over: Record<string, unknown> = {}) => ({
  loadingExperience: { id: 'https://example.com/', metrics },
  originLoadingExperience: { id: 'https://example.com', metrics },
  lighthouseResult: {
    lighthouseVersion: '12.0.0',
    finalDisplayedUrl: 'https://example.com/',
    categories: {
      performance: {
        score: 0.874,
        auditRefs: [
          { id: 'first-contentful-paint', group: 'metrics', acronym: 'FCP', relevantAudits: ['render-blocking-resources'] },
          { id: 'largest-contentful-paint', group: 'metrics', acronym: 'LCP', relevantAudits: ['render-blocking-resources', 'uses-optimized-images'] },
          { id: 'render-blocking-resources', group: 'diagnostics' },
          { id: 'uses-optimized-images', group: 'diagnostics' },
          { id: 'unused-javascript', group: 'diagnostics' },
          { id: 'viewport', group: 'diagnostics' },
          { id: 'legacy-audit', group: 'hidden' },
        ],
      },
    },
    audits: {
      'first-contentful-paint': { numericValue: 1400.4 },
      'largest-contentful-paint': { numericValue: 2300 },
      'total-blocking-time': { numericValue: 150 },
      'cumulative-layout-shift': { numericValue: 0.04 },
      'speed-index': { numericValue: 3000 },
      'server-response-time': { numericValue: 420 },
      'render-blocking-resources': audit({ title: 'Eliminate render-blocking resources', description: 'Resources [block](https://x.dev) the first paint.', score: 0.5, displayValue: 'Potential savings of 450 ms', details: { type: 'opportunity', overallSavingsMs: 450, items: [{ url: 'https://example.com/a.css', wastedMs: 450, totalBytes: 20480 }] } }),
      'uses-optimized-images': audit({ title: 'Efficiently encode images', score: 0.7, details: { type: 'opportunity', overallSavingsMs: 150, overallSavingsBytes: 90000, items: [] } }),
      'unused-javascript': audit({ title: 'Reduce unused JavaScript', score: 0.4, details: { type: 'opportunity', overallSavingsMs: 900, items: [] } }),
      viewport: audit({ title: 'Has a viewport meta tag', score: 1 }),
      'legacy-audit': audit({ title: 'Replaced by a newer audit', score: 0 }),
    },
  },
  ...over,
});

describe('thresholds', () => {
  it('grades with Google bands, inclusive at the good edge', () => {
    expect(grade('lcp', 2500)).toBe('good');
    expect(grade('lcp', 2501)).toBe('needs-improvement');
    expect(grade('lcp', 4001)).toBe('poor');
    expect(grade('cls', 0.1)).toBe('good');
    expect(grade('cls', 0.26)).toBe('poor');
    expect(grade('inp', null)).toBeNull();
    expect(gradeScore(90)).toBe('good');
    expect(gradeScore(89)).toBe('needs-improvement');
    expect(gradeScore(49)).toBe('poor');
  });
});

describe('days', () => {
  it('uses the Bangladesh calendar day (UTC+6)', () => {
    expect(bdDay(new Date('2026-11-19T17:59:00Z'))).toBe('2026-11-19');
    expect(bdDay(new Date('2026-11-19T18:00:00Z'))).toBe('2026-11-20');
    expect(bdDay(new Date('2026-11-20T06:00:00Z'))).toBe('2026-11-20'); // the 12:00 daily run
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('normalizeUrl', () => {
  it('gives one spelling to one page', () => {
    expect(normalizeUrl(' https://Example.com/about/#team ')).toBe('https://example.com/about');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com/a?x=1')).toBe('https://example.com/a?x=1');
  });
  it.each(['ftp://example.com', 'javascript:alert(1)', 'not a url', 'https://localhost:3000/', 'http://192.168.1.5/', 'https://user:pw@example.com/', 'http://printer.local/', 'http://intranet/'])('rejects %s', (u) => {
    expect(() => normalizeUrl(u)).toThrow(BadUrl);
  });
});

describe('parsePsi', () => {
  it('reads real-user vitals, undoing the x100 scale on layout shift', () => {
    const r = parsePsi(response());
    expect(r.field.scope).toBe('url');
    expect(r.field.lcp).toMatchObject({ p75: 2100, grade: 'good', dist: [0.8, 0.12, 0.08] });
    expect(r.field.cls?.p75).toBeCloseTo(0.05);
    expect(r.field.inp?.p75).toBe(180);
    expect(r.verdict).toBe('pass');
  });

  it('reads the lab run and rounds the score to a whole number', () => {
    const r = parsePsi(response());
    expect(r.perfScore).toBe(87);
    expect(r.lab).toEqual({ fcp: 1400.4, lcp: 2300, tbt: 150, cls: 0.04, si: 3000, ttfb: 420 });
    expect(r.finalUrl).toBe('https://example.com/');
    expect(r.lighthouseVersion).toBe('12.0.0');
  });

  it('fails the assessment when any vital is outside the good band', () => {
    const slow = { ...metrics, LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3200, distributions: dist(0.5, 0.3, 0.2) } };
    expect(parsePsi(response({ loadingExperience: { id: 'u', metrics: slow } })).verdict).toBe('fail');
  });

  it('falls back to site-wide data when the page has too little traffic, and says so', () => {
    const r = parsePsi(response({ loadingExperience: { id: 'https://example.com', origin_fallback: true, metrics } }));
    expect(r.field.scope).toBe('origin');
    const empty = parsePsi(response({ loadingExperience: { id: 'x' }, originLoadingExperience: { id: 'y' } }));
    expect(empty.field).toEqual({ scope: 'none' });
    expect(empty.verdict).toBe('none');
  });

  it('judges INP only when present (low-traffic pages lack it)', () => {
    const { INTERACTION_TO_NEXT_PAINT: _inp, ...noInp } = metrics;
    expect(parsePsi(response({ loadingExperience: { id: 'u', metrics: noInp } })).verdict).toBe('pass');
    expect(cwvVerdict({ scope: 'url', lcp: { p75: 2000, grade: 'good', dist: null } })).toBe('none'); // no CLS: no assessment
  });

  it('keeps only audits that can still be improved, biggest saving first, with the metrics they help', () => {
    const { audits } = parsePsi(response());
    expect(audits.map((a) => a.id)).toEqual(['unused-javascript', 'render-blocking-resources', 'uses-optimized-images']);
    const rb = audits.find((a) => a.id === 'render-blocking-resources')!;
    expect(rb.metrics).toEqual(['FCP', 'LCP']);
    expect(rb.kind).toBe('opportunity');
    expect(rb.savingsMs).toBe(450);
    expect(rb.description).toBe('Resources block the first paint.'); // links reduced to their text
    expect(rb.items).toEqual([{ label: 'https://example.com/a.css', value: '20 KiB' }]);
    expect(audits.find((a) => a.id === 'unused-javascript')!.metrics).toEqual([]);
    expect(audits.some((a) => a.id === 'viewport' || a.id === 'legacy-audit')).toBe(false);
  });

  it('survives a missing metric-to-audit map by leaving the filter empty', () => {
    const r = response();
    r.lighthouseResult.categories.performance.auditRefs.forEach((x) => { delete (x as { relevantAudits?: unknown }).relevantAudits; });
    expect(parsePsi(r).audits.every((a) => a.metrics.length === 0)).toBe(true);
  });

  it('throws a clear error when Lighthouse could not test the page', () => {
    const bad = response();
    (bad.lighthouseResult as Record<string, unknown>).runtimeError = { code: 'FAILED_DOCUMENT_REQUEST', message: 'Lighthouse was unable to reliably load the page.' };
    expect(() => parsePsi(bad)).toThrow(LighthouseError);
    expect(() => parsePsi({})).toThrow(LighthouseError);
  });
});

describe('pickDaily', () => {
  const at = (day: string, trigger: string, hour: number, ok = true) => ({ day, trigger, ok, runAt: new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) });
  it('lets the scheduled run stand for the day even when a manual run came later', () => {
    const r = pickDaily([at('2026-11-20', 'scheduled', 6), at('2026-11-20', 'manual', 9)]);
    expect(r).toHaveLength(1);
    expect(r[0].trigger).toBe('scheduled');
  });
  it('uses the latest manual run only when the day has no scheduled one', () => {
    const r = pickDaily([at('2026-11-20', 'manual', 3), at('2026-11-20', 'manual', 9)]);
    expect(r[0].runAt.getUTCHours()).toBe(9);
  });
  it('treats the first check after adding a page like a scheduled one, skips failures, and sorts by day', () => {
    const r = pickDaily([at('2026-11-21', 'scheduled', 6), at('2026-11-20', 'added', 7), at('2026-11-20', 'scheduled', 6, false), at('2026-11-19', 'manual', 1, false)]);
    expect(r.map((x) => `${x.day} ${x.trigger}`)).toEqual(['2026-11-20 added', '2026-11-21 scheduled']);
  });
});

// A trimmed copy of a real response for a mobile test (Lighthouse 13), so the actual Google format stays covered.
describe('parsePsi on a real PageSpeed response', () => {
  const real = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'psi-mobile.json'), 'utf8'));
  const r = parsePsi(real);

  it('reads the score and the lab metrics', () => {
    expect(r.perfScore).toBe(94);
    expect(r.lab.lcp).toBeGreaterThan(0);
    expect(r.lab.tbt).not.toBeNull();
    expect(r.lighthouseVersion).toMatch(/^1\d\./);
  });

  it('uses site-wide data when the page has too little traffic, and has no INP for a small site', () => {
    expect(real.loadingExperience.origin_fallback).toBe(true);
    expect(r.field.scope).toBe('origin');
    expect(r.field.lcp?.p75).toBe(3069);
    expect(r.field.cls?.p75).toBeCloseTo(0.01);
    expect(r.field.inp).toBeUndefined();
    expect(r.verdict).toBe('fail'); // LCP 3.1 s is not Good, and a missing INP is not held against the page
  });

  it('keeps the fixes Google lists, with the metrics they help and the time they save', () => {
    const byId = Object.fromEntries(r.audits.map((a) => [a.id, a]));
    expect(byId['render-blocking-insight']).toMatchObject({ metrics: ['LCP', 'FCP'], savingsMs: 650 });
    expect(byId['bootup-time'].metrics).toEqual(['TBT']);
    expect(byId['bootup-time'].savingsMs).toBe(300);
    expect(byId['cache-insight'].savingsBytes).toBeGreaterThan(0);
    expect(r.audits[0].savingsMs).toBe(650); // biggest saving first
    expect(r.audits.every((a) => a.title.length > 0 && a.score !== 1 || (a.savingsMs ?? 0) > 0)).toBe(true);
    expect(r.audits.some((a) => a.id === 'viewport-insight')).toBe(false); // already passing
  });

  it('stays small enough to store for every test', () => {
    expect(JSON.stringify(r).length).toBeLessThan(30_000);
  });
});

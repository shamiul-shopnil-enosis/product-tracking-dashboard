import { SOURCE_LABEL, bandOf, type Band } from './change';
import { formatValue, type Alerts, type Tile } from './dashboard';
import { fmtDate, fmtDateTime } from './date';

export type ReportCard = { label: string; source: 'clarity' | 'ga4' | null; value: string; change: number | null; trend: Tile['trend']; before: string | null };
export type ReportAlert = Alerts['items'][number];

export type ReportInput = {
  from: string; to: string;
  /** For example "Compared with 26 Oct 2026 to 8 Nov 2026", or "Not compared" */
  compareText: string;
  compare: boolean;
  traffic: 'human' | 'all';
  threshold: number;
  generatedBy: string;
  headline: string;
  insight: string;
  cards: ReportCard[];
  alerts: ReportAlert[];
  chart: { title: string; dates: string[]; values: (number | null)[]; previous?: { label: string; values: (number | null)[] } };
};

// The standard PDF fonts only know Western characters, so anything else is replaced rather than printed as noise.
const clean = (s: string) => s.replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ').replace(/\u2212/g, '-').replace(/\u2192/g, ' to ').replace(/[^\n\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '?');

const INK: [number, number, number] = [17, 17, 17];
const INK2: [number, number, number] = [82, 81, 78];
const INK3: [number, number, number] = [120, 119, 114];
const RULE: [number, number, number] = [221, 220, 215];
const BAND_RGB: Record<Band, [number, number, number]> = {
  flat: [154, 153, 143], good: [12, 163, 12], 'good-strong': [5, 107, 16], warn: [238, 138, 29], bad: [208, 59, 59],
};
// Darker versions for text on white paper
const BAND_TEXT: Record<Band, [number, number, number]> = {
  flat: [82, 81, 78], good: [11, 107, 11], 'good-strong': [5, 84, 14], warn: [168, 90, 8], bad: [180, 35, 35],
};

const PAGE_W = 210; const PAGE_H = 297; const M = 15; const CONTENT_W = PAGE_W - 2 * M;

function changeText(change: number | null): string {
  if (change === null) return 'no earlier period';
  const size = Math.abs(change);
  const num = size < 10 && change % 1 ? size.toFixed(1) : size.toFixed(0);
  return `${change > 0 ? '+' : change < 0 ? '-' : ''}${num}%`;
}

/** Builds the Overview as a PDF and downloads it. The library loads only when someone asks for a PDF. */
export async function downloadOverviewPdf(input: ReportInput): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = M;
  const generatedAt = fmtDateTime(new Date());

  const text = (s: string, x: number, yy: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; maxWidth?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(...(opts.color ?? INK));
    doc.text(clean(s), x, yy, { align: opts.align ?? 'left', maxWidth: opts.maxWidth });
  };
  const wrap = (s: string, width: number, size: number, bold = false): string[] => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    return doc.splitTextToSize(clean(s), width) as string[];
  };
  const ensure = (needed: number) => { if (y + needed > PAGE_H - 18) { doc.addPage(); y = M; } };
  const triangle = (x: number, yy: number, up: boolean, rgb: [number, number, number]) => {
    doc.setFillColor(...rgb);
    if (up) doc.triangle(x, yy + 1.6, x + 1.8, yy + 1.6, x + 0.9, yy, 'F');
    else doc.triangle(x, yy, x + 1.8, yy, x + 0.9, yy + 1.6, 'F');
  };
  const section = (title: string) => {
    ensure(14);
    y += 4;
    text(title, M, y, { size: 12, bold: true });
    y += 2;
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, y, PAGE_W - M, y);
    y += 5;
  };

  // ---- header ----
  text('Enosis Outsourcing', M, y + 3, { size: 9, bold: true, color: [208, 59, 59] });
  text('Product Analytics', M + 33, y + 3, { size: 9, color: INK3 });
  y += 11;
  text('Overview report', M, y, { size: 20, bold: true });
  y += 7;
  const range = input.from === input.to ? fmtDate(input.from) : `${fmtDate(input.from)} to ${fmtDate(input.to)}`;
  text(range, M, y, { size: 11, bold: true });
  y += 5.5;
  text(`${input.compareText}. ${input.traffic === 'human' ? 'Real visitors only (bots left out of the Clarity numbers).' : 'Human and bot visits together (Clarity).'}`, M, y, { size: 9, color: INK2, maxWidth: CONTENT_W });
  y += 4.5;
  text(`Prepared ${generatedAt} for ${input.generatedBy}.`, M, y, { size: 8.5, color: INK3 });
  y += 3;

  // ---- summary ----
  if (input.compare && input.headline) {
    section('Summary');
    const lines = wrap(input.headline, CONTENT_W, 11, true);
    text(lines.join('\n'), M, y, { size: 11, bold: true });
    y += lines.length * 5 + 1;
    if (input.insight) {
      const ins = wrap(`What it means: ${input.insight}`, CONTENT_W, 9.5);
      text(ins.join('\n'), M, y + 1, { size: 9.5, color: INK2 });
      y += ins.length * 4.4 + 2;
    }
  }

  // ---- cards ----
  section('Key numbers');
  if (input.cards.length === 0) {
    text('No cards are on this dashboard.', M, y, { size: 10, color: INK3 });
    y += 6;
  } else {
    const cols = 3; const gap = 4; const w = (CONTENT_W - gap * (cols - 1)) / cols; const h = 30;
    input.cards.forEach((c, i) => {
      const col = i % cols;
      if (col === 0) ensure(h + gap);
      const x = M + col * (w + gap);
      const band: Band = input.compare ? bandOf(c.change, c.trend) : 'flat';
      doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S');
      doc.setFillColor(...BAND_RGB[band]); doc.rect(x + 0.2, y, w - 0.4, 1.2, 'F');
      const label = wrap(c.label, w - 6, 8.5, true).slice(0, 2);
      text(label.join('\n'), x + 3, y + 5.2, { size: 8.5, bold: true, color: INK2 });
      if (c.source) text(SOURCE_LABEL[c.source], x + w - 3, y + 5.2, { size: 7.5, color: INK3, align: 'right' });
      text(c.value, x + 3, y + 17, { size: 17, bold: true });
      if (input.compare) {
        const moved = c.change !== null && Math.abs(c.change) >= 2;
        if (c.change !== null && (band !== 'flat' || moved)) triangle(x + 3, y + 21.2, c.change > 0, BAND_RGB[band]);
        else if (c.change !== null) { doc.setFillColor(...BAND_RGB.flat); doc.rect(x + 3, y + 22, 1.8, 0.8, 'F'); }
        const word = c.trend === 'better' ? 'better' : c.trend === 'worse' ? 'worse' : c.trend === 'flat' ? (moved ? 'changed' : 'about the same') : '';
        text(`${changeText(c.change)}${c.change !== null && word ? ' ' + word : ''}`, x + 6, y + 22.6, { size: 9, bold: true, color: BAND_TEXT[band] });
        if (c.before !== null) text(`before: ${c.before}`, x + 3, y + 27, { size: 8, color: INK3 });
      }
      if (col === cols - 1 || i === input.cards.length - 1) y += h + gap;
    });
  }

  // ---- needs attention ----
  if (input.compare) {
    section(`Needs attention (${input.threshold}% or more)`);
    if (input.alerts.length === 0) {
      text('Nothing moved that much. Rates with very few sessions are not flagged.', M, y, { size: 10, color: INK3 });
      y += 6;
    } else {
      const sorted = [...input.alerts].sort((a, b) => {
        const rank = (t: string) => (t === 'worse' ? 0 : t === 'better' ? 2 : 1);
        return rank(a.trend) - rank(b.trend) || Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0);
      });
      const colX = { metric: M, change: M + 98, before: M + 128, now: M + 156 };
      text('Metric', colX.metric, y, { size: 8.5, bold: true, color: INK3 });
      text('Change', colX.change, y, { size: 8.5, bold: true, color: INK3 });
      text('Before', colX.before, y, { size: 8.5, bold: true, color: INK3 });
      text('Now', colX.now, y, { size: 8.5, bold: true, color: INK3 });
      y += 2.5;
      for (const a of sorted) {
        ensure(9);
        doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(M, y, PAGE_W - M, y);
        y += 5.2;
        const band = bandOf(a.change, a.trend);
        text(a.label, colX.metric, y, { size: 9.5, maxWidth: 94 });
        if (a.change !== null && band !== 'flat') triangle(colX.change, y - 2.4, a.change > 0, BAND_RGB[band]);
        text(`${changeText(a.change)} ${a.trend === 'worse' ? 'worse' : a.trend === 'better' ? 'better' : 'changed'}`, colX.change + 3, y, { size: 9, bold: true, color: BAND_TEXT[band] });
        text(formatValue(a.previous, a.unit), colX.before, y, { size: 9.5, color: INK2 });
        text(formatValue(a.value, a.unit), colX.now, y, { size: 9.5 });
        y += 1.8;
      }
      y += 3;
    }
  }

  // ---- chart ----
  drawChart();

  function drawChart() {
    const { dates, values, previous } = input.chart;
    const pts = values.filter((v): v is number => v !== null);
    if (dates.length < 2 || pts.length < 2) return;
    const H = 58;
    ensure(H + 18); // keep the heading with its chart
    section(input.chart.title);
    const left = M + 12; const right = PAGE_W - M; const top = y + 2; const bottom = y + H - 8;
    const all = [...pts, ...((previous?.values ?? []).filter((v): v is number => v !== null))];
    const max = Math.max(...all); const min = Math.min(0, ...all);
    const span = max - min || 1;
    const nice = (v: number) => (v >= 1000 ? Math.round(v).toLocaleString('en-US') : Number.isInteger(v) ? String(v) : v.toFixed(1));
    const X = (i: number, n: number) => left + (n <= 1 ? 0 : (i / (n - 1)) * (right - left));
    const Y = (v: number) => bottom - ((v - min) / span) * (bottom - top);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2);
    for (let g = 0; g <= 4; g++) {
      const v = min + (span * g) / 4; const yy = Y(v);
      doc.line(left, yy, right, yy);
      text(nice(v), left - 2, yy + 1, { size: 7.5, color: INK3, align: 'right' });
    }
    const line = (vals: (number | null)[], rgb: [number, number, number], dashed: boolean, width: number) => {
      doc.setDrawColor(...rgb); doc.setLineWidth(width);
      doc.setLineDashPattern(dashed ? [1.4, 1.4] : [], 0);
      let prev: { x: number; y: number } | null = null;
      vals.forEach((v, i) => {
        if (v === null) { prev = null; return; }
        const p = { x: X(i, vals.length), y: Y(v) };
        if (prev) doc.line(prev.x, prev.y, p.x, p.y);
        prev = p;
      });
      doc.setLineDashPattern([], 0);
    };
    if (previous && input.compare) line(previous.values, [154, 153, 143], true, 0.4);
    line(values, [42, 120, 214], false, 0.7);
    const idx = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
    idx.forEach((i, k) => text(fmtDate(dates[i]), X(i, dates.length), bottom + 5, { size: 7.5, color: INK3, align: k === 0 ? 'left' : k === 2 ? 'right' : 'center' }));
    y = bottom + 9;
    // legend
    doc.setDrawColor(42, 120, 214); doc.setLineWidth(0.7); doc.line(left, y, left + 6, y);
    text(input.chart.title, left + 8, y + 1, { size: 8, color: INK2 });
    if (previous && input.compare) {
      const lx = left + 12 + doc.getTextWidth(clean(input.chart.title)) + 4;
      doc.setDrawColor(154, 153, 143); doc.setLineWidth(0.4); doc.setLineDashPattern([1.4, 1.4], 0); doc.line(lx, y, lx + 6, y); doc.setLineDashPattern([], 0);
      text(previous.label, lx + 8, y + 1, { size: 8, color: INK2 });
    }
    y += 6;
  }

  // ---- footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
    text(`Enosis Outsourcing - Product Analytics - ${range}`, M, PAGE_H - 7.5, { size: 7.5, color: INK3 });
    text(`Page ${p} of ${pages}`, PAGE_W - M, PAGE_H - 7.5, { size: 7.5, color: INK3, align: 'right' });
  }

  doc.setProperties({ title: `Overview report ${input.from} to ${input.to}`, subject: 'Product Analytics overview', author: 'Enosis Outsourcing Product Analytics' });
  doc.save(`overview-${input.from}_to_${input.to}.pdf`);
}

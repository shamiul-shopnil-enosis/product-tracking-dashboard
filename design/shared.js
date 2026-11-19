/* Shared data and chart code for the three mockups.
   CURRENT VALUES are real: the last 72 hours from your Clarity project, averaged per day.
   TRENDS and COMPARISONS are illustrative: real daily history starts after the first nightly runs. */
(function () {
  const KEY = 'pt-mock-theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  root.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  window.toggleTheme = function () {
    const t = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = t;
    try { localStorage.setItem(KEY, t); } catch (e) {}
    window.dispatchEvent(new Event('themechange'));
  };

  // ---- data ----
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 10, 4 + i)));
  const label = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
  // Illustrative daily values shaped like a trend plus noise, scaled so their average equals the real value.
  const wave = (base, trend, noise, seed, weekendDip = 0) => {
    const raw = days.map((d, i) => {
      const t = 1 + trend * (i / 13 - 0.5);
      const n = 1 + noise * Math.sin(i * 1.7 + seed) * Math.cos(i * 0.6 + seed * 2);
      return t * n * (weekend(d) ? 1 - weekendDip : 1);
    });
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    return raw.map((v) => (v / mean) * base);
  };

  const T = (o) => Object.assign({ goodWhen: 'up', sample: null }, o);
  const tiles = [
    T({ id: 'sessions', group: 'Audience', name: 'Human sessions per day', value: 916, unit: 'count', change: 12, series: wave(916, 0.12, 0.05, 1, 0.18), help: 'Average human sessions per day. Clarity counts bot sessions separately.' }),
    T({ id: 'users', group: 'Audience', name: 'Visitors per day', value: 843, unit: 'count', change: 11, series: wave(843, 0.11, 0.05, 2, 0.18), help: 'Average of the daily distinct user counts. Not de-duplicated across days.' }),
    T({ id: 'bots', group: 'Audience', name: 'Bot share', value: 86.6, unit: 'percent', change: 0.4, goodWhen: 'neutral', series: wave(86.6, 0.004, 0.01, 3), help: 'Bot sessions as a share of all sessions. Not a quality signal, but a sudden rise explains a traffic jump.' }),
    T({ id: 'pps', group: 'Audience', name: 'Pages per session', value: 1.22, unit: 'ratio', change: -1, series: wave(1.22, -0.01, 0.03, 4), help: 'Human sessions only, weighted by sessions.' }),
    T({ id: 'scroll', group: 'Engagement', name: 'Scroll depth', value: 38.3, unit: 'percent', change: -4.8, series: wave(38.3, -0.05, 0.03, 5), help: 'Average share of the page scrolled, human sessions only.' }),
    T({ id: 'active', group: 'Engagement', name: 'Active time per session', value: 12, unit: 'seconds', change: 3, series: wave(12, 0.03, 0.05, 6), help: 'Time with real interaction, as reported by Clarity. Total time on page is 52 s.' }),
    T({ id: 'quick', group: 'Friction', name: 'Quick-back sessions', value: 1.35, unit: 'percent', change: 18, goodWhen: 'down', sample: 37, series: wave(1.35, 0.18, 0.08, 7), help: 'Share of sessions where the visitor left a page almost at once and went back.' }),
    T({ id: 'dead', group: 'Friction', name: 'Dead-click sessions', value: 1.35, unit: 'percent', change: 1, goodWhen: 'down', sample: 37, series: wave(1.35, 0.01, 0.1, 8), help: 'Share of sessions with a click that did nothing.' }),
    T({ id: 'rage', group: 'Friction', name: 'Rage-click sessions', value: 0.07, unit: 'percent', change: -10, goodWhen: 'down', sample: 2, series: wave(0.07, -0.1, 0.2, 9), help: 'Share of sessions with rapid repeated clicks. Very few sessions, so changes are noise.' }),
    T({ id: 'script', group: 'Friction', name: 'Script-error sessions', value: 0.18, unit: 'percent', change: -12, goodWhen: 'down', sample: 5, series: wave(0.18, -0.12, 0.15, 10), help: 'Share of sessions that hit a JavaScript error. Very few sessions, so changes are noise.' }),
  ];
  const trendOf = (t) => {
    if (Math.abs(t.change) < 2 || t.goodWhen === 'neutral') return 'flat';
    return (t.change > 0) === (t.goodWhen === 'up') ? 'better' : 'worse';
  };
  tiles.forEach((t) => { t.trend = trendOf(t); t.prev = t.value / (1 + t.change / 100); });

  const fmt = {
    count: (v) => Math.round(v).toLocaleString('en-US'),
    percent: (v) => (v < 1 ? v.toFixed(2) : v.toFixed(1)).replace(/\.0$/, '') + '%',
    ratio: (v) => v.toFixed(2),
    seconds: (v) => (Math.round(v * 10) / 10) + ' s',
  };
  const fmtTile = (t, v = t.value) => fmt[t.unit](v);
  const sign = (c) => (c > 0 ? '+' : c < 0 ? '−' : '') + Math.abs(c).toFixed(Math.abs(c) < 10 && c % 1 ? 1 : 0) + '%';
  const deltaHTML = (t) => {
    const icon = { better: '▲', worse: '▼', flat: '■' }[t.trend];
    const word = { better: 'better', worse: 'worse', flat: 'about the same' }[t.trend];
    return `<span class="delta ${t.trend}"><i aria-hidden="true">${icon}</i>${sign(t.change)} <em>${word}</em></span>`;
  };

  // Alerts follow the app rules: threshold, enough sessions behind a rate.
  const alerts = (threshold) => tiles.filter((t) => Math.abs(t.change) >= threshold && (t.sample == null || t.sample >= 10)).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // One sentence that answers "is it improving?"
  const headline = () => {
    const by = (id) => tiles.find((t) => t.id === id);
    const word = (t, up, down) => `${t.name.toLowerCase().includes('scroll') ? '' : ''}${t.change > 0 ? up : down}`;
    const good = tiles.filter((t) => t.trend === 'better' && Math.abs(t.change) >= 5).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
    const bad = tiles.filter((t) => t.trend === 'worse' && Math.abs(t.change) >= 4 && (t.sample == null || t.sample >= 10)).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const phrase = (t) => `${t.id === 'quick' ? 'quick backs' : t.name.toLowerCase()} ${t.change > 0 ? 'up' : 'down'} ${Math.abs(Math.round(t.change))}%`;
    let s = good ? `More people are visiting: ${phrase(good)}.` : 'Traffic is steady.';
    if (bad.length) s += ` But watch ${bad.map(phrase).join(' and ')}.`;
    else s += ' Nothing needs attention.';
    return s;
  };

  // ---- charts ----
  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

  /** Line chart with hover. o: {series:[{label,color,values}], prev:{label,values}, unit, height, markers:[{i,label}], endLabel, area} */
  function lineChart(el, o) {
    el.classList.add('chart');
    const draw = () => {
      const w = el.clientWidth || 600, h = o.height || 240;
      const m = { l: 44, r: o.endLabel ? 52 : 14, t: 16, b: 26 };
      const all = o.series.flatMap((s) => s.values).concat(o.prev ? o.prev.values : []);
      const max = niceMax(Math.max(...all) * 1.05);
      const x = (i) => m.l + (i / 13) * (w - m.l - m.r);
      const y = (v) => m.t + (1 - v / max) * (h - m.t - m.b);
      const f = fmt[o.unit || 'count'];
      let s = `<svg viewBox="0 0 ${w} ${h}" height="${h}" role="img" aria-label="${o.title || 'chart'}">`;
      for (let k = 0; k <= 4; k++) {
        const v = (max / 4) * k;
        s += `<line x1="${m.l}" x2="${w - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${f(v)}</text>`;
      }
      const step = w < 480 ? 4 : 3; // fewer date labels on narrow charts so they never collide
      days.forEach((d, i) => { if (i % step === 0) s += `<text x="${x(i)}" y="${h - 6}" text-anchor="middle">${label(d)}</text>`; });
      (o.markers || []).forEach((mk) => {
        s += `<line x1="${x(mk.i)}" x2="${x(mk.i)}" y1="${m.t}" y2="${h - m.b}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3"/><text x="${x(mk.i) + 5}" y="${m.t + 8}">${mk.label}</text>`;
      });
      if (o.prev) s += `<path d="${o.prev.values.map((v, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(v)).join(' ')}" fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round"/>`;
      o.series.forEach((se, k) => {
        const col = `var(--${se.color})`;
        const d = se.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
        if (o.area && k === 0) s += `<path d="${d} L${x(13)} ${y(0)} L${x(0)} ${y(0)} Z" fill="${col}" opacity="0.10"/>`;
        s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        const last = se.values[13];
        s += `<circle cx="${x(13)}" cy="${y(last)}" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2"/>`;
        if (o.endLabel) s += `<text x="${x(13) + 10}" y="${y(last) + 4}" style="fill:var(--ink);font-weight:600">${f(last)}</text>`;
      });
      s += `<line id="cx" y1="${m.t}" y2="${h - m.b}" stroke="var(--ink-3)" stroke-width="1" style="display:none"/>`;
      s += `<g id="hd"></g><rect x="${m.l}" y="${m.t}" width="${w - m.l - m.r}" height="${h - m.t - m.b}" fill="transparent" id="hit"/></svg><div class="tip"></div>`;
      el.innerHTML = s;
      const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), cx = el.querySelector('#cx'), hd = el.querySelector('#hd'), hit = el.querySelector('#hit');
      const move = (e) => {
        const r = svg.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * w;
        const i = Math.max(0, Math.min(13, Math.round(((px - m.l) / (w - m.l - m.r)) * 13)));
        cx.setAttribute('x1', x(i)); cx.setAttribute('x2', x(i)); cx.style.display = '';
        hd.innerHTML = o.series.map((se) => `<circle cx="${x(i)}" cy="${y(se.values[i])}" r="5" fill="var(--${se.color})" stroke="var(--surface)" stroke-width="2"/>`).join('');
        tip.innerHTML = `<b>${label(days[i])}</b>` + o.series.map((se) => `<div><span><i class="dot" style="background:var(--${se.color})"></i> ${se.label}</span><span class="num">${f(se.values[i])}</span></div>`).join('') + (o.prev ? `<div class="muted"><span>${o.prev.label}</span><span class="num">${f(o.prev.values[i])}</span></div>` : '');
        tip.style.display = 'block';
        const tx = (x(i) / w) * r.width;
        tip.style.left = Math.min(Math.max(tx + 14, 0), r.width - 170) + 'px';
        tip.style.top = '8px';
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerleave', () => { cx.style.display = 'none'; hd.innerHTML = ''; tip.style.display = 'none'; });
    };
    draw();
    new ResizeObserver(() => draw()).observe(el);
    window.addEventListener('themechange', draw);
  }

  /** Tiny trend line for a tile. */
  function spark(el, values, colorVar, w, h) {
    w = w || 96; h = h || 28;
    const min = Math.min(...values), max = Math.max(...values), pad = 3;
    const x = (i) => pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = (v) => pad + (1 - (v - min) / (max - min || 1)) * (h - pad * 2);
    const d = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    el.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--${colorVar || 's1'})" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="3" fill="var(--${colorVar || 's1'})" stroke="var(--surface)" stroke-width="1.5"/></svg>`;
  }

  const sessionsSeries = tiles[0].series;
  const prevSessions = sessionsSeries.map((v, i) => v / (1.12 + (i - 6.5) * 0.002) * (0.97 + 0.03 * Math.sin(i)));
  window.MOCK = {
    days, label, tiles, fmt, fmtTile, deltaHTML, alerts, headline, lineChart, spark, trendOf,
    groups: ['Audience', 'Engagement', 'Friction'],
    sessionsSeries, prevSessions,
    botSeries: wave(916 * 6.45, 0.004, 0.05, 11, 0.1),
    marker: { i: 6, label: 'PMD 4.0.0' },
    friction: ['quick', 'dead', 'rage', 'script'].map((id) => tiles.find((t) => t.id === id)),
  };
  window.addEventListener('DOMContentLoaded', () => {
    const b = document.getElementById('themebtn');
    if (b) b.addEventListener('click', window.toggleTheme);
  });
})();

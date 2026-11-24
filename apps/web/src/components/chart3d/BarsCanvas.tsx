'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AmbientLight, BoxGeometry, BufferGeometry, DirectionalLight, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial,
  OrthographicCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer, Float32BufferAttribute, type Object3D,
} from 'three';
import { cssColor, reducedMotionNow } from '@/lib/webgl';
import { formatValue, type Unit } from '@/lib/dashboard';
import { fmtDate } from '@/lib/date';

type DataPoint = Record<string, string | number | null>;
export type BarSeries = { key: string; label: string; color: string };
type Tip = { x: number; y: number; date: string; rows: { label: string; value: string; color: string }[] } | null;
type Label = { x: number; y: number; text: string };

const DEPTH = 1.1; // how far behind the previous period sits
const W = 10;      // chart width in scene units (the camera is fitted so this spans the whole box)
const PAD_L = 52; const PAD_R = 10; const PAD_B = 34; const PAD_T = 12; // pixels kept free for the axis numbers

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * Extruded bars, one per day, the previous period (when given) as pale bars behind it.
 * The picture is drawn on demand (hover, resize and the short grow-in), not in a loop, so it costs nothing while you read.
 */
export default function BarsCanvas({ points, series, prev, unit, height, dark }: {
  points: DataPoint[]; series: BarSeries[]; prev?: { label: string; values: (number | null)[] }; unit: Unit; height: number; dark: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const [width, setWidth] = useState(0);
  const [yLabels, setYLabels] = useState<Label[]>([]);
  const [xLabels, setXLabels] = useState<Label[]>([]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || width < 50) return;
    const n = points.length;
    const upp = W / (width - PAD_L - PAD_R);            // scene units per pixel
    const H = (height - PAD_B - PAD_T) * upp;            // height of the tallest bar, so the chart fills the box
    const totals = points.map((p) => Math.max(0, ...series.map((s) => (typeof p[s.key] === 'number' ? (p[s.key] as number) : 0))));
    const prevVals = prev ? prev.values.map((v) => v ?? 0) : [];
    const top = niceMax(Math.max(1, ...totals, ...prevVals));
    const k = H / top;

    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'chart3d-canvas';
    el.prepend(renderer.domElement);
    const scene = new Scene();
    // Parallel projection: no perspective, so the chart reads straight, with just enough angle to show the depth of each bar.
    const cx = ((PAD_R - PAD_L) / 2) * upp; const cy = (H + (PAD_T - PAD_B) * upp) / 2;
    const hw = W / 2 + ((PAD_L + PAD_R) / 2) * upp; const hh = (H + (PAD_T + PAD_B) * upp) / 2;
    const camera = new OrthographicCamera(-hw, hw, hh, -hh, 0.1, 100);
    camera.position.set(cx + 1.6, cy + 1.4, 20);
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    scene.add(new AmbientLight(0xffffff, dark ? 1.15 : 1.35));
    const sun = new DirectionalLight(0xffffff, dark ? 2.1 : 2.4); sun.position.set(-6, 9, 7); scene.add(sun);

    // floor and back-wall grid lines
    const grid = cssColor('var(--grid)');
    const gp: number[] = [];
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) { const y = (H * i) / ticks; gp.push(-W / 2, y, -DEPTH - 0.5, W / 2, y, -DEPTH - 0.5); }
    gp.push(-W / 2, 0, -DEPTH - 0.5, -W / 2, 0, 0.8, W / 2, 0, -DEPTH - 0.5, W / 2, 0, 0.8, -W / 2, 0, 0.8, W / 2, 0, 0.8);
    const gg = new BufferGeometry(); gg.setAttribute('position', new Float32BufferAttribute(gp, 3));
    const gm = new LineBasicMaterial({ color: grid, transparent: true, opacity: 0.9 });
    scene.add(new LineSegments(gg, gm));

    // bars
    const slot = W / Math.max(1, n); const bw = slot * 0.66;
    const geo = new BoxGeometry(1, 1, 1);
    const root = new Group(); scene.add(root);
    const mats: MeshStandardMaterial[] = [];
    const bars: { mesh: Mesh; target: number; base: number; i: number; s: number }[] = [];
    const seriesColors = series.map((s) => cssColor(s.color));
    const prevColor = cssColor('var(--ink-3)');
    const g = Math.max(1, series.length); const sub = (bw * 1.1) / g;
    points.forEach((p, i) => {
      const x = -W / 2 + slot * (i + 0.5);
      series.forEach((s, si) => {
        const v = typeof p[s.key] === 'number' ? (p[s.key] as number) : 0;
        if (v <= 0) return;
        const m = new MeshStandardMaterial({ color: seriesColors[si], roughness: 0.38, metalness: 0.12 }); mats.push(m);
        const mesh = new Mesh(geo, m); mesh.position.set(x + (si - (g - 1) / 2) * sub, 0, 0); mesh.scale.set(sub * 0.92, 0.0001, bw * 1.2);
        mesh.userData = { i, s: si }; root.add(mesh);
        bars.push({ mesh, target: v * k, base: 0, i, s: si });
      });
      if (prev && prevVals[i] > 0) {
        const m = new MeshStandardMaterial({ color: prevColor, roughness: 0.6, metalness: 0, transparent: true, opacity: 0.38 }); mats.push(m);
        const mesh = new Mesh(geo, m); mesh.position.set(x, 0, -DEPTH); mesh.scale.set(bw * 0.8, 0.0001, bw * 1.1);
        mesh.userData = { i, s: -1 }; root.add(mesh);
        bars.push({ mesh, target: prevVals[i] * k, base: 0, i, s: -1 });
      }
    });

    let hover = -1; let progress = reducedMotionNow() ? 1 : 0; let raf = 0; let dead = false;
    const place = () => {
      const grow = 1 - (1 - progress) ** 3;
      for (const b of bars) { const h = Math.max(0.0001, b.target * grow); b.mesh.scale.y = h; b.mesh.position.y = b.base * grow + h / 2; }
      mats.forEach((m) => m.emissive.setScalar(0));
      if (hover >= 0) bars.forEach((b) => { if (b.i === hover) (b.mesh.material as MeshStandardMaterial).emissive.setScalar(0.22); });
    };
    const project = (v: Vector3, w: number, h: number) => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h }; };
    const labels = (w: number, h: number) => {
      setYLabels(Array.from({ length: ticks + 1 }, (_, i) => ({ ...project(new Vector3(-W / 2, (H * i) / ticks, -DEPTH - 0.5), w, h), text: formatValue((top * i) / ticks, unit) })));
      const every = Math.max(1, Math.ceil(n / 7));
      setXLabels(points.map((p, i) => ({ ...project(new Vector3(-W / 2 + slot * (i + 0.5), 0, 0.8), w, h), text: fmtDate(String(p.date)).replace(/ \d{4}$/, '') })).filter((_, i) => i % every === 0));
    };
    const draw = () => { place(); renderer.render(scene, camera); };
    renderer.setSize(width, height);
    labels(width, height); draw();

    const t0 = performance.now();
    const step = (now: number) => {
      if (dead) return;
      progress = Math.min(1, (now - t0) / 650); draw();
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    if (progress < 1) raf = requestAnimationFrame(step);

    const ray = new Raycaster(); const m2 = new Vector2();
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      m2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(m2, camera);
      const hit = ray.intersectObjects(root.children as Object3D[], false)[0];
      const idx = hit ? (hit.object.userData.i as number) : -1;
      if (idx !== hover) { hover = idx; draw(); }
      if (idx < 0) { setTip(null); return; }
      const p = points[idx];
      const rows = series.map((s, si) => ({ label: s.label, value: formatValue(typeof p[s.key] === 'number' ? (p[s.key] as number) : null, unit), color: s.color }));
      if (prev) rows.push({ label: prev.label, value: formatValue(prev.values[idx] ?? null, unit), color: 'var(--ink-3)' });
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top, date: fmtDate(String(p.date)), rows });
    };
    const onLeave = () => { hover = -1; setTip(null); draw(); };
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    return () => {
      dead = true; cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointermove', onMove); renderer.domElement.removeEventListener('pointerleave', onLeave);
      geo.dispose(); gg.dispose(); gm.dispose(); mats.forEach((m) => m.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [points, series, prev, unit, height, dark, width]);

  return (
    <div>
    <div className="chart3d" ref={host} style={{ height }} role="img" aria-label="A 3D bar chart of the same numbers as the table. Use View as table for exact values.">
      {yLabels.map((l, i) => <span key={`y${i}`} className="c3-y" style={{ left: l.x - 6, top: l.y }}>{l.text}</span>)}
      {xLabels.map((l, i) => <span key={`x${i}`} className="c3-x" style={{ left: l.x, top: l.y + 8 }}>{l.text}</span>)}
      {tip && (
        <div className="c3-tip" style={{ left: Math.min(tip.x + 14, (host.current?.clientWidth ?? 400) - 170), top: Math.max(0, tip.y - 12) }}>
          <b>{tip.date}</b>
          {tip.rows.map((r) => <span key={r.label}><i style={{ background: r.color }} />{r.label}<em>{r.value}</em></span>)}
        </div>
      )}
    </div>
    {series.length + (prev ? 1 : 0) > 1 && (
      <div className="c3-legend" aria-hidden="true">
        {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        {prev && <span><i style={{ background: 'var(--ink-3)', opacity: 0.45 }} />{prev.label} (behind)</span>}
      </div>
    )}
    </div>
  );
}

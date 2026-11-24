'use client';

import { useEffect, useRef, useState } from 'react';
import { AmbientLight, DirectionalLight, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, Shape, Vector2, WebGLRenderer, type Object3D } from 'three';
import { cssColor, reducedMotionNow } from '@/lib/webgl';

export type DonutItem = { name: string; value: number; color: string };

/** A thick ring, one slice per item. The slice under the pointer lifts out; the centre shows the total or the hovered slice. */
export default function DonutCanvas({ items, size, dark, totalLabel, format }: { items: DonutItem[]; size: number; dark: boolean; totalLabel: string; format: (v: number) => string }) {
  const host = useRef<HTMLDivElement>(null);
  const [center, setCenter] = useState<{ title: string; value: string; share?: string } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const total = items.reduce((a, i) => a + i.value, 0) || 1;
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size);
    renderer.domElement.className = 'chart3d-canvas';
    el.prepend(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(32, 1, 0.1, 100); camera.position.set(0, 0, 11); camera.lookAt(0, 0, 0);
    scene.add(new AmbientLight(0xffffff, dark ? 1.15 : 1.35));
    const sun = new DirectionalLight(0xffffff, dark ? 2.2 : 2.5); sun.position.set(-5, 6, 8); scene.add(sun);
    const ring = new Group(); ring.rotation.x = -0.82; scene.add(ring);

    const R = 2.6; const r = 1.55; const gap = 0.02;
    const meshes: { mesh: Mesh; mid: number; i: number }[] = [];
    const geos: ExtrudeGeometry[] = []; const mats: MeshStandardMaterial[] = [];
    let a0 = Math.PI / 2;
    items.forEach((it, i) => {
      const span = (it.value / total) * Math.PI * 2; const a1 = a0 - span;
      const s = new Shape();
      const lo = a1 + gap; const hi = a0 - gap;
      if (hi > lo) {
        s.absarc(0, 0, R, hi, lo, true); s.absarc(0, 0, r, lo, hi, false); s.closePath();
        const g = new ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 48 });
        const m = new MeshStandardMaterial({ color: cssColor(it.color), roughness: 0.4, metalness: 0.1 });
        const mesh = new Mesh(g, m); mesh.userData = { i }; ring.add(mesh);
        geos.push(g); mats.push(m); meshes.push({ mesh, mid: (a0 + a1) / 2, i });
      }
      a0 = a1;
    });

    let hover = -1; let raf = 0; let dead = false; let progress = reducedMotionNow() ? 1 : 0;
    const draw = () => {
      const e = 1 - (1 - progress) ** 3;
      ring.rotation.z = (1 - e) * -0.9; ring.scale.setScalar(0.85 + 0.15 * e);
      for (const m of meshes) {
        const lift = m.i === hover ? 0.22 : 0;
        m.mesh.position.set(Math.cos(m.mid) * lift, Math.sin(m.mid) * lift, m.i === hover ? 0.25 : 0);
        (m.mesh.material as MeshStandardMaterial).emissive.setScalar(m.i === hover ? 0.2 : 0);
      }
      renderer.render(scene, camera);
    };
    const t0 = performance.now();
    const step = (now: number) => { if (dead) return; progress = Math.min(1, (now - t0) / 700); draw(); if (progress < 1) raf = requestAnimationFrame(step); };
    if (progress < 1) raf = requestAnimationFrame(step); else draw();

    const ray = new Raycaster(); const m2 = new Vector2();
    const onMove = (ev: PointerEvent) => {
      const b = renderer.domElement.getBoundingClientRect();
      m2.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1);
      ray.setFromCamera(m2, camera);
      const hit = ray.intersectObjects(ring.children as Object3D[], false)[0];
      const idx = hit ? (hit.object.userData.i as number) : -1;
      if (idx === hover) return;
      hover = idx; draw();
      setCenter(idx < 0 ? null : { title: items[idx].name || '(not set)', value: format(items[idx].value), share: `${Math.round((items[idx].value / total) * 100)}%` });
    };
    const onLeave = () => { hover = -1; setCenter(null); draw(); };
    renderer.domElement.addEventListener('pointermove', onMove); renderer.domElement.addEventListener('pointerleave', onLeave);
    return () => {
      dead = true; cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointermove', onMove); renderer.domElement.removeEventListener('pointerleave', onLeave);
      geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); renderer.dispose(); renderer.domElement.remove();
    };
  }, [items, size, dark, format]);

  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <div className="donut3d" ref={host} style={{ width: size, height: size }} role="img" aria-label="A 3D donut chart of the shares listed beside it.">
      <div className="d3-center">
        <small>{center ? center.title : totalLabel}</small>
        <b>{center ? center.value : format(total)}</b>
        {center?.share && <small>{center.share}</small>}
      </div>
    </div>
  );
}

<script setup lang="ts">
/* Phase 1 stand-in: flat 2D plot of the same snapshot the globe will render. Replaced by PortosEarthView in Phase 2. */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import worldUrl from '@/assets/maps/world.earth-render.json?url';
import type { GeoPoint } from '@/core/types';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { mapColors } from '@/styles/tokens';

type Ring = [number, number][];
const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();
let rings: Ring[] = [];
let ro: ResizeObserver | null = null;
let w = 0;
let h = 0;
let raf = 0;

const project = (p: GeoPoint): [number, number] => [((p.lon + 180) / 360) * w, ((85 - p.lat) / 170) * h];

function draw() {
  raf = 0;
  const cv = canvas.value;
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = mapColors.ocean;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = mapColors.land;
  ctx.strokeStyle = mapColors.landOutline;
  ctx.lineWidth = 0.5;
  for (const r of rings) {
    ctx.beginPath();
    r.forEach(([lon, lat], i) => {
      const [x, y] = project({ lon, lat });
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  const c = catalog.catalog;
  const s = snap.snapshot;
  if (!c || !s) return;
  const sel = view.selection;
  const selectedVoyage = sel?.kind === 'vessel' ? c.byId.vessel.get(sel.id)?.currentVoyageId : sel?.kind === 'voyage' ? sel.id : null;
  if (selectedVoyage && view.layers.routes) {
    const route = c.byId.route.get(c.byId.voyage.get(selectedVoyage)?.routeId ?? '');
    if (route) {
      ctx.strokeStyle = mapColors.routeSelected;
      ctx.lineWidth = 2;
      ctx.beginPath();
      route.waypoints.forEach((p, i) => {
        const [x, y] = project(p);
        if (i && Math.abs(p.lon - route.waypoints[i - 1].lon) > 180) ctx.moveTo(x, y);
        else if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
  }
  if (view.layers.ports) {
    ctx.fillStyle = '#d7e3ea';
    for (const p of c.ports) {
      const [x, y] = project(p.location);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }
  for (const v of c.vessels) {
    if (!view.layers[v.fleet === 'own' ? 'fleet' : 'ambient']) continue;
    const st = s.vessels.get(v.vesselId);
    if (!st?.point) continue;
    const [x, y] = project(st.point);
    ctx.fillStyle = st.state === 'stale' ? '#687482' : v.fleet === 'own' ? '#f7fafc' : '#82b8c9';
    ctx.beginPath();
    ctx.arc(x, y, v.fleet === 'own' ? 2 : 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const mark = (id: string | undefined, color: string, r: number) => {
    const p = id ? s.vessels.get(id)?.point : null;
    if (!p) return;
    const [x, y] = project(p);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  if (view.hover?.kind === 'vessel') mark(view.hover.id, '#ffffff', 7);
  if (sel?.kind === 'vessel') mark(sel.id, mapColors.accent, 8);
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(draw);
}

function resize() {
  const el = host.value;
  const cv = canvas.value;
  if (!el || !cv) return;
  w = el.clientWidth;
  h = el.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
  schedule();
}

function onClick(e: MouseEvent) {
  const c = catalog.catalog;
  const s = snap.snapshot;
  if (!c || !s || !canvas.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let best: string | null = null;
  let bestD = 64;
  for (const v of c.vessels) {
    if (!view.layers[v.fleet === 'own' ? 'fleet' : 'ambient']) continue;
    const p = s.vessels.get(v.vesselId)?.point;
    if (!p) continue;
    const [x, y] = project(p);
    const d = (x - mx) ** 2 + (y - my) ** 2;
    if (d < bestD) {
      bestD = d;
      best = v.vesselId;
    }
  }
  if (best) nav.openEntity({ kind: 'vessel', id: best });
}

onMounted(async () => {
  ro = new ResizeObserver(resize);
  if (host.value) ro.observe(host.value);
  resize();
  const gj = await (await fetch(worldUrl)).json();
  for (const f of gj.features) {
    const polys: Ring[][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) rings.push(poly[0]);
  }
  schedule();
});

watch(() => [snap.snapshot, view.selection, view.hover, view.layers], schedule, { deep: true });

onBeforeUnmount(() => {
  ro?.disconnect();
  cancelAnimationFrame(raf);
  rings = [];
});
</script>

<template>
  <div ref="host" class="temp-map" data-testid="map-canvas">
    <canvas ref="canvas" aria-label="Simulated vessel positions (temporary flat map)" role="img" @click="onClick" />
  </div>
</template>

<style scoped>
.temp-map {
  position: absolute;
  inset: 0;
  background: var(--color-map-ocean);
}
canvas {
  display: block;
  cursor: crosshair;
}
</style>

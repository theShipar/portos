<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { boundsCenter, pointInPolygon } from '@/core/geo';
import { formatNm, formatUtc } from '@/core/format';
import { LAYERS, type LayerId } from '@/core/layers';
import { GeoScopeStack, scopeKey, type Scope, type ScopeStackItem } from '@/core/scope';
import type { Bounds, Region } from '@/core/types';
import { trackUntil } from '@/engines/tracks';
import { useNavigation } from '@/router/useRouteSync';
import {
  buildHazards,
  buildPortMarkers,
  buildRouteLines,
  buildVesselMarkers,
  clusterVessels,
  describeVesselMarker,
  focusForSelection,
  trafficDensity,
  TONE_LABEL,
  TONE_RANK,
  type VesselCluster,
  type VesselMarker,
} from '@/selectors/mapLayers';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSessionStore } from '@/stores/session';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { distanceToFitBounds, EARTH_PRESET, EARTH_RADIUS, pointPreset, regionPreset, type CameraPose, type CameraPreset } from './earth/camera';
import { EarthScene, type EarthPointerHit } from './earth/EarthScene';
import { degreesPerPx, nextClusterCell, nextStackCell, STACK_MIN_COUNT } from './earth/lod';
import { MaritimeOverlay, type OverlayLayers } from './earth/MaritimeOverlay';
import { loadWorld } from './earth/worldGeo';
import { buildRegionRegistry } from './regions';

const emit = defineEmits<{ ready: [EarthScene] }>();

const catalog = useCatalogStore();
const snapStore = useSnapshotStore();
const view = useViewStore();
const clock = useClockStore();
const session = useSessionStore();
const nav = useNavigation();

const host = ref<HTMLDivElement | null>(null);
const state = ref<'loading' | 'ready' | 'no-webgl' | 'error'>('loading');
const errorText = ref('');
const scene = shallowRef<EarthScene | null>(null);
const overlay = shallowRef<MaritimeOverlay | null>(null);
const tooltip = ref<{ x: number; y: number; title: string; lines: string[] } | null>(null);
const labelEls = new Map<string, HTMLElement>();
const portLabelEls = new Map<string, HTMLElement>();
const clusterEls = new Map<string, HTMLElement>();
const clusterCell = ref(0);
let clusterMode: 'earth' | 'stack' = 'earth';

const registry = computed(() => (catalog.catalog ? markRaw(buildRegionRegistry(catalog.catalog.regions)) : null));
const regions = computed(() => catalog.catalog?.regions ?? []);
const activeRegionId = computed(() => (view.scope.level === 'earth' ? null : view.scope.regionId));
const stack = new GeoScopeStack<CameraPose, Record<LayerId, boolean>>();
let currentScope: Scope = { level: 'earth' };
let scoping = false;
let pendingPortId: string | null = null;
let unsubs: (() => void)[] = [];

const markers = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(buildVesselMarkers(catalog.catalog, snapStore.snapshot)) : []));
const ports = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(buildPortMarkers(catalog.catalog, snapStore.snapshot)) : []));
const routeLines = computed(() => (catalog.catalog ? markRaw(buildRouteLines(catalog.catalog)) : []));
const hazards = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(buildHazards(catalog.catalog, snapStore.snapshot)) : []));
const hazardKey = computed(() => hazards.value.map((h) => `${h.hazardId}:${h.phase}`).join('|'));
const focus = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(focusForSelection(catalog.catalog, snapStore.snapshot, view.selection)) : null));

/** Layer switches filtered to what the current scope offers (spec 05/02). */
const effectiveLayers = computed<OverlayLayers>(() => {
  const on = (id: LayerId) => view.layers[id] && LAYERS.find((l) => l.id === id)!.scopes.includes(view.scope.level);
  return { fleet: on('fleet'), ambient: on('ambient'), ports: on('ports'), routes: on('routes'), weather: on('weather'), incidents: on('incidents'), traffic: on('traffic') };
});

const density = computed(() => (effectiveLayers.value.traffic ? trafficDensity(markers.value, 2) : []));
const densityKey = computed(() => density.value.map((c) => `${c.south},${c.west},${c.count}`).join('|'));

/** Earth: coarse grid clusters. Region/port: only genuine pile-ups (anchorages, berths) collapse into stacks. */
const clusters = computed<{ clusters: VesselCluster[]; clusteredIds: Set<string> }>(() => {
  if (!clusterCell.value) return { clusters: [], clusteredIds: new Set() };
  const l = effectiveLayers.value;
  const visible = markers.value.filter((m) => (m.fleet === 'own' ? l.fleet : l.ambient));
  const pinned = new Set(focus.value?.vesselIds ?? []);
  if (l.incidents) for (const m of visible) if (m.tone === 'incident') pinned.add(m.vesselId);
  return clusterVessels(visible, clusterCell.value, pinned, view.scope.level === 'earth' ? 4 : STACK_MIN_COUNT);
});
const stackMenu = ref<{ id: string; x: number; y: number; members: VesselMarker[]; more: number } | null>(null);
const stackMenuEl = ref<HTMLElement | null>(null);

/** Port labels for the scope, busiest first so collisions hide the quieter ports. */
const scopePorts = computed(() => {
  const c = catalog.catalog;
  if (!c || view.scope.level === 'earth' || !effectiveLayers.value.ports) return [];
  if (view.scope.level === 'port') return ports.value.filter((p) => p.portId === (view.scope as { portId: string }).portId);
  return ports.value
    .filter((p) => p.regionId === activeRegionId.value)
    .sort((a, b) => b.openIncidents - a.openIncidents || (b.waitHours ?? -1) - (a.waitHours ?? -1) || a.name.localeCompare(b.name));
});

function presetFor(s: Scope, sc: EarthScene): CameraPreset {
  const c = catalog.catalog!;
  if (s.level === 'region') {
    const r = c.byId.region.get(s.regionId)!;
    return regionPreset(r.regionId, r.bounds, r.cameraPreset.distance, sc.viewAspect);
  }
  if (s.level === 'port') {
    const p = c.byId.port.get(s.portId)!;
    return pointPreset(p.portId, 'port', p.location, 0.7);
  }
  return EARTH_PRESET;
}

function snapshotItem(s: Scope, sc: EarthScene): ScopeStackItem<CameraPose, Record<LayerId, boolean>> {
  return { key: scopeKey(s), scope: s, cameraPose: sc.getPose(), layers: { ...view.layers }, clockUtc: clock.iso, selection: view.selection };
}

async function applyScope(next: Scope, opts: { initial?: boolean } = {}) {
  const sc = scene.value;
  if (!sc || !catalog.catalog) return;
  stackMenu.value = null;
  tooltip.value = null;
  const saved = opts.initial ? null : stack.transition(snapshotItem(currentScope, sc), next);
  currentScope = next;
  const regionId = next.level === 'earth' ? null : next.regionId;
  const region = regionId ? catalog.catalog.byId.region.get(regionId) : null;
  sc.setRegionHighlight(region ? region.countryIso3 : null);
  sc.setHoverHighlight(null);
  sc.setIdleRotation(next.level === 'earth' && !view.selection);
  const preset = presetFor(next, sc);
  scoping = true;
  const done = saved?.cameraPose
    ? await sc.flyToPose(saved.cameraPose, { min: preset.minDistance, max: preset.maxDistance })
    : await sc.flyTo(preset, opts.initial ? { duration: session.reducedMotion ? 0 : 1.6 } : {});
  scoping = false;
  if (!done) return;
  if (pendingPortId && next.level === 'region') {
    const portId = pendingPortId;
    pendingPortId = null;
    if (catalog.catalog.byId.port.get(portId)?.regionId === next.regionId) {
      nav.openScope({ level: 'port', regionId: next.regionId, portId });
      return;
    }
  }
  ensureFocusVisible();
}

function ensureFocusVisible() {
  const sc = scene.value;
  const p = focus.value?.point;
  if (!sc || !p || scoping) return;
  if (!sc.isComfortablyInView(p.lat, p.lon)) sc.focusPoint(p.lat, p.lon, { maxDistance: view.scope.level === 'earth' ? 6.4 : undefined });
}

function resetCamera() {
  const sc = scene.value;
  if (sc) sc.flyTo(presetFor(view.scope, sc));
}

function localXY(e: PointerEvent, sc: EarthScene) {
  const r = sc.renderer.domElement.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function setTooltip(x: number, y: number, title: string, lines: string[]) {
  const sc = scene.value;
  const w = sc?.viewport.width ?? 1200;
  const h = sc?.viewport.height ?? 800;
  tooltip.value = { x: Math.min(x + 14, w - 300), y: Math.min(y + 14, h - 110), title, lines };
}

function hazardAt(lon: number, lat: number) {
  if (!effectiveLayers.value.weather) return null;
  return hazards.value.find((h) => h.phase === 'active' && pointInPolygon({ lon, lat }, h.polygon)) ?? null;
}

function onHover(hit: EarthPointerHit | null, e: PointerEvent) {
  const sc = scene.value;
  const reg = registry.value;
  const ov = overlay.value;
  const c = catalog.catalog;
  if (!sc || !reg || !c) return;
  const canvas = sc.renderer.domElement;
  const { x, y } = localXY(e, sc);
  const mapHit = hit && ov ? ov.hitTest(x, y) : null;
  ov?.setHover(mapHit?.kind === 'vessel' ? mapHit.id : null, mapHit?.kind === 'port' ? mapHit.id : null);
  if (mapHit) {
    sc.setHoverHighlight(null);
    canvas.style.cursor = 'pointer';
    if (mapHit.kind === 'vessel') {
      const m = ov!.marker(mapHit.id);
      if (m) {
        const d = describeVesselMarker(m);
        const more = (mapHit.stacked ?? 1) - 1;
        const lines = more > 0 ? [...d.lines, `+${more} more vessel${more === 1 ? '' : 's'} here · zoom in or search to pick another`] : d.lines;
        setTooltip(mapHit.screenX, mapHit.screenY, d.title, lines);
      }
    } else if (mapHit.kind === 'port') {
      const p = ports.value.find((pm) => pm.portId === mapHit.id);
      if (p) {
        const wait = p.waitHours === null ? 'Waiting estimate unavailable' : `Est. wait ${p.waitHours.toFixed(1)} h · as of ${formatUtc(p.waitAsOfUtc)}`;
        const action = view.scope.level === 'earth' ? 'Click: fly to region, then port' : 'Click to focus port';
        setTooltip(mapHit.screenX, mapHit.screenY, p.name, [`${p.portId} · ${c.byId.region.get(p.regionId)?.name ?? p.regionId}`, wait, `${p.openIncidents} open incident${p.openIncidents === 1 ? '' : 's'}`, action]);
      }
    } else {
      const r = routeLines.value.find((rl) => rl.routeId === mapHit.id);
      if (r) setTooltip(x, y, r.corridorName, [`${r.routeId} · ≈${formatNm(r.distanceNm)}`, `${r.voyageCount} voyages on corridor`, 'Synthetic corridor · not a navigational route']);
    }
    return;
  }
  if (!hit) {
    tooltip.value = null;
    sc.setHoverHighlight(null);
    canvas.style.cursor = '';
    return;
  }
  const hz = hazardAt(hit.lon, hit.lat);
  if (hz) {
    sc.setHoverHighlight(null);
    canvas.style.cursor = 'pointer';
    setTooltip(x, y, `${hz.type.replace(/_/g, ' ')} · ${hz.severity}`, [`${hz.hazardId} · scenario forecast (${hz.confidence} confidence)`, `Valid ${formatUtc(hz.validFromUtc)} – ${formatUtc(hz.validToUtc)}`, `${hz.affectedVoyageCount} affected voyages`]);
    return;
  }
  const region = reg.regionAt(hit.lon, hit.lat, hit.country?.iso3 ?? null);
  if (view.scope.level === 'earth') {
    sc.setHoverHighlight(region ? region.countryIso3 : null);
    canvas.style.cursor = region ? 'pointer' : '';
    if (region) setTooltip(hit.screenX, hit.screenY, region.name, [`${region.portIds.length} ports · click to focus region`]);
    else tooltip.value = null;
  } else {
    const inOther = region && region.regionId !== activeRegionId.value;
    sc.setHoverHighlight(hit.country && !inOther ? [hit.country.iso3] : inOther ? region!.countryIso3 : null);
    canvas.style.cursor = inOther ? 'pointer' : '';
    if (hit.country || inOther) setTooltip(hit.screenX, hit.screenY, hit.country?.name ?? region!.name, [inOther ? `${region!.name} · click to switch region` : (region?.name ?? 'Outside operational regions')]);
    else tooltip.value = null;
  }
}

function openPort(portId: string) {
  const c = catalog.catalog;
  const p = c?.byId.port.get(portId);
  if (!p) return;
  tooltip.value = null;
  if (view.scope.level === 'earth') {
    pendingPortId = portId;
    nav.openScope({ level: 'region', regionId: p.regionId });
  } else nav.openScope({ level: 'port', regionId: p.regionId, portId });
}

function onClick(hit: EarthPointerHit | null, e: PointerEvent) {
  const sc = scene.value;
  const reg = registry.value;
  if (!sc || !reg) return;
  stackMenu.value = null;
  const { x, y } = localXY(e, sc);
  const mapHit = hit && overlay.value ? overlay.value.hitTest(x, y) : null;
  if (mapHit) {
    tooltip.value = null;
    if (mapHit.kind === 'vessel') nav.openEntity({ kind: 'vessel', id: mapHit.id });
    else if (mapHit.kind === 'port') openPort(mapHit.id);
    else nav.openEntity({ kind: 'route', id: mapHit.id });
    return;
  }
  if (!hit) return;
  const hz = hazardAt(hit.lon, hit.lat);
  if (hz) {
    tooltip.value = null;
    nav.openEntity({ kind: 'weather', id: hz.hazardId });
    return;
  }
  const region = reg.regionAt(hit.lon, hit.lat, hit.country?.iso3 ?? null);
  if (region && region.regionId !== activeRegionId.value) {
    tooltip.value = null;
    nav.openScope({ level: 'region', regionId: region.regionId });
  }
}

function openRegion(r: Region) {
  nav.openScope({ level: 'region', regionId: r.regionId });
}

function zoomToCluster(cl: VesselCluster) {
  const sc = scene.value;
  if (!sc) return;
  stackMenu.value = null;
  if (view.scope.level === 'earth') {
    const pad = 2;
    const b: Bounds = { west: cl.bounds.west - pad, east: cl.bounds.east + pad, south: cl.bounds.south - pad, north: cl.bounds.north + pad };
    const distance = Math.max(3.2, Math.min(4.2, distanceToFitBounds(b, sc.viewAspect)));
    sc.flyTo({ id: cl.id, scope: 'earth', center: boundsCenter(b), distance, minDistance: EARTH_PRESET.minDistance, maxDistance: EARTH_PRESET.maxDistance });
    return;
  }
  const pad = Math.max(0.05, (cl.bounds.east - cl.bounds.west) * 0.5);
  const b: Bounds = { west: cl.bounds.west - pad, east: cl.bounds.east + pad, south: cl.bounds.south - pad, north: cl.bounds.north + pad };
  const { min, max } = sc.distanceLimits;
  const distance = Math.max(min, Math.min(max, distanceToFitBounds(b, sc.viewAspect)));
  sc.flyTo({ id: cl.id, scope: 'earth', center: boundsCenter(b), distance, minDistance: min, maxDistance: max });
}

/** Region/port stacks open a picker: zooming cannot always separate vessels moored metres apart. */
function onClusterClick(cl: VesselCluster) {
  if (view.scope.level === 'earth') return zoomToCluster(cl);
  if (stackMenu.value?.id === cl.id) {
    stackMenu.value = null;
    return;
  }
  const sc = scene.value;
  if (!sc) return;
  const p = sc.project(cl.center.lat, cl.center.lon);
  const byId = new Map(markers.value.map((m) => [m.vesselId, m]));
  const members = cl.memberIds
    .map((id) => byId.get(id))
    .filter((m): m is VesselMarker => !!m)
    .sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone] || a.name.localeCompare(b.name));
  const shown = members.slice(0, 8);
  const w = sc.viewport.width;
  const h = sc.viewport.height;
  stackMenu.value = { id: cl.id, x: Math.min(p.x + 18, w - 280), y: p.y - 20, members: shown, more: members.length - shown.length };
  nextTick(() => {
    const el = stackMenuEl.value;
    if (!el || !stackMenu.value) return;
    stackMenu.value.y = Math.max(8, Math.min(stackMenu.value.y, h - el.offsetHeight - 8));
    el.querySelector<HTMLElement>('.stack-menu__item')?.focus();
  });
}

function closeStackMenu() {
  const id = stackMenu.value?.id;
  stackMenu.value = null;
  if (id) clusterEls.get(id)?.focus();
}

function pickFromStack(id: string) {
  stackMenu.value = null;
  nav.openEntity({ kind: 'vessel', id });
}

function refSetter(map: Map<string, HTMLElement>, id: string) {
  return (el: unknown) => {
    if (el instanceof HTMLElement) map.set(id, el);
    else map.delete(id);
  };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
const labelWidths = new WeakMap<HTMLElement, number>();

function labelWidth(el: HTMLElement): number {
  let w = labelWidths.get(el);
  if (!w) {
    w = el.offsetWidth;
    if (w) labelWidths.set(el, w);
  }
  return w || 60;
}

/** Position a DOM label over a globe point; with `taken`, skip it if it would overlap an already placed label. */
function place(el: HTMLElement | undefined, sc: EarthScene, lat: number, lon: number, show: boolean, dx = 0, taken?: Rect[]) {
  if (!el) return;
  const p = sc.project(lat, lon);
  let visible = show && p.visible;
  if (visible && taken) {
    const w = labelWidth(el);
    const r = dx ? { x0: p.x + dx, x1: p.x + dx + w, y0: p.y - 8, y1: p.y + 8 } : { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - 9, y1: p.y + 9 };
    if (taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) visible = false;
    else taken.push(r);
  }
  el.style.visibility = visible ? 'visible' : 'hidden';
  if (visible) el.style.transform = `translate(${Math.round(p.x + dx)}px, ${Math.round(p.y)}px) translate(${dx ? '0' : '-50%'}, -50%)`;
}

/** Cluster badges always show; when one would cover a label it slides just below (or above) it instead. */
function placeBadge(el: HTMLElement | undefined, sc: EarthScene, lat: number, lon: number, taken: Rect[]) {
  if (!el) return;
  const p = sc.project(lat, lon);
  el.style.visibility = p.visible ? 'visible' : 'hidden';
  if (!p.visible) return;
  const w = labelWidth(el) / 2;
  const hits = (dy: number) => taken.some((t) => p.x - w < t.x1 && p.x + w > t.x0 && p.y + dy - 12 < t.y1 && p.y + dy + 12 > t.y0);
  const dy = [0, 22, -22].find((d) => !hits(d)) ?? 0;
  taken.push({ x0: p.x - w, x1: p.x + w, y0: p.y + dy - 12, y1: p.y + dy + 12 });
  el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + dy)}px) translate(-50%, -50%)`;
}

function onFrame(_now: number, dirty: boolean) {
  const sc = scene.value;
  if (!sc || !dirty) return;
  const ov = overlay.value;
  ov?.update();
  const distance = sc.camera.position.length();
  const mode = view.scope.level === 'earth' ? 'earth' : 'stack';
  const held = mode === clusterMode ? clusterCell.value : 0;
  clusterMode = mode;
  let nextCell = 0;
  if (mode === 'earth') nextCell = nextClusterCell(held, distance);
  else if (ov) nextCell = nextStackCell(held, degreesPerPx(distance, EARTH_RADIUS, sc.pxToWorld) * ov.markerPx * 0.5);
  if (nextCell !== clusterCell.value) {
    clusterCell.value = nextCell;
    stackMenu.value = null;
  }
  const atEarth = view.scope.level === 'earth';
  const taken: Rect[] = [];
  for (const r of regions.value) place(labelEls.get(r.regionId), sc, r.center.lat, r.center.lon, atEarth, 0, atEarth ? taken : undefined);
  for (const p of scopePorts.value) place(portLabelEls.get(p.portId), sc, p.point.lat, p.point.lon, true, 9, taken);
  for (const cl of clusters.value.clusters) placeBadge(clusterEls.get(cl.id), sc, cl.center.lat, cl.center.lon, taken);
}

async function init() {
  if (!host.value) return;
  if (!EarthScene.isWebGLAvailable()) {
    state.value = 'no-webgl';
    return;
  }
  let sc: EarthScene;
  try {
    sc = markRaw(new EarthScene(host.value, { quality: 'standard', reducedMotion: session.reducedMotion }));
  } catch (e) {
    state.value = 'no-webgl';
    errorText.value = e instanceof Error ? e.message : String(e);
    return;
  }
  scene.value = sc;
  try {
    const world = await loadWorld();
    await sc.load(world);
  } catch (e) {
    state.value = 'error';
    errorText.value = e instanceof Error ? e.message : String(e);
    return;
  }
  const ov = markRaw(new MaritimeOverlay(sc, catalog.catalog?.vessels.length ?? 512));
  overlay.value = ov;
  ov.setLayers(effectiveLayers.value);
  ov.setRoutes(routeLines.value);
  ov.setPorts(ports.value);
  ov.setVessels(markers.value);
  ov.setHazards(hazards.value);
  syncFocus();
  unsubs = [
    sc.on('hover', onHover),
    sc.on('click', onClick),
    sc.on('userInteract', () => {
      tooltip.value = null;
      stackMenu.value = null;
    }),
    sc.on('contextLost', () => {
      state.value = 'error';
      errorText.value = 'The WebGL context was lost (GPU reset or memory pressure).';
    }),
    sc.onFrame(onFrame),
  ];
  sc.setRightInset(view.inspectorOpen ? inspectorInset() : 0);
  sc.start();
  if (import.meta.env.DEV) (window as unknown as { __portos?: unknown }).__portos = { scene: sc, overlay: ov };
  state.value = 'ready';
  emit('ready', sc);
  await applyScope(view.scope, { initial: true });
}

function inspectorInset() {
  return 408 + 24;
}

function syncFocus() {
  const ov = overlay.value;
  const c = catalog.catalog;
  const f = focus.value;
  if (!ov || !c || !f) return;
  ov.setFocus(f);
  const vesselId = f.vesselIds[0];
  ov.setTrack(vesselId ? trackUntil(c, vesselId, clock.timeMs) : null);
}

watch(
  () => scopeKey(view.scope),
  () => applyScope(view.scope),
);
watch(
  () => view.inspectorOpen,
  (open) => {
    scene.value?.setRightInset(open ? inspectorInset() : 0);
    scene.value?.setIdleRotation(view.scope.level === 'earth' && !open);
  },
);
watch(
  () => session.reducedMotion,
  (v) => scene.value?.setReducedMotion(v),
);
watch(markers, (m) => overlay.value?.setVessels(m));
watch(ports, (p) => overlay.value?.setPorts(p));
watch(hazardKey, () => overlay.value?.setHazards(hazards.value));
watch(densityKey, () => overlay.value?.setDensity(density.value));
watch(effectiveLayers, (l) => overlay.value?.setLayers(l));
watch(focus, syncFocus);
watch(
  () => (view.selection ? `${view.selection.kind}:${view.selection.id}` : ''),
  (key) => {
    if (key) setTimeout(ensureFocusVisible, 200);
  },
);
watch(
  () => clusters.value,
  (cl) => overlay.value?.setClustered(cl.clusteredIds),
);

function retry() {
  dispose();
  state.value = 'loading';
  init();
}

function dispose() {
  unsubs.forEach((u) => u());
  unsubs = [];
  overlay.value?.dispose();
  overlay.value = null;
  scene.value?.dispose();
  scene.value = null;
  stack.clear();
}

onMounted(init);
onBeforeUnmount(dispose);

defineExpose({ resetCamera, scene, overlay });
</script>

<template>
  <div class="earth">
    <div ref="host" class="earth__host" />
    <div v-if="state === 'ready'" class="earth__labels">
      <button
        v-for="cl in clusters.clusters"
        :key="cl.id"
        :ref="refSetter(clusterEls, cl.id)"
        type="button"
        class="cluster"
        :class="[`cluster--${cl.worstTone}`, { 'cluster--stack': view.scope.level !== 'earth' }]"
        :aria-label="`${cl.count} vessels${cl.exceptionCount ? `, ${cl.exceptionCount} with exceptions` : ''}; worst state ${TONE_LABEL[cl.worstTone]}. ${view.scope.level === 'earth' ? 'Zoom in' : 'List vessels'}`"
        :aria-expanded="view.scope.level === 'earth' ? undefined : stackMenu?.id === cl.id"
        :title="`${cl.count} vessels · ${cl.exceptionCount} with exceptions · ${view.scope.level === 'earth' ? 'click to zoom' : 'click to list'}`"
        data-testid="vessel-cluster"
        @click="onClusterClick(cl)"
      >
        {{ cl.count }}
      </button>
      <button
        v-for="p in scopePorts"
        :key="p.portId"
        :ref="refSetter(portLabelEls, p.portId)"
        type="button"
        class="port-label"
        :class="{ 'port-label--active': view.scope.level === 'port' }"
        :tabindex="view.scope.level === 'region' ? 0 : -1"
        :aria-label="`Focus port ${p.name}`"
        :data-testid="`port-label-${p.portId}`"
        @click="openPort(p.portId)"
      >
        {{ p.name }}
      </button>
      <button
        v-for="r in regions"
        :key="r.regionId"
        :ref="refSetter(labelEls, r.regionId)"
        type="button"
        class="region-label"
        :class="{ 'region-label--active': r.regionId === activeRegionId }"
        :tabindex="view.scope.level === 'earth' ? 0 : -1"
        :aria-label="`Focus region ${r.name}`"
        :data-testid="`region-label-${r.regionId}`"
        @click="openRegion(r)"
      >
        {{ r.name }}
      </button>
    </div>
    <div
      v-if="stackMenu"
      ref="stackMenuEl"
      class="stack-menu"
      :style="{ transform: `translate(${stackMenu.x}px, ${stackMenu.y}px)` }"
      role="dialog"
      aria-label="Vessels at this spot"
      data-testid="stack-menu"
      @keydown.esc.stop="closeStackMenu"
    >
      <div class="stack-menu__head">
        <span>{{ stackMenu.members.length + stackMenu.more }} vessels here</span>
        <button type="button" class="stack-menu__zoom" @click="zoomToCluster(clusters.clusters.find((c) => c.id === stackMenu!.id)!)">Zoom to area</button>
      </div>
      <button v-for="m in stackMenu.members" :key="m.vesselId" type="button" class="stack-menu__item" :data-testid="`stack-item-${m.vesselId}`" @click="pickFromStack(m.vesselId)">
        <span class="stack-menu__dot" :class="`stack-menu__dot--${m.tone}`" aria-hidden="true" />
        <span class="stack-menu__name">{{ m.name }}</span>
        <span class="stack-menu__meta mono">{{ m.vesselId }} · {{ TONE_LABEL[m.tone] }}</span>
      </button>
      <span v-if="stackMenu.more" class="stack-menu__more">+{{ stackMenu.more }} more · zoom in or use search</span>
    </div>
    <div v-if="tooltip" class="earth__tooltip" :style="{ transform: `translate(${tooltip.x}px, ${tooltip.y}px)` }" role="tooltip" data-testid="map-tooltip">
      <strong>{{ tooltip.title }}</strong>
      <span v-for="(l, i) in tooltip.lines" :key="i">{{ l }}</span>
    </div>
    <div v-if="state === 'loading'" class="earth__state" role="status">
      <div class="spinner" aria-hidden="true" />
      <span>Preparing Earth view…</span>
    </div>
    <div v-else-if="state === 'no-webgl' || state === 'error'" class="earth__state earth__state--error" role="alert">
      <strong>{{ state === 'no-webgl' ? '3D map unavailable: WebGL is not supported or is disabled in this browser.' : '3D map failed to render.' }}</strong>
      <span v-if="errorText" class="mono">{{ errorText }}</span>
      <span>Search, inspectors and case work still function. Use search (press /) to open vessels, ports and incidents.</span>
      <button v-if="state === 'error'" type="button" class="btn btn--primary" @click="retry">Retry 3D map</button>
    </div>
  </div>
</template>

<style scoped>
.earth,
.earth__host {
  position: absolute;
  inset: 0;
}
.earth__host {
  background: #03080d;
}
.earth__labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.region-label,
.port-label,
.cluster {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: auto;
  white-space: nowrap;
}
.region-label {
  padding: 3px 8px;
  border: 1px solid rgba(207, 225, 234, 0.25);
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.72);
  color: var(--color-ink-on-dark);
  font-size: var(--text-11);
  font-weight: 500;
  letter-spacing: 0.02em;
  backdrop-filter: blur(4px);
  transition: background var(--motion-hover), border-color var(--motion-hover);
}
.region-label:hover {
  background: rgba(6, 26, 40, 0.92);
  border-color: rgba(233, 103, 34, 0.7);
}
.region-label--active {
  font-size: var(--text-13);
  font-weight: 600;
  padding: 4px 10px;
  border-color: rgba(233, 103, 34, 0.6);
  pointer-events: none;
}
.port-label {
  padding: 1px 5px;
  border: 0;
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.55);
  color: rgba(247, 250, 252, 0.88);
  font-size: var(--text-11);
  line-height: 15px;
}
.port-label:hover,
.port-label:focus-visible {
  background: rgba(6, 26, 40, 0.9);
  color: #fff;
}
.port-label--active {
  font-size: var(--text-12);
  font-weight: 600;
}
.cluster {
  display: grid;
  place-items: center;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: 13px;
  border: 2px solid rgba(211, 221, 227, 0.85);
  background: rgba(6, 26, 40, 0.86);
  color: var(--color-ink-on-dark);
  font-family: var(--font-data);
  font-size: var(--text-11);
  font-weight: 600;
  box-shadow: 0 0 0 3px rgba(6, 26, 40, 0.35);
}
.cluster:hover {
  background: rgba(16, 40, 55, 0.96);
}
.cluster--incident {
  border-color: #d97a72;
}
.cluster--atRisk {
  border-color: #c98a4f;
}
.cluster--delayed {
  border-color: #dcb27f;
  border-style: dashed;
}
.cluster--ambient {
  border-color: rgba(125, 147, 161, 0.9);
}
.cluster--stack {
  min-width: 22px;
  height: 22px;
  border-radius: var(--radius-input);
  border-width: 1.5px;
}
.stack-menu {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 26;
  display: grid;
  width: 264px;
  padding: var(--space-1);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-drawer);
}
.stack-menu__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px 6px;
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
}
.stack-menu__zoom {
  border: 0;
  background: none;
  color: var(--color-info);
  font-size: var(--text-11);
  font-weight: 500;
  cursor: pointer;
}
.stack-menu__item {
  display: grid;
  grid-template-columns: 8px 1fr;
  column-gap: 8px;
  align-items: center;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--radius-chip);
  background: none;
  text-align: left;
  line-height: 16px;
  cursor: pointer;
}
.stack-menu__item:hover,
.stack-menu__item:focus-visible {
  background: var(--color-panel-secondary);
}
.stack-menu__dot {
  grid-row: span 2;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-unknown);
}
.stack-menu__dot--incident {
  background: var(--color-critical);
}
.stack-menu__dot--atRisk {
  background: var(--color-warning);
}
.stack-menu__dot--delayed {
  background: transparent;
  border: 1.5px solid var(--color-warning);
}
.stack-menu__dot--onPlan {
  background: var(--color-info);
}
.stack-menu__name {
  font-size: var(--text-12);
  font-weight: 500;
  color: var(--color-ink);
}
.stack-menu__meta {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.stack-menu__more {
  padding: 4px 6px 2px;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.earth__tooltip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 25;
  display: grid;
  gap: 1px;
  max-width: 300px;
  padding: 6px 10px;
  border-radius: var(--radius-input);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
  line-height: 16px;
  pointer-events: none;
}
.earth__tooltip span {
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
}
.earth__state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  padding: 24px;
  color: var(--color-ink-on-dark);
  text-align: center;
}
.earth__state--error {
  background: var(--color-map-ocean);
}
.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--color-accent);
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

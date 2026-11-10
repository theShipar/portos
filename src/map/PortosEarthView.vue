<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { boundsCenter, pointInPolygon } from '@/core/geo';
import { formatNm, formatUtc } from '@/core/format';
import { LAYERS, type LayerId } from '@/core/layers';
import { flags } from '@/core/flags';
import { GeoScopeStack, scopeFocusId, scopeKey, type Scope, type ScopeStackItem } from '@/core/scope';
import type { Bounds, Region } from '@/core/types';
import { trackUntil } from '@/engines/tracks';
import { portScope, scopeFromSceneRef } from '@/router/opsLocation';
import { useNavigation } from '@/router/useRouteSync';
import {
  buildHazards,
  buildPortMarkers,
  buildRouteLines,
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
import { scaleBar } from '@/spatial/compass';
import { prefetchGeoDocs } from '@/spatial/geoData';
import { terrainMaps } from '@/spatial/scenes/regionGeometry';
import { InputRouter } from '@/spatial/InputRouter';
import { OverlayProjectionAdapter } from '@/spatial/OverlayProjectionAdapter';
import { CITIES } from '@/spatial/registry';
import { EARTH_SCENE_KEY, EarthGlobeScene } from '@/spatial/scenes/EarthGlobeScene';
import { planarSceneKey, Region3DScene, sceneKindForLevel, type PlanarLevel } from '@/spatial/scenes/Region3DScene';
import { SpatialDirector } from '@/spatial/SpatialDirector';
import type { SceneTarget, SpatialScene } from '@/spatial/types';
import { boundsPreset, distanceToFitBounds, EARTH_PRESET, EARTH_RADIUS, pointPreset, regionPreset, type CameraPose, type CameraPreset } from './earth/camera';
import { EarthScene } from './earth/EarthScene';
import type { MapSurface, SurfacePointerHit } from './surface';
import { degreesPerPx, nextClusterCell, nextStackCell, STACK_MIN_COUNT } from './earth/lod';
import { MaritimeOverlay, type OverlayLayers } from './earth/MaritimeOverlay';
import { loadWorld } from './earth/worldGeo';
import { buildRegionRegistry } from './regions';

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
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
/** The globe; it owns the WebGL renderer that every surface shares. */
const scene = shallowRef<EarthScene | null>(null);
/** The surface on screen (globe, or an extruded region / country / city scene) and its maritime overlay. */
const surface = shallowRef<MapSurface | null>(null);
const overlay = shallowRef<MaritimeOverlay | null>(null);
const overlays = new Map<MapSurface, MaritimeOverlay>();
const surfaceUnsubs = new Map<MapSurface, (() => void)[]>();
const planarInfo = ref<{ illustrative: boolean } | null>(null);
const compassEl = ref<HTMLElement | null>(null);
const scaleBarEl = ref<HTMLElement | null>(null);
const scaleTextEl = ref<HTMLElement | null>(null);
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
/** spatialV2: the director owns the frame loop and camera flights; the input router owns pointer events. */
let director: SpatialDirector | null = null;
let input: InputRouter | null = null;
const projection = new OverlayProjectionAdapter();
let nextFlight: ((surf: MapSurface) => Promise<boolean>) | null = null;

const markers = computed(() => snapStore.mapMarkers);
const ports = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(buildPortMarkers(catalog.catalog, snapStore.snapshot)) : []));
const routeLines = computed(() => (catalog.catalog ? markRaw(buildRouteLines(catalog.catalog)) : []));
const hazards = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(buildHazards(catalog.catalog, snapStore.snapshot)) : []));
const hazardKey = computed(() => hazards.value.map((h) => `${h.hazardId}:${h.phase}`).join('|'));
const focus = computed(() => (catalog.catalog && snapStore.snapshot ? markRaw(focusForSelection(catalog.catalog, snapStore.snapshot, view.selection, { comparing: view.comparing })) : null));

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
  if (view.scope.level === 'country' || view.scope.level === 'city') {
    const ids = new Set(catalog.registry?.get(scopeFocusId(view.scope))?.maritimePortIds ?? []);
    return ports.value.filter((p) => ids.has(p.portId)).sort((a, b) => b.openIncidents - a.openIncidents || a.name.localeCompare(b.name));
  }
  return ports.value
    .filter((p) => p.regionId === activeRegionId.value)
    .sort((a, b) => b.openIncidents - a.openIncidents || (b.waitHours ?? -1) - (a.waitHours ?? -1) || a.name.localeCompare(b.name));
});

function presetFor(s: Scope, surf: MapSurface): CameraPreset {
  const c = catalog.catalog!;
  const planar = surf instanceof Region3DScene ? surf : null;
  if (s.level === 'region') {
    const r = c.byId.region.get(s.regionId)!;
    return planar ? planar.fitPreset(r.regionId, 'region', r.bounds) : regionPreset(r.regionId, r.bounds, r.cameraPreset.distance, surf.viewAspect);
  }
  if (s.level === 'port') {
    const p = c.byId.port.get(s.portId)!;
    const e = catalog.registry?.get(p.portId);
    return planar && e ? planar.fitPreset(p.portId, 'port', e.bbox, 0.7) : pointPreset(p.portId, 'port', p.location, 0.7);
  }
  if (s.level === 'country' || s.level === 'city') {
    const e = catalog.registry?.get(scopeFocusId(s));
    if (e) return planar ? planar.fitPreset(e.id, s.level, e.bbox) : boundsPreset(e.id, s.level, e.bbox, surf.viewAspect);
  }
  return EARTH_PRESET;
}

/** Globe countries lit for a scope: the region's set, or the one country of a country/city scope. */
function highlightFor(s: Scope, surf?: MapSurface): string[] | null {
  if (s.level === 'earth') return null;
  if (s.level === 'country' || s.level === 'city') return catalog.registry?.get(scopeFocusId(s))?.iso3.filter(Boolean) ?? null;
  if (s.level === 'port' && surf?.surfaceKind === 'planar') return catalog.registry?.get(s.portId)?.iso3.filter(Boolean) ?? null;
  return catalog.catalog?.byId.region.get(s.regionId)?.countryIso3 ?? null;
}

/**
 * Regions, countries and cities render as extruded scenes; a port shows inside its city (or its region) until the
 * port twin lands. Entries without built geometry fall back to the globe.
 */
function targetForScope(s: Scope): SceneTarget {
  const focusId = scopeFocusId(s);
  const reg = catalog.registry;
  let level: PlanarLevel | null = null;
  let id = focusId;
  if (s.level === 'region' || s.level === 'country' || s.level === 'city') level = s.level;
  else if (s.level === 'port') {
    const city = reg?.cityOfPort(s.portId);
    level = city ? 'city' : 'region';
    id = city ? city.id : s.regionId;
  }
  if (level && reg?.get(id)?.geometryPath) return { kind: sceneKindForLevel(level), sceneKey: planarSceneKey(level, id), focusId };
  return { kind: 'earth', sceneKey: EARTH_SCENE_KEY, focusId };
}

/** Screen position of a geographic point through the active scene (director projector, or the globe directly). */
function geoProject(surf: MapSurface, lat: number, lon: number) {
  return director ? projection.project(lon, lat) : surf.project(lat, lon);
}

function snapshotItem(s: Scope, surf: MapSurface): ScopeStackItem<CameraPose, Record<LayerId, boolean>> {
  return { key: scopeKey(s), scope: s, cameraPose: surf.getPose(), layers: { ...view.layers }, clockUtc: clock.iso, selection: view.selection };
}

async function applyScope(next: Scope, opts: { initial?: boolean } = {}) {
  const globe = scene.value;
  const cur = surface.value;
  if (!globe || !cur || !catalog.catalog) return;
  stackMenu.value = null;
  tooltip.value = null;
  const saved = opts.initial ? null : stack.transition(snapshotItem(currentScope, cur), next);
  currentScope = next;
  globe.setIdleRotation(next.level === 'earth' && !view.selection);
  const fly = (surf: MapSurface) => {
    surf.setRegionHighlight(highlightFor(next, surf));
    surf.setHoverHighlight(null);
    const preset = presetFor(next, surf);
    return saved?.cameraPose
      ? surf.flyToPose(saved.cameraPose, { min: preset.minDistance, max: preset.maxDistance })
      : surf.flyTo(preset, opts.initial ? { duration: session.reducedMotion ? 0 : 1.6 } : {});
  };
  scoping = true;
  let done: boolean;
  if (director) {
    nextFlight = fly;
    done = (await director.navigate(targetForScope(next), { restoreCamera: false })) === 'done';
  } else done = await fly(globe);
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
  const surf = surface.value;
  const p = focus.value?.point;
  if (!surf || !p || scoping) return;
  if (!surf.isComfortablyInView(p.lat, p.lon)) surf.focusPoint(p.lat, p.lon, { maxDistance: view.scope.level === 'earth' ? 6.4 : undefined });
}

function resetCamera() {
  const surf = surface.value;
  if (surf) surf.flyTo(presetFor(view.scope, surf));
}

function localXY(e: PointerEvent, surf: MapSurface) {
  const r = surf.renderer.domElement.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function setTooltip(x: number, y: number, title: string, lines: string[]) {
  const surf = surface.value;
  const w = surf?.viewport.width ?? 1200;
  const h = surf?.viewport.height ?? 800;
  tooltip.value = { x: Math.min(x + 14, w - 300), y: Math.min(y + 14, h - 110), title, lines };
}

function hazardAt(lon: number, lat: number) {
  if (!effectiveLayers.value.weather) return null;
  return hazards.value.find((h) => h.phase === 'active' && pointInPolygon({ lon, lat }, h.polygon)) ?? null;
}

function onHover(hit: SurfacePointerHit | null, e: PointerEvent) {
  const sc = surface.value;
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
    const drill = !inOther && sc.surfaceKind === 'planar' ? drillTarget(hit) : null;
    sc.setHoverHighlight(hit.country && !inOther ? [hit.country.iso3] : inOther ? region!.countryIso3 : null);
    canvas.style.cursor = inOther || drill ? 'pointer' : '';
    const context = inOther ? `${region!.name} · click to switch region` : (region?.name ?? 'Outside operational regions');
    const lines = drill ? [context, `Double-click to open ${drill.label}`] : [context];
    if (hit.country || inOther) setTooltip(hit.screenX, hit.screenY, hit.country?.name ?? region!.name, lines);
    else tooltip.value = null;
  }
}

/** Next level down under the pointer on an extruded scene: region → country, country → city, city → nearest port. */
function drillTarget(hit: SurfacePointerHit): { scope: Scope; label: string } | null {
  const c = catalog.catalog;
  const reg = catalog.registry;
  const s = view.scope;
  if (!c || !reg) return null;
  const countryId = hit.country ? [...reg.countryRows.values()].find((r) => r.iso3 === hit.country!.iso3)?.countryId : undefined;
  const city = CITIES.find((ct) => {
    const pad = 0.25;
    return ct.countryId === countryId && hit.lon >= ct.bbox.west - pad && hit.lon <= ct.bbox.east + pad && hit.lat >= ct.bbox.south - pad && hit.lat <= ct.bbox.north + pad;
  });
  const to = (level: 'country' | 'city', id: string) => {
    const scope = scopeFromSceneRef(c, reg, { level, id });
    return scope ? { scope, label: reg.get(id)!.label } : null;
  };
  if (s.level === 'region') {
    if (countryId && reg.get(countryId)?.type === 'country') return to('country', countryId);
    const cityState = CITIES.find((ct) => ct.countryId === countryId && !reg.get(ct.countryId));
    return cityState ? to('city', cityState.id) : null;
  }
  if (s.level === 'country') {
    if (city) return to('city', city.id);
    return countryId && countryId !== s.countryId && reg.get(countryId)?.type === 'country' ? to('country', countryId) : null;
  }
  if (s.level === 'city') {
    const portIds = reg.get(s.cityId)?.maritimePortIds ?? [];
    const near = portIds
      .map((id) => c.byId.port.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) => Math.hypot(a.location.lon - hit.lon, a.location.lat - hit.lat) - Math.hypot(b.location.lon - hit.lon, b.location.lat - hit.lat))[0];
    return near ? { scope: portScope(c, reg, near.portId), label: near.name } : null;
  }
  return null;
}

function onDblClick(hit: SurfacePointerHit | null, e: PointerEvent) {
  const surf = surface.value;
  if (!(surf instanceof Region3DScene) || !hit) return;
  const { x, y } = localXY(e, surf);
  if (overlay.value?.hitTest(x, y)) return;
  const region = registry.value?.regionAt(hit.lon, hit.lat, hit.country?.iso3 ?? null);
  if (region && region.regionId !== activeRegionId.value) return;
  const drill = drillTarget(hit);
  if (!drill) return;
  tooltip.value = null;
  nav.openScope(drill.scope);
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

function onClick(hit: SurfacePointerHit | null, e: PointerEvent) {
  const sc = surface.value;
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
    return;
  }
  if (sc instanceof Region3DScene && view.scope.level === 'region') sc.selectFeature(hit.country?.iso3 ?? null);
}

function openRegion(r: Region) {
  nav.openScope({ level: 'region', regionId: r.regionId });
}

function zoomToCluster(cl: VesselCluster) {
  const sc = surface.value;
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
  const sc = surface.value;
  if (!sc) return;
  const p = geoProject(sc, cl.center.lat, cl.center.lon);
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
function place(el: HTMLElement | undefined, sc: MapSurface, lat: number, lon: number, show: boolean, dx = 0, taken?: Rect[]) {
  if (!el) return;
  const p = geoProject(sc, lat, lon);
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
function placeBadge(el: HTMLElement | undefined, sc: MapSurface, lat: number, lon: number, taken: Rect[]) {
  if (!el) return;
  const p = geoProject(sc, lat, lon);
  el.style.visibility = p.visible ? 'visible' : 'hidden';
  if (!p.visible) return;
  const w = labelWidth(el) / 2;
  const hits = (dy: number) => taken.some((t) => p.x - w < t.x1 && p.x + w > t.x0 && p.y + dy - 12 < t.y1 && p.y + dy + 12 > t.y0);
  const dy = [0, 22, -22].find((d) => !hits(d)) ?? 0;
  taken.push({ x0: p.x - w, x1: p.x + w, y0: p.y + dy - 12, y1: p.y + dy + 12 });
  el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y + dy)}px) translate(-50%, -50%)`;
}

function onFrame(_now: number, dirty: boolean) {
  const sc = surface.value;
  if (!sc || !dirty) return;
  const ov = overlay.value;
  ov?.update();
  if (sc instanceof Region3DScene) updateCompass(sc);
  const distance = sc.equivalentDistance;
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
    sc = markRaw(new EarthScene(host.value, { quality: 'standard', reducedMotion: session.reducedMotion, managed: flags.spatialV2 }));
  } catch (e) {
    state.value = 'no-webgl';
    errorText.value = e instanceof Error ? e.message : String(e);
    return;
  }
  scene.value = sc;
  surface.value = sc;
  if (flags.spatialV2) {
    input = markRaw(new InputRouter(sc.renderer.domElement));
    sc.attachInput(input);
    const globe = new EarthGlobeScene(sc, projection, () => (nextFlight ? nextFlight(sc) : Promise.resolve(true)));
    director = markRaw(new SpatialDirector({ factory: (t) => (t.kind === 'earth' ? globe : createPlanarScene(t, sc)) }));
    director.on('frame', (_ctx, drew) => {
      if (drew) projection.update();
    });
    director.on('phase', (phase) => input?.setEnabled(phase === 'idle' || phase === 'flying' || phase === 'error'));
    director.on('active', (s) => setActiveSurface(s === globe ? sc : (s as Region3DScene)));
  }
  try {
    const world = await loadWorld();
    await sc.load(world);
  } catch (e) {
    state.value = 'error';
    errorText.value = e instanceof Error ? e.message : String(e);
    return;
  }
  const ov = markRaw(new MaritimeOverlay(sc, catalog.catalog?.vessels.length ?? 512));
  bindSurface(sc, ov);
  overlay.value = ov;
  unsubs = [
    sc.on('contextLost', () => {
      state.value = 'error';
      errorText.value = 'The WebGL context was lost (GPU reset or memory pressure).';
    }),
  ];
  sc.setRightInset(view.inspectorOpen && !view.sheetLayout ? inspectorInset() : 0);
  if (props.active) startLoop();
  if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') exposeTestAdapter(sc);
  state.value = 'ready';
  emit('ready', sc);
  if (director && catalog.registry) {
    terrainMaps();
    prefetchGeoDocs([...catalog.registry.entries.values()].filter((e) => e.type === 'region' || e.type === 'city').map((e) => e.geometryPath!));
  }
  await applyScope(view.scope, { initial: true });
}

/** Extruded region / country / city scene for a director target; it shares the globe's renderer and input. */
function createPlanarScene(t: SceneTarget, globe: EarthScene): SpatialScene {
  const entryId = t.sceneKey.slice(t.sceneKey.indexOf(':') + 1);
  const entry = catalog.registry?.get(entryId);
  if (!entry || !host.value) throw new Error(`No geography for ${t.sceneKey}`);
  const s = markRaw(
    new Region3DScene({
      entry,
      renderer: globe.renderer,
      host: host.value,
      projection,
      reducedMotion: session.reducedMotion,
      focus: (_target, _restore, surf) => (nextFlight ? nextFlight(surf) : Promise.resolve(true)),
      onBuilt: (surf) => bindSurface(surf, markRaw(new MaritimeOverlay(surf, catalog.catalog?.vessels.length ?? 512))),
      onDispose: unbindSurface,
    }),
  );
  if (input) s.attachInput(input);
  return s;
}

/** Every surface gets its own overlay fed from the same selectors; only the active one reacts to input. */
function bindSurface(surf: MapSurface, ov: MaritimeOverlay) {
  overlays.set(surf, ov);
  feedOverlay(ov);
  const whenActive =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      if (surface.value === surf) fn(...a);
    };
  surfaceUnsubs.set(surf, [
    surf.on('hover', whenActive(onHover)),
    surf.on('click', whenActive(onClick)),
    surf.on('dblclick', whenActive(onDblClick)),
    surf.on(
      'userInteract',
      whenActive(() => {
        tooltip.value = null;
        stackMenu.value = null;
      }),
    ),
    surf.onFrame(whenActive(onFrame)),
  ]);
}

function unbindSurface(surf: MapSurface) {
  surfaceUnsubs.get(surf)?.forEach((u) => u());
  surfaceUnsubs.delete(surf);
  overlays.get(surf)?.dispose();
  overlays.delete(surf);
  if (surface.value === surf) overlay.value = null;
}

function feedOverlay(ov: MaritimeOverlay) {
  ov.setLayers(effectiveLayers.value);
  ov.setRoutes(routeLines.value);
  ov.setPorts(ports.value);
  ov.setVessels(markers.value);
  ov.setHazards(hazards.value);
  if (effectiveLayers.value.traffic) ov.setDensity(density.value);
  ov.setClustered(clusters.value.clusteredIds);
  focusOverlay(ov);
}

function eachOverlay(fn: (ov: MaritimeOverlay) => void) {
  for (const ov of overlays.values()) fn(ov);
}

function setActiveSurface(surf: MapSurface) {
  surface.value = surf;
  overlay.value = overlays.get(surf) ?? null;
  stackMenu.value = null;
  tooltip.value = null;
  surf.setReducedMotion(session.reducedMotion);
  surf.setRightInset(view.inspectorOpen && !view.sheetLayout ? inspectorInset() : 0, { instant: true });
  planarInfo.value = surf instanceof Region3DScene ? { illustrative: surf.illustrativeBounds } : null;
  surf.invalidate();
}

/** North arrow and scale bar for extruded scenes (DOM, written per drawn frame). */
function updateCompass(surf: Region3DScene) {
  const c = surf.compass();
  if (!c) return;
  if (compassEl.value) compassEl.value.style.transform = `rotate(${c.northDeg.toFixed(1)}deg)`;
  const bar = scaleBar(c.metresPerPx);
  if (bar && scaleBarEl.value && scaleTextEl.value) {
    scaleBarEl.value.style.width = `${Math.round(bar.px)}px`;
    scaleTextEl.value.textContent = bar.label;
  }
}

/** Test-only scene adapter (dev and `--mode e2e` builds): page coordinates for map targets and renderer figures. */
function exposeTestAdapter(sc: EarthScene) {
  const pointOf = (lat: number, lon: number) => {
    const p = geoProject(surface.value ?? sc, lat, lon);
    const r = host.value?.getBoundingClientRect();
    return r ? { x: r.left + p.x, y: r.top + p.y, visible: p.visible } : null;
  };
  (window as unknown as { __portos?: unknown }).__portos = {
    scene: sc,
    get overlay() {
      return overlay.value;
    },
    surface: () => surface.value,
    surfaceKind: () => surface.value?.surfaceKind ?? null,
    compass: () => (surface.value instanceof Region3DScene ? surface.value.compass() : null),
    state: () => state.value,
    stats: () => (surface.value ?? sc).stats(),
    flying: () => !!surface.value?.flying || !!director?.busy,
    reducedMotion: () => (surface.value ?? sc).motionReduced,
    pointOf,
    vesselPoint: (id: string) => {
      const m = markers.value.find((v) => v.vesselId === id);
      return m ? pointOf(m.point.lat, m.point.lon) : null;
    },
    vesselsNear: (x: number, y: number, radius: number) =>
      markers.value
        .filter((m) => {
          const p = pointOf(m.point.lat, m.point.lon);
          return !!p?.visible && Math.hypot(p.x - x, p.y - y) <= radius;
        })
        .map((m) => m.vesselId),
    portPoint: (id: string) => {
      const m = ports.value.find((p) => p.portId === id);
      return m ? pointOf(m.point.lat, m.point.lon) : null;
    },
    loseContext: () => sc.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext(),
    spatialV2: flags.spatialV2,
    director: () => director?.state() ?? null,
    sceneCache: () => director?.cache.stats() ?? null,
  };
}

function inspectorInset() {
  return 408 + 24;
}

function focusOverlay(ov: MaritimeOverlay) {
  const c = catalog.catalog;
  const f = focus.value;
  if (!c || !f) return;
  ov.setFocus(f);
  const vesselId = f.vesselIds[0];
  ov.setTrack(vesselId ? trackUntil(c, vesselId, clock.timeMs) : null);
}

function syncFocus() {
  eachOverlay(focusOverlay);
}

watch(
  () => scopeKey(view.scope),
  () => applyScope(view.scope),
);
watch(
  () => [view.inspectorOpen, view.sheetLayout] as const,
  ([open, sheet]) => {
    surface.value?.setRightInset(open && !sheet ? inspectorInset() : 0);
    if (surface.value !== scene.value) scene.value?.setRightInset(open && !sheet ? inspectorInset() : 0, { instant: true });
    scene.value?.setIdleRotation(view.scope.level === 'earth' && !open);
  },
);
watch(
  () => session.reducedMotion,
  (v) => {
    scene.value?.setReducedMotion(v);
    surface.value?.setReducedMotion(v);
  },
);
/** Hidden behind the 2D map: stop rendering entirely; resume with a fresh frame. */
watch(
  () => props.active,
  (active) => {
    const sc = scene.value;
    if (!sc) return;
    stackMenu.value = null;
    tooltip.value = null;
    if (active) {
      sc.resize();
      if (surface.value !== sc) surface.value?.resize();
      startLoop();
    } else stopLoop();
  },
);
watch(markers, (m) => eachOverlay((ov) => ov.setVessels(m)));
watch(ports, (p) => eachOverlay((ov) => ov.setPorts(p)));
watch(hazardKey, () => eachOverlay((ov) => ov.setHazards(hazards.value)));
watch(densityKey, () => eachOverlay((ov) => ov.setDensity(density.value)));
watch(effectiveLayers, (l) => eachOverlay((ov) => ov.setLayers(l)));
watch(focus, syncFocus);
watch(
  () => (view.selection ? `${view.selection.kind}:${view.selection.id}` : ''),
  (key) => {
    if (key) setTimeout(ensureFocusVisible, 200);
  },
);
watch(
  () => clusters.value,
  (cl) => eachOverlay((ov) => ov.setClustered(cl.clusteredIds)),
);

function retry() {
  dispose();
  state.value = 'loading';
  init();
}

function startLoop() {
  if (director) director.start();
  else scene.value?.start();
}

function stopLoop() {
  if (director) director.stop();
  else scene.value?.stop();
}

/** Managed mode: the director (not the EarthScene) pauses rendering in hidden tabs. */
function onVisibility() {
  if (!director || !props.active) return;
  if (document.hidden) director.stop();
  else {
    surface.value?.invalidate();
    director.start();
  }
}

function dispose() {
  unsubs.forEach((u) => u());
  unsubs = [];
  director?.dispose();
  director = null;
  input?.dispose();
  input = null;
  nextFlight = null;
  projection.setProjector(null);
  for (const surf of [...overlays.keys()]) unbindSurface(surf);
  overlay.value = null;
  surface.value = null;
  planarInfo.value = null;
  scene.value?.dispose();
  scene.value = null;
  stack.clear();
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility);
  init();
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility);
  dispose();
});

defineExpose({ resetCamera, scene, surface, overlay });
</script>

<template>
  <div class="earth" :inert="!active || undefined" :aria-hidden="!active || undefined">
    <div ref="host" class="earth__host" />
    <div v-if="state === 'ready'" v-show="active" class="earth__labels">
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
    <div v-if="state === 'ready' && planarInfo" v-show="active" class="planar-hud" data-testid="planar-hud">
      <span v-if="planarInfo.illustrative" class="planar-hud__chip" data-testid="illustrative-bounds">Illustrative operational bounds · not a border</span>
      <div class="planar-hud__row">
        <span class="planar-hud__north" role="img" aria-label="North arrow" data-testid="north-arrow">
          <svg ref="compassEl" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M12 2 17 20 12 16 7 20Z" fill="currentColor" />
          </svg>
          <span class="planar-hud__n">N</span>
        </span>
        <span class="planar-hud__scale" data-testid="scale-bar">
          <span ref="scaleBarEl" class="planar-hud__bar" />
          <span ref="scaleTextEl" class="planar-hud__label mono" />
        </span>
      </div>
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
.planar-hud {
  position: absolute;
  left: var(--map-control-gap);
  bottom: 36px;
  z-index: 15;
  display: grid;
  justify-items: start;
  gap: 6px;
  pointer-events: none;
}
.planar-hud__chip {
  padding: 2px 8px;
  border: 1px dashed rgba(166, 169, 180, 0.7);
  border-radius: var(--radius-chip);
  background: rgba(7, 26, 39, 0.78);
  color: rgba(247, 250, 252, 0.86);
  font-size: var(--text-11);
  line-height: 16px;
}
.planar-hud__row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 4px 8px;
  border-radius: var(--radius-chip);
  background: rgba(7, 26, 39, 0.72);
  color: rgba(247, 250, 252, 0.86);
}
.planar-hud__north {
  display: grid;
  justify-items: center;
  color: #e66a2d;
}
.planar-hud__north svg {
  transform-origin: 50% 50%;
}
.planar-hud__n {
  font-size: 10px;
  font-weight: 600;
  line-height: 10px;
  color: rgba(247, 250, 252, 0.86);
}
.planar-hud__scale {
  display: grid;
  gap: 2px;
  padding-bottom: 2px;
}
.planar-hud__bar {
  display: block;
  height: 5px;
  min-width: 20px;
  border: 1.5px solid rgba(247, 250, 252, 0.86);
  border-top: 0;
}
.planar-hud__label {
  font-size: var(--text-11);
  line-height: 14px;
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

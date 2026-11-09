<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapGeoJSONFeature, MapMouseEvent, PointLike } from 'maplibre-gl';
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { formatHours, formatLocal, formatPercent, formatUtc } from '@/core/format';
import { LAYERS, type LayerId } from '@/core/layers';
import { scopeKey } from '@/core/scope';
import type { Bounds } from '@/core/types';
import { trackUntil } from '@/engines/tracks';
import { useNavigation } from '@/router/useRouteSync';
import { buildHazards, buildPortMarkers, buildRouteLines, describeVesselMarker, focusForSelection, TONE_LABEL, TONE_RANK, type MarkerTone } from '@/selectors/mapLayers';
import { BERTH_STATUS_LABEL, QUEUE_STATUS_LABEL } from '@/selectors/port';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSessionStore } from '@/stores/session';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { mapColors, statusStyle } from '@/styles/tokens';
import StatusChip from '@/components/ui/StatusChip.vue';
import { cssHex, markerColors } from '../theme';
import { clampZoom, ZOOM_RANGE, type MapView2D } from '../viewport';
import { basemapConfig, BASEMAP_COLORS, portosBasemapStyle } from './basemapStyle';
import { anchorageFeatures, berthFeatures, hazardFeatures, routeFeatures, trackFeature, vesselFeatures } from './features';
import { buildMapIcons } from './icons';

const props = defineProps<{ initialView: MapView2D | null; insetLeft: number; insetRight: number }>();
const emit = defineEmits<{ ready: [] }>();

const catalog = useCatalogStore();
const snapStore = useSnapshotStore();
const view = useViewStore();
const clock = useClockStore();
const session = useSessionStore();
const nav = useNavigation();

const host = ref<HTMLDivElement | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const errorText = ref('');
const cfg = basemapConfig();
const basemap = ref<'loading' | 'ready' | 'unavailable' | 'disabled'>(cfg.kind === 'none' ? 'disabled' : 'loading');
const map = shallowRef<MlMap | null>(null);
let basemapTimer = 0;
let moveRaf = 0;
let clusterKey = '';

type CardKind = 'berth' | 'anchorage' | 'terminal';
const card = ref<{ kind: CardKind; id: string; x: number; y: number } | null>(null);
const cardEl = ref<HTMLElement | null>(null);
const tooltip = ref<{ x: number; y: number; title: string; lines: string[] } | null>(null);
const clusterBadges = ref<{ id: number; count: number; lon: number; lat: number; tone: MarkerTone }[]>([]);
const labelEls = new Map<string, HTMLElement>();

const c = computed(() => catalog.catalog);
const vm = computed(() => snapStore.portView);
const markers = computed(() => snapStore.mapMarkers);
const markerById = computed(() => new Map(markers.value.map((m) => [m.vesselId, m])));
const routeLines = computed(() => (c.value ? markRaw(buildRouteLines(c.value)) : []));
const hazards = computed(() => (c.value && snapStore.snapshot ? markRaw(buildHazards(c.value, snapStore.snapshot)) : []));
const focus = computed(() => (c.value && snapStore.snapshot ? markRaw(focusForSelection(c.value, snapStore.snapshot, view.selection)) : null));
const selectedVesselId = computed(() => focus.value?.vesselIds[0] ?? null);
const selectedRow = computed(() => vm.value?.queue.find((q) => q.vesselId === selectedVesselId.value) ?? null);
const highlightBerthId = computed(() => {
  const id = selectedVesselId.value;
  if (!id || !vm.value) return null;
  return selectedRow.value?.berthId ?? vm.value.berths.find((b) => b.occupantVesselId === id || b.scheduledVesselId === id)?.berthId ?? null;
});
const highlightAnchorageId = computed(() => {
  const id = selectedVesselId.value;
  return id ? (vm.value?.anchorages.find((a) => a.vesselIds.includes(id))?.anchorageId ?? null) : null;
});

const on = (id: LayerId) => view.layers[id] && LAYERS.find((l) => l.id === id)!.scopes.includes(view.scope.level);
const layersOn = computed(() => ({
  fleet: on('fleet'),
  ambient: on('ambient'),
  ports: on('ports'),
  routes: on('routes'),
  weather: on('weather'),
  incidents: on('incidents'),
  traffic: on('traffic'),
  anchorage: on('anchorage'),
  berths: on('berths'),
}));

const regionPorts = computed(() => {
  const cat = c.value;
  if (!cat || view.scope.level !== 'region' || !layersOn.value.ports || !snapStore.snapshot) return [];
  const rid = view.scope.regionId;
  return buildPortMarkers(cat, snapStore.snapshot).filter((p) => p.regionId === rid);
});

const terminals = computed(() => (layersOn.value.berths ? (vm.value?.terminals ?? []) : []));
const anchorages = computed(() => (layersOn.value.anchorage ? (vm.value?.anchorages ?? []) : []));

const pinned = computed(() => {
  const s = new Set(focus.value?.vesselIds ?? []);
  if (layersOn.value.incidents) for (const m of markers.value) if (m.tone === 'incident') s.add(m.vesselId);
  return s;
});

const reduced = () => session.reducedMotion;
const accent = mapColors.accent;
const RANK_TONE = Object.fromEntries(Object.entries(TONE_RANK).map(([t, r]) => [r, t])) as Record<number, MarkerTone>;
const VESSEL_LAYERS = ['vessels-pinned', 'vessels'];
const sizeBy = (k: number): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], 3, 0.55 * k, 9, 0.8 * k, 13, 1.05 * k, 16, 1.35 * k];

function padding() {
  return { top: 96, bottom: 48, left: props.insetLeft + 24, right: props.insetRight + 72 };
}

function scopeBounds(): Bounds | null {
  const s = view.scope;
  if (s.level === 'port') return vm.value?.bounds ?? null;
  if (s.level === 'region') return c.value?.byId.region.get(s.regionId)?.bounds ?? null;
  return null;
}

function fitScope(animate: boolean) {
  const m = map.value;
  const b = scopeBounds();
  if (!m || !b || view.scope.level === 'earth') return;
  const [, maxZ] = ZOOM_RANGE[view.scope.level];
  m.fitBounds(
    [
      [b.west, b.south],
      [b.east, b.north],
    ],
    { padding: 40, maxZoom: Math.min(maxZ, view.scope.level === 'port' ? 13.2 : maxZ), duration: animate && !reduced() ? 900 : 0 },
  );
}

/** Current 2D view, for the 2D → 3D hand-off. */
function getView(): MapView2D | null {
  const m = map.value;
  if (!m) return null;
  const ctr = m.getCenter();
  return { center: { lat: ctr.lat, lon: ctr.lng }, zoom: m.getZoom() };
}

function resetView() {
  card.value = null;
  fitScope(true);
}

function source(id: string) {
  return map.value?.getSource(id) as GeoJSONSource | undefined;
}

function syncVessels() {
  const l = layersOn.value;
  const { clustered, pinned: pin } = vesselFeatures(markers.value, (m) => (m.fleet === 'own' ? l.fleet : l.ambient), pinned.value);
  source('vessels')?.setData(clustered);
  source('vessels-pinned')?.setData(pin);
  source('traffic')?.setData({ type: 'FeatureCollection', features: [...clustered.features, ...pin.features] });
}

function syncFocus() {
  const cat = c.value;
  const f = focus.value;
  const id = selectedVesselId.value;
  const m = id ? markerById.value.get(id) : undefined;
  source('selection')?.setData({ type: 'FeatureCollection', features: m ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [m.point.lon, m.point.lat] }, properties: {} }] : [] });
  source('track')?.setData(trackFeature(cat && id ? trackUntil(cat, id, clock.timeMs) : []));
  source('routes')?.setData(routeFeatures(routeLines.value, f?.routeIds ?? []));
}

function syncPort() {
  const p = vm.value;
  source('anchorages')?.setData(anchorageFeatures(p?.anchorages ?? [], highlightAnchorageId.value));
  source('berths')?.setData(berthFeatures(p?.berths ?? [], highlightBerthId.value));
}

function setVis(ids: string[], visible: boolean) {
  const m = map.value;
  if (!m) return;
  for (const id of ids) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
}

function syncLayerVisibility() {
  const l = layersOn.value;
  setVis(['hazard-fill', 'hazard-line-active', 'hazard-line-upcoming'], l.weather);
  setVis(['anchorage-fill', 'anchorage-line'], l.anchorage);
  setVis(['berths', 'berth-halo'], l.berths);
  setVis(['routes-line', 'routes-focus'], l.routes);
  setVis(['traffic-heat'], l.traffic);
  setVis(['vessels-incident-ring'], l.incidents);
}

function addOverlays() {
  const m = map.value;
  if (!m || m.getSource('vessels')) return;
  for (const icon of buildMapIcons()) if (!m.hasImage(icon.name)) m.addImage(icon.name, icon.image, { pixelRatio: icon.pixelRatio });
  const empty = { type: 'FeatureCollection' as const, features: [] };
  m.addSource('hazards', { type: 'geojson', data: hazardFeatures(hazards.value) });
  m.addSource('anchorages', { type: 'geojson', data: empty });
  m.addSource('routes', { type: 'geojson', data: empty });
  m.addSource('track', { type: 'geojson', data: empty });
  m.addSource('berths', { type: 'geojson', data: empty });
  m.addSource('traffic', { type: 'geojson', data: empty });
  m.addSource('vessels', { type: 'geojson', data: empty, cluster: true, clusterRadius: 44, clusterMaxZoom: 10, clusterProperties: { maxRank: ['max', ['get', 'rank']] } });
  m.addSource('vessels-pinned', { type: 'geojson', data: empty });
  m.addSource('selection', { type: 'geojson', data: empty });

  const sev = (moderate: string, high: string, severe: string): ExpressionSpecification => ['match', ['get', 'severity'], 'severe', severe, 'high', high, moderate];
  const hz = sev(cssHex(markerColors.hazardModerate), cssHex(markerColors.hazardHigh), cssHex(markerColors.hazardSevere));
  m.addLayer({ id: 'traffic-heat', type: 'heatmap', source: 'traffic', maxzoom: 11, paint: {
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 10, 9, 26],
    'heatmap-intensity': 0.6,
    'heatmap-opacity': 0.75,
    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.3, 'rgba(46,101,139,0.35)', 0.7, 'rgba(130,184,201,0.5)', 1, 'rgba(201,138,79,0.6)'],
  } });
  m.addLayer({ id: 'hazard-fill', type: 'fill', source: 'hazards', filter: ['==', ['get', 'phase'], 'active'], paint: { 'fill-color': hz, 'fill-opacity': 0.16 } });
  m.addLayer({ id: 'hazard-line-active', type: 'line', source: 'hazards', filter: ['==', ['get', 'phase'], 'active'], paint: { 'line-color': hz, 'line-width': 1.4, 'line-opacity': 0.8 } });
  m.addLayer({ id: 'hazard-line-upcoming', type: 'line', source: 'hazards', filter: ['!=', ['get', 'phase'], 'active'], paint: { 'line-color': hz, 'line-width': 1.2, 'line-dasharray': [3, 3], 'line-opacity': 0.7 } });
  m.addLayer({ id: 'anchorage-fill', type: 'fill', source: 'anchorages', paint: { 'fill-color': ['case', ['get', 'crowded'], 'rgba(201,138,79,0.16)', 'rgba(46,101,139,0.26)'] } });
  m.addLayer({ id: 'anchorage-line', type: 'line', source: 'anchorages', paint: {
    'line-color': ['case', ['get', 'highlight'], mapColors.routeSelected, ['get', 'crowded'], '#c98a4f', mapColors.routeBase],
    'line-width': ['case', ['get', 'highlight'], 2.4, 1.4],
    'line-dasharray': [4, 2],
  } });
  m.addLayer({ id: 'routes-line', type: 'line', source: 'routes', filter: ['!', ['get', 'focus']], layout: { 'line-cap': 'round' }, paint: { 'line-color': mapColors.routeBase, 'line-width': 1.2, 'line-opacity': 0.45 } });
  m.addLayer({ id: 'routes-focus', type: 'line', source: 'routes', filter: ['get', 'focus'], layout: { 'line-cap': 'round' }, paint: { 'line-color': mapColors.routeSelected, 'line-width': 3 } });
  m.addLayer({ id: 'track-line', type: 'line', source: 'track', paint: { 'line-color': cssHex(markerColors.track), 'line-width': 1.6, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.85 } });
  m.addLayer({ id: 'berth-halo', type: 'circle', source: 'berths', filter: ['get', 'highlight'], paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': accent, 'circle-stroke-width': 2.2 } });
  m.addLayer({ id: 'berths', type: 'symbol', source: 'berths', minzoom: 10.5, layout: { 'icon-image': ['get', 'icon'], 'icon-size': sizeBy(1), 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
  const vesselLayout = (k: number) => ({
    'icon-image': ['get', 'icon'] as ExpressionSpecification,
    'icon-size': sizeBy(k),
    'icon-rotate': ['get', 'rotate'] as ExpressionSpecification,
    'icon-rotation-alignment': 'map' as const,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    'symbol-sort-key': ['get', 'rank'] as ExpressionSpecification,
  });
  m.addLayer({ id: 'vessel-clusters', type: 'circle', source: 'vessels', filter: ['has', 'point_count'], paint: { 'circle-radius': 14, 'circle-opacity': 0 } });
  m.addLayer({ id: 'vessels', type: 'symbol', source: 'vessels', filter: ['!', ['has', 'point_count']], layout: vesselLayout(1) });
  m.addLayer({ id: 'vessels-incident-ring', type: 'circle', source: 'vessels-pinned', filter: ['get', 'incident'], paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 8, 16, 16],
    'circle-color': 'rgba(0,0,0,0)',
    'circle-stroke-color': cssHex(markerColors.incident),
    'circle-stroke-width': 1.5,
  } });
  m.addLayer({ id: 'vessels-pinned', type: 'symbol', source: 'vessels-pinned', layout: vesselLayout(1.3) });
  m.addLayer({ id: 'selection-halo', type: 'circle', source: 'selection', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11, 16, 20],
    'circle-color': 'rgba(233,103,34,0.12)',
    'circle-stroke-color': accent,
    'circle-stroke-width': 2.5,
  } });

  syncVessels();
  syncFocus();
  syncPort();
  syncLayerVisibility();
}

function onBasemapError() {
  if (basemap.value === 'ready' || basemap.value === 'disabled') return;
  basemap.value = 'unavailable';
  map.value?.setPaintProperty('bm-background', 'background-color', BASEMAP_COLORS.water);
}

function retryBasemap() {
  const m = map.value;
  if (!m || cfg.kind === 'none') return;
  basemap.value = 'loading';
  armBasemapTimer();
  m.setStyle(cfg.kind === 'custom' ? cfg.styleUrl! : portosBasemapStyle(cfg), { diff: false });
}

function armBasemapTimer() {
  clearTimeout(basemapTimer);
  basemapTimer = window.setTimeout(() => {
    if (basemap.value === 'loading') onBasemapError();
  }, 12000);
}

/** Topmost thing under the pointer: vessels beat berths beat zones beat weather beat corridors. */
function pick(pt: { x: number; y: number }): { kind: 'vessel' | 'berth' | 'anchorage' | 'hazard' | 'route'; id: string } | null {
  const m = map.value;
  if (!m) return null;
  const box = (r: number): [PointLike, PointLike] => [
    [pt.x - r, pt.y - r],
    [pt.x + r, pt.y + r],
  ];
  const has = (ids: string[]) => ids.filter((id) => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none');
  const first = (fs: MapGeoJSONFeature[]) => fs.find((f) => f.properties?.id);
  const v = first(m.queryRenderedFeatures(box(8), { layers: has(VESSEL_LAYERS) }));
  if (v) return { kind: 'vessel', id: v.properties.id as string };
  const b = first(m.queryRenderedFeatures(box(9), { layers: has(['berths']) }));
  if (b) return { kind: 'berth', id: b.properties.id as string };
  const a = first(m.queryRenderedFeatures([pt.x, pt.y], { layers: has(['anchorage-fill']) }));
  if (a) return { kind: 'anchorage', id: a.properties.id as string };
  const h = first(m.queryRenderedFeatures([pt.x, pt.y], { layers: has(['hazard-fill']) }));
  if (h) return { kind: 'hazard', id: h.properties.id as string };
  const r = first(m.queryRenderedFeatures(box(4), { layers: has(['routes-focus', 'routes-line']) }));
  if (r) return { kind: 'route', id: r.properties.id as string };
  return null;
}

function setTooltip(x: number, y: number, title: string, lines: string[]) {
  const w = host.value?.clientWidth ?? 1200;
  const h = host.value?.clientHeight ?? 800;
  tooltip.value = { x: Math.min(x + 14, w - 300), y: Math.min(y + 14, h - 110), title, lines };
}

function onHover(e: MapMouseEvent) {
  const m = map.value;
  const hit = pick(e.point);
  if (m) m.getCanvas().style.cursor = hit ? 'pointer' : '';
  if (!hit) {
    tooltip.value = null;
    return;
  }
  const p = vm.value;
  if (hit.kind === 'vessel') {
    const mk = markerById.value.get(hit.id);
    if (!mk) return;
    const d = describeVesselMarker(mk);
    const row = p?.queue.find((q) => q.vesselId === hit.id);
    const extra = row ? [`${QUEUE_STATUS_LABEL[row.status]} · waiting ${formatHours(row.elapsedWaitHours)}${row.berthConfirmed ? '' : ' · berth unconfirmed'}`] : [];
    setTooltip(e.point.x, e.point.y, d.title, [...d.lines, ...extra]);
  } else if (hit.kind === 'berth') {
    const b = p?.berths.find((x) => x.berthId === hit.id);
    if (b) setTooltip(e.point.x, e.point.y, b.name, [`${BERTH_STATUS_LABEL[b.status]}${b.occupantName ? ` · ${b.occupantName}` : ''}`, 'Click for berth details']);
  } else if (hit.kind === 'anchorage') {
    const a = p?.anchorages.find((x) => x.anchorageId === hit.id);
    if (a) setTooltip(e.point.x, e.point.y, a.name, [`${a.vesselIds.length} vessels in zone · ${a.queueCount} in queue`, 'Demo zone · not for navigation']);
  } else if (hit.kind === 'hazard') {
    const hzd = hazards.value.find((x) => x.hazardId === hit.id);
    if (hzd) setTooltip(e.point.x, e.point.y, `${hzd.type.replace(/_/g, ' ')} · ${hzd.severity}`, [`${hzd.hazardId} · scenario forecast (${hzd.confidence} confidence)`, `Valid ${formatUtc(hzd.validFromUtc)} – ${formatUtc(hzd.validToUtc)}`]);
  } else {
    const r = routeLines.value.find((x) => x.routeId === hit.id);
    if (r) setTooltip(e.point.x, e.point.y, r.corridorName, [`${r.voyageCount} voyages on corridor`, 'Synthetic corridor · not a navigational route']);
  }
}

function anchorFor(kind: CardKind, id: string) {
  const p = vm.value;
  if (!p) return null;
  if (kind === 'berth') return p.berths.find((b) => b.berthId === id)?.location ?? null;
  if (kind === 'terminal') return p.terminals.find((t) => t.terminalId === id)?.location ?? null;
  const a = p.anchorages.find((x) => x.anchorageId === id);
  if (!a) return null;
  const lon = a.polygon.reduce((s, q) => s + q.lon, 0) / a.polygon.length;
  const lat = a.polygon.reduce((s, q) => s + q.lat, 0) / a.polygon.length;
  return { lon, lat };
}

function openCard(kind: CardKind, id: string) {
  tooltip.value = null;
  card.value = { kind, id, x: 0, y: 0 };
  positionCard();
  nextTick(() => {
    positionCard();
    cardEl.value?.querySelector<HTMLElement>('button, a')?.focus();
  });
}

function closeCard() {
  card.value = null;
}

function positionCard() {
  const m = map.value;
  const cd = card.value;
  if (!m || !cd) return;
  const at = anchorFor(cd.kind, cd.id);
  if (!at) return;
  const p = m.project([at.lon, at.lat]);
  const w = host.value?.clientWidth ?? 1200;
  const h = host.value?.clientHeight ?? 800;
  const el = cardEl.value;
  const cw = el?.offsetWidth ?? 300;
  const ch = el?.offsetHeight ?? 200;
  const maxX = w - props.insetRight - cw - 12;
  cd.x = Math.max(props.insetLeft + 12, Math.min(p.x + 16, maxX));
  cd.y = Math.max(72, Math.min(p.y - 24, h - ch - 48));
}

function onClick(e: MapMouseEvent) {
  const hit = pick(e.point);
  tooltip.value = null;
  if (!hit) {
    card.value = null;
    return;
  }
  if (hit.kind === 'vessel') {
    card.value = null;
    nav.openEntity({ kind: 'vessel', id: hit.id });
  } else if (hit.kind === 'berth' || hit.kind === 'anchorage') openCard(hit.kind, hit.id);
  else if (hit.kind === 'hazard') nav.openEntity({ kind: 'weather', id: hit.id });
  else nav.openEntity({ kind: 'route', id: hit.id });
}

function openVessel(id: string) {
  card.value = null;
  nav.openEntity({ kind: 'vessel', id });
}

function openPort(portId: string) {
  const p = c.value?.byId.port.get(portId);
  if (p) nav.openScope({ level: 'port', regionId: p.regionId, portId });
}

async function zoomCluster(id: number, lon: number, lat: number) {
  const m = map.value;
  const src = source('vessels');
  if (!m || !src) return;
  const z = await src.getClusterExpansionZoom(id);
  m.easeTo({ center: [lon, lat], zoom: Math.min(z + 0.5, m.getMaxZoom()), duration: reduced() ? 0 : 600 });
}

function refreshClusters() {
  const m = map.value;
  if (!m || !m.getLayer('vessel-clusters')) return;
  const seen = new Map<number, { id: number; count: number; lon: number; lat: number; tone: MarkerTone }>();
  for (const f of m.queryRenderedFeatures({ layers: ['vessel-clusters'] })) {
    const p = f.properties;
    if (!p?.cluster || f.geometry.type !== 'Point') continue;
    const id = p.cluster_id as number;
    if (seen.has(id)) continue;
    const [lon, lat] = f.geometry.coordinates as [number, number];
    seen.set(id, { id, count: p.point_count as number, lon, lat, tone: RANK_TONE[Math.min(4, Math.floor(p.maxRank as number))] ?? 'ambient' });
  }
  const next = [...seen.values()];
  const key = next.map((b) => `${b.id}:${b.count}`).join('|');
  if (key !== clusterKey) {
    clusterKey = key;
    clusterBadges.value = next;
  }
  nextTick(placeLabels);
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Offset = (w: number, h: number) => [number, number];
const CENTER: Offset[] = [(w, h) => [-w / 2, -h / 2], (w, h) => [-w / 2, -h / 2 + 24], (w, h) => [-w / 2, -h / 2 - 24]];
const BELOW: Offset[] = [(w) => [-w / 2, 6]];
const CORNERS: Offset[] = [() => [10, 10], (_w, h) => [10, -10 - h], (w) => [-10 - w, 10], (w, h) => [-10 - w, -10 - h]];
const PORT_DOT: Offset[] = [() => [-6, -9]];

/** Place a DOM label at a map point, trying offsets in order; `force` keeps it even when every offset collides. */
function placeEl(key: string, lon: number, lat: number, offsets: Offset[], taken: Rect[], opts: { show?: boolean; force?: boolean } = {}) {
  const m = map.value;
  const el = labelEls.get(key);
  if (!m || !el) return;
  const p = m.project([lon, lat]);
  const W = host.value?.clientWidth ?? 0;
  const H = host.value?.clientHeight ?? 0;
  let visible = (opts.show ?? true) && p.x > -40 && p.y > -40 && p.x < W + 40 && p.y < H + 40;
  let at: [number, number] | null = null;
  if (visible) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    for (const o of offsets) {
      const [dx, dy] = o(w, h);
      const r = { x0: p.x + dx, y0: p.y + dy, x1: p.x + dx + w, y1: p.y + dy + h };
      if (!taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) {
        at = [r.x0, r.y0];
        taken.push(r);
        break;
      }
    }
    if (!at && opts.force) {
      const [dx, dy] = offsets[0]!(w, h);
      at = [p.x + dx, p.y + dy];
    }
    visible = !!at;
  }
  el.style.visibility = visible ? 'visible' : 'hidden';
  if (at) el.style.transform = `translate(${Math.round(at[0])}px, ${Math.round(at[1])}px)`;
}

function placeLabels() {
  const m = map.value;
  if (!m) return;
  const z = m.getZoom();
  const W = host.value?.clientWidth ?? 0;
  const H = host.value?.clientHeight ?? 0;
  const taken: Rect[] = [];
  if (props.insetLeft) taken.push({ x0: -1e4, y0: -1e4, x1: props.insetLeft, y1: H + 1e4 });
  if (props.insetRight) taken.push({ x0: W - props.insetRight, y0: -1e4, x1: W + 1e4, y1: H + 1e4 });
  for (const p of regionPorts.value) placeEl(`p:${p.portId}`, p.point.lon, p.point.lat, PORT_DOT, taken);
  for (const a of anchorages.value) {
    const bottom = a.polygon.reduce((lo, q) => Math.min(lo, q.lat), 90);
    const at = anchorFor('anchorage', a.anchorageId);
    if (at) placeEl(`a:${a.anchorageId}`, at.lon, bottom, BELOW, taken, { show: z >= 10, force: true });
  }
  for (const b of clusterBadges.value) placeEl(`c:${b.id}`, b.lon, b.lat, CENTER, taken, { force: true });
  for (const t of terminals.value) placeEl(`t:${t.terminalId}`, t.location.lon, t.location.lat, CORNERS, taken, { show: z >= 10.5 });
  positionCard();
}

function onMove() {
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0;
    placeLabels();
  });
}

function refSetter(key: string) {
  return (el: unknown) => {
    if (el instanceof HTMLElement) labelEls.set(key, el);
    else labelEls.delete(key);
  };
}

/** Keep the selected vessel on screen without changing the user's zoom. */
function ensureSelectionVisible() {
  const m = map.value;
  const id = selectedVesselId.value;
  const mk = id ? markerById.value.get(id) : undefined;
  if (!m || !mk) return;
  const p = m.project([mk.point.lon, mk.point.lat]);
  const pad = padding();
  const w = m.getContainer().clientWidth;
  const h = m.getContainer().clientHeight;
  if (p.x > pad.left && p.x < w - pad.right && p.y > pad.top && p.y < h - pad.bottom) return;
  m.easeTo({ center: [mk.point.lon, mk.point.lat], duration: reduced() ? 0 : 600 });
}

async function init() {
  if (!host.value) return;
  let ml: typeof import('maplibre-gl');
  try {
    ml = await import('maplibre-gl');
  } catch (e) {
    state.value = 'error';
    errorText.value = `The 2D map library could not be loaded (${e instanceof Error ? e.message : String(e)}).`;
    return;
  }
  const s = view.scope;
  if (s.level === 'earth') return;
  const [minZ, maxZ] = ZOOM_RANGE[s.level];
  const iv = props.initialView;
  let m: MlMap;
  try {
    m = markRaw(
      new ml.Map({
        container: host.value,
        style: cfg.kind === 'custom' ? cfg.styleUrl! : portosBasemapStyle(cfg),
        center: iv ? [iv.center.lon, iv.center.lat] : [c.value!.byId.port.get(s.level === 'port' ? s.portId : '')?.location.lon ?? 103.8, 1.27],
        zoom: iv ? clampZoom(s, iv.zoom) : minZ,
        minZoom: ZOOM_RANGE.region[0],
        maxZoom: maxZ,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        fadeDuration: 0,
      }),
    );
  } catch (e) {
    state.value = 'error';
    errorText.value = e instanceof Error ? e.message : 'WebGL is not available in this browser.';
    return;
  }
  m.touchZoomRotate.disableRotation();
  m.keyboard.disableRotation();
  map.value = m;
  m.setPadding(padding());
  if (cfg.kind !== 'none') armBasemapTimer();
  m.on('style.load', addOverlays);
  m.on('error', (ev) => {
    const sid = (ev as { sourceId?: string }).sourceId;
    if (sid === 'basemap' || (cfg.kind === 'custom' && !m.isStyleLoaded())) onBasemapError();
  });
  m.on('sourcedata', (ev) => {
    if (ev.sourceId === 'basemap' && (ev as { tile?: unknown }).tile && basemap.value !== 'ready') {
      basemap.value = 'ready';
      clearTimeout(basemapTimer);
    }
  });
  m.on('idle', refreshClusters);
  m.on('webglcontextlost', () => {
    state.value = 'error';
    errorText.value = 'The WebGL context was lost (GPU reset or memory pressure).';
  });
  m.on('mousemove', onHover);
  m.on('mouseout', () => (tooltip.value = null));
  m.on('click', onClick);
  m.on('move', onMove);
  m.on('moveend', refreshClusters);
  m.on('dragstart', () => {
    tooltip.value = null;
  });
  m.once('load', () => {
    state.value = 'ready';
    if (!iv) fitScope(false);
    nextTick(() => {
      placeLabels();
      ensureSelectionVisible();
    });
    emit('ready');
  });
  if (import.meta.env.DEV) (window as unknown as { __portos2d?: unknown }).__portos2d = m;
}

watch([markers, pinned, layersOn], syncVessels);
watch(focus, syncFocus);
watch([vm, highlightAnchorageId, highlightBerthId], syncPort);
watch(
  () => hazards.value.map((h) => `${h.hazardId}:${h.phase}`).join('|'),
  () => source('hazards')?.setData(hazardFeatures(hazards.value)),
);
watch(layersOn, () => {
  syncLayerVisibility();
  nextTick(placeLabels);
});
watch([terminals, anchorages, regionPorts], () => nextTick(placeLabels));
watch(
  () => scopeKey(view.scope),
  () => {
    card.value = null;
    tooltip.value = null;
    const s = view.scope;
    if (s.level !== 'earth') map.value?.setMaxZoom(ZOOM_RANGE[s.level][1]);
    nextTick(() => fitScope(true));
  },
);
watch(
  () => (view.selection ? `${view.selection.kind}:${view.selection.id}` : ''),
  (k) => {
    if (k) setTimeout(ensureSelectionVisible, 120);
  },
);
watch(
  () => [props.insetLeft, props.insetRight],
  () => {
    map.value?.setPadding(padding());
    nextTick(placeLabels);
  },
);

onMounted(init);
onBeforeUnmount(() => {
  clearTimeout(basemapTimer);
  cancelAnimationFrame(moveRaf);
  map.value?.remove();
  map.value = null;
  if (import.meta.env.DEV) delete (window as unknown as { __portos2d?: unknown }).__portos2d;
});

const cardBerth = computed(() => (card.value?.kind === 'berth' ? (vm.value?.berths.find((b) => b.berthId === card.value!.id) ?? null) : null));
const cardTerminal = computed(() => (card.value?.kind === 'terminal' ? (vm.value?.terminals.find((t) => t.terminalId === card.value!.id) ?? null) : null));
const cardAnchorage = computed(() => (card.value?.kind === 'anchorage' ? (vm.value?.anchorages.find((a) => a.anchorageId === card.value!.id) ?? null) : null));
const anchorageRows = computed(() => {
  const a = cardAnchorage.value;
  if (!a || !vm.value) return [];
  const inside = new Set(a.vesselIds);
  return vm.value.queue.filter((q) => inside.has(q.vesselId)).slice(0, 5);
});
const tz = computed(() => vm.value?.localTimeZone ?? 'UTC');
/** "Singapore Demo Terminal West" → "Demo Terminal West": the port is already in the breadcrumb. */
function shortName(name: string) {
  const prefix = `${vm.value?.port.name ?? ''} `;
  return prefix.trim() && name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

defineExpose({ getView, resetView, map });
</script>

<template>
  <div class="m2d" data-testid="port-map-2d">
    <div ref="host" class="m2d__host" role="region" aria-label="2D port map. Arrow keys pan, plus and minus zoom." />
    <div v-if="state === 'ready'" class="m2d__labels">
      <button
        v-for="b in clusterBadges"
        :key="`c${b.id}`"
        :ref="refSetter(`c:${b.id}`)"
        type="button"
        class="m2d-cluster"
        :class="`m2d-cluster--${b.tone}`"
        :aria-label="`${b.count} vessels; worst state ${TONE_LABEL[b.tone]}. Zoom in`"
        data-testid="vessel-cluster-2d"
        @click="zoomCluster(b.id, b.lon, b.lat)"
      >
        {{ b.count }}
      </button>
      <button
        v-for="t in terminals"
        :key="t.terminalId"
        :ref="refSetter(`t:${t.terminalId}`)"
        type="button"
        class="m2d-terminal"
        :aria-label="`Terminal ${t.name}: ${t.occupied} of ${t.berths.length} berths occupied`"
        :data-testid="`terminal-${t.terminalId}`"
        @click="openCard('terminal', t.terminalId)"
      >
        <strong>{{ shortName(t.name) }}</strong>
        <span>{{ t.occupied }}/{{ t.berths.length }} occupied<template v-if="t.unknown"> · {{ t.unknown }} unknown</template></span>
      </button>
      <button
        v-for="a in anchorages"
        :key="a.anchorageId"
        :ref="refSetter(`a:${a.anchorageId}`)"
        type="button"
        class="m2d-zone"
        :class="{ 'm2d-zone--crowded': a.crowded }"
        :aria-label="`${a.name}: ${a.vesselIds.length} vessels in zone. Demo zone, not for navigation`"
        :data-testid="`anchorage-${a.anchorageId}`"
        @click="openCard('anchorage', a.anchorageId)"
      >
        <strong>{{ shortName(a.name) }}</strong>
        <span>{{ a.vesselIds.length }}<template v-if="a.capacityEstimate"> / ~{{ a.capacityEstimate }}</template> vessels · Demo zone · not for navigation</span>
      </button>
      <button
        v-for="p in regionPorts"
        :key="p.portId"
        :ref="refSetter(`p:${p.portId}`)"
        type="button"
        class="m2d-port"
        :aria-label="`Focus port ${p.name}`"
        :data-testid="`port-label-2d-${p.portId}`"
        @click="openPort(p.portId)"
      >
        <span class="m2d-port__dot" :class="`m2d-port__dot--${p.tone}`" aria-hidden="true" />{{ p.name }}
      </button>
    </div>

    <div v-if="tooltip && !card" class="m2d-tip" :style="{ transform: `translate(${tooltip.x}px, ${tooltip.y}px)` }" role="tooltip">
      <strong>{{ tooltip.title }}</strong>
      <span v-for="(l, i) in tooltip.lines" :key="i">{{ l }}</span>
    </div>

    <section
      v-if="card"
      ref="cardEl"
      class="m2d-card"
      :style="{ transform: `translate(${card.x}px, ${card.y}px)` }"
      role="dialog"
      :aria-label="cardBerth?.name ?? cardTerminal?.name ?? cardAnchorage?.name ?? 'Details'"
      data-testid="map-card"
      @keydown.esc.stop="closeCard"
    >
      <header class="m2d-card__head">
        <div>
          <p class="m2d-card__kicker">{{ card.kind === 'berth' ? 'Berth' : card.kind === 'terminal' ? 'Terminal' : 'Anchorage' }}</p>
          <h3>{{ cardBerth?.name ?? cardTerminal?.name ?? cardAnchorage?.name }}</h3>
        </div>
        <button type="button" class="m2d-card__close" aria-label="Close" @click="closeCard">×</button>
      </header>

      <template v-if="cardBerth">
        <StatusChip :status="statusStyle('berth', cardBerth.status)" :label="BERTH_STATUS_LABEL[cardBerth.status]" />
        <p v-if="cardBerth.status === 'unknown'" class="m2d-card__note">Berth status unknown: not counted as free.</p>
        <dl class="m2d-card__dl">
          <dt>Terminal</dt>
          <dd>{{ vm?.terminals.find((t) => t.terminalId === cardBerth!.terminalId)?.name ?? cardBerth.terminalId }}</dd>
          <dt>Occupant</dt>
          <dd>
            <button v-if="cardBerth.occupantVesselId" type="button" class="linkish" @click="openVessel(cardBerth.occupantVesselId)">{{ cardBerth.occupantName }}</button>
            <span v-else>—</span>
          </dd>
          <dt>Next scheduled</dt>
          <dd>
            <template v-if="cardBerth.scheduledVesselId">
              <button type="button" class="linkish" @click="openVessel(cardBerth.scheduledVesselId)">{{ cardBerth.scheduledName }}</button>
              <span class="m2d-card__sub num">{{ formatUtc(cardBerth.scheduledWindowStartUtc) }} · {{ formatLocal(cardBerth.scheduledWindowStartUtc, tz) }}</span>
            </template>
            <span v-else>—</span>
          </dd>
        </dl>
        <template v-if="cardBerth.linkedCalls.length">
          <p class="m2d-card__kicker">Linked calls · next 7 days</p>
          <ul class="m2d-card__list">
            <li v-for="lc in cardBerth.linkedCalls.slice(0, 5)" :key="lc.portCallId">
              <button type="button" class="linkish" @click="openVessel(lc.vesselId)">{{ lc.name }}</button>
              <span class="num">{{ lc.estimatedBerthUtc ? formatUtc(lc.estimatedBerthUtc) : 'Berth time unconfirmed' }}</span>
            </li>
          </ul>
        </template>
        <p class="m2d-card__foot num">Record updated {{ formatUtc(cardBerth.lastUpdatedUtc) }} · synthetic layout</p>
      </template>

      <template v-else-if="cardTerminal">
        <ul class="m2d-card__list">
          <li v-for="b in cardTerminal.berths" :key="b.berthId">
            <button type="button" class="linkish" @click="openCard('berth', b.berthId)">{{ b.name }}</button>
            <StatusChip dense :status="statusStyle('berth', b.status)" :label="BERTH_STATUS_LABEL[b.status]" />
          </li>
        </ul>
        <p v-if="cardTerminal.unknown" class="m2d-card__note">{{ cardTerminal.unknown }} berth{{ cardTerminal.unknown > 1 ? 's' : '' }} with unknown status, not counted as free.</p>
        <p class="m2d-card__foot">Synthetic terminal layout · not for navigation</p>
      </template>

      <template v-else-if="cardAnchorage">
        <dl class="m2d-card__dl">
          <dt>In zone</dt>
          <dd class="num">
            {{ cardAnchorage.vesselIds.length }}<template v-if="cardAnchorage.capacityEstimate"> of ~{{ cardAnchorage.capacityEstimate }} est. ({{ formatPercent(cardAnchorage.occupancy, 0) }})</template>
          </dd>
          <dt>In port queue</dt>
          <dd class="num">{{ cardAnchorage.queueCount }} · {{ cardAnchorage.awaitingBerthConfirmed }} with confirmed berth</dd>
          <dt>Median wait</dt>
          <dd class="num">{{ formatHours(cardAnchorage.medianWaitHours) }}</dd>
          <dt>P90 wait</dt>
          <dd class="num">{{ cardAnchorage.p90WaitHours === null ? 'Needs ≥ 5 known waits' : formatHours(cardAnchorage.p90WaitHours) }}</dd>
          <dt>Wait start unknown</dt>
          <dd class="num">{{ cardAnchorage.unknownWaitCount }}</dd>
        </dl>
        <template v-if="anchorageRows.length">
          <p class="m2d-card__kicker">Longest elapsed wait</p>
          <ul class="m2d-card__list">
            <li v-for="r in anchorageRows" :key="r.portCallId">
              <button type="button" class="linkish" @click="openVessel(r.vesselId)">{{ r.name }}</button>
              <span class="num">{{ formatHours(r.elapsedWaitHours) }}</span>
            </li>
          </ul>
        </template>
        <p class="m2d-card__foot">Demo zone · not for navigation · elapsed wait from recorded queue start</p>
      </template>
    </section>

    <div v-if="state === 'loading'" class="m2d-state" role="status">Loading 2D port map…</div>
    <div v-else-if="state === 'error'" class="m2d-state m2d-state--error" role="alert" data-testid="map2d-error">
      <strong>2D map unavailable</strong>
      <span>{{ errorText }}</span>
      <span>The port queue and inspector remain available.</span>
    </div>
    <div v-if="state === 'ready' && (basemap === 'unavailable' || basemap === 'disabled')" class="m2d-banner" role="status" data-testid="basemap-unavailable">
      <strong>Basemap unavailable</strong>
      <span>{{ basemap === 'disabled' ? 'No tile source is configured.' : 'Map tiles could not be loaded.' }} Operational overlays, the queue and the inspector still work.</span>
      <button v-if="basemap === 'unavailable'" type="button" class="btn btn--quiet" @click="retryBasemap">Retry tiles</button>
    </div>
  </div>
</template>

<style scoped>
.m2d,
.m2d__host {
  position: absolute;
  inset: 0;
}
.m2d__host {
  background: var(--color-map-ocean);
}
.m2d__labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.m2d__labels > * {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: auto;
  visibility: hidden;
}
.m2d-cluster {
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border-radius: 15px;
  border: 1.5px solid rgba(247, 250, 252, 0.7);
  background: rgba(6, 26, 40, 0.88);
  color: #f7fafc;
  font: 600 var(--text-12) / 1 var(--font-sans);
  cursor: pointer;
}
.m2d-cluster--incident {
  border-color: var(--color-critical);
  box-shadow: 0 0 0 2px rgba(201, 58, 58, 0.35);
}
.m2d-cluster--atRisk {
  border-color: #e7a64f;
}
.m2d-cluster--delayed {
  border-color: #d9c46a;
}
.m2d-terminal,
.m2d-zone {
  display: grid;
  gap: 1px;
  padding: 4px 8px;
  border: 1px solid rgba(159, 193, 209, 0.45);
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.86);
  color: #f7fafc;
  font-size: var(--text-11);
  line-height: 14px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.m2d-terminal span,
.m2d-zone span {
  color: rgba(247, 250, 252, 0.72);
}
.m2d-zone {
  border-style: dashed;
}
.m2d-zone--crowded {
  border-color: #c98a4f;
}
.m2d-port {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 4px;
  border: 0;
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.78);
  color: #f7fafc;
  font-size: var(--text-12);
  line-height: 16px;
  cursor: pointer;
}
.m2d-port__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid #061a28;
  background: var(--color-unknown);
}
.m2d-port__dot--healthy {
  background: var(--color-healthy);
}
.m2d-port__dot--warning {
  background: var(--color-warning);
}
.m2d-port__dot--critical {
  background: var(--color-critical);
}
.m2d-cluster:focus-visible,
.m2d-terminal:focus-visible,
.m2d-zone:focus-visible,
.m2d-port:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}
.m2d-tip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 18;
  display: grid;
  gap: 2px;
  max-width: 300px;
  padding: 8px 10px;
  border-radius: var(--radius-input);
  background: rgba(6, 26, 40, 0.94);
  color: rgba(247, 250, 252, 0.8);
  font-size: var(--text-12);
  line-height: 16px;
  pointer-events: none;
}
.m2d-tip strong {
  color: #f7fafc;
}
.m2d-card {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 19;
  display: grid;
  gap: 8px;
  width: 300px;
  padding: 12px 14px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
  line-height: 16px;
}
.m2d-card__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 8px;
}
.m2d-card__head h3 {
  margin: 0;
  font-size: var(--text-14);
  line-height: 20px;
}
.m2d-card__kicker {
  margin: 0;
  font-size: var(--text-11);
  font-weight: 500;
  color: var(--color-ink-muted);
}
.m2d-card__close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-input);
  background: transparent;
  font-size: 18px;
  color: var(--color-ink-secondary);
  cursor: pointer;
}
.m2d-card__close:hover {
  background: var(--color-panel-secondary);
}
.m2d-card__dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
}
.m2d-card__dl dt {
  color: var(--color-ink-muted);
}
.m2d-card__dl dd {
  margin: 0;
  display: grid;
}
.m2d-card__sub {
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.m2d-card__list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.m2d-card__list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.m2d-card__note {
  margin: 0;
  color: var(--color-unknown);
}
.m2d-card__foot {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.linkish {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent-hover);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.linkish:hover {
  text-decoration: underline;
}
.m2d-state {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  color: rgba(247, 250, 252, 0.8);
  text-align: center;
}
.m2d-state--error {
  background: var(--color-map-ocean);
}
.m2d-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 18;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 560px;
  translate: -50% 0;
  padding: 8px 12px;
  border-radius: var(--radius-panel);
  background: var(--color-panel);
  border: 1px solid var(--color-warning);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
  line-height: 16px;
}
.m2d-banner strong,
.m2d-banner .btn {
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .m2d-cluster {
    transition: none;
  }
}
</style>

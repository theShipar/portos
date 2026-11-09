<script setup lang="ts">
// SPDX-License-Identifier: GPL-3.0-or-later
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { computed, markRaw, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { GeoScopeStack, scopeKey, type Scope, type ScopeStackItem } from '@/core/scope';
import type { LayerId } from '@/core/layers';
import type { Region } from '@/core/types';
import { useNavigation } from '@/router/useRouteSync';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSessionStore } from '@/stores/session';
import { useViewStore } from '@/stores/view';
import { EARTH_PRESET, pointPreset, regionPreset, type CameraPose, type CameraPreset } from './earth/camera';
import { EarthScene, type EarthPointerHit } from './earth/EarthScene';
import { loadWorld } from './earth/worldGeo';
import { buildRegionRegistry } from './regions';

const emit = defineEmits<{ ready: [EarthScene] }>();

const catalog = useCatalogStore();
const view = useViewStore();
const clock = useClockStore();
const session = useSessionStore();
const nav = useNavigation();

const host = ref<HTMLDivElement | null>(null);
const state = ref<'loading' | 'ready' | 'no-webgl' | 'error'>('loading');
const errorText = ref('');
const scene = shallowRef<EarthScene | null>(null);
const tooltip = ref<{ x: number; y: number; title: string; sub: string } | null>(null);
const labelEls = new Map<string, HTMLElement>();

const registry = computed(() => (catalog.catalog ? markRaw(buildRegionRegistry(catalog.catalog.regions)) : null));
const regions = computed(() => catalog.catalog?.regions ?? []);
const activeRegionId = computed(() => (view.scope.level === 'earth' ? null : view.scope.regionId));
const stack = new GeoScopeStack<CameraPose, Record<LayerId, boolean>>();
let currentScope: Scope = { level: 'earth' };
let unsubs: (() => void)[] = [];

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
  const saved = opts.initial ? null : stack.transition(snapshotItem(currentScope, sc), next);
  currentScope = next;
  const regionId = next.level === 'earth' ? null : next.regionId;
  const region = regionId ? catalog.catalog.byId.region.get(regionId) : null;
  sc.setRegionHighlight(region ? region.countryIso3 : null);
  sc.setHoverHighlight(null);
  sc.setIdleRotation(next.level === 'earth' && !view.selection);
  const preset = presetFor(next, sc);
  if (saved?.cameraPose) await sc.flyToPose(saved.cameraPose, { min: preset.minDistance, max: preset.maxDistance });
  else await sc.flyTo(preset, opts.initial ? { duration: session.reducedMotion ? 0 : 1.6 } : {});
}

function resetCamera() {
  const sc = scene.value;
  if (sc) sc.flyTo(presetFor(view.scope, sc));
}

function onHover(hit: EarthPointerHit | null) {
  const sc = scene.value;
  const reg = registry.value;
  if (!sc || !reg) return;
  if (!hit) {
    tooltip.value = null;
    sc.setHoverHighlight(null);
    sc.renderer.domElement.style.cursor = '';
    return;
  }
  const region = reg.regionAt(hit.lon, hit.lat, hit.country?.iso3 ?? null);
  if (view.scope.level === 'earth') {
    sc.setHoverHighlight(region ? region.countryIso3 : null);
    sc.renderer.domElement.style.cursor = region ? 'pointer' : '';
    tooltip.value = region ? { x: hit.screenX, y: hit.screenY, title: region.name, sub: `${region.portIds.length} ports · click to focus region` } : null;
  } else {
    const inOther = region && region.regionId !== activeRegionId.value;
    sc.setHoverHighlight(hit.country && !inOther ? [hit.country.iso3] : inOther ? region!.countryIso3 : null);
    sc.renderer.domElement.style.cursor = inOther ? 'pointer' : '';
    tooltip.value = hit.country || inOther ? { x: hit.screenX, y: hit.screenY, title: hit.country?.name ?? region!.name, sub: inOther ? `${region!.name} · click to switch region` : (region?.name ?? 'Outside operational regions') } : null;
  }
}

function onClick(hit: EarthPointerHit | null) {
  const reg = registry.value;
  if (!hit || !reg) return;
  const region = reg.regionAt(hit.lon, hit.lat, hit.country?.iso3 ?? null);
  if (region && region.regionId !== activeRegionId.value) {
    tooltip.value = null;
    nav.openScope({ level: 'region', regionId: region.regionId });
  }
}

function openRegion(r: Region) {
  nav.openScope({ level: 'region', regionId: r.regionId });
}

function setLabelRef(id: string, el: unknown) {
  if (el instanceof HTMLElement) labelEls.set(id, el);
  else labelEls.delete(id);
}

function updateLabels() {
  const sc = scene.value;
  if (!sc) return;
  const showAll = view.scope.level === 'earth';
  for (const r of regions.value) {
    const el = labelEls.get(r.regionId);
    if (!el) continue;
    const show = showAll || (view.scope.level === 'region' && r.regionId === activeRegionId.value);
    const p = sc.project(r.center.lat, r.center.lon);
    const visible = show && p.visible;
    el.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
  }
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
  unsubs = [
    sc.on('hover', onHover),
    sc.on('click', onClick),
    sc.on('userInteract', () => (tooltip.value = null)),
    sc.on('contextLost', () => {
      state.value = 'error';
      errorText.value = 'The WebGL context was lost (GPU reset or memory pressure).';
    }),
    sc.onFrame(updateLabels),
  ];
  sc.setRightInset(view.inspectorOpen ? inspectorInset() : 0);
  sc.start();
  state.value = 'ready';
  emit('ready', sc);
  await applyScope(view.scope, { initial: true });
}

function inspectorInset() {
  return 408 + 24;
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

function retry() {
  dispose();
  state.value = 'loading';
  init();
}

function dispose() {
  unsubs.forEach((u) => u());
  unsubs = [];
  scene.value?.dispose();
  scene.value = null;
  stack.clear();
}

onMounted(init);
onBeforeUnmount(dispose);

defineExpose({ resetCamera, scene });
</script>

<template>
  <div class="earth">
    <div ref="host" class="earth__host" />
    <div v-if="state === 'ready'" class="earth__labels" aria-label="Operational regions">
      <button
        v-for="r in regions"
        :key="r.regionId"
        :ref="(el) => setLabelRef(r.regionId, el)"
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
    <div v-if="tooltip" class="earth__tooltip" :style="{ transform: `translate(${tooltip.x + 14}px, ${tooltip.y + 14}px)` }" role="tooltip">
      <strong>{{ tooltip.title }}</strong>
      <span>{{ tooltip.sub }}</span>
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
.region-label {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: auto;
  padding: 3px 8px;
  border: 1px solid rgba(207, 225, 234, 0.25);
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.72);
  color: var(--color-ink-on-dark);
  font-size: var(--text-11);
  font-weight: 500;
  letter-spacing: 0.02em;
  white-space: nowrap;
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
.earth__tooltip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 25;
  display: grid;
  gap: 1px;
  padding: 6px 10px;
  border-radius: var(--radius-input);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
  line-height: 16px;
  pointer-events: none;
  white-space: nowrap;
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

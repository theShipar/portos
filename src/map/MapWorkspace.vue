<script setup lang="ts">
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue';
import { scopeKey } from '@/core/scope';
import { TONE_LABEL, type MarkerTone } from '@/selectors/mapLayers';
import { useViewStore } from '@/stores/view';
import { EARTH_RADIUS } from './earth/camera';
import type { EarthScene } from './earth/EarthScene';
import { degreesPerPx } from './earth/lod';
import LayerMenu from './LayerMenu.vue';
import PortosEarthView from './PortosEarthView.vue';
import { basemapConfig } from './port2d/basemapStyle';
import { cssHex, markerColors } from './theme';
import ViewModeSwitch from './ViewModeSwitch.vue';
import { degPerPxForZoom, distanceForDegPerPx, zoomForDegPerPx, type MapView2D } from './viewport';
import Icon from '@/components/ui/Icon.vue';

const PortMap2D = defineAsyncComponent(() => import('./port2d/PortMap2D.vue'));

const earthView = ref<InstanceType<typeof PortosEarthView> | null>(null);
const map2d = ref<{ getView(): MapView2D | null; resetView(): void } | null>(null);
const earth = shallowRef<EarthScene | null>(null);
const view = useViewStore();
const basemap = basemapConfig();

const SHELF_W = 340;
const show2d = computed(() => view.viewMode === '2d' && view.scope.level !== 'earth');
const insetLeft = computed(() => (view.scope.level === 'port' ? (view.queueShelfOpen ? SHELF_W + 16 : 0) : 0));
const insetRight = computed(() => (view.inspectorOpen && !view.sheetLayout ? 408 + 24 : 0));
const initialView = ref<MapView2D | null>(null);
/** Ports already framed once in 2D; the first visit fits the port layout instead of copying the globe zoom. */
const framedPorts = new Set<string>();

/** The 3D surface on screen (globe or extruded scene); both speak globe-unit poses. */
function surface3d() {
  return earthView.value?.surface ?? earth.value;
}

function viewFromGlobe(): MapView2D | null {
  const sc = surface3d();
  if (!sc) return null;
  const pose = sc.getPose();
  return { center: { lat: pose.lat, lon: pose.lon }, zoom: zoomForDegPerPx(degreesPerPx(pose.distance, EARTH_RADIUS, sc.pxToWorld), pose.lat) };
}

function globeFromView(v: MapView2D) {
  const sc = surface3d();
  if (!sc) return;
  sc.jumpToPose({ lat: v.center.lat, lon: v.center.lon, distance: distanceForDegPerPx(degPerPxForZoom(v.zoom, v.center.lat), EARTH_RADIUS, sc.pxToWorld) });
}

/** Mode switches hand the camera across; scope changes are left to each view's own framing. */
watch(
  () => [show2d.value, scopeKey(view.scope)] as const,
  ([on, key], prev) => {
    const sameScope = prev && prev[1] === key;
    if (on && !prev?.[0]) {
      const s = view.scope;
      const firstPortVisit = s.level === 'port' && !framedPorts.has(key);
      initialView.value = sameScope && !firstPortVisit ? viewFromGlobe() : null;
      if (s.level === 'port') framedPorts.add(key);
    } else if (on && view.scope.level === 'port') framedPorts.add(key);
    else if (!on && prev?.[0] && sameScope) {
      const v = map2d.value?.getView();
      if (v) globeFromView(v);
    }
  },
  { immediate: true },
);

function reset() {
  if (show2d.value) map2d.value?.resetView();
  else earthView.value?.resetCamera();
}

const legendTones: MarkerTone[] = ['incident', 'atRisk', 'delayed', 'onPlan', 'ambient'];
const legend = legendTones.map((t) => ({ tone: t, label: t === 'delayed' ? 'Late forecast' : t === 'onPlan' ? 'On plan' : TONE_LABEL[t], color: cssHex(markerColors[t]) }));

defineExpose({ earth, earthView, map2d });
</script>

<template>
  <div class="workspace-map" :class="{ 'workspace-map--inspector': view.inspectorOpen }" :data-view-mode="show2d ? '2d' : '3d'" data-testid="map-workspace">
    <PortosEarthView ref="earthView" :active="!show2d" @ready="earth = $event" />
    <Transition name="mode-fade">
      <PortMap2D v-if="show2d" ref="map2d" class="workspace-map__2d" :initial-view="initialView" :inset-left="insetLeft" :inset-right="insetRight" />
    </Transition>
    <div class="map-tools" role="toolbar" aria-label="Map tools">
      <ViewModeSwitch />
      <LayerMenu />
      <button type="button" class="map-tool" title="Reset view for this scope" aria-label="Reset view for this scope" @click="reset">
        <Icon name="reset" :size="16" />
      </button>
    </div>
    <ul class="map-legend" aria-label="Vessel marker legend">
      <li v-for="l in legend" :key="l.tone">
        <span class="map-legend__glyph" :style="{ background: l.color }" aria-hidden="true" />
        {{ l.label }}
      </li>
    </ul>
    <!-- eslint-disable-next-line vue/no-v-html -->
    <p v-if="show2d" class="attribution" data-testid="attribution-2d">
      <span v-if="basemap.attribution" v-html="basemap.attribution" /><span v-else>No basemap configured</span> · Port layout, vessels &amp; queues synthetic · not for
      navigation
    </p>
    <p v-else class="attribution">
      Earth textures &amp; country outlines via
      <a href="https://github.com/songsummer920-dazzle/three-scope-map-skill" target="_blank" rel="noopener">three-scope-map</a> (GPL-3.0) · Natural
      Earth-derived boundaries · All vessel data synthetic
    </p>
  </div>
</template>

<style scoped>
.workspace-map {
  position: absolute;
  inset: 0;
}
.workspace-map__2d {
  z-index: 5;
}
.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 220ms ease;
}
.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .mode-fade-enter-active,
  .mode-fade-leave-active {
    transition: none;
  }
}
.map-tools {
  position: absolute;
  right: var(--map-control-gap);
  bottom: calc(40px + var(--rail-lift, 0px));
  z-index: 20;
  display: grid;
  justify-items: end;
  gap: 6px;
}
.map-legend {
  position: absolute;
  left: var(--map-control-gap);
  bottom: 8px;
  z-index: 15;
  display: flex;
  gap: 12px;
  margin: 0;
  padding: 4px 10px;
  list-style: none;
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.72);
  color: rgba(247, 250, 252, 0.86);
  font-size: var(--text-11);
  line-height: 16px;
}
.map-legend li {
  display: flex;
  align-items: center;
  gap: 5px;
}
.map-legend__glyph {
  width: 8px;
  height: 10px;
  clip-path: polygon(50% 0, 100% 100%, 50% 74%, 0 100%);
}
.attribution {
  position: absolute;
  right: var(--map-control-gap);
  bottom: 8px;
  z-index: 15;
  margin: 0;
  padding: 2px 8px;
  border-radius: var(--radius-chip);
  background: rgba(6, 26, 40, 0.6);
  color: rgba(247, 250, 252, 0.7);
  font-size: var(--text-11);
  line-height: 16px;
}
.workspace-map--inspector .map-tools,
.workspace-map--inspector .attribution {
  right: calc(var(--inspector-w) + var(--map-control-gap) * 2);
  /* Leaves room for the marker legend on the left. */
  max-width: max(240px, calc(100% - var(--inspector-w) - 480px));
  text-align: right;
}
.attribution :deep(a) {
  color: inherit;
}
@media (max-width: 1280px) {
  .attribution {
    max-width: 380px;
    text-align: right;
  }
}
@media (max-width: 1024px) {
  .workspace-map--inspector .map-tools,
  .workspace-map--inspector .attribution {
    right: var(--map-control-gap);
  }
  .workspace-map--inspector .map-tools {
    top: var(--map-control-gap);
    bottom: auto;
  }
  .workspace-map--inspector .attribution {
    bottom: min(var(--sheet-top), calc(100% - 48px));
    max-width: 380px;
  }
  .workspace-map--inspector .map-legend {
    display: none;
  }
}
</style>

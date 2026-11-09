<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { TONE_LABEL, type MarkerTone } from '@/selectors/mapLayers';
import { useViewStore } from '@/stores/view';
import type { EarthScene } from './earth/EarthScene';
import LayerMenu from './LayerMenu.vue';
import PortosEarthView from './PortosEarthView.vue';
import { cssHex, markerColors } from './theme';
import Icon from '@/components/ui/Icon.vue';

const earthView = ref<InstanceType<typeof PortosEarthView> | null>(null);
const earth = shallowRef<EarthScene | null>(null);
const view = useViewStore();

const legendTones: MarkerTone[] = ['incident', 'atRisk', 'delayed', 'onPlan', 'ambient'];
const legend = legendTones.map((t) => ({ tone: t, label: t === 'delayed' ? 'Late forecast' : t === 'onPlan' ? 'On plan' : TONE_LABEL[t], color: cssHex(markerColors[t]) }));

defineExpose({ earth, earthView });
</script>

<template>
  <div class="workspace-map" :class="{ 'workspace-map--inspector': view.inspectorOpen }" data-testid="map-workspace">
    <PortosEarthView ref="earthView" @ready="earth = $event" />
    <div class="map-tools" role="toolbar" aria-label="Map tools">
      <LayerMenu />
      <button type="button" class="map-tool" title="Reset view for this scope" aria-label="Reset camera for this scope" @click="earthView?.resetCamera()">
        <Icon name="reset" :size="16" />
      </button>
    </div>
    <ul class="map-legend" aria-label="Vessel marker legend">
      <li v-for="l in legend" :key="l.tone">
        <span class="map-legend__glyph" :style="{ background: l.color }" aria-hidden="true" />
        {{ l.label }}
      </li>
    </ul>
    <p class="attribution">
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
.map-tools {
  position: absolute;
  right: var(--map-control-gap);
  bottom: 40px;
  z-index: 20;
  display: grid;
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
}
.attribution a {
  color: inherit;
}
</style>

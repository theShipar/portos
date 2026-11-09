<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { useViewStore } from '@/stores/view';
import type { EarthScene } from './earth/EarthScene';
import PortosEarthView from './PortosEarthView.vue';
import Icon from '@/components/ui/Icon.vue';

const earthView = ref<InstanceType<typeof PortosEarthView> | null>(null);
const earth = shallowRef<EarthScene | null>(null);
const view = useViewStore();

defineExpose({ earth });
</script>

<template>
  <div class="workspace-map" :class="{ 'workspace-map--inspector': view.inspectorOpen }" data-testid="map-workspace">
    <PortosEarthView ref="earthView" @ready="earth = $event" />
    <div class="map-tools" role="toolbar" aria-label="Map tools">
      <button type="button" class="map-tool" title="Reset view for this scope" aria-label="Reset camera for this scope" @click="earthView?.resetCamera()">
        <Icon name="reset" :size="16" />
      </button>
    </div>
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
.map-tool {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  box-shadow: var(--shadow-panel);
}
.map-tool:hover {
  color: var(--color-ink);
  background: var(--color-panel-secondary);
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

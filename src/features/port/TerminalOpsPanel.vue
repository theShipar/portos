<script setup lang="ts">
import { useCatalogStore } from '@/stores/catalog';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import TerminalOpsSection from './TerminalOpsSection.vue';
import { useTerminalOps } from './useTerminalOps';

/** Port-level terminal operations (V3 typed twin) while no berth is in focus. */
const catalog = useCatalogStore();
const snap = useSnapshotStore();
const view = useViewStore();
const { opsView, equipmentCard } = useTerminalOps();
const portName = () => (snap.portTwin ? (catalog.catalog?.byId.port.get(snap.portTwin.portId)?.name ?? snap.portTwin.portId) : '');
</script>

<template>
  <aside v-if="opsView" class="ops-panel" aria-label="Terminal operations" data-testid="terminal-ops-panel" :style="{ maxHeight: `calc(100% - ${view.bottomInsetPx + 28}px)` }">
    <p class="ops-panel__kicker">{{ portName() }} · Terminal operations · Simulated</p>
    <TerminalOpsSection :ops="opsView" :card="equipmentCard" />
  </aside>
</template>

<style scoped>
.ops-panel {
  position: absolute;
  z-index: 19;
  top: var(--map-control-gap);
  right: calc(var(--map-control-gap) + var(--card-right, 0px));
  display: grid;
  gap: 4px;
  width: 300px;
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
}
.ops-panel__kicker {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
</style>

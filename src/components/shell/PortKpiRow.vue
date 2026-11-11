<script setup lang="ts">
import { computed } from 'vue';
import type { PortViewModel } from '@/selectors/port';
import { portRailCells } from '@/selectors/kpiRail';
import ProvenanceButton from '@/components/ui/ProvenanceButton.vue';

const props = defineProps<{ vm: PortViewModel }>();
const items = computed(() => portRailCells(props.vm));
</script>

<template>
  <ul class="kpis" :aria-label="`${vm.port.name} port indicators at the simulation time · Simulated`" data-testid="map-kpi-rail">
    <li v-for="k in items" :key="k.key" class="kpi" :data-testid="`port-kpi-${k.key}`" :aria-label="k.ariaLabel">
      <span class="kpi__label">
        {{ k.label }}
        <ProvenanceButton v-if="k.provenance" :provenance="k.provenance" :label="k.label" />
      </span>
      <span class="kpi__line">
        <span class="kpi__value num" :class="k.tone ? `tone-${k.tone}` : undefined">{{ k.valueText }}</span>
        <span v-if="k.contextText" class="kpi__den">{{ k.contextText }}</span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.kpis {
  display: flex;
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  pointer-events: auto;
}
.kpi {
  display: grid;
  gap: 1px;
  padding: 7px 14px 8px;
  min-width: 92px;
}
.kpi + .kpi {
  border-left: 1px solid var(--color-border);
}
.kpi__label {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 14px;
  font-size: var(--text-11);
  line-height: 14px;
  font-weight: 500;
  color: var(--color-ink-muted);
  white-space: nowrap;
}
.kpi__label :deep(.prov-btn) {
  width: 16px;
  height: 16px;
}
.kpi__line {
  display: flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}
.kpi__value {
  font-size: var(--text-20);
  line-height: 26px;
  font-weight: 600;
}
.kpi__den {
  font-size: var(--text-11);
  font-weight: 400;
  color: var(--color-ink-muted);
}
.tone-warning {
  color: var(--color-warning-ink);
}
.tone-critical {
  color: var(--color-critical);
}
.tone-info {
  color: var(--color-info);
}
.tone-unknown {
  color: var(--color-unknown-ink);
}
</style>

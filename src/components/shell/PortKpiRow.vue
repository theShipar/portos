<script setup lang="ts">
import { computed } from 'vue';
import { formatCount, formatHours, formatUtc } from '@/core/format';
import type { PortViewModel } from '@/selectors/port';

const props = defineProps<{ vm: PortViewModel }>();

const items = computed(() => {
  const k = props.vm.kpis;
  const asOf = formatUtc(props.vm.asOfUtc);
  const src = `Source: computePortCongestion · ${props.vm.port.portId} · as of ${asOf}`;
  return [
    { key: 'queue', label: 'In berth queue', value: formatCount(k.awaitingBerth), den: null, title: `Port calls arrived and not yet at berth.\n${src}` },
    { key: 'anchor', label: 'At anchor', value: formatCount(k.atAnchor), den: null, title: `Queued calls whose vessel reports at anchor.\n${src}` },
    { key: 'arrivals', label: 'Arrivals next 24 h', value: formatCount(k.arrivalsNext24h), den: null, title: `Scheduled arrivals within 24 h of the simulation time.\n${src}` },
    {
      key: 'wait',
      label: 'Median known wait',
      value: formatHours(k.medianKnownWaitHours),
      den: `${k.waitSampleSize}/${k.awaitingBerth} known`,
      title: `Median elapsed wait of queued calls with a recorded waiting start; unknown starts are excluded, never counted as zero.\n${src}`,
    },
  ];
});
</script>

<template>
  <ul class="kpis" :aria-label="`${vm.port.name} port indicators at the simulation time`">
    <li v-for="k in items" :key="k.key" class="kpi" :title="k.title" :data-testid="`port-kpi-${k.key}`">
      <span class="kpi__label">{{ k.label }}</span>
      <span class="kpi__value num">
        {{ k.value }}<span v-if="k.den" class="kpi__den">{{ k.den }}</span>
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
  gap: 2px;
  padding: 8px 14px;
  min-width: 96px;
}
.kpi + .kpi {
  border-left: 1px solid var(--color-border);
}
.kpi__label {
  font-size: var(--text-11);
  line-height: 14px;
  font-weight: 500;
  color: var(--color-ink-muted);
}
.kpi__value {
  font-size: var(--text-18);
  line-height: 24px;
  font-weight: 600;
}
.kpi__den {
  margin-left: 4px;
  font-size: var(--text-12);
  font-weight: 400;
  color: var(--color-ink-muted);
}
</style>

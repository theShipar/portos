<script setup lang="ts">
import { computed } from 'vue';
import { formatCount, formatPercent, formatUsd } from '@/core/format';
import type { Kpi, KpiKey } from '@/engines/kpis';

const props = withDefaults(defineProps<{ kpis: Kpi[]; keys?: KpiKey[] }>(), {
  keys: () => ['trackedVessels', 'delayedVoyages', 'atRiskVoyages', 'exposureUsd'],
});

const shown = computed(() => props.keys.map((k) => props.kpis.find((x) => x.key === k)).filter((k): k is Kpi => !!k));

function value(k: Kpi) {
  if (k.unit === 'usd') return formatUsd(k.value, { compact: true });
  if (k.unit === 'fraction') return formatPercent(k.value);
  return formatCount(k.value);
}
</script>

<template>
  <ul class="kpis" aria-label="Key indicators at the simulation time">
    <li v-for="k in shown" :key="k.key" class="kpi" :title="`${k.definition}\nSource: ${k.source} · ${k.cohort} · as of ${k.asOfUtc}`" :data-testid="`kpi-${k.key}`">
      <span class="kpi__label">{{ k.label }}</span>
      <span class="kpi__value num">
        {{ value(k) }}<span v-if="k.denominator !== undefined && k.unit === 'count' && k.key === 'trackedVessels'" class="kpi__den">/ {{ formatCount(k.denominator) }}</span>
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
  margin-left: 3px;
  font-size: var(--text-12);
  font-weight: 400;
  color: var(--color-ink-muted);
}
</style>

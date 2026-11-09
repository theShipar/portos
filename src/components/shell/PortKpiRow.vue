<script setup lang="ts">
import { computed } from 'vue';
import { formatCount, formatHours } from '@/core/format';
import type { Provenance } from '@/engines/provenance';
import type { PortViewModel } from '@/selectors/port';
import type { StatusTone } from '@/styles/tokens';
import ProvenanceButton from '@/components/ui/ProvenanceButton.vue';

const props = defineProps<{ vm: PortViewModel }>();

const LEVEL: Record<PortViewModel['congestion']['level'], { label: string; tone: StatusTone }> = {
  normal: { label: 'Normal', tone: 'info' },
  elevated: { label: 'Elevated', tone: 'warning' },
  critical: { label: 'Critical', tone: 'critical' },
  unknown: { label: 'Unknown', tone: 'unknown' },
};

interface Item {
  key: string;
  label: string;
  value: string;
  den: string | null;
  tone?: StatusTone;
  provenance?: Provenance;
}

const items = computed<Item[]>(() => {
  const k = props.vm.kpis;
  const cg = props.vm.congestion;
  return [
    { key: 'queue', label: 'In berth queue', value: formatCount(k.awaitingBerth), den: null, provenance: k.queueProvenance },
    { key: 'anchor', label: 'At anchor', value: formatCount(k.atAnchor), den: null },
    { key: 'arrivals', label: 'Arrivals next 24 h', value: formatCount(k.arrivalsNext24h), den: null },
    { key: 'wait', label: 'Median known wait', value: formatHours(k.medianKnownWaitHours), den: `${k.waitSampleSize}/${k.awaitingBerth} known`, provenance: k.waitProvenance },
    { key: 'congestion', label: 'Congestion', value: LEVEL[cg.level].label, den: cg.score0to100 === null ? null : `${cg.score0to100}/100`, tone: LEVEL[cg.level].tone, provenance: cg.provenance },
  ];
});
</script>

<template>
  <ul class="kpis" :aria-label="`${vm.port.name} port indicators at the simulation time`">
    <li v-for="k in items" :key="k.key" class="kpi" :data-testid="`port-kpi-${k.key}`">
      <span class="kpi__label">
        {{ k.label }}
        <ProvenanceButton v-if="k.provenance" :provenance="k.provenance" :label="k.label" />
      </span>
      <span class="kpi__value num" :class="k.tone ? `tone-${k.tone}` : undefined">
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

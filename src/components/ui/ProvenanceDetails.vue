<script setup lang="ts">
import { computed } from 'vue';
import { formatUtc } from '@/core/format';
import { EVIDENCE_KIND_LABEL, SOURCE_CLASS_LABEL, type Provenance } from '@/engines/provenance';
import { statusStyle, type StatusStyle } from '@/styles/tokens';
import StatusChip from './StatusChip.vue';

const props = defineProps<{ provenance: Provenance }>();

const SOURCE_TONE: Record<Provenance['sourceClass'], StatusStyle> = {
  'simulated-fixture': { tone: 'neutral', label: SOURCE_CLASS_LABEL['simulated-fixture'], icon: 'dot' },
  'derived-model': { tone: 'info', label: SOURCE_CLASS_LABEL['derived-model'], icon: 'info' },
  'user-scenario': { tone: 'selected', label: SOURCE_CLASS_LABEL['user-scenario'], icon: 'check' },
};
const FRESHNESS: Record<Provenance['freshness'], StatusStyle> = {
  fresh: { tone: 'healthy', label: 'Fresh', icon: 'check' },
  aging: { tone: 'warning', label: 'Aging', icon: 'clock' },
  stale: { tone: 'critical', label: 'Stale', icon: 'clock' },
  unknown: { tone: 'unknown', label: 'Age unknown', icon: 'question' },
};

const ageText = computed(() => {
  const m = props.provenance.ageMinutes;
  if (m === null) return 'age unknown';
  if (m < 1) return 'at the simulation time';
  if (m < 60) return `${m} min old`;
  const h = m / 60;
  return h < 48 ? `${h.toFixed(1)} h old` : `${(h / 24).toFixed(1)} d old`;
});
</script>

<template>
  <div class="prov" data-testid="provenance">
    <div class="prov__chips">
      <StatusChip :status="SOURCE_TONE[provenance.sourceClass]" dense data-testid="provenance-source" />
      <StatusChip :status="{ tone: provenance.evidence === 'unknown' ? 'unknown' : 'neutral', label: EVIDENCE_KIND_LABEL[provenance.evidence], icon: 'dot' }" dense />
      <StatusChip :status="statusStyle('confidence', provenance.confidence)" dense />
      <StatusChip v-if="provenance.freshness !== 'fresh'" :status="FRESHNESS[provenance.freshness]" dense />
    </div>
    <p class="prov__asof"><span class="mono">As of {{ formatUtc(provenance.asOfUtc) }}</span> · {{ ageText }}</p>
    <p class="prov__method">{{ provenance.method }}</p>
    <p v-if="provenance.formula" class="prov__formula mono" data-testid="provenance-formula">{{ provenance.formula }}</p>
    <ul v-if="provenance.warnings.length" class="prov__warnings">
      <li v-for="w in provenance.warnings" :key="w">{{ w }}</li>
    </ul>
    <div v-if="provenance.sources.length">
      <h4 class="prov__h">Sources</h4>
      <ul class="prov__sources">
        <li v-for="s in provenance.sources" :key="`${s.kind}:${s.id}:${s.label}`">
          <span class="mono prov__id">{{ s.id }}</span>
          <span>{{ s.label }}</span>
          <span v-if="s.atUtc" class="mono prov__time">{{ formatUtc(s.atUtc) }}</span>
        </li>
      </ul>
    </div>
    <div v-if="provenance.assumptions.length">
      <h4 class="prov__h">Assumptions</h4>
      <ul class="prov__list">
        <li v-for="a in provenance.assumptions" :key="a">{{ a }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.prov {
  display: grid;
  gap: 8px;
  font-size: var(--text-12);
  line-height: 17px;
  color: var(--color-ink-secondary);
}
.prov__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.prov__asof {
  margin: 0;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.prov__method {
  margin: 0;
  color: var(--color-ink);
}
.prov__formula {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--radius-chip);
  background: var(--color-panel-secondary);
  border: 1px solid var(--color-border);
  color: var(--color-ink);
  font-size: var(--text-11);
  word-break: break-word;
}
.prov__warnings {
  margin: 0;
  padding: 6px 8px 6px 22px;
  border-radius: var(--radius-chip);
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}
.prov__h {
  margin: 0 0 2px;
  font-size: var(--text-11);
  font-weight: 600;
  color: var(--color-ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.prov__sources,
.prov__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 3px;
}
.prov__list {
  list-style: disc;
  padding-left: 16px;
}
.prov__sources li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 8px;
}
.prov__id {
  color: var(--color-ink);
  font-size: var(--text-11);
}
.prov__time {
  grid-column: 2;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>

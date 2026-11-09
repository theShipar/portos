<script setup lang="ts">
import { formatUtc } from '@/core/format';
import type { VoyageImpact } from '@/selectors/impact';
import { statusStyle } from '@/styles/tokens';
import Icon from '@/components/ui/Icon.vue';
import ProvenanceButton from '@/components/ui/ProvenanceButton.vue';
import StatusChip from '@/components/ui/StatusChip.vue';
import ExposureRateEditor from './ExposureRateEditor.vue';

defineProps<{ impact: VoyageImpact }>();
</script>

<template>
  <div class="impact" data-testid="eta-block">
    <div class="impact__row">
      <div>
        <div class="micro-label">Forecast ETA shift</div>
        <div class="impact__value-line">
          <span class="impact__value num" :class="`tone-${impact.shiftTone}`" data-testid="eta-shift">{{ impact.shiftText }}</span>
          <ProvenanceButton v-if="impact.eta" :provenance="impact.eta.provenance" label="Forecast ETA shift" />
        </div>
      </div>
      <div>
        <div class="micro-label">Est. delay exposure</div>
        <div class="impact__value-line">
          <span class="impact__value num" :class="{ 'impact__value--muted': impact.exposureUnavailable }" data-testid="exposure-value">{{ impact.exposureText }}</span>
          <ProvenanceButton v-if="impact.exposure" :provenance="impact.exposure.provenance" label="Est. delay exposure" />
        </div>
      </div>
    </div>
    <div v-if="impact.eta" class="impact__grid">
      <span>Planned ETA</span><span class="mono">{{ formatUtc(impact.eta.plannedArrivalUtc) }}</span>
      <span>Forecast ETA</span><span class="mono">{{ formatUtc(impact.eta.estimatedArrivalUtc) }}</span>
    </div>
    <div v-if="impact.eta?.drivers.length" class="impact__driver">
      <Icon name="info" :size="14" />
      <span>Driver: <strong>{{ impact.eta.drivers[0].label }}</strong> · {{ impact.eta.drivers[0].eventId }} at {{ formatUtc(impact.eta.drivers[0].atUtc, { date: false }) }}</span>
    </div>
    <div v-if="impact.exposure" class="impact__formula mono" :class="{ 'impact__formula--scenario': impact.rateIsUserScenario }" data-testid="exposure-formula">
      {{ impact.exposure.formulaText }}<template v-if="impact.exposureUnavailable"> · {{ impact.exposure.explanation }}</template>
    </div>
    <div class="impact__risk" data-testid="route-risk">
      <StatusChip :status="impact.riskStyle" dense />
      <ProvenanceButton :provenance="impact.riskProvenance" label="Weather route risk" />
      <span class="impact__risk-text">{{ impact.riskSummary }}</span>
    </div>
    <ExposureRateEditor v-if="impact.exposure" :impact="impact" />
    <div v-if="impact.eta" class="impact__meta">
      <StatusChip :status="statusStyle('confidence', impact.eta.confidence)" dense />
      <span>As of {{ formatUtc(impact.eta.asOfUtc) }} · simulated estimate, not an invoice or demurrage claim</span>
    </div>
  </div>
</template>

<style scoped>
.impact {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-panel-secondary);
}
.impact__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.impact__value-line {
  display: flex;
  align-items: center;
  gap: 4px;
}
.impact__value {
  font-size: var(--text-24);
  line-height: 30px;
  font-weight: 600;
}
.impact__value--muted {
  font-size: var(--text-16);
  color: var(--color-unknown);
}
.tone-critical {
  color: var(--color-critical);
}
.tone-warning {
  color: var(--color-warning);
}
.tone-healthy {
  color: var(--color-healthy);
}
.tone-unknown {
  color: var(--color-unknown);
}
.impact__grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.impact__grid .mono {
  color: var(--color-ink);
}
.impact__driver {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  font-size: var(--text-12);
  line-height: 18px;
  color: var(--color-ink-secondary);
}
.impact__driver strong {
  color: var(--color-ink);
  font-weight: 600;
}
.impact__driver svg {
  margin-top: 2px;
  flex: none;
}
.impact__formula {
  font-size: var(--text-12);
  padding: 6px 8px;
  border-radius: var(--radius-chip);
  background: var(--color-panel);
  border: 1px solid var(--color-border);
}
.impact__formula--scenario {
  border-color: var(--color-accent);
  background: var(--color-accent-subtle);
}
.impact__risk {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: var(--text-12);
}
.impact__risk-text {
  flex-basis: 100%;
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
  line-height: 16px;
}
.impact__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
</style>

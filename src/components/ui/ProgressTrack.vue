<script setup lang="ts">
import { computed } from 'vue';
import type { StatusTone } from '@/styles/tokens';

/**
 * Origin → destination progress (V3 spec 04/10 cruise progress). `progress` is a 0–1 share computed by a selector;
 * the component only places it. Optional `stops` mark intermediate calls at their own 0–1 position.
 */
const props = withDefaults(
  defineProps<{
    origin: string;
    destination: string;
    progress: number;
    label: string;
    originCaption?: string;
    destinationCaption?: string;
    tone?: StatusTone;
    stops?: { at: number; label: string }[];
    valueText?: string;
  }>(),
  { originCaption: '', destinationCaption: '', tone: 'info', stops: () => [], valueText: '' },
);

const pct = computed(() => `${(Math.min(1, Math.max(0, props.progress)) * 100).toFixed(1)}%`);
</script>

<template>
  <div class="ptrack" :class="`ptrack--${tone}`">
    <div class="ptrack__ends">
      <span class="ptrack__end">
        <strong>{{ origin }}</strong>
        <small v-if="originCaption">{{ originCaption }}</small>
      </span>
      <span class="ptrack__end ptrack__end--dest">
        <strong>{{ destination }}</strong>
        <small v-if="destinationCaption">{{ destinationCaption }}</small>
      </span>
    </div>
    <div
      class="ptrack__bar"
      role="progressbar"
      :aria-label="label"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(Math.min(1, Math.max(0, progress)) * 100)"
      :aria-valuetext="valueText || undefined"
      data-testid="progress-track"
    >
      <span class="ptrack__fill" :style="{ width: pct }" />
      <span v-for="s in stops" :key="s.label" class="ptrack__stop" :style="{ left: `${s.at * 100}%` }" :title="s.label" />
      <span class="ptrack__now" :style="{ left: pct }" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.ptrack {
  display: grid;
  gap: 8px;
}
.ptrack__ends {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.ptrack__end {
  display: grid;
  min-width: 0;
}
.ptrack__end strong {
  font-size: var(--text-14);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ptrack__end small {
  font-size: var(--text-12);
  color: var(--color-ink-muted);
  font-variant-numeric: tabular-nums;
}
.ptrack__end--dest {
  text-align: right;
}
.ptrack__bar {
  position: relative;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--color-panel-secondary);
  box-shadow: inset 0 0 0 1px var(--color-border);
}
.ptrack__fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: var(--color-data-observed);
  transition: width var(--motion-panel) var(--ease-standard);
}
.ptrack--warning .ptrack__fill {
  background: var(--color-warning);
}
.ptrack--critical .ptrack__fill {
  background: var(--color-critical);
}
.ptrack__stop {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 10px;
  margin-left: -1px;
  background: var(--color-ink-muted);
}
.ptrack__now {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-panel);
}
</style>

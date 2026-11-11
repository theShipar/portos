<script setup lang="ts">
import type { DecisionCompareView, DeltaBar } from '@/selectors/decisionCompare';
import { statusStyle } from '@/styles/tokens';
import StatusChip from '@/components/ui/StatusChip.vue';

defineProps<{ view: DecisionCompareView }>();

const barStyle = (b: DeltaBar) => (b.direction === 'better' ? { right: '50%', width: `${b.widthPct}%` } : { left: '50%', width: `${b.widthPct}%` });
</script>

<template>
  <section class="dc" aria-label="Original plan versus proposed responses" data-testid="decision-compare" :data-columns="view.columns.length">
    <div class="dc__grid" :style="{ '--cols': view.columns.length }">
      <article v-for="col in view.columns" :key="col.optionId" class="dc__col" :class="`dc__col--${col.role}`" :data-testid="`dc-col-${col.optionId}`">
        <header>
          <span class="dc__role">{{ col.roleLabel }}</span>
          <strong class="dc__name">{{ col.name }}</strong>
          <StatusChip :status="statusStyle('confidence', col.confidence)" dense />
        </header>
        <dl class="dc__metrics">
          <div><dt>Delay</dt><dd class="mono">{{ col.delayText }}</dd></div>
          <div><dt>Exposure</dt><dd class="mono">{{ col.exposureText }}</dd></div>
          <div><dt>Distance</dt><dd class="mono">{{ col.distanceText }}</dd></div>
        </dl>
        <div class="dc__deltas" aria-label="Change versus original plan">
          <div v-for="row in [{ k: 'delay', label: 'Δ delay', b: col.delayBar }, { k: 'usd', label: 'Δ cost', b: col.exposureBar }]" :key="row.k" class="dc__delta" :data-testid="`dc-delta-${row.k}`" :data-direction="row.b.direction">
            <span class="dc__delta-label">{{ row.label }}</span>
            <span class="dc__chart" aria-hidden="true">
              <span class="dc__axis" />
              <span v-if="row.b.widthPct > 0" class="dc__bar" :class="`dc__bar--${row.b.direction}`" :style="barStyle(row.b)" />
            </span>
            <span class="dc__delta-text mono">{{ row.b.text }}</span>
          </div>
        </div>
      </article>
    </div>
    <ul v-if="view.assumptions.length" class="dc__assumptions">
      <li v-for="a in view.assumptions" :key="a">{{ a }}</li>
    </ul>
    <p class="dc__foot" data-testid="decision-compare-foot">{{ view.footnote }}</p>
  </section>
</template>

<style scoped>
.dc {
  display: grid;
  gap: 8px;
}
.dc__grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 6px;
}
.dc__col {
  display: grid;
  align-content: start;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  font-size: var(--text-12);
}
.dc__col--original {
  background: var(--color-panel-secondary);
}
.dc__col--proposed {
  border-style: dashed;
  border-color: var(--color-border-strong);
}
.dc__col header {
  display: grid;
  gap: 2px;
  justify-items: start;
}
.dc__role {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.dc__name {
  line-height: 16px;
  overflow-wrap: anywhere;
}
.dc__col header :deep(.chip) {
  max-width: 100%;
  height: auto;
  white-space: normal;
}
.dc__metrics {
  display: grid;
  gap: 2px;
  margin: 0;
}
.dc__metrics div {
  display: grid;
  min-width: 0;
}
.dc__metrics dt {
  font-size: var(--text-11);
  line-height: 14px;
  color: var(--color-ink-muted);
}
.dc__metrics dd {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.dc__deltas {
  display: grid;
  gap: 3px;
}
.dc__delta {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1px;
}
.dc__delta-label {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.dc__chart {
  position: relative;
  height: 8px;
  border-radius: 2px;
  background: var(--color-panel-secondary);
}
.dc__axis {
  position: absolute;
  left: 50%;
  top: -1px;
  bottom: -1px;
  border-left: 1px solid var(--color-border-strong);
}
.dc__bar {
  position: absolute;
  top: 1px;
  bottom: 1px;
  border-radius: 2px;
}
.dc__bar--better {
  background: var(--color-healthy);
}
.dc__bar--worse {
  background: var(--color-critical);
}
.dc__delta-text {
  font-size: var(--text-11);
}
.dc__assumptions {
  margin: 0;
  padding-left: 16px;
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
}
.dc__foot {
  margin: 0;
  padding: 6px 8px;
  border-radius: var(--radius-input);
  background: var(--color-warning-subtle);
  color: var(--color-warning-ink);
  font-size: var(--text-11);
  font-weight: 600;
}
</style>

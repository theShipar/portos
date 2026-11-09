<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatUtc } from '@/core/format';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { tokens } from '@/styles/tokens';
import Icon from '@/components/ui/Icon.vue';

const clock = useClockStore();
const catalog = useCatalogStore();
const open = ref(false);

const timeText = computed(() => formatUtc(clock.timeMs));
const modeText = computed(() => (clock.mode === 'now' ? 'Now (simulated)' : clock.playing ? `Replay · ${clock.speed}×` : 'Replay · paused'));
const manifest = computed(() => catalog.catalog?.manifest ?? null);
</script>

<template>
  <div class="stamp" @keydown.esc.stop="open = false">
    <button
      type="button"
      class="stamp__btn"
      :class="{ 'stamp__btn--replay': clock.mode === 'replay' }"
      :aria-expanded="open"
      aria-controls="sim-disclosure"
      data-testid="simulated-stamp"
      @click="open = !open"
    >
      <span class="stamp__badge">Simulated</span>
      <span class="stamp__text">
        <span class="stamp__mode">{{ modeText }}</span>
        <span class="stamp__time mono">{{ timeText }}</span>
      </span>
      <Icon name="chevron-down" :size="14" />
    </button>
    <div v-if="open" id="sim-disclosure" class="stamp__pop panel" role="dialog" aria-label="Data disclosure">
      <p class="stamp__title">{{ tokens.disclosure }}</p>
      <p>
        All vessels, voyages, positions, incidents and costs are generated from fixture
        <span class="mono">{{ manifest?.dataset }} v{{ manifest?.version }}</span> (seed
        <span class="mono">{{ manifest?.seed }}</span>). Port locations are approximate public reference points.
      </p>
      <dl>
        <dt>Scenario anchor</dt>
        <dd class="mono">{{ formatUtc(clock.anchorMs) }}</dd>
        <dt>Replay window</dt>
        <dd class="mono">{{ formatUtc(clock.startMs, { date: false }) }} – {{ formatUtc(clock.anchorMs, { date: false }) }}</dd>
        <dt>Showing</dt>
        <dd class="mono">{{ timeText }}</dd>
      </dl>
      <p class="stamp__note">Not for navigation, routing or safety decisions.</p>
      <button v-if="clock.mode === 'replay'" type="button" class="btn btn--sm" @click="clock.reset()">
        <Icon name="reset" :size="14" /> Return to Now (simulated)
      </button>
    </div>
  </div>
</template>

<style scoped>
.stamp {
  position: relative;
}
.stamp__btn {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
  color: var(--color-ink-secondary);
}
.stamp__btn:hover {
  background: var(--color-panel-secondary);
}
.stamp__btn--replay {
  border-color: var(--color-info);
}
.stamp__badge {
  padding: 3px 7px;
  border-radius: var(--radius-chip);
  background: var(--color-ink);
  color: var(--color-ink-on-dark);
  font-size: var(--text-11);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.stamp__text {
  display: grid;
  text-align: left;
  line-height: 15px;
  white-space: nowrap;
}
.stamp__mode {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.stamp__time {
  font-size: var(--text-12);
  color: var(--color-ink);
}
.stamp__pop {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 60;
  width: 340px;
  padding: 16px;
  display: grid;
  gap: 10px;
  font-size: var(--text-12);
  line-height: 18px;
  color: var(--color-ink-secondary);
  box-shadow: var(--shadow-drawer);
}
.stamp__title {
  font-size: var(--text-13);
  font-weight: 600;
  color: var(--color-ink);
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
}
dt {
  color: var(--color-ink-muted);
}
dd {
  margin: 0;
  color: var(--color-ink);
}
.stamp__note {
  color: var(--color-critical);
  font-weight: 500;
}
</style>

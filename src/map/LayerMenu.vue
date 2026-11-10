<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { LAYERS, type LayerConfig, type LayerId, type ScopeLevel } from '@/core/layers';
import { PORT_WAIT_THRESHOLDS } from '@/selectors/mapLayers';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';
import { cssHex, markerColors as MC } from './theme';

type Swatch = { label: string; color: string; shape: 'arrow' | 'ring' | 'diamond' | 'line' | 'dotted' | 'dashed' | 'fill' | 'hatch' };

const view = useViewStore();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const toggleBtn = ref<HTMLButtonElement | null>(null);

const SCOPE_NAME: Record<ScopeLevel, string> = { earth: 'Earth', region: 'Region', country: 'Country', city: 'City', port: 'Port' };

const LEGEND: Partial<Record<LayerId, Swatch[]>> = {
  fleet: [
    { label: 'Open incident', color: cssHex(MC.incident), shape: 'arrow' },
    { label: 'At risk (incident or active hazard)', color: cssHex(MC.atRisk), shape: 'arrow' },
    { label: 'Forecast late > 60 min', color: cssHex(MC.delayed), shape: 'arrow' },
    { label: 'On plan', color: cssHex(MC.onPlan), shape: 'arrow' },
    { label: 'Stale position (> 30 min)', color: cssHex(MC.stale), shape: 'arrow' },
  ],
  ambient: [{ label: 'Other simulated traffic (smaller)', color: cssHex(MC.ambient), shape: 'arrow' }],
  ports: [
    { label: `Wait < ${PORT_WAIT_THRESHOLDS.warning} h`, color: cssHex(MC.portHealthy), shape: 'diamond' },
    { label: `Wait ${PORT_WAIT_THRESHOLDS.warning}–${PORT_WAIT_THRESHOLDS.critical} h`, color: cssHex(MC.portWarning), shape: 'diamond' },
    { label: `Wait ≥ ${PORT_WAIT_THRESHOLDS.critical} h`, color: cssHex(MC.portCritical), shape: 'diamond' },
    { label: 'No estimate (unknown, not free)', color: cssHex(MC.portUnknown), shape: 'diamond' },
  ],
  routes: [
    { label: 'Synthetic corridor', color: cssHex(MC.route), shape: 'line' },
    { label: 'Selected voyage corridor', color: cssHex(MC.routeFocus), shape: 'line' },
    { label: 'Recorded track to sim time', color: cssHex(MC.track), shape: 'dotted' },
  ],
  weather: [
    { label: 'Moderate (active)', color: cssHex(MC.hazardModerate), shape: 'fill' },
    { label: 'High (active)', color: cssHex(MC.hazardHigh), shape: 'hatch' },
    { label: 'Severe (active)', color: cssHex(MC.hazardSevere), shape: 'hatch' },
    { label: 'Upcoming (outline only)', color: cssHex(MC.hazardModerate), shape: 'dashed' },
  ],
  incidents: [{ label: 'Unresolved incident ring', color: cssHex(MC.incident), shape: 'ring' }],
  traffic: [{ label: 'Vessels per 2° cell (darker = more)', color: cssHex(MC.density), shape: 'fill' }],
};

const ordered = computed(() => [...LAYERS].sort((a, b) => b.renderOrder - a.renderOrder));
const available = computed(() => ordered.value.filter((l) => l.scopes.includes(view.scope.level)));
const unavailable = computed(() => ordered.value.filter((l) => !l.scopes.includes(view.scope.level)));
const activeCount = computed(() => available.value.filter((l) => view.layers[l.id]).length);
const selectionOnly = computed(() => {
  const s = view.selection;
  return !!s && ['vessel', 'voyage', 'incident'].includes(s.kind) && (!view.layers.fleet || !view.layers.ambient);
});

function scopesText(l: LayerConfig) {
  return l.scopes.map((s) => SCOPE_NAME[s]).join(' · ');
}

function onDocPointer(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation();
    open.value = false;
    toggleBtn.value?.focus();
  }
}

watch(open, async (v) => {
  if (v) {
    document.addEventListener('pointerdown', onDocPointer, true);
    await nextTick();
    root.value?.querySelector<HTMLInputElement>('input')?.focus();
  } else document.removeEventListener('pointerdown', onDocPointer, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer, true));
</script>

<template>
  <div ref="root" class="layer-menu" @keydown="onKey">
    <button
      ref="toggleBtn"
      type="button"
      class="map-tool"
      :class="{ 'map-tool--on': open }"
      :aria-expanded="open"
      aria-controls="layer-panel"
      :aria-label="`Map layers (${activeCount} on)`"
      title="Map layers"
      data-testid="layer-toggle"
      @click="open = !open"
    >
      <Icon name="layers" :size="16" />
    </button>
    <section v-if="open" id="layer-panel" class="panel layer-panel" role="dialog" aria-label="Map layers" data-testid="layer-panel">
      <header class="layer-panel__head">
        <h2>Layers</h2>
        <span class="micro-label">{{ SCOPE_NAME[view.scope.level] }} scope</span>
      </header>
      <ul class="layer-list">
        <li v-for="l in available" :key="l.id" class="layer">
          <label class="layer__row">
            <input type="checkbox" role="switch" class="switch" :checked="view.layers[l.id]" :data-testid="`layer-${l.id}`" @change="view.toggleLayer(l.id, ($event.target as HTMLInputElement).checked)" />
            <span class="layer__label">{{ l.label }}</span>
            <span class="layer__quality" :class="`layer__quality--${l.quality.toLowerCase()}`">{{ l.quality }}</span>
          </label>
          <p class="layer__meta">{{ l.legend }} · <span class="mono">{{ l.source }}</span></p>
          <ul v-if="view.layers[l.id] && LEGEND[l.id]" class="legend">
            <li v-for="s in LEGEND[l.id]" :key="s.label">
              <span class="swatch" :class="`swatch--${s.shape}`" :style="{ '--sw': s.color }" aria-hidden="true" />
              {{ s.label }}
            </li>
          </ul>
          <p v-else-if="l.id === 'anchorage' || l.id === 'berths'" class="layer__meta">Drawn in the 2D port view.</p>
        </li>
      </ul>
      <p v-if="selectionOnly" class="layer-note">The selected vessel stays visible (selection-only) while its layer is off.</p>
      <div v-if="unavailable.length" class="layer-unavailable">
        <span class="micro-label">Not available at this scope</span>
        <ul>
          <li v-for="l in unavailable" :key="l.id">
            <strong>{{ l.label }}</strong> — available at {{ scopesText(l) }}
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer-menu {
  position: relative;
}
.map-tool--on {
  color: var(--color-accent-ink) !important;
  border-color: var(--color-accent) !important;
}
.layer-panel {
  position: absolute;
  right: calc(100% + 8px);
  bottom: 0;
  width: 320px;
  max-height: min(70vh, 620px);
  overflow: auto;
  padding: 12px 14px;
  z-index: 30;
}
.layer-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.layer-panel__head h2 {
  margin: 0;
  font-size: var(--text-14);
  font-weight: 600;
}
.layer-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.layer__row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.layer__label {
  flex: 1;
  font-size: var(--text-13);
  font-weight: 500;
}
.layer__quality {
  padding: 0 6px;
  border-radius: var(--radius-chip);
  font-size: var(--text-11);
  line-height: 18px;
  background: var(--color-panel-secondary);
  color: var(--color-ink-secondary);
}
.layer__quality--derived {
  background: var(--color-info-subtle);
  color: var(--color-info);
}
.layer__meta {
  margin: 2px 0 0 36px;
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
  line-height: 15px;
}
.legend {
  display: grid;
  gap: 3px;
  margin: 6px 0 0 36px;
  padding: 0;
  list-style: none;
  font-size: var(--text-11);
  color: var(--color-ink);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.swatch {
  flex: none;
  width: 18px;
  height: 12px;
  border-radius: 2px;
  background: #061a28;
  position: relative;
}
.swatch::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
}
.swatch--arrow::after {
  width: 8px;
  height: 10px;
  background: var(--sw);
  clip-path: polygon(50% 0, 100% 100%, 50% 74%, 0 100%);
}
.swatch--diamond::after {
  width: 8px;
  height: 8px;
  background: var(--sw);
  transform: rotate(45deg);
  outline: 1px solid #e8eef2;
}
.swatch--ring::after {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px dashed var(--sw);
}
.swatch--line::after,
.swatch--dotted::after,
.swatch--dashed::after {
  height: 0;
  width: 14px;
  border-top: 2px solid var(--sw);
}
.swatch--dotted::after {
  border-top-style: dotted;
}
.swatch--dashed::after {
  border-top-style: dashed;
}
.swatch--fill {
  background: color-mix(in srgb, var(--sw) 55%, #061a28);
}
.swatch--hatch {
  background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--sw) 60%, #061a28) 0 3px, color-mix(in srgb, var(--sw) 85%, #fff) 3px 4px);
}
.layer-note {
  margin: 10px 0 0;
  padding: 6px 8px;
  border-radius: var(--radius-input);
  background: var(--color-info-subtle);
  color: var(--color-info);
  font-size: var(--text-11);
}
.layer-unavailable {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border);
}
.layer-unavailable ul {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
  display: grid;
  gap: 2px;
}
.switch {
  appearance: none;
  flex: none;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--color-border);
  position: relative;
  cursor: pointer;
  transition: background var(--motion-hover);
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform var(--motion-hover);
}
.switch:checked {
  background: var(--color-accent);
}
.switch:checked::after {
  transform: translateX(12px);
}
.switch:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>

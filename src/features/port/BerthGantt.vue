<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useNavigation } from '@/router/useRouteSync';
import { BAR_KIND_LABEL, berthGanttView, GANTT_WINDOWS, type GanttWindow } from '@/selectors/berthGantt';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';

const catalog = useCatalogStore();
const clock = useClockStore();
const snap = useSnapshotStore();
const view = useViewStore();
const nav = useNavigation();

const expanded = ref(true);
/** An open inspector takes priority: the schedule folds to its header until the inspector closes (or on request). */
const yieldToInspector = ref(false);
const docked = computed(() => view.inspectorOpen && !view.sheetLayout);
watch(docked, (v) => (yieldToInspector.value = v), { immediate: true });
const open = computed(() => expanded.value && !yieldToInspector.value);

function toggle() {
  if (yieldToInspector.value) {
    yieldToInspector.value = false;
    expanded.value = true;
  } else expanded.value = !expanded.value;
}
const root = ref<HTMLElement | null>(null);
let observer: ResizeObserver | null = null;

/** Map scenes frame their focus above the schedule (panel height + its bottom offset). */
function reportInset() {
  const el = root.value;
  view.bottomInsetPx = el ? el.offsetHeight + parseFloat(getComputedStyle(el).bottom || '0') : 0;
}
onMounted(() => {
  observer = new ResizeObserver(reportInset);
  if (root.value) observer.observe(root.value);
  reportInset();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  view.bottomInsetPx = 0;
});
const hours = ref<GanttWindow>(48);
const gantt = computed(() => (catalog.catalog && snap.portTwin ? berthGanttView(catalog.catalog, snap.portTwin, clock.timeMs, hours.value) : null));

/** The now line spans the track column only (right of the berth labels). */
const nowStyle = computed(() => ({ left: `calc(var(--label-w) + (100% - var(--label-w)) * ${(gantt.value?.nowPct ?? 0) / 100})` }));

function pickBar(berthId: string, vesselId: string) {
  view.selectBerth(berthId);
  nav.openEntity({ kind: 'vessel', id: vesselId });
}
</script>

<template>
  <section v-if="gantt" ref="root" class="gantt" :class="{ 'gantt--closed': !open }" aria-label="Berth schedule" data-testid="berth-gantt">
    <header class="gantt__head">
      <button type="button" class="gantt__toggle" :aria-expanded="open" data-testid="gantt-toggle" @click="toggle">
        <Icon :name="open ? 'chevron-down' : 'chevron-right'" :size="14" />
        <span class="gantt__title">Berth schedule</span>
      </button>
      <span class="gantt__sim">Simulated</span>
      <span v-if="gantt.conflictCount" class="gantt__conflicts" data-testid="gantt-conflict-count">
        {{ gantt.conflictCount }} overlap{{ gantt.conflictCount === 1 ? '' : 's' }} · not yet validated
      </span>
      <template v-if="open">
        <ul class="gantt__legend" aria-label="Bar legend">
          <li><span class="swatch swatch--actual" aria-hidden="true" />{{ BAR_KIND_LABEL.actual }}</li>
          <li><span class="swatch swatch--planned" aria-hidden="true" />{{ BAR_KIND_LABEL.planned }}</li>
          <li><span class="swatch swatch--forecast" aria-hidden="true" />{{ BAR_KIND_LABEL.forecast }}</li>
          <li><span class="swatch swatch--requested" aria-hidden="true" />Requested</li>
          <li><span class="swatch swatch--conflict" aria-hidden="true" />Overlap</li>
        </ul>
        <div class="gantt__windows" role="group" aria-label="Schedule window">
          <button
            v-for="h in GANTT_WINDOWS"
            :key="h"
            type="button"
            class="gantt__window"
            :aria-pressed="hours === h"
            :data-testid="`gantt-window-${h}`"
            @click="hours = h"
          >
            {{ h }} h
          </button>
        </div>
      </template>
    </header>
    <div v-if="open" class="gantt__body">
      <div class="gantt__axis" aria-hidden="true">
        <span class="gantt__axis-pad" />
        <span class="gantt__axis-track">
          <span v-for="t in gantt.ticks" :key="t.key" class="gantt__tick" :class="{ 'gantt__tick--day': t.day }" :style="{ left: `${t.leftPct}%` }">{{ t.label }}</span>
        </span>
      </div>
      <ol class="gantt__rows">
        <li
          v-for="r in gantt.rows"
          :key="r.berthId"
          class="gantt__row"
          :class="{ 'gantt__row--active': r.berthId === view.berthId }"
          :data-testid="`gantt-row-${r.berthId}`"
        >
          <button
            type="button"
            class="gantt__label"
            :aria-pressed="r.berthId === view.berthId"
            :aria-label="`${r.name}, ${r.terminalName}: ${r.statusLabel}. Focus berth`"
            @click="view.selectBerth(r.berthId)"
          >
            <span class="gantt__dot" :class="`gantt__dot--${r.status}`" aria-hidden="true" />
            <span class="gantt__name">{{ r.name }}</span>
          </button>
          <div class="gantt__track" @click.self="view.selectBerth(r.berthId)">
            <button
              v-for="b in r.bars"
              :key="b.key"
              type="button"
              class="gantt__bar"
              :class="[`gantt__bar--${b.kind}`, { 'gantt__bar--open': b.open, 'gantt__bar--clip-start': b.clippedStart, 'gantt__bar--clip-end': b.clippedEnd }]"
              :style="{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }"
              :title="b.title"
              :aria-label="b.title"
              :data-kind="b.kind"
              data-testid="gantt-bar"
              @click="pickBar(r.berthId, b.vesselId)"
            >
              <span v-if="b.kind !== 'forecast'" class="gantt__bar-text">{{ b.vesselName }}</span>
            </button>
            <span v-for="m in r.requested" :key="m.key" class="gantt__req" :style="{ left: `${m.leftPct}%` }" :title="m.title" data-testid="gantt-requested" />
            <span
              v-for="x in r.conflicts"
              :key="x.key"
              class="gantt__conflict"
              :class="`gantt__conflict--${x.basis}`"
              :style="{ left: `${x.leftPct}%`, width: `${x.widthPct}%` }"
              :title="x.title"
              role="img"
              :aria-label="x.title"
              :data-basis="x.basis"
              data-testid="gantt-conflict"
            />
          </div>
        </li>
      </ol>
      <span class="gantt__now" :style="nowStyle" data-testid="gantt-now">
        <span class="gantt__now-label">{{ clock.mode === 'replay' ? 'Replay' : 'Now' }}</span>
      </span>
      <p class="gantt__note">{{ gantt.note }}</p>
    </div>
  </section>
</template>

<style scoped>
.gantt {
  --label-w: 128px;
  --row-h: 20px;
  position: absolute;
  z-index: 18;
  left: calc(var(--map-control-gap) * 2 + var(--shelf-w, 0px));
  right: calc(var(--map-control-gap) * 2 + var(--gantt-right, 84px));
  bottom: calc(36px + var(--rail-lift, 0px));
  display: grid;
  gap: 4px;
  padding: 6px 10px 6px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-11);
}
.gantt--closed {
  right: auto;
}
.gantt__head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 24px;
  flex-wrap: wrap;
}
.gantt__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--radius-input);
  background: none;
  color: var(--color-ink);
  cursor: pointer;
}
.gantt__title {
  font-size: var(--text-12);
  font-weight: 600;
}
.gantt__sim {
  padding: 1px 6px;
  border-radius: var(--radius-chip);
  background: var(--color-muted, #f0f1ef);
  color: var(--color-ink-secondary);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 10px;
}
.gantt__conflicts {
  color: #8a5a0c;
  font-weight: 600;
}
.gantt__legend {
  display: flex;
  gap: 10px;
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
  color: var(--color-ink-secondary);
}
.gantt__legend li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.swatch {
  display: inline-block;
  width: 16px;
  height: 9px;
  border-radius: 2px;
}
.swatch--actual,
.gantt__bar--actual {
  background: #2f7f89;
}
.swatch--planned,
.gantt__bar--planned {
  background: repeating-linear-gradient(135deg, rgba(127, 139, 148, 0.85) 0 3px, rgba(127, 139, 148, 0.25) 3px 6px);
  border: 1px solid #7f8b94;
}
.swatch--forecast,
.gantt__bar--forecast {
  background: rgba(166, 169, 180, 0.32);
  border: 1px dashed #8a8e9a;
}
.swatch--requested {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid #13191e;
  border-radius: 0;
}
.swatch--conflict,
.gantt__conflict {
  background: rgba(212, 154, 46, 0.22);
  outline: 2px solid #b67b17;
  outline-offset: -2px;
}
.gantt__windows {
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  overflow: hidden;
}
.gantt__window {
  padding: 1px 8px;
  border: 0;
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
  cursor: pointer;
}
.gantt__window[aria-pressed='true'] {
  background: var(--color-ink);
  color: var(--color-panel);
}
.gantt__body {
  position: relative;
  display: grid;
  gap: 2px;
}
.gantt__axis {
  display: grid;
  grid-template-columns: var(--label-w) 1fr;
  height: 14px;
}
.gantt__axis-track {
  position: relative;
}
.gantt__tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  color: var(--color-ink-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.gantt__tick--day {
  color: var(--color-ink);
  font-weight: 600;
}
.gantt__rows {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.gantt__row {
  display: grid;
  grid-template-columns: var(--label-w) 1fr;
  height: var(--row-h);
  border-radius: 3px;
}
.gantt__row--active {
  background: rgba(230, 106, 45, 0.1);
  box-shadow: inset 2px 0 0 #e66a2d;
}
.gantt__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0 6px;
  border: 0;
  background: none;
  color: var(--color-ink);
  font-size: var(--text-11);
  text-align: left;
  cursor: pointer;
}
.gantt__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gantt__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a6a9b4;
}
.gantt__dot--occupied {
  background: #2f7f89;
}
.gantt__dot--reserved {
  background: #7f8b94;
}
.gantt__dot--free {
  background: #147a66;
}
.gantt__dot--unavailable {
  background: #c63b3b;
}
.gantt__track {
  position: relative;
  border-bottom: 1px solid var(--color-border);
  background: repeating-linear-gradient(90deg, transparent 0 calc(100% / 8 - 1px), rgba(19, 25, 30, 0.04) calc(100% / 8 - 1px) calc(100% / 8));
  cursor: pointer;
}
.gantt__bar {
  position: absolute;
  top: 3px;
  bottom: 3px;
  min-width: 3px;
  padding: 0 4px;
  border: 0;
  border-radius: 3px;
  overflow: hidden;
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  text-align: left;
  cursor: pointer;
}
.gantt__bar--planned,
.gantt__bar--forecast {
  color: var(--color-ink);
}
.gantt__bar--forecast {
  top: 6px;
  bottom: 1px;
}
.gantt__bar--planned {
  top: 1px;
  bottom: 6px;
}
.gantt__bar--open {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.gantt__bar--clip-start {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
.gantt__bar--clip-end {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.gantt__bar:focus-visible {
  outline: 2px solid #e66a2d;
  outline-offset: 1px;
}
.gantt__bar-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gantt__req {
  position: absolute;
  top: -1px;
  width: 0;
  height: 0;
  transform: translateX(-5px);
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 7px solid #13191e;
  pointer-events: auto;
}
.gantt__conflict {
  position: absolute;
  top: 0;
  bottom: 0;
  border-radius: 3px;
  pointer-events: auto;
}
.gantt__conflict--forecast {
  outline-style: dashed;
}
.gantt__now {
  position: absolute;
  top: 0;
  bottom: 18px;
  width: 0;
  border-left: 2px solid #13191e;
  pointer-events: none;
}
.gantt__now-label {
  position: absolute;
  top: -1px;
  left: 3px;
  padding: 0 4px;
  border-radius: 2px;
  background: #13191e;
  color: #fff;
  font-size: 10px;
  line-height: 13px;
}
.gantt__note {
  margin: 2px 0 0;
  color: var(--color-ink-muted);
}
@media (prefers-reduced-motion: no-preference) {
  .gantt__bar {
    transition: filter var(--motion-hover, 120ms);
  }
  .gantt__bar:hover {
    filter: brightness(1.1);
  }
}
</style>

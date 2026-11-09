<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { formatDuration, formatLocal, formatUtc } from '@/core/format';
import { useNavigation } from '@/router/useRouteSync';
import { CATEGORY_LABEL, compareWithNow, currentMarker, densityBins, railMarkers, stepMarker, type RailMarker } from '@/selectors/replay';
import { useCatalogStore } from '@/stores/catalog';
import { REPLAY_SPEEDS, useClockStore, type ReplaySpeed } from '@/stores/clock';
import { useSnapshotStore } from '@/stores/snapshot';
import { useViewStore } from '@/stores/view';
import { useWorkflowStore } from '@/stores/workflow';
import Icon from '@/components/ui/Icon.vue';

const catalog = useCatalogStore();
const clock = useClockStore();
const snap = useSnapshotStore();
const view = useViewStore();
const wf = useWorkflowStore();
const nav = useNavigation();
const ids = { scrub: useId(), help: useId(), note: useId() };

const TICK_HOURS = 2;

const contextPortId = computed(() => {
  const c = catalog.catalog;
  const sel = view.selection;
  if (sel?.kind === 'incident') return c?.byId.incident.get(sel.id)?.portId ?? null;
  return view.scope.level === 'port' ? view.scope.portId : null;
});
const timeZone = computed(() => (contextPortId.value ? (catalog.catalog?.byId.port.get(contextPortId.value)?.timeZone ?? null) : null));
const markers = computed<RailMarker[]>(() => (catalog.catalog ? railMarkers(catalog.catalog, view.selection, view.scope.level === 'port' ? view.scope.portId : null, clock.startMs, clock.anchorMs) : []));
const bins = computed(() => (catalog.catalog ? densityBins(catalog.catalog, clock.startMs, clock.anchorMs) : []));
const current = computed(() => currentMarker(markers.value, clock.timeMs));
const contextText = computed(() => {
  const sel = view.selection;
  if (sel) return `Events for ${sel.id} and linked records`;
  if (contextPortId.value) return `Events at ${catalog.catalog?.byId.port.get(contextPortId.value)?.name ?? contextPortId.value}`;
  return 'Case openings and storm warnings';
});
const markerCount = computed(() => `${markers.value.length} ${markers.value.length === 1 ? 'marker' : 'markers'}`);
const ticks = computed(() => {
  const out: { at: number; label: string }[] = [];
  const span = Math.max(1, clock.anchorMs - clock.startMs);
  const first = Math.ceil(clock.startMs / (TICK_HOURS * 3600_000)) * TICK_HOURS * 3600_000;
  for (let t = first; t <= clock.anchorMs; t += TICK_HOURS * 3600_000) out.push({ at: (t - clock.startMs) / span, label: formatUtc(t, { date: false }).replace(' UTC', '') });
  return out;
});
const progressPct = computed(() => `${(clock.progress * 100).toFixed(2)}%`);
const historical = computed(() => clock.mode === 'replay');
const behindText = computed(() => (historical.value ? `${formatDuration(Math.round((clock.anchorMs - clock.timeMs) / 60_000))} earlier` : 'Latest simulated snapshot'));
const localText = computed(() => {
  if (!timeZone.value) return null;
  const local = formatLocal(clock.timeMs, timeZone.value);
  return `${local.slice(0, 10) === clock.iso.slice(0, 10) ? local.slice(11) : local} (${timeZone.value})`;
});
const compare = computed(() => (catalog.catalog && snap.snapshot && snap.nowSnapshot && historical.value ? compareWithNow(catalog.catalog, snap.snapshot, snap.nowSnapshot, view.selection ?? (contextPortId.value ? { kind: 'port', id: contextPortId.value } : null)) : []));
const valueText = computed(() => `${formatUtc(clock.timeMs)}${historical.value ? `, ${behindText.value} than Now` : ', Now (simulated)'}`);

let raf = 0;
let pending: number | null = null;
function onScrub(e: Event) {
  if (clock.playing) clock.pause();
  pending = Number((e.target as HTMLInputElement).value);
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (pending !== null) clock.seekMs(pending);
    pending = null;
  });
}
onMounted(() => (view.replayOpen = true));
onBeforeUnmount(() => cancelAnimationFrame(raf));

function onScrubKey(e: KeyboardEvent) {
  if (!e.shiftKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
  e.preventDefault();
  step(e.key === 'ArrowRight' ? 1 : -1);
}

function step(dir: 1 | -1) {
  const m = stepMarker(markers.value, clock.timeMs, dir);
  if (!m) return;
  clock.pause();
  clock.seekMs(m.ms);
}

function jump(m: RailMarker) {
  clock.pause();
  clock.seekMs(m.ms);
  if (!view.selection && m.target) nav.openEntity(m.target);
}

function togglePlay() {
  if (clock.playing) clock.pause();
  else clock.play();
}

function setSpeed(s: ReplaySpeed) {
  clock.setSpeed(s);
}

const noting = ref(false);
const noteText = ref('');
const noteError = ref<string | null>(null);
const noteInput = ref<HTMLTextAreaElement | null>(null);
function startNote() {
  clock.pause();
  noting.value = true;
  noteText.value = '';
  noteError.value = null;
  nextTick(() => noteInput.value?.focus());
}
function saveNote() {
  const r = wf.dispatch({ type: 'history.note', text: noteText.value, entityRefs: view.selection ? [view.selection] : [] });
  if (!r.ok) {
    noteError.value = r.error;
    return;
  }
  noting.value = false;
}
</script>

<template>
  <section class="rail" :class="{ 'rail--historical': historical }" aria-label="Replay timeline" data-testid="replay-rail">
    <div class="rail__bar">
      <button type="button" class="icon-btn rail__play" :aria-label="clock.playing ? 'Pause replay' : 'Play replay'" :aria-pressed="clock.playing" data-testid="replay-play" @click="togglePlay">
        <Icon :name="clock.playing ? 'pause' : 'play'" :size="16" />
      </button>
      <div class="seg" role="group" aria-label="Replay speed">
        <button v-for="s in REPLAY_SPEEDS" :key="s" type="button" class="seg__btn num" :aria-pressed="clock.speed === s" :data-testid="`replay-speed-${s}`" @click="setSpeed(s)">{{ s }}×</button>
      </div>
      <button type="button" class="icon-btn" aria-label="Previous event" :disabled="!markers.length" data-testid="replay-prev" @click="step(-1)">
        <Icon name="chevron-left" :size="16" />
      </button>
      <button type="button" class="icon-btn" aria-label="Next event" :disabled="!markers.length" data-testid="replay-next" @click="step(1)">
        <Icon name="chevron-right" :size="16" />
      </button>
      <div class="rail__time" aria-live="polite">
        <span class="rail__mode" :class="{ 'rail__mode--hist': historical }">{{ historical ? 'Historical' : 'Now (simulated)' }}</span>
        <strong class="mono" data-testid="replay-time">{{ formatUtc(clock.timeMs) }}</strong>
        <span v-if="localText" class="rail__sub mono">{{ localText }}</span>
        <span class="rail__sub">{{ behindText }}</span>
      </div>
      <div class="rail__actions">
        <button type="button" class="btn btn--sm" :disabled="!historical" :title="historical ? undefined : 'Move back in time to note a historical moment.'" aria-label="Add a note about this historical moment" data-testid="replay-note" @click="startNote">Add note</button>
        <button type="button" class="btn btn--sm btn--primary" :disabled="!historical" data-testid="replay-now" @click="clock.reset()">
          <Icon name="reset" :size="14" /> Return to Now
        </button>
        <button type="button" class="icon-btn" aria-label="Close replay and return to Now" data-testid="replay-close" @click="nav.closeReplay()">
          <Icon name="close" :size="16" />
        </button>
      </div>
    </div>

    <div class="rail__body">
      <div class="track">
        <div class="track__density" aria-hidden="true">
          <span v-for="b in bins" :key="b.startMs" class="track__bin" :style="{ left: `${b.at * 100}%`, width: `${b.width * 100}%`, height: `${4 + b.level * 22}px` }" />
        </div>
        <div class="track__markers">
          <button
            v-for="m in markers"
            :key="m.eventId"
            type="button"
            class="mark"
            :class="[`mark--${m.category}`, { 'mark--current': current?.eventId === m.eventId }]"
            :style="{ left: `${m.at * 100}%` }"
            :title="`${m.timeText} · ${CATEGORY_LABEL[m.category]} · ${m.label}`"
            :aria-label="`Jump to ${m.timeText}: ${m.label}`"
            :data-testid="`replay-marker-${m.eventId}`"
            @click="jump(m)"
          />
        </div>
        <div class="track__fill" :style="{ width: progressPct }" aria-hidden="true" />
        <label :for="ids.scrub" class="sr-only">Simulation time</label>
        <input
          :id="ids.scrub"
          class="track__input"
          type="range"
          :min="clock.startMs"
          :max="clock.anchorMs"
          step="60000"
          :value="clock.timeMs"
          :aria-valuetext="valueText"
          :aria-describedby="ids.help"
          data-testid="replay-scrubber"
          @input="onScrub"
          @keydown="onScrubKey"
        />
        <div class="track__ticks" aria-hidden="true">
          <span v-for="t in ticks" :key="t.at" :style="{ left: `${t.at * 100}%` }">{{ t.label }}</span>
        </div>
      </div>
      <p :id="ids.help" class="rail__help">
        {{ contextText }} · {{ markerCount }}. Arrow keys step one minute; Shift+Arrow jumps between events.
      </p>
      <p class="rail__event" data-testid="replay-current">
        <template v-if="current">
          <span class="dot" :class="`dot--${current.category}`" aria-hidden="true" />
          Last event <span class="mono">{{ current.timeText }}</span> · {{ current.label }}
        </template>
        <template v-else>No recorded event for this context before {{ formatUtc(clock.timeMs, { date: false }) }}.</template>
      </p>
    </div>

    <aside v-if="noting" class="rail__side" aria-label="Note this moment">
      <form class="form" @submit.prevent="saveNote" @keydown.esc.stop.prevent="noting = false">
        <label :for="ids.note" class="field">
          Note about {{ formatUtc(clock.timeMs) }}<template v-if="view.selection"> · {{ view.selection.id }}</template>
          <textarea :id="ids.note" ref="noteInput" v-model="noteText" class="control" rows="2" data-testid="replay-note-input" />
        </label>
        <p v-if="noteError" class="form-error" role="alert">{{ noteError }}</p>
        <p class="form-hint">Saved to the local audit log at your current time, referencing this historical instant. No case changes.</p>
        <div class="form-row">
          <button type="submit" class="btn btn--sm btn--primary" data-testid="replay-note-save">Save note</button>
          <button type="button" class="btn btn--sm" @click="noting = false">Cancel</button>
        </div>
      </form>
    </aside>
    <aside v-else-if="historical" class="rail__side" aria-label="Compared with Now" data-testid="replay-compare">
      <table class="cmp">
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">Value</span></th>
            <th scope="col">At {{ formatUtc(clock.timeMs, { date: false }).replace(' UTC', '') }}</th>
            <th scope="col">Now</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in compare" :key="r.label" :class="{ 'cmp--changed': r.changed }">
            <th scope="row" :title="r.label">{{ r.label }}</th>
            <td class="num" :title="r.then">{{ r.then }}</td>
            <td class="num" :title="r.now">{{ r.now }}</td>
          </tr>
        </tbody>
      </table>
    </aside>
  </section>
</template>

<style scoped>
.rail {
  position: absolute;
  left: var(--map-control-gap);
  right: var(--map-control-gap);
  bottom: 36px;
  z-index: 35;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  column-gap: 16px;
  height: var(--rail-h);
  padding: 8px 12px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.rail--historical {
  border-color: var(--color-info);
}
.rail__bar {
  grid-column: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.rail__bar > .icon-btn,
.seg {
  flex: none;
}
.rail__play {
  border: 1px solid var(--color-border);
}
.seg {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  overflow: hidden;
}
.seg__btn {
  height: 30px;
  min-width: 36px;
  padding: 0 6px;
  border: 0;
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  font-size: var(--text-12);
  cursor: pointer;
}
.seg__btn + .seg__btn {
  border-left: 1px solid var(--color-border);
}
.seg__btn[aria-pressed='true'] {
  background: var(--color-accent-subtle);
  color: var(--color-accent-hover);
  font-weight: 600;
}
.rail__time {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  margin-left: 4px;
  font-size: var(--text-12);
}
.rail__time strong {
  font-size: var(--text-13);
}
.rail__mode {
  padding: 0 6px;
  border-radius: var(--radius-chip);
  background: var(--color-panel-secondary);
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
  font-weight: 600;
  line-height: 18px;
}
.rail__mode--hist {
  background: var(--color-info-subtle);
  color: var(--color-info);
}
.rail__sub {
  color: var(--color-ink-muted);
}
.rail__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: none;
}
.rail__body {
  grid-column: 1;
  display: grid;
  gap: 2px;
  min-width: 0;
}
.track {
  position: relative;
  height: 54px;
  margin: 2px 6px 0;
}
.track__density {
  position: absolute;
  inset: 0 0 23px;
  display: block;
}
.track__bin {
  position: absolute;
  bottom: 0;
  border-radius: 2px 2px 0 0;
  background: var(--color-panel-secondary);
  box-shadow: inset 0 0 0 1px var(--color-border);
}
.track__fill {
  position: absolute;
  left: 0;
  bottom: 21px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-accent);
  pointer-events: none;
}
.track__markers {
  position: absolute;
  inset: 0 0 23px;
  pointer-events: none;
}
.mark {
  position: absolute;
  top: 0;
  width: 8px;
  height: 14px;
  margin-left: -4px;
  padding: 0;
  border: 1px solid var(--color-panel);
  border-radius: 2px;
  background: var(--color-ink-muted);
  cursor: pointer;
  pointer-events: auto;
}
.mark--current {
  outline: 2px solid var(--color-ink);
  outline-offset: 1px;
}
.mark--eta,
.mark--portDelay,
.dot--eta,
.dot--portDelay {
  background: var(--color-warning);
}
.mark--case,
.mark--weather,
.dot--case,
.dot--weather {
  background: var(--color-critical);
}
.mark--anchorage,
.dot--anchorage {
  background: var(--color-info);
}
.mark--berth,
.dot--berth {
  background: var(--color-healthy);
}
.mark--position,
.dot--position {
  background: var(--color-ink-muted);
}
.track__input {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  width: 100%;
  height: 20px;
  margin: 0;
  background: transparent;
  appearance: none;
  cursor: pointer;
}
.track__input::-webkit-slider-runnable-track {
  height: 3px;
  background: var(--color-border);
  border-radius: 2px;
}
.track__input::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5.5px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--color-accent);
  box-shadow: 0 0 0 1px var(--color-accent);
}
.track__input::-moz-range-track {
  height: 3px;
  background: var(--color-border);
}
.track__input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: var(--color-accent);
}
.track__ticks {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 12px;
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.track__ticks span {
  position: absolute;
  transform: translateX(-50%);
  font-variant-numeric: tabular-nums;
}
.track__ticks span:first-child {
  transform: none;
}
.track__ticks span:last-child {
  transform: translateX(-100%);
}
.rail__help,
.rail__event {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-11);
  line-height: 15px;
  color: var(--color-ink-muted);
}
.rail__event {
  font-size: var(--text-12);
  line-height: 16px;
  color: var(--color-ink);
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 4px;
  border-radius: 2px;
  vertical-align: 0;
}
.rail__side {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: 360px;
  min-height: 0;
  padding-left: 16px;
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
}
.cmp {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: var(--text-12);
  line-height: 16px;
}
.cmp th,
.cmp td {
  padding: 2px 4px;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cmp thead th:first-child {
  width: 36%;
}
.cmp thead th {
  font-size: var(--text-11);
  font-weight: 500;
  color: var(--color-ink-muted);
}
.cmp tbody th {
  font-weight: 500;
  color: var(--color-ink-secondary);
}
.cmp--changed td:first-of-type {
  color: var(--color-info);
  font-weight: 600;
}
.rail__side .form {
  gap: 6px;
}
.rail__side textarea {
  min-height: 44px;
  resize: none;
}
@media (prefers-reduced-motion: reduce) {
  .track__fill {
    transition: none;
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { formatDuration, formatLocal, formatUtc } from '@/core/format';
import { HOUR } from '@/core/time';
import { LOOP_RANGES, PLAYBACK_RATES, isPlaybackRate } from '@/core/scenarioClock';
import { useNavigation } from '@/router/useRouteSync';
import { CATEGORY_LABEL, compareWithNow, currentMarker, densityBins, railMarkers, stepMarker, type RailMarker } from '@/selectors/replay';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
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
const ids = { scrub: useId(), help: useId(), note: useId(), rate: useId() };

const contextPortId = computed(() => {
  const c = catalog.catalog;
  const sel = view.selection;
  if (sel?.kind === 'incident') return c?.byId.incident.get(sel.id)?.portId ?? null;
  return view.scope.level === 'port' ? view.scope.portId : null;
});
const timeZone = computed(() => (contextPortId.value ? (catalog.catalog?.byId.port.get(contextPortId.value)?.timeZone ?? null) : null));
const span = computed(() => Math.max(1, clock.rangeEndMs - clock.rangeStartMs));
const markers = computed<RailMarker[]>(() => (catalog.catalog ? railMarkers(catalog.catalog, view.selection, view.scope.level === 'port' ? view.scope.portId : null, clock.rangeStartMs, clock.rangeEndMs) : []));
const bins = computed(() => (catalog.catalog ? densityBins(catalog.catalog, clock.rangeStartMs, clock.rangeEndMs, Math.max(30, Math.round(span.value / HOUR / 48) * 60)) : []));
const current = computed(() => currentMarker(markers.value, clock.timeMs));
const contextText = computed(() => {
  const sel = view.selection;
  if (sel) return `Events for ${sel.id} and linked records`;
  if (contextPortId.value) return `Events at ${catalog.catalog?.byId.port.get(contextPortId.value)?.name ?? contextPortId.value}`;
  return 'Case openings and storm warnings';
});
const markerCount = computed(() => `${markers.value.length} ${markers.value.length === 1 ? 'marker' : 'markers'}`);
const ticks = computed(() => {
  const hours = span.value / HOUR;
  const every = (hours <= 6 ? 1 : hours <= 24 ? 3 : hours <= 72 ? 12 : 24) * HOUR;
  const out: { at: number; label: string }[] = [];
  const first = Math.ceil(clock.rangeStartMs / every) * every;
  for (let t = first; t <= clock.rangeEndMs; t += every) {
    const full = formatUtc(t);
    out.push({ at: (t - clock.rangeStartMs) / span.value, label: hours <= 24 ? full.slice(11, 16) : hours <= 72 ? full.slice(5, 16) : full.slice(5, 10) });
  }
  return out;
});
const pct = (ms: number) => `${(((ms - clock.rangeStartMs) / span.value) * 100).toFixed(3)}%`;
const progressPct = computed(() => `${(Math.min(1, Math.max(0, clock.progress)) * 100).toFixed(2)}%`);
const anchorInRange = computed(() => clock.anchorMs >= clock.rangeStartMs && clock.anchorMs <= clock.rangeEndMs);
const simStyle = computed(() => {
  const from = Math.max(clock.anchorMs, clock.rangeStartMs);
  if (from >= clock.rangeEndMs) return null;
  return { left: pct(from), right: '0' };
});
const historical = computed(() => clock.phase === 'history');
const away = computed(() => clock.phase !== 'now');
const phaseText = computed(() => (clock.phase === 'history' ? 'Historical' : clock.phase === 'simulation' ? 'Simulated ahead' : 'Now (simulated)'));
const offsetText = computed(() => {
  const min = Math.round(Math.abs(clock.anchorMs - clock.timeMs) / 60_000);
  if (clock.phase === 'history') return `${formatDuration(min)} earlier than Now`;
  if (clock.phase === 'simulation') return `${formatDuration(min)} after Now`;
  return 'Latest simulated snapshot';
});
const localText = computed(() => {
  if (!timeZone.value) return null;
  const local = formatLocal(clock.timeMs, timeZone.value);
  return `${local.slice(0, 10) === clock.iso.slice(0, 10) ? local.slice(11) : local} (${timeZone.value})`;
});
const compare = computed(() => (catalog.catalog && snap.snapshot && snap.nowSnapshot && away.value ? compareWithNow(catalog.catalog, snap.snapshot, snap.nowSnapshot, view.selection ?? (contextPortId.value ? { kind: 'port', id: contextPortId.value } : null)) : []));
const valueText = computed(() => `${formatUtc(clock.timeMs)}, ${offsetText.value}`);

/** Vessel the follow toggle applies to: the selected vessel, or the vessel of the selected voyage. */
const followVesselId = computed(() => {
  const sel = view.selection;
  if (sel?.kind === 'vessel') return sel.id;
  if (sel?.kind === 'voyage') return catalog.catalog?.byId.voyage.get(sel.id)?.vesselId ?? null;
  return null;
});
const following = computed(() => !!view.follow && view.follow.vesselId === followVesselId.value);
function toggleFollow() {
  if (following.value) view.stopFollow();
  else if (followVesselId.value) {
    if (view.selection?.kind !== 'vessel') nav.openEntity({ kind: 'vessel', id: followVesselId.value });
    view.startFollow(followVesselId.value);
  }
}

/** Events crossed while playing, counted from the clock's commit spans (never skipped by the 10 Hz throttle). */
const passed = ref(0);
watch(
  () => snap.crossedEvents,
  (list) => (passed.value += list.length),
);

let raf = 0;
let pending: number | null = null;
function onScrubInput(e: Event) {
  if (clock.mode !== 'scrubbing') clock.beginScrub();
  pending = Number((e.target as HTMLInputElement).value);
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (pending !== null) clock.scrub(pending);
    pending = null;
  });
}
function onScrubCommit(e: Event) {
  cancelAnimationFrame(raf);
  raf = 0;
  pending = null;
  clock.endScrub(Number((e.target as HTMLInputElement).value));
}
function onScrubRelease() {
  if (clock.mode === 'scrubbing') clock.endScrub();
}
onMounted(() => (view.replayOpen = true));
onBeforeUnmount(() => cancelAnimationFrame(raf));

function onScrubKey(e: KeyboardEvent) {
  if (!e.shiftKey || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
  e.preventDefault();
  clock.step(e.key === 'ArrowRight' ? 1 : -1, true);
}

function stepEvent(dir: 1 | -1) {
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
  else {
    passed.value = 0;
    clock.play();
  }
}

function onRate(e: Event) {
  const r = Number((e.target as HTMLSelectElement).value);
  if (isPlaybackRate(r)) clock.setRate(r);
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
  <section class="rail" :class="{ 'rail--historical': away }" aria-label="Replay timeline" data-testid="replay-rail">
    <div class="rail__bar">
      <button type="button" class="icon-btn rail__play" :aria-label="clock.playing ? 'Pause' : 'Play'" :aria-pressed="clock.playing" data-testid="replay-play" @click="togglePlay">
        <Icon :name="clock.playing ? 'pause' : 'play'" :size="16" />
      </button>
      <button type="button" class="icon-btn" aria-label="Back 5 minutes" title="Back 5 min (Shift: 1 h on the timeline)" data-testid="replay-step-back" @click="clock.step(-1)">
        <Icon name="step-back" :size="15" />
      </button>
      <button type="button" class="icon-btn" aria-label="Forward 5 minutes" title="Forward 5 min (Shift: 1 h on the timeline)" data-testid="replay-step-forward" @click="clock.step(1)">
        <Icon name="step-forward" :size="15" />
      </button>
      <label :for="ids.rate" class="sr-only">Playback rate</label>
      <select :id="ids.rate" class="control rail__rate num" :value="clock.rate" data-testid="replay-rate" @change="onRate">
        <option v-for="r in PLAYBACK_RATES" :key="r" :value="r">Simulation ×{{ r }}</option>
      </select>
      <button type="button" class="icon-btn" aria-label="Previous event" :disabled="!markers.length" data-testid="replay-prev" @click="stepEvent(-1)">
        <Icon name="chevron-left" :size="16" />
      </button>
      <button type="button" class="icon-btn" aria-label="Next event" :disabled="!markers.length" data-testid="replay-next" @click="stepEvent(1)">
        <Icon name="chevron-right" :size="16" />
      </button>
      <div class="rail__time" aria-live="polite">
        <span class="rail__mode" :class="{ 'rail__mode--hist': historical, 'rail__mode--sim': clock.phase === 'simulation' }" data-testid="replay-phase">{{ phaseText }}</span>
        <strong class="mono" data-testid="replay-time">{{ formatUtc(clock.timeMs) }}</strong>
        <span v-if="localText" class="rail__sub mono">{{ localText }}</span>
        <span class="rail__sub">{{ offsetText }}</span>
      </div>
      <div class="rail__actions">
        <button
          type="button"
          class="btn btn--sm"
          :class="{ 'btn--active': following }"
          :disabled="!followVesselId"
          :aria-pressed="following"
          :title="followVesselId ? undefined : 'Select a vessel to follow it.'"
          data-testid="replay-follow"
          @click="toggleFollow"
        >
          <Icon name="crosshair" :size="14" /> Follow selected vessel
        </button>
        <button type="button" class="btn btn--sm" :disabled="!historical" :title="historical ? undefined : 'Move back in time to note a historical moment.'" aria-label="Add a note about this historical moment" data-testid="replay-note" @click="startNote">Add note</button>
        <button type="button" class="btn btn--sm btn--primary" :disabled="!away" data-testid="replay-now" @click="clock.reset()">
          <Icon name="reset" :size="14" /> Return to Now
        </button>
        <button type="button" class="icon-btn" aria-label="Close replay and return to Now" data-testid="replay-close" @click="nav.closeReplay()">
          <Icon name="close" :size="16" />
        </button>
      </div>
    </div>

    <div class="rail__body">
      <div class="track">
        <div v-if="simStyle" class="track__sim" :style="simStyle" title="Simulated time after Now: scenario keyframes; vessels without them hold their last report" aria-hidden="true" />
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
        <span v-if="anchorInRange" class="track__anchor" :style="{ left: pct(clock.anchorMs) }" aria-hidden="true"><span>Now</span></span>
        <div class="track__fill" :style="{ width: progressPct }" aria-hidden="true" />
        <label :for="ids.scrub" class="sr-only">Simulation time</label>
        <input
          :id="ids.scrub"
          class="track__input"
          type="range"
          :min="clock.rangeStartMs"
          :max="clock.rangeEndMs"
          step="300000"
          :value="clock.timeMs"
          :aria-valuetext="valueText"
          :aria-describedby="ids.help"
          data-testid="replay-scrubber"
          @pointerdown="clock.beginScrub()"
          @pointerup="onScrubRelease"
          @pointercancel="onScrubRelease"
          @blur="onScrubRelease"
          @input="onScrubInput"
          @change="onScrubCommit"
          @keydown="onScrubKey"
        />
        <div class="track__ticks" aria-hidden="true">
          <span v-for="t in ticks" :key="t.at" :style="{ left: `${t.at * 100}%` }">{{ t.label }}</span>
        </div>
      </div>
      <div class="rail__meta">
        <p :id="ids.help" class="rail__help">{{ contextText }} · {{ markerCount }}. Arrow keys step 5 min; Shift+Arrow steps 1 h.</p>
        <div class="seg seg--sm" role="group" aria-label="Playback range">
          <button v-for="r in LOOP_RANGES" :key="r.key" type="button" class="seg__btn" :aria-pressed="clock.rangeKey === r.key" :data-testid="`replay-range-${r.key}`" @click="clock.setRange(r.key)">{{ r.label }}</button>
        </div>
        <button type="button" class="btn btn--sm rail__loop" :class="{ 'btn--active': clock.loop }" :aria-pressed="clock.loop" title="Off: playback pauses at the end of the range" data-testid="replay-loop" @click="clock.setLoop(!clock.loop)">
          <Icon name="loop" :size="13" /> Loop
        </button>
      </div>
      <p class="rail__event" data-testid="replay-current">
        <span class="rail__event-text">
          <template v-if="current">
            <span class="dot" :class="`dot--${current.category}`" aria-hidden="true" />
            Last event <span class="mono">{{ current.timeText }}</span> · {{ current.label }}
          </template>
          <template v-else>No recorded event for this context before {{ formatUtc(clock.timeMs, { date: false }) }}.</template>
        </span>
        <span class="rail__passed" :data-count="passed" data-testid="replay-passed">{{ passed }} {{ passed === 1 ? 'event' : 'events' }} passed this run</span>
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
    <aside v-else-if="away" class="rail__side" aria-label="Compared with Now" data-testid="replay-compare">
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
  color: var(--color-accent-ink);
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
.rail__rate {
  flex: none;
  width: auto;
  height: 30px;
  padding: 0 24px 0 8px;
  font-size: var(--text-12);
  font-weight: 600;
}
.rail__mode--sim {
  background: var(--color-warning-subtle);
  color: var(--color-warning-ink);
}
.rail__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.rail__meta .rail__help {
  flex: 1 1 auto;
  min-width: 0;
}
.seg--sm .seg__btn {
  height: 22px;
  min-width: 34px;
  font-size: var(--text-11);
}
.rail__loop {
  height: 22px;
  padding: 0 8px;
  font-size: var(--text-11);
}
.rail__event {
  display: flex;
  gap: 12px;
}
.rail__event-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail__passed {
  flex: none;
  color: var(--color-ink-muted);
  font-size: var(--text-11);
  font-variant-numeric: tabular-nums;
}
.track__sim {
  position: absolute;
  top: 0;
  bottom: 21px;
  background: repeating-linear-gradient(135deg, transparent 0 5px, rgba(127, 139, 148, 0.12) 5px 7px);
  border-left: 1px dashed var(--color-border);
  pointer-events: none;
}
.track__anchor {
  position: absolute;
  top: -2px;
  bottom: 18px;
  width: 0;
  border-left: 2px solid var(--color-ink);
  pointer-events: none;
}
.track__anchor span {
  position: absolute;
  top: -1px;
  left: 3px;
  font-size: 10px;
  font-weight: 600;
  line-height: 12px;
  color: var(--color-ink);
}
@media (max-width: 1100px) {
  .rail {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr);
    row-gap: 6px;
  }
  .rail__bar {
    flex-wrap: wrap;
    row-gap: 6px;
  }
  .rail__side {
    grid-column: 1;
    grid-row: 3;
    width: auto;
    padding: 6px 0 0;
    border-left: 0;
    border-top: 1px solid var(--color-border);
  }
}
@media (prefers-reduced-motion: reduce) {
  .track__fill {
    transition: none;
  }
}
</style>

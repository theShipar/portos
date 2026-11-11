<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { formatDuration, formatLocal, formatUtc } from '@/core/format';
import { HOUR } from '@/core/time';
import { LOOP_RANGES, PLAYBACK_RATES, isPlaybackRate } from '@/core/scenarioClock';
import { useNavigation } from '@/router/useRouteSync';
import { CATEGORY_LABEL, compareWithNow, currentMarker, densityBins, railBookmarks, railMarkers, stepMarker, type RailMarker } from '@/selectors/replay';
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
const bookmarks = computed(() => railBookmarks(wf.state.audit, clock.rangeStartMs, clock.rangeEndMs));
const expanded = computed(() => view.replayExpanded);
function toggleExpanded() {
  view.replayExpanded = !view.replayExpanded;
  if (!view.replayExpanded) noting.value = false;
}
function jumpBookmark(ms: number) {
  clock.pause();
  clock.seekMs(ms);
}
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
  view.replayExpanded = true;
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
  <section
    class="rail"
    :class="{ 'rail--historical': away, 'rail--expanded': expanded, 'rail--side': expanded && (noting || away) }"
    aria-label="Replay timeline"
    data-testid="replay-rail"
    :data-expanded="expanded"
  >
    <div class="rail__bar">
      <button type="button" class="icon-btn rail__play" :aria-label="clock.playing ? 'Pause' : 'Play'" :aria-pressed="clock.playing" data-testid="replay-play" @click="togglePlay">
        <Icon :name="clock.playing ? 'pause' : 'play'" :size="16" />
      </button>
      <template v-if="expanded">
        <button type="button" class="icon-btn" aria-label="Back 5 minutes" title="Back 5 min (Shift: 1 h on the timeline)" data-testid="replay-step-back" @click="clock.step(-1)">
          <Icon name="step-back" :size="15" />
        </button>
        <button type="button" class="icon-btn" aria-label="Forward 5 minutes" title="Forward 5 min (Shift: 1 h on the timeline)" data-testid="replay-step-forward" @click="clock.step(1)">
          <Icon name="step-forward" :size="15" />
        </button>
      </template>
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

      <div class="track" :class="{ 'track--mini': !expanded }">
        <div v-if="simStyle" class="track__sim" :style="simStyle" title="Simulated time after Now: scenario keyframes; vessels without them hold their last report" aria-hidden="true" />
        <div v-if="expanded" class="track__density" aria-hidden="true" data-testid="replay-histogram">
          <span v-for="b in bins" :key="b.startMs" class="track__bin" :style="{ left: `${b.at * 100}%`, width: `${b.width * 100}%`, height: `${3 + b.level * 15}px` }" />
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
          <button
            v-for="b in bookmarks"
            :key="b.auditId"
            type="button"
            class="bookmark"
            :style="{ left: `${b.at * 100}%` }"
            :title="`Saved: ${b.label}`"
            :aria-label="`Jump to saved moment: ${b.label}`"
            :data-testid="`replay-bookmark-${b.auditId}`"
            @click="jumpBookmark(b.ms)"
          >
            <Icon name="bookmark" :size="11" />
          </button>
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
        <div v-if="expanded" class="track__ticks" aria-hidden="true">
          <span v-for="t in ticks" :key="t.at" :style="{ left: `${t.at * 100}%` }">{{ t.label }}</span>
        </div>
        <p v-else class="rail__event rail__event--mini" data-testid="replay-current">
          <template v-if="current">
            <span class="dot" :class="`dot--${current.category}`" aria-hidden="true" />
            <span class="mono">{{ current.timeText }}</span> · {{ current.label }}
          </template>
          <template v-else>No recorded event before {{ formatUtc(clock.timeMs, { date: false }) }}</template>
        </p>
      </div>

      <div class="rail__time" aria-live="polite">
        <span class="rail__mode" :class="{ 'rail__mode--hist': historical, 'rail__mode--sim': clock.phase === 'simulation' }" data-testid="replay-phase">{{ phaseText }}</span>
        <strong class="mono" data-testid="replay-time">{{ formatUtc(clock.timeMs) }}</strong>
        <span v-if="expanded && localText" class="rail__sub mono">{{ localText }}</span>
      </div>
      <div class="rail__actions">
        <button type="button" class="btn btn--sm btn--primary" :disabled="!away" data-testid="replay-now" @click="clock.reset()">
          <Icon name="reset" :size="14" /> Now
        </button>
        <button
          type="button"
          class="icon-btn"
          :aria-expanded="expanded"
          :aria-label="expanded ? 'Collapse replay timeline' : 'Expand replay timeline: ranges, loop, histogram and comparison'"
          :title="expanded ? 'Collapse' : 'Expand: ranges, loop, histogram, compare with Now'"
          data-testid="replay-expand"
          @click="toggleExpanded"
        >
          <Icon :name="expanded ? 'chevron-down' : 'chevron-up'" :size="16" />
        </button>
        <button type="button" class="icon-btn" aria-label="Close replay and return to Now" data-testid="replay-close" @click="nav.closeReplay()">
          <Icon name="close" :size="16" />
        </button>
      </div>
    </div>

    <p :id="ids.help" class="sr-only">{{ contextText }} · {{ markerCount }}. {{ offsetText }}. Arrow keys step 5 min; Shift+Arrow steps 1 h.</p>

    <div v-if="expanded" class="rail__meta">
      <div class="seg seg--sm" role="group" aria-label="Playback range">
        <button v-for="r in LOOP_RANGES" :key="r.key" type="button" class="seg__btn" :aria-pressed="clock.rangeKey === r.key" :data-testid="`replay-range-${r.key}`" @click="clock.setRange(r.key)">{{ r.label }}</button>
      </div>
      <button type="button" class="btn btn--sm rail__loop" :class="{ 'btn--active': clock.loop }" :aria-pressed="clock.loop" title="Off: playback pauses at the end of the range" data-testid="replay-loop" @click="clock.setLoop(!clock.loop)">
        <Icon name="loop" :size="13" /> Loop
      </button>
      <button
        type="button"
        class="btn btn--sm rail__loop"
        :class="{ 'btn--active': following }"
        :disabled="!followVesselId"
        :aria-pressed="following"
        :title="followVesselId ? undefined : 'Select a vessel to follow it.'"
        data-testid="replay-follow"
        @click="toggleFollow"
      >
        <Icon name="crosshair" :size="13" /> Follow
      </button>
      <button type="button" class="btn btn--sm rail__loop" :disabled="!historical" :title="historical ? undefined : 'Move back in time to note a historical moment.'" aria-label="Add a note about this historical moment" data-testid="replay-note" @click="startNote">
        <Icon name="bookmark" :size="12" /> Note
      </button>
      <p class="rail__event" data-testid="replay-current">
        <span class="rail__event-text">
          <template v-if="current">
            <span class="dot" :class="`dot--${current.category}`" aria-hidden="true" />
            Last event <span class="mono">{{ current.timeText }}</span> · {{ current.label }}
          </template>
          <template v-else>No recorded event for this context before {{ formatUtc(clock.timeMs, { date: false }) }}.</template>
        </span>
      </p>
      <span class="rail__sub rail__offset">{{ offsetText }}</span>
      <span class="rail__passed" :data-count="passed" data-testid="replay-passed">{{ passed }} {{ passed === 1 ? 'event' : 'events' }} passed</span>
    </div>

    <aside v-if="expanded && noting" class="rail__side" aria-label="Note this moment">
      <form class="form" @submit.prevent="saveNote" @keydown.esc.stop.prevent="noting = false">
        <label :for="ids.note" class="field">
          Note about {{ formatUtc(clock.timeMs) }}<template v-if="view.selection"> · {{ view.selection.id }}</template>
          <textarea :id="ids.note" ref="noteInput" v-model="noteText" class="control" rows="1" data-testid="replay-note-input" />
        </label>
        <p v-if="noteError" class="form-error" role="alert">{{ noteError }}</p>
        <div class="form-row">
          <button type="submit" class="btn btn--sm btn--primary" data-testid="replay-note-save">Save note</button>
          <button type="button" class="btn btn--sm" @click="noting = false">Cancel</button>
          <span class="form-hint">Local audit log · no case changes</span>
        </div>
      </form>
    </aside>
    <aside v-else-if="expanded && away" class="rail__side" aria-label="Compared with Now" data-testid="replay-compare">
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
  grid-template-columns: minmax(0, 1fr);
  align-content: center;
  column-gap: 16px;
  row-gap: 4px;
  height: var(--rail-h);
  padding: 6px 10px;
  overflow: hidden;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  transition: height var(--motion-panel) var(--ease-standard);
}
.rail--expanded {
  grid-template-rows: auto auto;
  align-content: start;
}
.rail--side {
  grid-template-columns: minmax(0, 1fr) 340px;
}
.rail--historical {
  border-color: var(--color-info);
}
.rail__bar {
  grid-column: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.rail--expanded .rail__bar {
  flex-wrap: wrap;
  row-gap: 4px;
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
  background: var(--toggle-on-bg);
  color: var(--toggle-on-ink);
  font-weight: 600;
}
.rail__time {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: none;
  gap: 1px;
  white-space: nowrap;
  font-size: var(--text-12);
  line-height: 16px;
}
.rail--expanded .rail__time {
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
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
  line-height: 16px;
}
.rail__mode--hist {
  background: var(--color-info-subtle);
  color: var(--color-info);
}
.rail__mode--sim {
  background: var(--color-warning-subtle);
  color: var(--color-warning-ink);
}
.rail__sub {
  color: var(--color-ink-muted);
}
.rail__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.track {
  position: relative;
  flex: 1 1 200px;
  min-width: 160px;
  height: 46px;
  margin: 0 6px;
}
.track--mini {
  height: 44px;
}
.rail--expanded .track {
  order: 10;
  flex-basis: 100%;
  height: 40px;
  margin: 0 6px;
}
.track__density {
  position: absolute;
  inset: 0 0 20px;
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
  bottom: 19px;
  height: 3px;
  border-radius: 2px;
  background: var(--color-accent);
  pointer-events: none;
}
.track--mini .track__fill {
  bottom: 21px;
}
.track__markers {
  position: absolute;
  inset: 0 0 22px;
  pointer-events: none;
}
.mark {
  position: absolute;
  bottom: 2px;
  width: 8px;
  height: 12px;
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
.bookmark {
  position: absolute;
  top: -2px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--color-accent);
  color: var(--color-on-accent);
  cursor: pointer;
  pointer-events: auto;
}
.track__input {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 11px;
  width: 100%;
  height: 20px;
  margin: 0;
  background: transparent;
  appearance: none;
  cursor: pointer;
}
.track--mini .track__input {
  bottom: 13px;
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
  border: 2px solid var(--color-ink-on-dark);
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
  border: 2px solid var(--color-ink-on-dark);
  border-radius: 50%;
  background: var(--color-accent);
}
.track__ticks {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 12px;
  font-size: var(--text-11);
  line-height: 12px;
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
.rail__event {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-12);
  line-height: 16px;
  color: var(--color-ink);
}
.rail__event--mini {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  font-size: var(--text-11);
  line-height: 13px;
  color: var(--color-ink-secondary);
}
.rail__event-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 4px;
  border-radius: 2px;
  vertical-align: 0;
}
.rail__meta {
  grid-column: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: var(--text-11);
}
.rail__offset {
  flex: none;
}
.rail__passed {
  flex: none;
  color: var(--color-ink-muted);
  font-variant-numeric: tabular-nums;
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
.rail__side {
  grid-column: 2;
  grid-row: 1 / span 2;
  min-height: 0;
  padding-left: 14px;
  border-left: 1px solid var(--color-border);
  overflow-y: auto;
}
.cmp {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: var(--text-12);
  line-height: 15px;
}
.cmp th,
.cmp td {
  padding: 1px 4px;
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
  gap: 4px;
}
.rail__side textarea {
  min-height: 30px;
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
.track__sim {
  position: absolute;
  top: 0;
  bottom: 19px;
  background: repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--color-data-planned) 12%, transparent) 5px 7px);
  border-left: 1px dashed var(--color-border);
  pointer-events: none;
}
.track__anchor {
  position: absolute;
  top: 0;
  bottom: 17px;
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
  .rail--side {
    grid-template-columns: minmax(0, 1fr);
  }
  .rail__side {
    grid-column: 1;
    grid-row: auto;
    padding: 4px 0 0;
    border-left: 0;
    border-top: 1px solid var(--color-border);
  }
  .rail:not(.rail--expanded) .rail__bar > .icon-btn:not(.rail__play) {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rail,
  .track__fill {
    transition: none;
  }
}
</style>

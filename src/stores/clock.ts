import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { parseUtc, toIsoUtc } from '@/core/time';
import {
  advance,
  clampToWindow,
  rangeAround,
  rangeHours,
  stepTarget,
  type ClockMode,
  type ClockState,
  type LoopRangeKey,
  type PlaybackRate,
} from '@/core/scenarioClock';

/** Where the clock stands against "Now (simulated)": recorded history, the anchor itself, or simulated time after it. */
export type ClockPhase = 'history' | 'now' | 'simulation';

/** Reactive commits run at 10 Hz (spec: selectors 5–15 Hz); render loops read `frameTimeMs()` every frame. */
const COMMIT_INTERVAL_MS = 100;

const DEFAULT_ANCHOR = Date.parse('2026-11-09T12:00:00Z');
const DEFAULT_RANGE: LoopRangeKey = '24h';

/**
 * The only scenario time source (DECISIONS D-036, superseding D-008). Time moves inside the scenario window
 * [minMs, maxMs], past the anchor too; the playback range bounds play and loop. Committed time is whole seconds.
 */
export const useClockStore = defineStore('clock', () => {
  const anchorMs = ref(DEFAULT_ANCHOR);
  const minMs = ref(DEFAULT_ANCHOR - 12 * 3600_000);
  const maxMs = ref(DEFAULT_ANCHOR);
  const timeMs = ref(DEFAULT_ANCHOR);
  const mode = ref<ClockMode>('paused');
  const rate = ref<PlaybackRate>(10);
  const rangeKey = ref<LoopRangeKey>(DEFAULT_RANGE);
  const rangeStartMs = ref(minMs.value);
  const rangeEndMs = ref(maxMs.value);
  const loop = ref(false);
  const dataVersion = ref('');
  /** Scenario interval covered by the latest playback commit, so event edges inside it are never dropped. */
  const lastSpan = shallowRef<{ fromMs: number; toMs: number } | null>(null);

  let frameMs = DEFAULT_ANCHOR;
  let raf = 0;
  let lastWall = 0;
  let lastCommit = 0;

  const playing = computed(() => mode.value === 'playing');
  const phase = computed<ClockPhase>(() => (timeMs.value < anchorMs.value ? 'history' : timeMs.value > anchorMs.value ? 'simulation' : 'now'));
  const iso = computed(() => toIsoUtc(timeMs.value));
  const progress = computed(() => (timeMs.value - rangeStartMs.value) / Math.max(1, rangeEndMs.value - rangeStartMs.value));

  function whole(ms: number) {
    return Math.round(ms / 1000) * 1000;
  }

  function placeRange(t: number) {
    const r = rangeAround(t, rangeHours(rangeKey.value), minMs.value, maxMs.value);
    rangeStartMs.value = r.startUTC;
    rangeEndMs.value = r.endUTC;
  }

  function configure(opts: { anchorMs: number; minMs: number; maxMs: number; dataVersion: string }) {
    anchorMs.value = opts.anchorMs;
    minMs.value = Math.min(opts.minMs, opts.anchorMs);
    maxMs.value = Math.max(opts.maxMs, opts.anchorMs);
    dataVersion.value = opts.dataVersion;
    pause();
    placeRange(opts.anchorMs);
    seekMs(opts.anchorMs);
  }

  function state(): ClockState {
    return {
      mode: mode.value,
      scenarioNowUTC: frameMs,
      playbackRate: rate.value,
      minUTC: minMs.value,
      maxUTC: maxMs.value,
      rangeStartUTC: rangeStartMs.value,
      rangeEndUTC: rangeEndMs.value,
      loop: loop.value,
    };
  }

  /** Exact jump (clamped to the window); a time outside the playback range moves the range to it. */
  function seekMs(ms: number) {
    const t = whole(clampToWindow(ms, minMs.value, maxMs.value));
    if (t < rangeStartMs.value || t > rangeEndMs.value) placeRange(t);
    timeMs.value = t;
    frameMs = t;
    lastSpan.value = null;
  }

  /** Accepts a UTC ISO string; invalid input is ignored and returns false. */
  function seek(isoUtc: string): boolean {
    const ms = parseUtc(isoUtc);
    if (ms === null) return false;
    seekMs(ms);
    return true;
  }

  function nowUtc() {
    return toIsoUtc(anchorMs.value);
  }

  /** Unrounded scenario time of the current animation frame (between reactive commits while playing). */
  function frameTimeMs() {
    return frameMs;
  }

  function commit(t: number) {
    const from = timeMs.value;
    const to = whole(t);
    if (to === from) return;
    lastSpan.value = to > from ? { fromMs: from, toMs: to } : null;
    timeMs.value = to;
  }

  function tick(wall: number) {
    if (mode.value !== 'playing') return;
    const r = advance(state(), wall - lastWall);
    lastWall = wall;
    frameMs = r.state.scenarioNowUTC;
    if (r.ended) {
      commit(frameMs);
      stopLoop();
      mode.value = 'paused';
      return;
    }
    if (r.wrapped) {
      timeMs.value = whole(frameMs);
      lastSpan.value = null;
      lastCommit = wall;
    } else if (wall - lastCommit >= COMMIT_INTERVAL_MS) {
      commit(frameMs);
      lastCommit = wall;
    }
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function play(r?: PlaybackRate) {
    if (r) rate.value = r;
    if (timeMs.value >= rangeEndMs.value) seekMs(rangeStartMs.value);
    if (mode.value === 'playing') return;
    mode.value = 'playing';
    frameMs = timeMs.value;
    lastWall = performance.now();
    lastCommit = lastWall;
    stopLoop();
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    const was = mode.value;
    stopLoop();
    mode.value = 'paused';
    if (was === 'playing') commit(frameMs);
    frameMs = timeMs.value;
  }

  function toggle() {
    if (mode.value === 'playing') pause();
    else play();
  }

  function setRate(r: PlaybackRate) {
    rate.value = r;
  }

  function setRange(key: LoopRangeKey) {
    rangeKey.value = key;
    placeRange(timeMs.value);
  }

  function setLoop(v: boolean) {
    loop.value = v;
  }

  /** ±5 min, or ±1 h with `big` (Shift+Arrow). Pauses playback. */
  function step(dir: 1 | -1, big = false) {
    pause();
    seekMs(stepTarget(timeMs.value, dir, big, minMs.value, maxMs.value));
  }

  /** Scrubbing pauses playback; previews seek like a jump and `endScrub` settles on an exact time. */
  function beginScrub() {
    pause();
    mode.value = 'scrubbing';
  }

  function scrub(ms: number) {
    timeMs.value = whole(clampToWindow(ms, rangeStartMs.value, rangeEndMs.value));
    frameMs = timeMs.value;
    lastSpan.value = null;
  }

  function endScrub(ms?: number) {
    if (ms !== undefined) scrub(ms);
    if (mode.value === 'scrubbing') mode.value = 'paused';
  }

  /** Back to "Now (simulated)": paused at the anchor, range re-centred on it. */
  function reset() {
    pause();
    placeRange(anchorMs.value);
    seekMs(anchorMs.value);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && mode.value === 'playing') pause();
    });
  }

  return {
    anchorMs,
    minMs,
    maxMs,
    timeMs,
    mode,
    rate,
    rangeKey,
    rangeStartMs,
    rangeEndMs,
    loop,
    dataVersion,
    lastSpan,
    playing,
    phase,
    iso,
    progress,
    configure,
    state,
    seek,
    seekMs,
    nowUtc,
    frameTimeMs,
    play,
    pause,
    toggle,
    setRate,
    setRange,
    setLoop,
    step,
    beginScrub,
    scrub,
    endScrub,
    reset,
  };
});

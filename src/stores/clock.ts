import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { parseUtc, toIsoUtc } from '@/core/time';

export type ClockMode = 'now' | 'replay';
export const REPLAY_SPEEDS = [1, 10, 60] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** Reactive commits are throttled; render loops read `frameTimeMs()` for per-frame motion. */
const COMMIT_INTERVAL_MS = 100;
/** Large enough that throttled frame rates still play at wall-clock pace; hidden tabs pause instead. */
const MAX_FRAME_DELTA_MS = 1000;

const DEFAULT_ANCHOR = Date.parse('2026-11-09T12:00:00Z');

/**
 * Single SimulationClock. "Now (simulated)" is pinned to the fixture anchor (DECISIONS D-008): the dataset has no
 * samples after it, so time only moves inside replay, between replay start and the anchor.
 */
export const useClockStore = defineStore('clock', () => {
  const anchorMs = ref(DEFAULT_ANCHOR);
  const startMs = ref(DEFAULT_ANCHOR - 12 * 3600_000);
  const timeMs = ref(DEFAULT_ANCHOR);
  const playing = ref(false);
  const speed = ref<ReplaySpeed>(60);
  const dataVersion = ref('');

  let frameMs = DEFAULT_ANCHOR;
  let raf = 0;
  let lastWall = 0;
  let lastCommit = 0;

  const mode = computed<ClockMode>(() => (timeMs.value >= anchorMs.value ? 'now' : 'replay'));
  const iso = computed(() => toIsoUtc(timeMs.value));
  const progress = computed(() => (timeMs.value - startMs.value) / Math.max(1, anchorMs.value - startMs.value));

  function configure(opts: { anchorMs: number; startMs: number; dataVersion: string }) {
    anchorMs.value = opts.anchorMs;
    startMs.value = opts.startMs;
    dataVersion.value = opts.dataVersion;
    seekMs(opts.anchorMs);
  }

  function clamp(ms: number) {
    return Math.min(anchorMs.value, Math.max(startMs.value, Math.round(ms / 1000) * 1000));
  }

  function seekMs(ms: number) {
    timeMs.value = clamp(ms);
    frameMs = timeMs.value;
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

  function frameTimeMs() {
    return frameMs;
  }

  function tick(wall: number) {
    if (!playing.value) return;
    const dt = Math.min(MAX_FRAME_DELTA_MS, wall - lastWall);
    lastWall = wall;
    frameMs = Math.min(anchorMs.value, frameMs + dt * speed.value);
    if (frameMs >= anchorMs.value) {
      timeMs.value = anchorMs.value;
      pause();
      return;
    }
    if (wall - lastCommit >= COMMIT_INTERVAL_MS) {
      timeMs.value = Math.round(frameMs / 1000) * 1000;
      lastCommit = wall;
    }
    raf = requestAnimationFrame(tick);
  }

  function play(s?: ReplaySpeed) {
    if (s) speed.value = s;
    if (timeMs.value >= anchorMs.value) seekMs(startMs.value);
    if (playing.value) return;
    playing.value = true;
    frameMs = timeMs.value;
    lastWall = performance.now();
    lastCommit = lastWall;
    raf = requestAnimationFrame(tick);
  }

  function pause() {
    playing.value = false;
    cancelAnimationFrame(raf);
    timeMs.value = Math.round(frameMs / 1000) * 1000;
  }

  function setSpeed(s: ReplaySpeed) {
    speed.value = s;
  }

  /** Back to "Now (simulated)". */
  function reset() {
    pause();
    seekMs(anchorMs.value);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing.value) pause();
    });
  }

  return { anchorMs, startMs, timeMs, playing, speed, dataVersion, mode, iso, progress, configure, seek, seekMs, nowUtc, frameTimeMs, play, pause, setSpeed, reset };
});

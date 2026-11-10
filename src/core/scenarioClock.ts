import { HOUR, MINUTE } from './time';

/**
 * Canonical scenario clock (spec 10), pure part. `scenarioNowUTC` decides every snapshot; the playback rate only
 * chooses how fast it moves (never a vessel's speed). Real frame time comes in as a clamped delta.
 */

export const PLAYBACK_RATES = [1, 5, 10, 25, 50, 100] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export type ClockMode = 'playing' | 'paused' | 'scrubbing';

export const LOOP_RANGES = [
  { key: '6h', hours: 6, label: '6 h' },
  { key: '24h', hours: 24, label: '24 h' },
  { key: '72h', hours: 72, label: '72 h' },
  { key: '7d', hours: 168, label: '7 d' },
] as const;
export type LoopRangeKey = (typeof LOOP_RANGES)[number]['key'];

export const STEP_MS = 5 * MINUTE;
export const BIG_STEP_MS = HOUR;
/** Longest real frame delta applied at once; a resumed tab never jumps hours ahead. */
export const MAX_FRAME_DELTA_MS = 1000;

export interface ClockState {
  mode: ClockMode;
  scenarioNowUTC: number;
  playbackRate: PlaybackRate;
  minUTC: number;
  maxUTC: number;
  /** Playback range inside [minUTC, maxUTC]; play stops (or loops) at its end. */
  rangeStartUTC: number;
  rangeEndUTC: number;
  loop: boolean;
}

export function isPlaybackRate(v: unknown): v is PlaybackRate {
  return (PLAYBACK_RATES as readonly unknown[]).includes(v);
}

export function rangeHours(key: LoopRangeKey): number {
  return LOOP_RANGES.find((r) => r.key === key)!.hours;
}

/** A range of `hours` centred on `t`, shifted (not shrunk) to stay inside the window, on whole hours. */
export function rangeAround(t: number, hours: number, minUTC: number, maxUTC: number): { startUTC: number; endUTC: number } {
  const span = Math.min(hours * HOUR, maxUTC - minUTC);
  let start = Math.round((t - span / 2) / HOUR) * HOUR;
  start = Math.max(minUTC, Math.min(maxUTC - span, start));
  return { startUTC: start, endUTC: start + span };
}

export function clampToWindow(t: number, minUTC: number, maxUTC: number): number {
  return Math.min(maxUTC, Math.max(minUTC, t));
}

/** Target of a ±5 min (or ±1 h) step, clamped to the window. */
export function stepTarget(t: number, dir: 1 | -1, big: boolean, minUTC: number, maxUTC: number): number {
  return clampToWindow(t + dir * (big ? BIG_STEP_MS : STEP_MS), minUTC, maxUTC);
}

export interface AdvanceResult {
  state: ClockState;
  /** Reached the range end with loop off: the clock is now paused there. */
  ended: boolean;
  /** Wrapped from the range end to its start (loop on). */
  wrapped: boolean;
}

/** One frame of playback: scenario time += clamped real delta × rate. Not playing ⇒ unchanged. */
export function advance(s: ClockState, realDeltaMs: number): AdvanceResult {
  if (s.mode !== 'playing') return { state: s, ended: false, wrapped: false };
  const dt = Math.max(0, Math.min(MAX_FRAME_DELTA_MS, realDeltaMs));
  const next = s.scenarioNowUTC + dt * s.playbackRate;
  if (next < s.rangeEndUTC) return { state: { ...s, scenarioNowUTC: next }, ended: false, wrapped: false };
  if (s.loop) return { state: { ...s, scenarioNowUTC: s.rangeStartUTC }, ended: false, wrapped: true };
  return { state: { ...s, scenarioNowUTC: s.rangeEndUTC, mode: 'paused' }, ended: true, wrapped: false };
}

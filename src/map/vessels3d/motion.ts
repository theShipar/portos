import type { NavStatus } from '@/core/types';
import { wrapDegrees } from './contract';

export type MotionState = 'underway' | 'anchored' | 'moored' | 'stopped';

/** Speed through water (kn) above which an underway ship draws a wake. */
export const WAKE_MIN_KN = 2;
/** Wake length in ship lengths at {@link WAKE_FULL_KN}; scales linearly from the threshold. */
export const WAKE_MAX_LENGTHS = 1.4;
export const WAKE_FULL_KN = 22;
/** Anchored ships swing on their chain: ± this many degrees around the resting heading. */
export const ANCHOR_SWAY_DEG = 4;
/** One full swing in scenario minutes; at 100× replay that is about 5 s of wall time. */
export const ANCHOR_SWAY_PERIOD_MIN = 9;

export function motionStateOf(navStatus: NavStatus, sogKn: number | null): MotionState {
  if (navStatus === 'moored') return 'moored';
  if (navStatus === 'at_anchor') return 'anchored';
  if (navStatus === 'underway' && (sogKn ?? 0) > WAKE_MIN_KN) return 'underway';
  return 'stopped';
}

/** Wake length in ship lengths; 0 unless underway above the threshold. */
export function wakeLength(state: MotionState, sogKn: number | null): number {
  if (state !== 'underway' || sogKn === null || sogKn <= WAKE_MIN_KN) return 0;
  const t = Math.min(1, (sogKn - WAKE_MIN_KN) / (WAKE_FULL_KN - WAKE_MIN_KN));
  return 0.25 + t * (WAKE_MAX_LENGTHS - 0.25);
}

function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Heading for a ship without a course over ground (anchored, moored, unknown). Deterministic per vessel so it never
 * jumps between frames; moored ships take the berth heading when the port layout provides one.
 */
export function restingHeadingDeg(vesselId: string, berthHeadingDeg?: number | null): number {
  if (berthHeadingDeg !== undefined && berthHeadingDeg !== null) return wrapDegrees(berthHeadingDeg);
  return Math.round(hash01(vesselId) * 360);
}

/** Swing around the anchor, driven by scenario time so replay is deterministic and pauses with the clock. */
export function anchorSwayDeg(vesselId: string, scenarioMs: number): number {
  const phase = hash01(`${vesselId}:sway`) * Math.PI * 2;
  const t = scenarioMs / 60000 / ANCHOR_SWAY_PERIOD_MIN;
  return ANCHOR_SWAY_DEG * Math.sin(t * Math.PI * 2 + phase);
}

/** Displayed heading: course over ground when underway, resting heading (+ swing at anchor) otherwise; moored is fixed. */
export function displayHeadingDeg(v: { vesselId: string; cogDeg: number | null; state: MotionState; berthHeadingDeg?: number | null }, scenarioMs: number): number {
  if (v.state === 'moored') return restingHeadingDeg(v.vesselId, v.berthHeadingDeg);
  const base = v.cogDeg ?? restingHeadingDeg(v.vesselId);
  return v.state === 'anchored' ? wrapDegrees(base + anchorSwayDeg(v.vesselId, scenarioMs)) : wrapDegrees(base);
}

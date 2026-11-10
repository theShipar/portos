// SPDX-License-Identifier: GPL-3.0-or-later
// Earth → geography handoff orchestration, modified from three-scope-map-skill by 宋夏天Dazzle (EarthChinaMap.vue:
// warm the destination, show a pre-rendered destination frame through a cloud reveal, then hand control over).
// Generalised from the China-only template to any registry target. 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import { EARTH_RADIUS, type CameraPose, type CameraPreset } from '@/map/earth/camera';
import type { MapSurface } from '@/map/surface';
import type { TransitionPlan, TransitionPlanner } from './SpatialDirector';
import type { SceneKind, SceneTarget, SpatialScene } from './types';

/** Spec 05 phase budgets in milliseconds. Durations are chosen inside these ranges; readiness gates the start. */
export const BRIDGE_TIMINGS = {
  focus: { min: 650, max: 1200 },
  dive: { min: 450, max: 850 },
  handoff: { min: 350, max: 650 },
  settle: { min: 300, max: 550 },
  reducedCrossfade: 120,
  reducedCrossfadeMax: 150,
  rise: 420,
} as const;

/** The skill's `china-cloud-reveal` keyframes (opacity and scale of the destination stage). */
export const CLOUD_REVEAL: Keyframe[] = [
  { opacity: 0.06, transform: 'scale(0.78)', offset: 0 },
  { opacity: 0.24, transform: 'scale(0.83)', offset: 0.28 },
  { opacity: 0.78, transform: 'scale(0.94)', offset: 0.66 },
  { opacity: 1, transform: 'scale(1)', offset: 1 },
];
/** Subtler reveal for planar → planar geographic dives. */
export const GEO_REVEAL: Keyframe[] = [
  { opacity: 0, transform: 'scale(0.92)', offset: 0 },
  { opacity: 1, transform: 'scale(1)', offset: 1 },
];
export const RISE_FADE: Keyframe[] = [
  { opacity: 1, transform: 'scale(1)' },
  { opacity: 0, transform: 'scale(0.86)' },
];
const FADE_IN: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const FADE_OUT: Keyframe[] = [{ opacity: 1 }, { opacity: 0 }];

export const SCENE_DEPTH: Record<SceneKind, number> = { earth: 0, region3d: 1, country3d: 2, city3d: 3, port3d: 4, port2d: 4 };

export type BridgeStep = 'prepare' | 'focus' | 'dive' | 'handoff' | 'settle' | 'crossfade' | 'rise' | 'cancelled';

export interface BridgeStage {
  /** Copies the shared canvas (call synchronously right after a render). */
  capture(source: HTMLCanvasElement): void;
  /** Shows the captured frame at full opacity at once. */
  show(): void;
  reveal(keyframes: Keyframe[], ms: number, signal: AbortSignal): Promise<boolean>;
  fadeOut(keyframes: Keyframe[], ms: number, signal: AbortSignal): Promise<boolean>;
  atmosphere(opacity: number, ms: number, signal: AbortSignal): Promise<boolean>;
  clear(): void;
}

/** Planar destinations can be placed at an entry camera that the settle flight then eases out of. */
export interface EntryCameraSurface extends MapSurface {
  setEntryCamera(preset: CameraPreset, exact: boolean): void;
}

export interface BridgeHost {
  stage: BridgeStage;
  canvas: HTMLCanvasElement;
  reducedMotion(): boolean;
  surfaceOf(scene: SpatialScene): MapSurface | null;
  /** Camera goal of the pending navigation on a surface: preset, and a saved pose when going back. */
  destination(surf: MapSurface): { preset: CameraPreset; pose: CameraPose | null };
  /** Globe framing of the destination before the dive (null when the destination has no geography). */
  approach(target: SceneTarget, globe: MapSurface): CameraPreset | null;
  /** Insets, highlights and reduced motion for a surface about to be drawn. */
  prepare(surf: MapSurface): void;
  setOverlaysVisible(surf: MapSurface, visible: boolean): void;
  /** Draws one frame of a surface into the shared canvas immediately. */
  drawNow(surf: MapSurface): void;
  /** `ms` is wall-clock time since the previous step; `plannedMs` is the animation length chosen for it. */
  onStep?(step: BridgeStep, ms: number, plannedMs: number): void;
}

const clamp = (v: number, r: { min: number; max: number }) => Math.max(r.min, Math.min(r.max, v));

const hasEntryCamera = (s: MapSurface): s is EntryCameraSurface => typeof (s as Partial<EntryCameraSurface>).setEntryCamera === 'function';

/** Focus duration from angular travel and zoom, inside the 650–1200 ms budget. */
export function focusDurationMs(from: CameraPose, to: { lat: number; lon: number; distance: number }): number {
  const d2r = Math.PI / 180;
  const cos = Math.sin(from.lat * d2r) * Math.sin(to.lat * d2r) + Math.cos(from.lat * d2r) * Math.cos(to.lat * d2r) * Math.cos((to.lon - from.lon) * d2r);
  const omega = Math.acos(Math.max(-1, Math.min(1, cos)));
  const zoom = Math.abs(Math.log(to.distance / Math.max(from.distance, 1e-6)));
  return Math.round(clamp(650 + omega * 380 + zoom * 220, BRIDGE_TIMINGS.focus));
}

export const DIVE_MS = 620;
export const HANDOFF_MS = 520;
export const SETTLE_MS = 440;

function presetFromPose(pose: CameraPose, limits: CameraPreset): CameraPreset {
  return { id: 'restore', scope: limits.scope, center: { lat: pose.lat, lon: pose.lon }, distance: pose.distance, minDistance: limits.minDistance, maxDistance: limits.maxDistance };
}

/**
 * Transition planner for the SpatialDirector. Deeper destinations (Earth → region, region → country → city) get the
 * cinematic sequence: prepare one static destination frame, focus the source on the target, dive, reveal the frame,
 * hand over, settle. Shallower or sibling destinations rise: the current frame is held and fades out over the
 * destination as it flies to its goal. Reduced motion collapses everything to a ≤150 ms crossfade.
 */
export function createBridgePlanner(host: BridgeHost): TransitionPlanner {
  return (from, to): TransitionPlan | null => {
    if (!from) return null;
    const src = host.surfaceOf(from.scene);
    const dst = host.surfaceOf(to.scene);
    if (!src || !dst || src === dst) return null;
    const reduced = host.reducedMotion();
    const down = SCENE_DEPTH[to.target.kind] > SCENE_DEPTH[from.target.kind];
    const goal = host.destination(dst);
    const t0 = performance.now();
    let stepStart = t0;
    const step = (s: BridgeStep, plannedMs = 0) => {
      const now = performance.now();
      host.onStep?.(s, Math.round(now - stepStart), plannedMs);
      stepStart = now;
    };
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      host.stage.clear();
      host.setOverlaysVisible(dst, true);
      host.setOverlaysVisible(src, true);
    };
    const watch = (signal: AbortSignal) => {
      signal.addEventListener(
        'abort',
        () => {
          step('cancelled');
          cleanup();
        },
        { once: true },
      );
    };

    const settleFlight = (duration: number | undefined) => {
      const preset = goal.pose ? presetFromPose(goal.pose, goal.preset) : goal.preset;
      return dst.flyTo(preset, duration === undefined ? {} : { duration: duration / 1000 });
    };

    if (down) {
      return {
        async fly(signal) {
          watch(signal);
          host.prepare(dst);
          host.setOverlaysVisible(dst, false);
          if (hasEntryCamera(dst)) dst.setEntryCamera(goal.preset, reduced || !!goal.pose);
          else await dst.jumpToPose({ lat: goal.preset.center.lat, lon: goal.preset.center.lon, distance: goal.preset.distance });
          host.drawNow(dst);
          host.stage.capture(host.canvas);
          host.drawNow(src);
          step('prepare');
          if (signal.aborted) return false;
          if (reduced) return true;
          if (src.surfaceKind === 'globe') {
            const approach = host.approach(to.target, src);
            if (approach) {
              const focusMs = focusDurationMs(src.getPose(), { ...approach.center, distance: approach.distance });
              if (!(await src.flyTo(approach, { duration: focusMs / 1000 }))) return false;
              step('focus', focusMs);
              host.setOverlaysVisible(src, false);
              const dive = src.flyTo({ ...approach, id: 'dive', distance: EARTH_RADIUS + (approach.distance - EARTH_RADIUS) * 0.42 }, { duration: DIVE_MS / 1000 });
              const veil = host.stage.atmosphere(0.92, DIVE_MS, signal);
              const [a, b] = await Promise.all([dive, veil]);
              if (!a || !b) return false;
              step('dive', DIVE_MS);
            }
          } else {
            // Geographic dive: zoom the parent towards the child before the reveal.
            const { min } = src.distanceLimits;
            const distance = Math.max(min, EARTH_RADIUS + (src.equivalentDistance - EARTH_RADIUS) * 0.55);
            host.setOverlaysVisible(src, false);
            const ok = await src.flyTo({ ...goal.preset, id: 'dive', distance, minDistance: Math.min(min, distance), maxDistance: src.distanceLimits.max }, { duration: DIVE_MS / 1000 });
            if (!ok) return false;
            step('dive', DIVE_MS);
          }
          return true;
        },
        async handoff(signal) {
          if (reduced) {
            const ok = await host.stage.reveal(FADE_IN, BRIDGE_TIMINGS.reducedCrossfade, signal);
            step('crossfade', BRIDGE_TIMINGS.reducedCrossfade);
            return ok;
          }
          const reveal = host.stage.reveal(src.surfaceKind === 'globe' ? CLOUD_REVEAL : GEO_REVEAL, HANDOFF_MS, signal);
          const veil = src.surfaceKind === 'globe' ? host.stage.atmosphere(0, HANDOFF_MS, signal) : Promise.resolve(true);
          const [a, b] = await Promise.all([reveal, veil]);
          step('handoff', HANDOFF_MS);
          return a && b;
        },
        async settle(signal) {
          host.setOverlaysVisible(dst, true);
          const fade = host.stage.fadeOut(FADE_OUT, reduced ? 0 : 160, signal);
          let ok = true;
          if (!reduced) ok = await settleFlight(SETTLE_MS);
          else if (goal.pose) ok = await settleFlight(0);
          await fade;
          step('settle', reduced ? 0 : SETTLE_MS);
          cleanup();
          return ok;
        },
      };
    }

    return {
      async fly(signal) {
        watch(signal);
        host.drawNow(src);
        host.stage.capture(host.canvas);
        host.stage.show();
        host.prepare(dst);
        host.setOverlaysVisible(dst, false);
        const pose = src.getPose();
        if (reduced) await settleFlight(0);
        else await dst.jumpToPose(pose);
        step('rise');
        return !signal.aborted;
      },
      async settle(signal) {
        host.setOverlaysVisible(dst, true);
        const fade = host.stage.fadeOut(reduced ? FADE_OUT : RISE_FADE, reduced ? BRIDGE_TIMINGS.reducedCrossfade : BRIDGE_TIMINGS.rise, signal);
        const ok = reduced ? true : await settleFlight(undefined);
        await fade;
        step('settle', reduced ? BRIDGE_TIMINGS.reducedCrossfade : BRIDGE_TIMINGS.rise);
        cleanup();
        return ok;
      },
    };
  };
}

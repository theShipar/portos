import type { EntityRef } from '@/core/types';

/** Rendering surface of a scope. Orthogonal to the selection and to the time mode. */
export type SceneKind = 'earth' | 'region3d' | 'country3d' | 'city3d' | 'port3d' | 'port2d';

/** Director flight phases. `error` keeps the previous scene on screen. */
export type FlightPhase = 'idle' | 'preparing' | 'flying' | 'handoff' | 'settling' | 'error';

export type FlightOutcome = 'done' | 'cancelled' | 'error';

export interface CameraState {
  sceneKey: string;
  position: [number, number, number];
  target: [number, number, number];
  /** Scene-specific extra (e.g. globe pose distance). */
  extra?: Record<string, number>;
}

export interface FrameContext {
  /** `performance.now()` of this frame. */
  nowMs: number;
  /** Wall-clock milliseconds since the previous frame, capped at 1 s. */
  dtMs: number;
}

/** Where the director should go: one scene instance (key) plus the camera goal inside it. */
export interface SceneTarget {
  kind: SceneKind;
  /** Scene instance key; several targets can share one scene (all globe targets share `earth`). */
  sceneKey: string;
  /** Registry ID of the focus (`earth`, `REG-SEA`, `CNT-NLD`, `CTY-SIN`, `PRT-SIN`). */
  focusId: string;
}

/**
 * Lifecycle every scene implements. The director calls these in a fixed order:
 * preload → renderStaticFrame → (flight) → activate → updateFrame… → deactivate → dispose (on cache eviction).
 */
export interface SpatialScene {
  readonly key: string;
  readonly kind: SceneKind;
  preload(signal: AbortSignal): Promise<void>;
  /** Prepares a first frame for the target without taking over the screen (used to gate the handoff). */
  renderStaticFrame(target: SceneTarget): void;
  activate(target: SceneTarget): void;
  /** Called once per animation frame while active; returns true when it drew. */
  updateFrame(ctx: FrameContext): boolean;
  /** Camera move inside an active scene (same-scene navigation). Resolves false when cancelled. */
  focus(target: SceneTarget, signal: AbortSignal, opts: { restore: CameraState | null }): Promise<boolean>;
  setSelection(sel: EntityRef | null): void;
  deactivate(): void;
  dispose(): void;
  getCameraState(): CameraState | null;
  restoreCameraState(state: CameraState): void;
  /** Rough GPU budget for the cache and the perf report. */
  stats?(): { geometries: number; textures: number };
}

export type SceneFactory = (target: SceneTarget) => SpatialScene;

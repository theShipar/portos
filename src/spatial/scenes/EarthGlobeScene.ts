// SPDX-License-Identifier: GPL-3.0-or-later
import type { EntityRef } from '@/core/types';
import type { EarthScene } from '@/map/earth/EarthScene';
import type { OverlayProjectionAdapter } from '../OverlayProjectionAdapter';
import type { CameraState, FrameContext, SceneTarget, SpatialScene } from '../types';

export const EARTH_SCENE_KEY = 'earth';

/** Camera move for a target, supplied by the host (it knows presets, insets and the scope stack). */
export type GlobeFocus = (target: SceneTarget, restore: CameraState | null) => Promise<boolean>;

/**
 * The PORTOS globe as a director-managed scene. The EarthScene keeps its renderer and textures (the host creates
 * and disposes it); this adapter only maps the lifecycle: frames come from the director, input from the
 * InputRouter, and the overlay projector is installed while the globe is active.
 */
export class EarthGlobeScene implements SpatialScene {
  readonly key = EARTH_SCENE_KEY;
  readonly kind = 'earth' as const;

  constructor(
    private readonly earth: EarthScene,
    private readonly projection: OverlayProjectionAdapter,
    private readonly focusFn: GlobeFocus,
  ) {}

  async preload(): Promise<void> {}

  renderStaticFrame(): void {
    this.earth.invalidate();
  }

  activate(): void {
    this.earth.setActive(true);
    this.projection.setProjector((lon, lat) => this.earth.project(lat, lon));
    const v = this.earth.viewport;
    this.projection.setViewport(v.width, v.height);
  }

  updateFrame(ctx: FrameContext): boolean {
    const v = this.earth.viewport;
    this.projection.setViewport(v.width, v.height);
    return this.earth.tick(ctx.nowMs);
  }

  async focus(target: SceneTarget, signal: AbortSignal, opts: { restore: CameraState | null }): Promise<boolean> {
    if (signal.aborted) return false;
    const onAbort = () => this.earth.cancelFlight();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.focusFn(target, opts.restore);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  setSelection(_sel: EntityRef | null): void {}

  deactivate(): void {
    this.earth.cancelFlight();
    this.earth.setActive(false);
  }

  /** The host owns the EarthScene (WebGL context, textures); nothing GPU-side belongs to the adapter. */
  dispose(): void {}

  getCameraState(): CameraState {
    const p = this.earth.camera.position;
    const pose = this.earth.getPose();
    return { sceneKey: this.key, position: [p.x, p.y, p.z], target: [0, 0, 0], extra: { lat: pose.lat, lon: pose.lon, distance: pose.distance } };
  }

  restoreCameraState(state: CameraState): void {
    const e = state.extra;
    if (e && Number.isFinite(e.lat) && Number.isFinite(e.lon) && Number.isFinite(e.distance)) this.earth.jumpToPose({ lat: e.lat, lon: e.lon, distance: e.distance });
  }

  stats() {
    const s = this.earth.stats();
    return { geometries: s.geometries, textures: s.textures };
  }
}

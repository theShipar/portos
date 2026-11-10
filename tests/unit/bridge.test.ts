import { describe, expect, it } from 'vitest';
import type { CameraPose, CameraPreset } from '@/map/earth/camera';
import type { MapSurface } from '@/map/surface';
import {
  BRIDGE_TIMINGS,
  CLOUD_REVEAL,
  createBridgePlanner,
  DIVE_MS,
  focusDurationMs,
  GEO_REVEAL,
  HANDOFF_MS,
  SETTLE_MS,
  type BridgeHost,
  type BridgeStage,
  type BridgeStep,
} from '@/spatial/EarthGeographyBridge';
import { SpatialDirector, type FrameScheduler } from '@/spatial/SpatialDirector';
import type { CameraState, SceneKind, SceneTarget, SpatialScene } from '@/spatial/types';

const scheduler: FrameScheduler = { request: () => 0, cancel: () => {} };

class FakeScene implements SpatialScene {
  active = false;
  constructor(
    readonly key: string,
    readonly kind: SceneKind,
  ) {}
  async preload() {}
  renderStaticFrame() {}
  activate() {
    this.active = true;
  }
  updateFrame() {
    return false;
  }
  async focus() {
    return true;
  }
  setSelection() {}
  deactivate() {
    this.active = false;
  }
  dispose() {}
  getCameraState(): CameraState {
    return { sceneKey: this.key, position: [0, 0, 1], target: [0, 0, 0] };
  }
  restoreCameraState() {}
}

type Fly = { id: string; duration?: number };

class FakeSurface {
  overlay = { visible: true };
  flights: Fly[] = [];
  jumps: CameraPose[] = [];
  entry: { exact: boolean } | null = null;
  pose: CameraPose = { lat: 10, lon: 100, distance: 7 };
  hold: Promise<boolean> | null = null;
  constructor(
    readonly surfaceKind: 'globe' | 'planar',
    readonly log: string[],
    readonly name: string,
  ) {}
  get equivalentDistance() {
    return this.pose.distance;
  }
  get distanceLimits() {
    return { min: 2.01, max: 9 };
  }
  getPose() {
    return this.pose;
  }
  flyTo(p: CameraPreset, o: { duration?: number } = {}) {
    this.flights.push({ id: p.id, duration: o.duration });
    this.log.push(`${this.name}.fly:${p.id}`);
    this.pose = { lat: p.center.lat, lon: p.center.lon, distance: p.distance };
    return this.hold ?? Promise.resolve(true);
  }
  async jumpToPose(p: CameraPose) {
    this.jumps.push(p);
    this.log.push(`${this.name}.jump`);
    return true;
  }
  setEntryCamera(_p: CameraPreset, exact: boolean) {
    this.entry = { exact };
    this.log.push(`${this.name}.entry`);
  }
}

class FakeStage implements BridgeStage {
  calls: { op: string; ms?: number; kf?: Keyframe[] }[] = [];
  holdReveal = false;
  constructor(private log: string[]) {}
  capture() {
    this.log.push('stage.capture');
  }
  show() {
    this.calls.push({ op: 'show' });
  }
  reveal(kf: Keyframe[], ms: number, signal: AbortSignal) {
    this.calls.push({ op: 'reveal', ms, kf });
    this.log.push('stage.reveal');
    if (!this.holdReveal) return Promise.resolve(true);
    return new Promise<boolean>((r) => signal.addEventListener('abort', () => r(false)));
  }
  fadeOut(kf: Keyframe[], ms: number) {
    this.calls.push({ op: 'fadeOut', ms, kf });
    return Promise.resolve(true);
  }
  atmosphere(opacity: number, ms: number) {
    this.calls.push({ op: `atmosphere:${opacity}`, ms });
    return Promise.resolve(true);
  }
  clear() {
    this.calls.push({ op: 'clear' });
  }
}

const preset = (id: string): CameraPreset => ({ id, scope: 'region', center: { lat: 5, lon: 110 }, distance: 2.6, minDistance: 2.1, maxDistance: 6 });

function rig(opts: { reduced?: boolean } = {}) {
  const log: string[] = [];
  const earth = new FakeScene('earth', 'earth');
  const sea = new FakeScene('region3d:REG-SEA', 'region3d');
  const sin = new FakeScene('city3d:CTY-SIN', 'city3d');
  const globe = new FakeSurface('globe', log, 'globe');
  const seaSurf = new FakeSurface('planar', log, 'sea');
  const sinSurf = new FakeSurface('planar', log, 'sin');
  const surfaces = new Map<SpatialScene, FakeSurface>([
    [earth, globe],
    [sea, seaSurf],
    [sin, sinSurf],
  ]);
  const stage = new FakeStage(log);
  const steps: { step: BridgeStep; ms: number }[] = [];
  const visibility: string[] = [];
  let pendingPose: CameraPose | null = null;
  const host: BridgeHost = {
    stage,
    canvas: {} as HTMLCanvasElement,
    reducedMotion: () => !!opts.reduced,
    surfaceOf: (s) => (surfaces.get(s) as unknown as MapSurface) ?? null,
    destination: (surf) => ({ preset: preset((surf as unknown as FakeSurface).name === 'globe' ? 'earth' : 'REG-SEA'), pose: pendingPose }),
    approach: () => preset('REG-SEA'),
    prepare: (surf) => log.push(`${(surf as unknown as FakeSurface).name}.prepare`),
    setOverlaysVisible: (surf, v) => {
      (surf as unknown as FakeSurface).overlay.visible = v;
      visibility.push(`${(surf as unknown as FakeSurface).name}:${v}`);
    },
    drawNow: (surf) => log.push(`${(surf as unknown as FakeSurface).name}.draw`),
    onStep: (step, ms) => steps.push({ step, ms }),
  };
  const byKey = new Map([earth, sea, sin].map((s) => [s.key, s]));
  const director = new SpatialDirector({ factory: (t) => byKey.get(t.sceneKey)!, planner: createBridgePlanner(host), scheduler });
  const target = (s: FakeScene, focusId: string): SceneTarget => ({ kind: s.kind, sceneKey: s.key, focusId });
  return { log, earth, sea, sin, globe, seaSurf, sinSurf, stage, steps, visibility, director, target, setPose: (p: CameraPose | null) => (pendingPose = p) };
}

describe('EarthGeographyBridge', () => {
  it('chooses focus durations inside the 650–1200 ms budget', () => {
    const cases = [
      [{ lat: 0, lon: 0, distance: 7.4 }, { lat: 1, lon: 1, distance: 7.3 }],
      [{ lat: 12, lon: 72, distance: 7.4 }, { lat: 5, lon: 110, distance: 2.6 }],
      [{ lat: 50, lon: -120, distance: 12 }, { lat: -40, lon: 150, distance: 2.05 }],
    ] as const;
    for (const [a, b] of cases) {
      const ms = focusDurationMs(a, b);
      expect(ms).toBeGreaterThanOrEqual(BRIDGE_TIMINGS.focus.min);
      expect(ms).toBeLessThanOrEqual(BRIDGE_TIMINGS.focus.max);
    }
    for (const [ms, r] of [
      [DIVE_MS, BRIDGE_TIMINGS.dive],
      [HANDOFF_MS, BRIDGE_TIMINGS.handoff],
      [SETTLE_MS, BRIDGE_TIMINGS.settle],
    ] as const) {
      expect(ms).toBeGreaterThanOrEqual(r.min);
      expect(ms).toBeLessThanOrEqual(r.max);
    }
    expect(BRIDGE_TIMINGS.reducedCrossfade).toBeLessThanOrEqual(BRIDGE_TIMINGS.reducedCrossfadeMax);
  });

  it('Earth → region: static frame first, then focus, dive, cloud reveal, handoff and settle', async () => {
    const r = rig();
    expect(await r.director.navigate(r.target(r.earth, 'earth'))).toBe('done');
    r.log.length = 0;
    expect(await r.director.navigate(r.target(r.sea, 'REG-SEA'))).toBe('done');
    expect(r.steps.map((s) => s.step)).toEqual(['prepare', 'focus', 'dive', 'handoff', 'settle']);
    // The destination frame is drawn and captured before the globe starts moving, then the globe is redrawn.
    expect(r.log.slice(0, 6)).toEqual(['sea.prepare', 'sea.entry', 'sea.draw', 'stage.capture', 'globe.draw', 'globe.fly:REG-SEA']);
    expect(r.seaSurf.entry).toEqual({ exact: false });
    const [focus, dive] = r.globe.flights;
    expect(focus.duration! * 1000).toBeGreaterThanOrEqual(650);
    expect(focus.duration! * 1000).toBeLessThanOrEqual(1200);
    expect(dive.id).toBe('dive');
    expect(dive.duration! * 1000).toBe(DIVE_MS);
    const reveal = r.stage.calls.find((c) => c.op === 'reveal')!;
    expect(reveal.kf).toBe(CLOUD_REVEAL);
    expect(reveal.ms).toBe(HANDOFF_MS);
    expect(r.stage.calls.map((c) => c.op)).toContain('atmosphere:0.92');
    expect(r.stage.calls.map((c) => c.op)).toContain('atmosphere:0');
    expect(r.seaSurf.flights.at(-1)!.duration! * 1000).toBe(SETTLE_MS);
    // Overlays hidden while the frame is captured, revealed at settle, stage cleared at the end.
    expect(r.visibility[0]).toBe('sea:false');
    expect(r.seaSurf.overlay.visible).toBe(true);
    expect(r.globe.overlay.visible).toBe(true);
    expect(r.stage.calls.at(-1)!.op).toBe('clear');
    expect(r.sea.active).toBe(true);
    expect(r.earth.active).toBe(false);
  });

  it('region → city uses the geographic dive and a subtler reveal', async () => {
    const r = rig();
    await r.director.navigate(r.target(r.sea, 'REG-SEA'));
    r.steps.length = 0;
    await r.director.navigate(r.target(r.sin, 'CTY-SIN'));
    expect(r.steps.map((s) => s.step)).toEqual(['prepare', 'dive', 'handoff', 'settle']);
    expect(r.seaSurf.flights.at(-1)!.id).toBe('dive');
    expect(r.stage.calls.find((c) => c.op === 'reveal')!.kf).toBe(GEO_REVEAL);
    expect(r.stage.calls.some((c) => c.op.startsWith('atmosphere'))).toBe(false);
  });

  it('reduced motion is a ≤150 ms crossfade without camera flights', async () => {
    const r = rig({ reduced: true });
    await r.director.navigate(r.target(r.earth, 'earth'));
    await r.director.navigate(r.target(r.sea, 'REG-SEA'));
    expect(r.steps.map((s) => s.step)).toEqual(['prepare', 'crossfade', 'settle']);
    expect(r.globe.flights).toHaveLength(0);
    expect(r.seaSurf.entry).toEqual({ exact: true });
    expect(r.stage.calls.find((c) => c.op === 'reveal')!.ms).toBeLessThanOrEqual(150);
    r.steps.length = 0;
    await r.director.navigate(r.target(r.earth, 'earth'));
    expect(r.steps.map((s) => s.step)).toEqual(['rise', 'settle']);
    expect(r.stage.calls.filter((c) => c.op === 'fadeOut').at(-1)!.ms).toBeLessThanOrEqual(150);
  });

  it('back to Earth rises: holds the current frame, continues from the region pose, fades out', async () => {
    const r = rig();
    await r.director.navigate(r.target(r.earth, 'earth'));
    await r.director.navigate(r.target(r.sea, 'REG-SEA'));
    r.steps.length = 0;
    r.seaSurf.pose = { lat: 3, lon: 104, distance: 2.4 };
    r.setPose({ lat: 12, lon: 72, distance: 7.4 });
    expect(await r.director.navigate(r.target(r.earth, 'earth'))).toBe('done');
    expect(r.steps.map((s) => s.step)).toEqual(['rise', 'settle']);
    expect(r.stage.calls.some((c) => c.op === 'show')).toBe(true);
    expect(r.globe.jumps.at(-1)).toEqual({ lat: 3, lon: 104, distance: 2.4 });
    expect(r.globe.flights.at(-1)!.id).toBe('restore');
    expect(r.stage.calls.filter((c) => c.op === 'fadeOut').at(-1)!.ms).toBe(BRIDGE_TIMINGS.rise);
    expect(r.earth.active).toBe(true);
  });

  it('Back mid-flight cancels the dive, clears the stage and keeps the globe active', async () => {
    const r = rig();
    await r.director.navigate(r.target(r.earth, 'earth'));
    let release!: (v: boolean) => void;
    r.globe.hold = new Promise<boolean>((res) => (release = res));
    const going = r.director.navigate(r.target(r.sea, 'REG-SEA'));
    await new Promise((res) => setTimeout(res, 0));
    expect(r.director.phase).toBe('flying');
    r.globe.hold = null;
    const back = r.director.navigate(r.target(r.earth, 'earth'));
    release(false);
    expect(await going).toBe('cancelled');
    expect(await back).toBe('done');
    expect(r.steps.map((s) => s.step)).toContain('cancelled');
    expect(r.stage.calls.some((c) => c.op === 'clear')).toBe(true);
    expect(r.seaSurf.overlay.visible).toBe(true);
    expect(r.earth.active).toBe(true);
    expect(r.sea.active).toBe(false);
    expect(r.director.state().activeSceneKey).toBe('earth');
  });

  it('cancelling during the reveal never activates the destination', async () => {
    const r = rig();
    await r.director.navigate(r.target(r.earth, 'earth'));
    r.stage.holdReveal = true;
    const going = r.director.navigate(r.target(r.sea, 'REG-SEA'));
    await new Promise((res) => setTimeout(res, 0));
    expect(r.director.phase).toBe('handoff');
    r.director.cancel();
    expect(await going).toBe('cancelled');
    expect(r.sea.active).toBe(false);
    expect(r.earth.active).toBe(true);
    expect(r.stage.calls.at(-1)!.op).toBe('clear');
  });
});

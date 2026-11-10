import { describe, expect, it, vi } from 'vitest';
import { CLICK_MAX_MS, InputRouter, type HitTester, type InputTarget } from '@/spatial/InputRouter';
import { OverlayProjectionAdapter } from '@/spatial/OverlayProjectionAdapter';
import { SceneCache } from '@/spatial/SceneCache';
import { SpatialDirector, type FrameScheduler } from '@/spatial/SpatialDirector';
import type { CameraState, FlightPhase, SceneKind, SceneTarget, SpatialScene } from '@/spatial/types';

/** Deferred promise so tests can hold a scene inside preload/focus and interleave navigations. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeScene implements SpatialScene {
  readonly log: string[] = [];
  disposed = false;
  camera: CameraState;
  preloadGate: Promise<void> | null = null;
  focusGate: Promise<boolean> | null = null;
  failPreload = false;
  constructor(
    readonly key: string,
    readonly kind: SceneKind = 'region3d',
  ) {
    this.camera = { sceneKey: key, position: [0, 0, 10], target: [0, 0, 0] };
  }
  async preload(signal: AbortSignal) {
    this.log.push('preload');
    if (this.failPreload) throw new Error(`load failed: ${this.key}`);
    if (this.preloadGate) await this.preloadGate;
    if (signal.aborted) this.log.push('preload-aborted');
  }
  renderStaticFrame(t: SceneTarget) {
    this.log.push(`static:${t.focusId}`);
  }
  activate(t: SceneTarget) {
    this.log.push(`activate:${t.focusId}`);
  }
  updateFrame() {
    this.log.push('frame');
    return true;
  }
  async focus(t: SceneTarget, signal: AbortSignal, opts: { restore: CameraState | null }) {
    this.log.push(`focus:${t.focusId}${opts.restore ? ':restore' : ''}`);
    if (this.focusGate) return (await this.focusGate) && !signal.aborted;
    return true;
  }
  setSelection() {}
  deactivate() {
    this.log.push('deactivate');
  }
  dispose() {
    this.disposed = true;
  }
  getCameraState() {
    return this.camera;
  }
  restoreCameraState(s: CameraState) {
    this.log.push(`restore:${s.position.join(',')}`);
    this.camera = s;
  }
}

const target = (sceneKey: string, focusId = sceneKey): SceneTarget => ({ kind: 'region3d', sceneKey, focusId });

function fakeFactory() {
  const made = new Map<string, FakeScene>();
  const factory = (t: SceneTarget) => {
    const s = new FakeScene(t.sceneKey);
    made.set(t.sceneKey, s);
    return s;
  };
  return { made, factory };
}

describe('SceneCache', () => {
  it('reuses by key, evicts least recently used and disposes evicted scenes', () => {
    const { made, factory } = fakeFactory();
    const cache = new SceneCache(2);
    const a = cache.createOrReuse(target('a'), factory);
    cache.createOrReuse(target('b'), factory);
    expect(cache.createOrReuse(target('a'), factory)).toBe(a);
    cache.createOrReuse(target('c'), factory);
    expect(cache.keys()).toEqual(['a', 'c']);
    expect(made.get('b')!.disposed).toBe(true);
    expect(cache.stats()).toMatchObject({ size: 2, created: 3, disposed: 1 });
  });

  it('never evicts pinned scenes and catches up on unpin', () => {
    const { made, factory } = fakeFactory();
    const cache = new SceneCache(1);
    cache.createOrReuse(target('a'), factory);
    cache.pin('a');
    cache.createOrReuse(target('b'), factory);
    expect(cache.keys()).toEqual(['a', 'b']);
    cache.pin('b');
    cache.unpin('a');
    expect(cache.keys()).toEqual(['b']);
    expect(made.get('a')!.disposed).toBe(true);
  });

  it('rejects factories that return the wrong key and clears everything', () => {
    const cache = new SceneCache(3);
    expect(() => cache.createOrReuse(target('x'), () => new FakeScene('y'))).toThrow(/key y/);
    const { made, factory } = fakeFactory();
    cache.createOrReuse(target('a'), factory);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(made.get('a')!.disposed).toBe(true);
  });
});

describe('SpatialDirector', () => {
  it('runs a cross-scene flight through the fixed phases', async () => {
    const { made, factory } = fakeFactory();
    const d = new SpatialDirector({ factory });
    const phases: FlightPhase[] = [];
    d.on('phase', (p) => phases.push(p));
    expect(await d.navigate(target('a', 'REG-SEA'))).toBe('done');
    expect(phases).toEqual(['preparing', 'handoff', 'settling', 'idle']);
    expect(made.get('a')!.log).toEqual(['preload', 'static:REG-SEA', 'activate:REG-SEA', 'focus:REG-SEA']);
    expect(d.state()).toMatchObject({ phase: 'idle', activeSceneKey: 'a', activeFocusId: 'REG-SEA', lastOutcome: 'done', flights: 1 });
  });

  it('moves the camera inside the active scene for same-scene targets', async () => {
    const { made, factory } = fakeFactory();
    const d = new SpatialDirector({ factory });
    await d.navigate(target('earth', 'earth'));
    const phases: FlightPhase[] = [];
    d.on('phase', (p) => phases.push(p));
    expect(await d.navigate(target('earth', 'REG-SEA'))).toBe('done');
    expect(phases).toEqual(['flying', 'idle']);
    expect(made.size).toBe(1);
    expect(made.get('earth')!.log.at(-1)).toBe('focus:REG-SEA');
    expect(d.state().activeFocusId).toBe('REG-SEA');
  });

  it('a second navigation aborts the first mid-preload (Back during a flight)', async () => {
    const { made, factory } = fakeFactory();
    const gate = deferred();
    const d = new SpatialDirector({
      factory: (t) => {
        const s = factory(t) as FakeScene;
        if (t.sceneKey === 'slow') s.preloadGate = gate.promise;
        return s;
      },
    });
    await d.navigate(target('home'));
    const slow = d.navigate(target('slow'));
    const back = d.navigate(target('home', 'home'));
    gate.resolve();
    expect(await slow).toBe('cancelled');
    expect(await back).toBe('done');
    expect(made.get('slow')!.log).not.toContain('activate:slow');
    expect(d.state()).toMatchObject({ activeSceneKey: 'home', phase: 'idle', cancelled: 1 });
  });

  it('cancel() during a same-scene flight leaves the scene active and idle', async () => {
    const gate = deferred<boolean>();
    const { factory } = fakeFactory();
    const d = new SpatialDirector({ factory });
    await d.navigate(target('earth', 'earth'));
    (d.activeScene as FakeScene).focusGate = gate.promise;
    const p = d.navigate(target('earth', 'REG-NEU'));
    expect(d.busy).toBe(true);
    d.cancel();
    gate.resolve(true);
    expect(await p).toBe('cancelled');
    expect(d.state()).toMatchObject({ phase: 'idle', activeSceneKey: 'earth', lastOutcome: 'cancelled' });
  });

  it('a failed preload reports an error and keeps the previous scene on screen', async () => {
    const { factory } = fakeFactory();
    const d = new SpatialDirector({
      factory: (t) => {
        const s = factory(t) as FakeScene;
        s.failPreload = t.sceneKey === 'broken';
        return s;
      },
    });
    await d.navigate(target('good'));
    const errors: string[] = [];
    d.on('error', (e) => errors.push(e.message));
    expect(await d.navigate(target('broken'))).toBe('error');
    expect(errors).toEqual(['load failed: broken']);
    expect(d.state()).toMatchObject({ phase: 'error', activeSceneKey: 'good', lastError: 'load failed: broken' });
    expect(await d.navigate(target('good', 'again'))).toBe('done');
  });

  it('remembers the camera per scene and focus, and restores it on return', async () => {
    const { made, factory } = fakeFactory();
    const d = new SpatialDirector({ factory });
    await d.navigate(target('a', 'REG-SEA'));
    made.get('a')!.camera = { sceneKey: 'a', position: [1, 2, 3], target: [0, 0, 0] };
    await d.navigate(target('b'));
    await d.navigate(target('a', 'REG-SEA'));
    expect(made.get('a')!.log).toContain('restore:1,2,3');
    expect(made.get('a')!.log.at(-1)).toBe('focus:REG-SEA:restore');
    await d.navigate(target('b'), { restoreCamera: false });
    expect(made.get('b')!.log.at(-1)).toBe('focus:b');
  });

  it('runs the transition planner hooks in order', async () => {
    const order: string[] = [];
    const { factory } = fakeFactory();
    const d = new SpatialDirector({
      factory,
      planner: (from) =>
        from
          ? {
              fly: async () => (order.push('fly'), true),
              handoff: async () => (order.push('handoff'), true),
              settle: async () => (order.push('settle'), true),
            }
          : null,
    });
    await d.navigate(target('a'));
    expect(order).toEqual([]);
    await d.navigate(target('b'));
    expect(order).toEqual(['fly', 'handoff', 'settle']);
  });

  it('owns one frame loop: the active scene updates, then frame listeners run', async () => {
    const queue: ((now: number) => void)[] = [];
    const scheduler: FrameScheduler = { request: (cb) => queue.push(cb), cancel: () => queue.splice(0) };
    const { made, factory } = fakeFactory();
    const d = new SpatialDirector({ factory, scheduler });
    await d.navigate(target('a'));
    const frames: [number, boolean][] = [];
    d.on('frame', (ctx, drew) => frames.push([ctx.dtMs, drew]));
    d.start();
    d.start();
    expect(queue.length).toBe(1);
    queue.shift()!(1000);
    queue.shift()!(1016);
    expect(frames).toEqual([
      [0, true],
      [16, true],
    ]);
    expect(made.get('a')!.log.filter((l) => l === 'frame').length).toBe(2);
    d.stop();
    expect(d.isRunning).toBe(false);
    expect(queue.length).toBe(0);
  });

  it('keeps scene memory bounded across round trips and disposes everything', async () => {
    const { made, factory } = fakeFactory();
    const d = new SpatialDirector({ factory, cache: new SceneCache(2) });
    for (const k of ['a', 'b', 'c', 'a', 'b', 'c']) await d.navigate(target(k));
    expect(d.cache.size).toBeLessThanOrEqual(2);
    d.dispose();
    expect([...made.values()].filter((s) => !s.disposed)).toEqual([]);
    expect(await d.navigate(target('a'))).toBe('cancelled');
  });
});

class FakeElement implements InputTarget {
  private readonly handlers = new Map<string, (e: PointerEvent) => void>();
  addEventListener(type: string, fn: (e: PointerEvent) => void) {
    this.handlers.set(type, fn);
  }
  removeEventListener(type: string) {
    this.handlers.delete(type);
  }
  getBoundingClientRect() {
    return { left: 10, top: 20 };
  }
  fire(type: string, x: number, y: number, extra: { button?: number; buttons?: number } = {}) {
    this.handlers.get(type)?.({ clientX: x, clientY: y, button: extra.button ?? 0, buttons: extra.buttons ?? 0 } as PointerEvent);
  }
  get listenerCount() {
    return this.handlers.size;
  }
}

function routerHarness() {
  const el = new FakeElement();
  let now = 0;
  const frames: (() => void)[] = [];
  const router = new InputRouter(el, { now: () => now, schedule: (cb) => frames.push(cb) });
  return {
    el,
    router,
    advance: (ms: number) => (now += ms),
    flush: () => frames.splice(0).forEach((f) => f()),
    frames,
  };
}

const tester = (layer: string, priority: number, hit: (x: number, y: number) => boolean): HitTester => ({
  layer,
  priority,
  test: (x, y) => (hit(x, y) ? { layer, key: `${layer}:${x},${y}`, target: layer } : null),
});

describe('InputRouter', () => {
  it('a press-release within 5 px is a click in canvas-local coordinates', () => {
    const { el, router } = routerHarness();
    router.register(tester('globe', 0, () => true));
    const clicks = vi.fn();
    router.on('click', clicks);
    el.fire('pointerdown', 110, 120, { buttons: 1 });
    el.fire('pointerup', 113, 123);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(clicks.mock.calls[0][0]).toMatchObject({ layer: 'globe' });
    expect(clicks.mock.calls[0][2]).toEqual({ x: 103, y: 103 });
  });

  it('a drag beyond the threshold never clicks and suppresses hover', () => {
    const { el, router, frames } = routerHarness();
    router.register(tester('globe', 0, () => true));
    const clicks = vi.fn();
    const drags = vi.fn();
    router.on('click', clicks);
    router.on('dragstart', drags);
    el.fire('pointerdown', 100, 100, { buttons: 1 });
    el.fire('pointermove', 104, 100, { buttons: 1 });
    expect(router.dragging).toBe(false);
    el.fire('pointermove', 106, 100, { buttons: 1 });
    expect(router.dragging).toBe(true);
    el.fire('pointerup', 100, 100);
    expect(drags).toHaveBeenCalledTimes(1);
    expect(clicks).not.toHaveBeenCalled();
    expect(frames.length).toBe(0);
  });

  it('long presses and non-primary buttons are not clicks', () => {
    const { el, router, advance } = routerHarness();
    const clicks = vi.fn();
    router.on('click', clicks);
    el.fire('pointerdown', 0, 0, { buttons: 1 });
    advance(CLICK_MAX_MS + 1);
    el.fire('pointerup', 0, 0);
    el.fire('pointerdown', 0, 0, { buttons: 2 });
    el.fire('pointerup', 0, 0, { button: 2 });
    expect(clicks).not.toHaveBeenCalled();
  });

  it('coalesces hover to one hit test per frame and the highest priority tester wins', () => {
    const { el, router, flush } = routerHarness();
    const globe = vi.fn(() => ({ layer: 'globe', key: 'globe', target: null }));
    router.register({ layer: 'globe', priority: 0, test: globe });
    router.register(tester('vessel', 10, (x) => x > 50));
    const hovers = vi.fn();
    const changes = vi.fn();
    router.on('hover', hovers);
    router.on('hoverchange', changes);
    for (let i = 0; i < 5; i++) el.fire('pointermove', 20 + i, 20);
    flush();
    expect(hovers).toHaveBeenCalledTimes(1);
    expect(hovers.mock.calls[0][0]).toMatchObject({ layer: 'globe' });
    el.fire('pointermove', 100, 20);
    flush();
    expect(hovers.mock.calls[1][0]).toMatchObject({ layer: 'vessel' });
    el.fire('pointermove', 100, 20);
    flush();
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('disabling drops pending hover and clears the hover target; dispose removes listeners', () => {
    const { el, router, flush } = routerHarness();
    router.register(tester('globe', 0, () => true));
    const hovers = vi.fn();
    const changes = vi.fn();
    router.on('hover', hovers);
    router.on('hoverchange', changes);
    el.fire('pointermove', 30, 30);
    flush();
    router.setEnabled(false);
    expect(changes.mock.calls.at(-1)![0]).toBeNull();
    el.fire('pointermove', 40, 40);
    flush();
    expect(hovers).toHaveBeenCalledTimes(1);
    router.dispose();
    expect(el.listenerCount).toBe(0);
  });
});

describe('OverlayProjectionAdapter', () => {
  it('projects through the installed projector and hides points outside the viewport margin', () => {
    const o = new OverlayProjectionAdapter(48);
    expect(o.project(0, 0).visible).toBe(false);
    o.setProjector((lon, lat) => ({ x: lon * 10, y: lat * 10, visible: lat >= 0 }));
    o.setViewport(800, 600);
    expect(o.project(10, 10)).toEqual({ x: 100, y: 100, visible: true });
    expect(o.project(10, -1).visible).toBe(false);
    expect(o.project(84, 10).visible).toBe(true);
    expect(o.project(85, 10).visible).toBe(false);
    expect(o.project(Number.NaN, 10).visible).toBe(false);
  });

  it('tracks anchors, re-projects them on update and swaps projectors without re-registering', () => {
    const o = new OverlayProjectionAdapter();
    o.setViewport(1000, 1000);
    o.setProjector((lon, lat) => ({ x: lon, y: lat, visible: true }));
    const seen: number[] = [];
    const stop = o.track({ id: 'PRT-SIN', lon: 103.8, lat: 1.3 }, (p) => seen.push(p.x));
    expect(seen).toEqual([103.8]);
    const v0 = o.version;
    o.setProjector((lon, lat) => ({ x: lon * 2, y: lat, visible: true }));
    expect(o.version).toBeGreaterThan(v0);
    expect(o.update()).toBe(1);
    expect(seen).toEqual([103.8, 207.6]);
    stop();
    expect(o.anchorCount).toBe(0);
    expect(o.update()).toBe(0);
  });
});

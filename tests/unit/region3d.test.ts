import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { formatScaleLength, niceScaleLength, scaleBar } from '@/spatial/compass';
import { parseGeoDoc } from '@/spatial/geoData';
import { InputRouter } from '@/spatial/InputRouter';
import { OverlayProjectionAdapter } from '@/spatial/OverlayProjectionAdapter';
import { CITIES } from '@/spatial/registry';
import { EXTRUDE_FRACTION, globeToPlanarDistance, HOVER_LIFT_FRACTION, planarSceneKey, planarToGlobeDistance, Region3DScene, type Region3DOptions } from '@/spatial/scenes/Region3DScene';

const W = 1200;
const H = 800;

/** Minimal DOM for OrbitControls, ResizeObserver and Three's image loader in the node test environment. */
class FakeEl {
  style: Record<string, string> = {};
  private l = new Map<string, Set<(e: unknown) => void>>();
  addEventListener(t: string, fn: (e: unknown) => void) {
    if (!this.l.has(t)) this.l.set(t, new Set());
    this.l.get(t)!.add(fn);
  }
  removeEventListener(t: string, fn: (e: unknown) => void) {
    this.l.get(t)?.delete(fn);
  }
  dispatch(t: string, e: Record<string, unknown>) {
    for (const fn of this.l.get(t) ?? []) fn({ preventDefault() {}, ...e });
  }
  getRootNode() {
    return this;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: W, height: H, right: W, bottom: H };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false;
  }
  get ownerDocument() {
    return this;
  }
  clientWidth = W;
  clientHeight = H;
}

const saved: Record<string, unknown> = {};
beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  saved.document = g.document;
  saved.ResizeObserver = g.ResizeObserver;
  g.document = {
    createElementNS: () => {
      const img = new FakeEl() as FakeEl & { src: string; width: number; height: number };
      Object.defineProperty(img, 'src', { set: () => setTimeout(() => img.dispatch('load', {})) });
      img.width = 4;
      img.height = 4;
      return img;
    },
  };
  g.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});
afterAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.document = saved.document;
  g.ResizeObserver = saved.ResizeObserver;
});

function geo(path: string) {
  return parseGeoDoc(JSON.parse(readFileSync(resolve('public', path.replace(/^\//, '')), 'utf8')), path);
}

function makeScene(entry: Region3DOptions['entry'], extra: Partial<Region3DOptions> = {}) {
  const canvas = new FakeEl();
  const renderer = {
    domElement: canvas,
    compile: vi.fn(),
    render: vi.fn(),
    info: { render: { calls: 0, triangles: 0, lines: 0, points: 0 }, memory: { geometries: 0, textures: 0 } },
  } as unknown as THREE.WebGLRenderer;
  const projection = new OverlayProjectionAdapter();
  const scene = new Region3DScene({
    entry,
    renderer,
    host: new FakeEl() as unknown as HTMLElement,
    projection,
    reducedMotion: true,
    focus: async () => true,
    loadDoc: async (p) => geo(p),
    ...extra,
  });
  return { scene, renderer, canvas, projection };
}

const sinEntry = { id: 'CTY-SIN', type: 'city' as const, label: 'Singapore', bbox: CITIES[0].bbox, geometryPath: '/geo/city/CTY-SIN.json' };

describe('scale bar', () => {
  it('picks 1-2-5 lengths', () => {
    expect(niceScaleLength(0)).toBe(0);
    expect(niceScaleLength(7.3)).toBe(5);
    expect(niceScaleLength(180)).toBe(100);
    expect(niceScaleLength(2600)).toBe(2000);
    expect(niceScaleLength(49_000)).toBe(20_000);
    expect(formatScaleLength(500)).toBe('500 m');
    expect(formatScaleLength(20_000)).toBe('20 km');
    const bar = scaleBar(25, 110)!;
    expect(bar.label).toBe('2 km');
    expect(bar.px).toBeCloseTo(80);
  });
});

describe('planar distance conversion', () => {
  it('round-trips globe distances', () => {
    for (const d of [2.01, 2.3, 3, 6]) expect(planarToGlobeDistance(globeToPlanarDistance(d))).toBeCloseTo(d, 9);
    // 0.1 globe units above the surface is 5 % of the Earth radius.
    expect(globeToPlanarDistance(2.2)).toBeCloseTo(637.10088, 3);
  });
  it('keeps hover lift within the 2 % budget', () => {
    expect(HOVER_LIFT_FRACTION).toBeGreaterThan(0);
    expect(HOVER_LIFT_FRACTION).toBeLessThanOrEqual(0.02);
    expect(EXTRUDE_FRACTION).toBeLessThan(0.05);
  });
});

describe('Region3DScene', () => {
  it('builds the Singapore city scene with the focus contour lit', async () => {
    const built = vi.fn();
    const { scene } = makeScene(sinEntry, { onBuilt: built });
    expect(scene.key).toBe(planarSceneKey('city', 'CTY-SIN'));
    expect(scene.kind).toBe('city3d');
    expect(scene.surfaceKind).toBe('planar');
    await scene.preload(new AbortController().signal);
    expect(built).toHaveBeenCalledWith(scene);
    expect(scene.ready).toBe(true);
    expect(scene.geoDoc!.features.map((f) => f.iso3)).toContain('SGP');
    expect(scene.selectedFeature).toBe('SGP');
    expect(scene.illustrativeBounds).toBe(false);
    scene.dispose();
  });

  it('projects, picks and reports a north-up compass after a framing flight', async () => {
    const { scene, projection } = makeScene(sinEntry);
    await scene.preload(new AbortController().signal);
    scene.activate();
    const preset = scene.fitPreset('CTY-SIN', 'city', sinEntry.bbox);
    expect(await scene.flyTo(preset)).toBe(true);
    const pose = scene.getPose();
    expect(pose.lat).toBeCloseTo(preset.center.lat, 6);
    expect(pose.lon).toBeCloseTo(preset.center.lon, 6);
    expect(scene.equivalentDistance).toBeCloseTo(preset.distance, 6);

    // A point on Singapore island projects on screen and picks back as SGP land at the same place.
    const s = scene.project(1.36, 103.82);
    expect(s.visible).toBe(true);
    expect(projection.project(103.82, 1.36).x).toBeCloseTo(s.x, 6);
    const hit = scene.pick(s.x, s.y)!;
    expect(hit.country?.iso3).toBe('SGP');
    expect(hit.lat).toBeCloseTo(1.36, 2);
    expect(hit.lon).toBeCloseTo(103.82, 2);

    const c = scene.compass()!;
    expect(Math.abs(c.northDeg)).toBeLessThan(1);
    expect(c.metresPerPx).toBeGreaterThan(5);
    expect(c.metresPerPx).toBeLessThan(500);
    scene.dispose();
  });

  it('lifts a hovered feature by at most 2 % of the frame and settles back', async () => {
    const { scene } = makeScene(sinEntry);
    await scene.preload(new AbortController().signal);
    scene.activate();
    scene.setReducedMotion(false);
    scene.setHoverHighlight(['SGP']);
    let now = 0;
    for (let i = 0; i < 120; i++) scene.updateFrame({ nowMs: (now += 16), dtMs: 16 });
    const lift = scene.liftFraction('SGP');
    expect(lift).toBeCloseTo(HOVER_LIFT_FRACTION, 4);
    expect(lift).toBeLessThanOrEqual(0.02);
    scene.setHoverHighlight(null);
    for (let i = 0; i < 120; i++) scene.updateFrame({ nowMs: (now += 16), dtMs: 16 });
    expect(scene.liftFraction('SGP')).toBeCloseTo(0, 6);
    scene.dispose();
  });

  it('emits dblclick picks only while active and frees resources once', async () => {
    const disposed = vi.fn();
    const { scene, canvas } = makeScene(sinEntry, { onDispose: disposed });
    await scene.preload(new AbortController().signal);
    const router = new InputRouter(canvas as unknown as HTMLCanvasElement);
    scene.attachInput(router);
    const dbl = vi.fn();
    scene.on('dblclick', dbl);
    const tap = (t: number) => {
      vi.setSystemTime(t);
      canvas.dispatch('pointerdown', { clientX: 600, clientY: 400, button: 0, pointerType: 'mouse', pointerId: 1 });
      canvas.dispatch('pointerup', { clientX: 600, clientY: 400, button: 0, pointerType: 'mouse', pointerId: 1 });
    };
    vi.useFakeTimers();
    tap(1000);
    tap(1200);
    expect(dbl).not.toHaveBeenCalled();
    scene.activate();
    tap(5000);
    tap(5200);
    vi.useRealTimers();
    expect(dbl).toHaveBeenCalledTimes(1);
    scene.dispose();
    scene.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    router.dispose();
  });

  it('frames REG-MED as illustrative operational bounds', async () => {
    const { scene } = makeScene({ id: 'REG-MED', type: 'region', label: 'Mediterranean', bbox: { west: -6, south: 30, east: 36, north: 46 }, geometryPath: '/geo/region/REG-MED.json', illustrativeBounds: true });
    await scene.preload(new AbortController().signal);
    expect(scene.illustrativeBounds).toBe(true);
    expect(scene.selectedFeature).toBeNull();
    scene.dispose();
  });
});

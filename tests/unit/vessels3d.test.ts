import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { categoryOf, modelKeyOf, SHIP_MODEL_KEYS, SHIP_PRESETS, type ShipModelKey } from '@/map/vessels3d/categories';
import { forwardForHeading, headingToYaw, MODEL_FORWARD, wrapDegrees, yawToHeading } from '@/map/vessels3d/contract';
import { buildShipGeometry, LOD_TRIANGLE_RANGE, libraryStats, triangleCount, wakeGeometry, type ShipLod } from '@/map/vessels3d/library';
import { ANCHOR_SWAY_DEG, anchorSwayDeg, displayHeadingDeg, motionStateOf, restingHeadingDeg, WAKE_MAX_LENGTHS, wakeLength } from '@/map/vessels3d/motion';
import { catalog } from './fixtures';

const LODS: ShipLod[] = [0, 1, 2];

function extent(g: THREE.BufferGeometry, pick: (z: number) => boolean): number {
  const p = g.getAttribute('position');
  let m = 0;
  for (let i = 0; i < p.count; i++) if (pick(p.getZ(i))) m = Math.max(m, Math.abs(p.getX(i)));
  return m;
}

describe('ship coordinate contract', () => {
  it('maps the cardinal headings to yaw (forward −Z, up +Y)', () => {
    expect(headingToYaw(0)).toBeCloseTo(0, 12);
    expect(headingToYaw(90)).toBeCloseTo(-Math.PI / 2, 12);
    expect(Math.abs(headingToYaw(180))).toBeCloseTo(Math.PI, 12);
    expect(headingToYaw(270)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingToYaw(360)).toBeCloseTo(0, 12);
    expect(headingToYaw(-90)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('points the bow north, east, south and west in the scene frame (+X east, −Z north)', () => {
    const cases: [number, number, number][] = [
      [0, 0, -1],
      [90, 1, 0],
      [180, 0, 1],
      [270, -1, 0],
    ];
    for (const [h, x, z] of cases) {
      const f = forwardForHeading(h);
      expect(f.x).toBeCloseTo(x, 12);
      expect(f.z).toBeCloseTo(z, 12);
      // The same yaw on a Three.js object turns the model's bow the same way.
      const o = new THREE.Object3D();
      o.rotation.y = headingToYaw(h);
      o.updateMatrixWorld();
      const v = new THREE.Vector3(MODEL_FORWARD.x, MODEL_FORWARD.y, MODEL_FORWARD.z).applyMatrix4(o.matrixWorld);
      expect(v.x).toBeCloseTo(x, 12);
      expect(v.z).toBeCloseTo(z, 12);
    }
  });

  it('round-trips every heading through yaw', () => {
    for (let h = -720; h <= 720; h += 7.5) expect(yawToHeading(headingToYaw(h))).toBeCloseTo(wrapDegrees(h), 9);
  });
});

describe('ship categories', () => {
  it('covers the six spec categories and maps every fixture type', () => {
    expect(new Set(SHIP_MODEL_KEYS.map(categoryOf))).toEqual(new Set(['container', 'tanker', 'bulk', 'roro', 'tug', 'other']));
    const expected: Record<string, ShipModelKey> = {
      'Container ship': 'container',
      'Oil tanker': 'tanker',
      'LNG carrier': 'gas',
      'Bulk carrier': 'bulk',
      RoRo: 'roro',
      'General cargo': 'other',
    };
    for (const v of catalog().vessels) expect(modelKeyOf(v.vesselType)).toBe(expected[v.vesselType]);
    expect(modelKeyOf('Hovercraft')).toBe('other');
    expect(modelKeyOf('Tug')).toBe('tug');
  });
});

describe('procedural ship library', () => {
  it('keeps every model inside its LOD triangle range', () => {
    const stats = libraryStats();
    for (const key of SHIP_MODEL_KEYS) {
      for (const lod of LODS) {
        const [lo, hi] = LOD_TRIANGLE_RANGE[lod];
        expect(stats[key][lod], `${key} LOD${lod}`).toBeGreaterThanOrEqual(lo);
        expect(stats[key][lod], `${key} LOD${lod}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('is length-normalised with the bow at −Z, the waterline at y = 0 and plausible beam', () => {
    for (const key of SHIP_MODEL_KEYS) {
      for (const lod of [1, 2] as ShipLod[]) {
        const g = buildShipGeometry(key, lod);
        const b = g.boundingBox!;
        expect(b.max.z - b.min.z, `${key} length`).toBeGreaterThan(0.98);
        expect(b.max.z - b.min.z, `${key} length`).toBeLessThan(1.06);
        // The stem is fine and the transom is full: the narrow end is the bow.
        expect(extent(g, (z) => z < -0.44), `${key} bow`).toBeLessThan(extent(g, (z) => z > 0.44) * 0.7);
        expect(b.min.y, `${key} keel`).toBeLessThan(0);
        expect(b.min.y, `${key} keel`).toBeGreaterThan(-0.05);
        const beam = 1 / SHIP_PRESETS[key].lengthToBeam;
        expect((b.max.x - b.min.x) / beam, `${key} beam`).toBeGreaterThan(0.95);
        expect((b.max.x - b.min.x) / beam, `${key} beam`).toBeLessThan(1.45);
        for (const a of ['position', 'normal', 'partColor', 'tint']) expect(g.getAttribute(a), `${key} ${a}`).toBeTruthy();
      }
    }
  });

  it('caches geometry per model and LOD, with one shared LOD0 glyph', () => {
    expect(buildShipGeometry('container', 1)).toBe(buildShipGeometry('container', 1));
    expect(buildShipGeometry('container', 0)).toBe(buildShipGeometry('tug', 0));
    expect(triangleCount(buildShipGeometry('container', 2))).toBeGreaterThan(triangleCount(buildShipGeometry('container', 1)));
  });

  it('paints status only on the LOD0 glyph and the LOD1 deck, never whole LOD1/LOD2 hulls', () => {
    const tinted = (g: THREE.BufferGeometry) => {
      const t = g.getAttribute('tint');
      let n = 0;
      for (let i = 0; i < t.count; i++) if (t.getX(i) > 0.5) n++;
      return n / t.count;
    };
    expect(tinted(buildShipGeometry('other', 0))).toBeGreaterThan(0.6);
    for (const key of SHIP_MODEL_KEYS) {
      expect(tinted(buildShipGeometry(key, 1)), key).toBeLessThan(0.2);
      expect(tinted(buildShipGeometry(key, 2)), key).toBe(0);
    }
  });

  it('starts the wake at the stern and fades it out aft', () => {
    const g = wakeGeometry();
    const p = g.getAttribute('position');
    const f = g.getAttribute('fade');
    for (let i = 0; i < p.count; i++) {
      expect(p.getZ(i)).toBeGreaterThanOrEqual(0.5);
      if (p.getZ(i) >= 1.5 - 1e-6) expect(f.getX(i)).toBeCloseTo(0, 6);
    }
    expect(Math.max(...Array.from({ length: f.count }, (_, i) => f.getX(i)))).toBeCloseTo(1, 6);
  });
});

describe('ship motion rules', () => {
  it('classifies motion from navigation status and speed', () => {
    expect(motionStateOf('underway', 14)).toBe('underway');
    expect(motionStateOf('underway', 1)).toBe('stopped');
    expect(motionStateOf('at_anchor', 0)).toBe('anchored');
    expect(motionStateOf('moored', 0)).toBe('moored');
    expect(motionStateOf('unknown', null)).toBe('stopped');
  });

  it('draws a wake only underway, growing with speed', () => {
    expect(wakeLength('anchored', 12)).toBe(0);
    expect(wakeLength('moored', 12)).toBe(0);
    expect(wakeLength('stopped', 0)).toBe(0);
    expect(wakeLength('underway', 2)).toBe(0);
    expect(wakeLength('underway', 8)).toBeGreaterThan(0);
    expect(wakeLength('underway', 18)).toBeGreaterThan(wakeLength('underway', 8));
    expect(wakeLength('underway', 40)).toBeCloseTo(WAKE_MAX_LENGTHS, 9);
  });

  it('sways anchored ships within ±4° from scenario time, deterministically', () => {
    const t0 = Date.UTC(2026, 10, 9, 12);
    const samples = Array.from({ length: 200 }, (_, i) => anchorSwayDeg('VSL-0100', t0 + i * 20_000));
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(ANCHOR_SWAY_DEG + 1e-9);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(ANCHOR_SWAY_DEG);
    expect(anchorSwayDeg('VSL-0100', t0)).toBe(anchorSwayDeg('VSL-0100', t0));
    expect(anchorSwayDeg('VSL-0100', t0)).not.toBe(anchorSwayDeg('VSL-0101', t0));
  });

  it('holds moored ships fixed, follows COG underway and swings around the resting heading at anchor', () => {
    const t = Date.UTC(2026, 10, 9, 12);
    const moored = { vesselId: 'VSL-0200', cogDeg: null, state: 'moored' as const };
    expect(displayHeadingDeg(moored, t)).toBe(displayHeadingDeg(moored, t + 3_600_000));
    expect(displayHeadingDeg({ ...moored, berthHeadingDeg: 125 }, t)).toBe(125);
    expect(displayHeadingDeg({ vesselId: 'VSL-0001', cogDeg: 271, state: 'underway' }, t)).toBe(271);
    const rest = restingHeadingDeg('VSL-0300');
    const a = displayHeadingDeg({ vesselId: 'VSL-0300', cogDeg: null, state: 'anchored' }, t);
    const d = Math.abs(((a - rest + 540) % 360) - 180);
    expect(d).toBeLessThanOrEqual(ANCHOR_SWAY_DEG + 1e-9);
  });
});

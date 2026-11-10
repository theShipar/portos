import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHIP_PRESETS, type ShipModelKey } from './categories';
import { box, capsule, colored, cylinder, dome, loftedHull, seeded, tiltedBox, triangleCount, type HullShape, type Part } from './geometry';

/**
 * Procedural ship library (spec 08 fallback tier: code-built, no third-party models). LOD0 is one shared low-poly hull
 * glyph for instanced Earth views; LOD1 is a recognisable per-type model for regional / city views; LOD2 is the
 * detailed model drawn only for the selected ship. Model frame per `contract.ts`.
 */
export type ShipLod = 0 | 1 | 2;

export const LOD_TRIANGLE_RANGE: Record<ShipLod, readonly [number, number]> = { 0: [100, 500], 1: [1000, 5000], 2: [10000, 60000] };
/** Beam exaggeration applied in the shader while a ship is drawn larger than true scale (legibility at 9–30 px). */
export const LOD_BEAM_BOOST: Record<ShipLod, number> = { 0: 1.8, 1: 1.35, 2: 1 };

const COL = {
  house: '#e1e6ea',
  houseShade: '#c8d0d6',
  window: '#17222a',
  funnel: '#2b353c',
  funnelBand: '#8c969d',
  pipe: '#8d989f',
  pipeDark: '#6c777e',
  crane: '#b3a98f',
  hatch: '#7d7466',
  hatchRib: '#6c6457',
  dome: '#e9edf0',
  skirt: '#9aa5ac',
  rail: '#c4ccd2',
  fender: '#1c2227',
  boat: '#d98c3c',
  ramp: '#6e7a82',
  vent: '#aeb7bd',
  cargo: ['#5f7686', '#8a6d52', '#4f6b78', '#7e5a4d', '#9b8c6a', '#5c7666', '#6d6f7c', '#8c7f6e'],
};

interface Ctx {
  key: ShipModelKey;
  lod: ShipLod;
  beam: number;
  fb: number;
  shape: HullShape;
  parts: Part[];
  rand: () => number;
  /** Segment count helper: cheap at LOD1, round at LOD2. */
  seg(lo: number, hi: number): number;
}

const zOf = (s: number) => 0.5 - s;

/** Accommodation block: stacked tiers, bridge with wings and window band, funnel aft, mast. */
function accommodation(c: Ctx, o: { s: number; depth: number; width: number; tiers: number; tierH: number; funnel?: boolean; wings?: boolean }) {
  const z = zOf(o.s);
  const { lod, fb, parts } = c;
  const w = Math.min(o.width, c.shape.halfBreadth(o.s) * 2 * 0.96);
  for (let k = 0; k < o.tiers; k++) {
    const shrink = 1 - k * 0.05;
    parts.push(box(w * shrink, o.tierH, o.depth * (1 - k * 0.04), 0, fb + k * o.tierH, z + k * o.depth * 0.02, k % 2 ? COL.houseShade : COL.house));
  }
  const top = fb + o.tiers * o.tierH;
  const front = z - o.depth / 2;
  const bridgeY = top - o.tierH;
  if (o.wings !== false) parts.push(box(c.shape.halfBreadth(o.s) * 2 * 1.02, o.tierH * 0.22, o.depth * 0.3, 0, bridgeY + o.tierH * 0.62, front + o.depth * 0.15, COL.house));
  if (lod === 2) {
    // Individual windows on every tier front and along both sides of the bridge.
    for (let k = 0; k < o.tiers; k++) {
      const tw = w * (1 - k * 0.05);
      const n = k === o.tiers - 1 ? 14 : 9;
      for (let i = 0; i < n; i++) {
        const x = -tw / 2 + (tw / n) * (i + 0.5);
        parts.push(box((tw / n) * 0.62, o.tierH * 0.34, o.depth * 0.02, x, fb + k * o.tierH + o.tierH * 0.42, front + k * o.depth * 0.02 - o.depth * 0.005, COL.window));
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          parts.push(box(o.depth * 0.015, o.tierH * 0.3, (o.depth / 4) * 0.55, side * (tw / 2 + o.depth * 0.004), fb + k * o.tierH + o.tierH * 0.44, front + (o.depth / 4) * (i + 0.5), COL.window));
        }
      }
    }
  } else {
    parts.push(box(w * 1.01, o.tierH * 0.3, o.depth * 0.06, 0, bridgeY + o.tierH * 0.4, front + o.depth * 0.02, COL.window));
  }
  if (o.funnel !== false) {
    const fz = z + o.depth * 0.42;
    const fh = o.tierH * 1.6;
    parts.push(cylinder(w * 0.11, fh, c.seg(8, 24), 0, top - o.tierH * 0.2, fz, COL.funnel));
    parts.push(cylinder(w * 0.115, fh * 0.14, c.seg(8, 24), 0, top + fh * 0.55, fz, COL.funnelBand));
  }
  parts.push(cylinder(w * 0.012, o.tierH * 1.4, c.seg(5, 10), 0, top, front + o.depth * 0.3, COL.rail));
  if (lod === 2) {
    for (const side of [-1, 1]) parts.push(capsule(c.beam * 0.045, o.depth * 0.5, 10, side * (w / 2 + c.beam * 0.05), fb + o.tierH * 1.2, z + o.depth * 0.1, COL.boat));
  }
}

/** Forecastle deck house and a bow mast. */
function forecastle(c: Ctx) {
  const s = 0.93;
  const w = c.shape.halfBreadth(s) * 2 * 0.8;
  c.parts.push(box(w, c.fb * 0.25, 0.05, 0, c.shape.deckY(s), zOf(s) + 0.01, c.lod === 0 ? COL.house : SHIP_PRESETS[c.key].paint.deck));
  c.parts.push(cylinder(c.beam * 0.012, c.fb * 1.6, c.seg(5, 10), 0, c.shape.deckY(s), zOf(s), COL.rail));
}

/** Deck-edge railings (LOD2 only): posts and top rails along both sides. */
function railings(c: Ctx, from = 0.03, to = 0.95, step = 0.012) {
  const postH = c.fb * 0.28;
  for (const side of [-1, 1]) {
    let prev: { x: number; z: number; y: number } | null = null;
    for (let s = from; s <= to; s += step) {
      const x = side * c.shape.halfBreadth(s) * 0.97;
      const y = c.shape.deckY(s);
      const z = zOf(s);
      c.parts.push(box(0.0018, postH, 0.0018, x, y, z, COL.rail));
      if (prev) {
        const dx = x - prev.x;
        const dz = z - prev.z;
        const len = Math.hypot(dx, dz);
        c.parts.push(tiltedBox(0.0016, 0.0016, len, 0, Math.atan2(dx, dz), (x + prev.x) / 2, (y + prev.y) / 2 + postH, (z + prev.z) / 2, COL.rail));
      }
      prev = { x, z, y };
    }
  }
}

function container(c: Ctx) {
  const tierH = c.fb * 0.62;
  const bays = c.lod === 2 ? 16 : 12;
  const s0 = 0.14;
  const s1 = 0.8;
  for (let b = 0; b < bays; b++) {
    const sb = s0 + ((s1 - s0) * (b + 0.5)) / bays;
    if (Math.abs(sb - 0.2) < 0.045) continue;
    const z = zOf(sb);
    const len = ((s1 - s0) / bays) * 0.9;
    const width = Math.min(c.beam * 0.9, c.shape.halfBreadth(sb) * 2 * 0.92);
    const y0 = c.shape.deckY(sb);
    if (c.lod === 2) {
      const rows = 9;
      for (let r = 0; r < rows; r++) {
        const x = -width / 2 + (width / rows) * (r + 0.5);
        const tiers = 3 + Math.floor(c.rand() * 4);
        for (let t = 0; t < tiers; t++) {
          const col = COL.cargo[Math.floor(c.rand() * COL.cargo.length)]!;
          c.parts.push(box((width / rows) * 0.92, tierH * 0.94, len, x, y0 + t * tierH, z, col, 0));
        }
      }
    } else {
      for (const side of [-1, 1]) {
        const tiers = 2 + Math.floor(c.rand() * 3);
        const col = COL.cargo[Math.floor(c.rand() * COL.cargo.length)]!;
        c.parts.push(box(width / 2 - 0.002, tierH * tiers, len, (side * width) / 4, y0, z, col, 0));
      }
    }
  }
  accommodation(c, { s: 0.2, depth: 0.06, width: c.beam, tiers: 6, tierH: c.fb * 0.62 });
  forecastle(c);
}

function tanker(c: Ctx) {
  const deckY = c.fb;
  const zA = zOf(0.84);
  const zB = zOf(0.18);
  const len = zA - zB;
  const midZ = (zA + zB) / 2;
  const pipes = c.lod === 2 ? 6 : 2;
  for (let i = 0; i < pipes; i++) {
    const x = (i - (pipes - 1) / 2) * c.beam * 0.035;
    c.parts.push(cylinder(c.beam * 0.012, Math.abs(len), c.seg(6, 12), x, deckY + c.fb * 0.25, midZ, i % 2 ? COL.pipeDark : COL.pipe, 'z'));
  }
  c.parts.push(box(c.beam * 0.16, c.fb * 0.08, Math.abs(len), 0, deckY + c.fb * 0.12, midZ, COL.pipeDark));
  // Manifold amidships with valves and a hose crane each side.
  const mz = zOf(0.5);
  c.parts.push(box(c.beam * 0.82, c.fb * 0.12, 0.02, 0, deckY, mz, COL.pipe));
  for (const side of [-1, 1]) c.parts.push(cylinder(c.beam * 0.02, c.fb * 0.9, c.seg(6, 12), side * c.beam * 0.3, deckY, mz + 0.03, COL.crane));
  if (c.lod === 2) {
    for (let i = 0; i < 10; i++) c.parts.push(cylinder(c.beam * 0.014, c.fb * 0.3, 12, (i - 4.5) * c.beam * 0.08, deckY + c.fb * 0.12, mz, COL.pipeDark));
    for (let i = 0; i < 12; i++) {
      const s = 0.22 + i * 0.05;
      for (const side of [-1, 1]) c.parts.push(cylinder(c.beam * 0.03, c.fb * 0.12, 12, side * c.beam * 0.26, deckY, zOf(s), COL.pipe));
    }
    for (let s = 0.2; s < 0.84; s += 0.03) c.parts.push(box(c.beam * 0.004, c.fb * 0.25, 0.002, 0, deckY, zOf(s), COL.pipeDark));
  }
  accommodation(c, { s: 0.09, depth: 0.07, width: c.beam, tiers: 5, tierH: c.fb * 0.75 });
  forecastle(c);
}

function gas(c: Ctx) {
  const r = c.beam * 0.42;
  const domes = 4;
  for (let i = 0; i < domes; i++) {
    const s = 0.3 + i * 0.165;
    const z = zOf(s);
    c.parts.push(cylinder(r * 1.02, c.fb * 0.5, c.seg(14, 40), 0, c.fb, z, COL.skirt));
    c.parts.push(dome(r, c.seg(14, 40), c.seg(6, 16), 0, c.fb * 1.5, z, COL.dome));
  }
  const zA = zOf(0.3 + 3 * 0.165);
  const zB = zOf(0.3);
  c.parts.push(box(c.beam * 0.1, c.fb * 0.12, Math.abs(zA - zB), 0, c.fb * 1.5 + r * 0.98, (zA + zB) / 2, COL.pipe));
  if (c.lod === 2) {
    for (let i = 0; i < domes; i++) c.parts.push(cylinder(r * 0.16, c.fb * 0.3, 24, 0, c.fb * 1.5 + r * 0.95, zOf(0.3 + i * 0.165), COL.pipeDark));
    for (const side of [-1, 1]) c.parts.push(cylinder(c.beam * 0.01, Math.abs(zA - zB), 12, side * c.beam * 0.38, c.fb * 1.15, (zA + zB) / 2, COL.pipe, 'z'));
  }
  accommodation(c, { s: 0.09, depth: 0.065, width: c.beam, tiers: 5, tierH: c.fb * 0.62 });
  forecastle(c);
}

function bulk(c: Ctx) {
  const holds = 7;
  for (let i = 0; i < holds; i++) {
    const s = 0.2 + i * 0.09;
    const z = zOf(s);
    const w = c.beam * 0.62;
    c.parts.push(box(w * 1.06, c.fb * 0.16, 0.066, 0, c.fb, z, COL.hatchRib));
    c.parts.push(box(w, c.fb * 0.14, 0.06, 0, c.fb + c.fb * 0.16, z, COL.hatch, 0));
    if (c.lod === 2) for (let k = 0; k < 7; k++) c.parts.push(box(w, c.fb * 0.04, 0.003, 0, c.fb + c.fb * 0.3, z - 0.027 + k * 0.009, COL.hatchRib));
  }
  // Geared: four deck cranes between the holds, jibs alternating to port and starboard.
  for (let i = 0; i < 4; i++) {
    const s = 0.245 + i * 0.18;
    const z = zOf(s);
    const side = i % 2 ? -1 : 1;
    c.parts.push(cylinder(c.beam * 0.05, c.fb * 1.1, c.seg(8, 18), 0, c.fb, z, COL.crane));
    c.parts.push(box(c.beam * 0.12, c.fb * 0.4, c.beam * 0.1, 0, c.fb * 2.1, z, COL.crane));
    c.parts.push(tiltedBox(c.beam * 0.035, c.beam * 0.035, 0.11, 0.35, side * 1.1, side * c.beam * 0.2, c.fb * 2.7, z + 0.012, COL.crane));
  }
  accommodation(c, { s: 0.09, depth: 0.065, width: c.beam, tiers: 5, tierH: c.fb * 0.75 });
  forecastle(c);
}

function roro(c: Ctx) {
  const h = c.fb * 4.2;
  const s0 = 0.03;
  const s1 = 0.86;
  const w = c.beam * 0.98;
  const zA = zOf(s1);
  const zB = zOf(s0);
  c.parts.push(box(w, h, zB - zA, 0, c.fb, (zA + zB) / 2, '#d7dcdf'));
  // Rounded, raked front: half cylinder squashed in Z.
  const front = new THREE.CylinderGeometry(w / 2, w / 2, h, c.seg(10, 32), 1, false, Math.PI / 2, Math.PI);
  front.scale(1, 1, 0.55);
  front.translate(0, c.fb + h / 2, zA);
  c.parts.push(colored(front, '#d7dcdf', 0));
  c.parts.push(box(w * 1.004, h * 0.06, (zB - zA) * 0.02, 0, c.fb + h * 0.84, zA - w * 0.27, COL.window));
  c.parts.push(box(w * 1.005, h * 0.025, zB - zA, 0, c.fb + h * 0.05, (zA + zB) / 2, SHIP_PRESETS.roro.paint.hull));
  // Stern ramp folded up against the transom.
  c.parts.push(tiltedBox(w * 0.42, 0.004, h * 0.75, -1.25, 0, w * 0.18, c.fb + h * 0.4, zB + 0.008, COL.ramp));
  c.parts.push(cylinder(w * 0.1, h * 0.25, c.seg(8, 24), 0, c.fb + h, zOf(0.12), COL.funnel));
  if (c.lod === 2) {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 26; i++) c.parts.push(box(w * 0.06, h * 0.04, 0.012, (r - 1) * w * 0.3, c.fb + h, zOf(0.12 + i * 0.027), COL.vent));
    for (const side of [-1, 1]) {
      for (let i = 0; i < 40; i++) c.parts.push(box(0.002, h * 0.05, 0.012, side * (w / 2 + 0.001), c.fb + h * 0.66, zOf(0.08 + i * 0.019), COL.window));
      c.parts.push(capsule(c.beam * 0.05, 0.035, 10, side * (w / 2 + c.beam * 0.05), c.fb + h * 0.55, zOf(0.2), COL.boat));
    }
  }
}

function tug(c: Ctx) {
  const s = 0.56;
  const z = zOf(s);
  const tierH = c.fb * 0.9;
  c.parts.push(box(c.beam * 0.62, tierH, 0.22, 0, c.fb, z, COL.house));
  c.parts.push(box(c.beam * 0.56, tierH * 0.9, 0.17, 0, c.fb + tierH, z - 0.01, COL.house));
  // All-round wheelhouse glazing.
  c.parts.push(box(c.beam * 0.57, tierH * 0.36, 0.172, 0, c.fb + tierH * 1.38, z - 0.01, COL.window));
  c.parts.push(cylinder(c.beam * 0.015, tierH * 1.6, c.seg(6, 12), 0, c.fb + tierH * 1.9, z, COL.rail));
  // Towing winch and staple aft.
  c.parts.push(cylinder(c.beam * 0.07, c.beam * 0.4, c.seg(8, 20), 0, c.fb + c.beam * 0.07, zOf(0.3), COL.pipeDark, 'x'));
  c.parts.push(tiltedBox(c.beam * 0.7, c.fb * 0.25, 0.02, 0, 0, 0, c.fb * 1.6, zOf(0.17), COL.crane));
  // Rubber fender band along the gunwale.
  const n = c.lod === 2 ? 64 : 16;
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const sa = 0.02 + (0.96 * i) / n;
      const sb = 0.02 + (0.96 * (i + 1)) / n;
      const xa = side * c.shape.halfBreadth(sa) * 1.02;
      const xb = side * c.shape.halfBreadth(sb) * 1.02;
      const za = zOf(sa);
      const zb = zOf(sb);
      const len = Math.hypot(xb - xa, zb - za);
      c.parts.push(tiltedBox(c.beam * 0.05, c.fb * 0.3, len, 0, Math.atan2(xb - xa, zb - za), (xa + xb) / 2, c.fb * 0.82, (za + zb) / 2, COL.fender));
    }
  }
  c.parts.push(cylinder(c.beam * 0.08, c.beam * 0.5, c.seg(8, 20), 0, c.shape.deckY(0.98) * 0.85, zOf(0.985), COL.fender, 'x'));
  if (c.lod === 2) {
    for (const side of [-1, 1]) for (let i = 0; i < 10; i++) c.parts.push(cylinder(c.beam * 0.05, c.beam * 0.04, 16, side * c.shape.halfBreadth(0.2 + i * 0.06) * 1.05, c.fb * 0.3, zOf(0.2 + i * 0.06), COL.fender, 'x'));
  }
}

function other(c: Ctx) {
  accommodation(c, { s: 0.1, depth: 0.07, width: c.beam, tiers: 4, tierH: c.fb * 0.7 });
  c.parts.push(box(c.beam * 0.3, c.fb * 0.4, 0.06, 0, c.fb, zOf(0.6), SHIP_PRESETS.other.paint.deck));
  forecastle(c);
}

const BUILDERS: Record<ShipModelKey, (c: Ctx) => void> = { container, tanker, gas, bulk, roro, tug, other };

function hullFor(key: ShipModelKey, lod: ShipLod) {
  const p = SHIP_PRESETS[key];
  const beam = 1 / p.lengthToBeam;
  const res = lod === 2 ? { stations: 96, sections: 20 } : lod === 1 ? { stations: 32, sections: 8 } : { stations: 12, sections: 3 };
  return {
    beam,
    ...loftedHull({
      beam,
      freeboard: p.freeboard,
      keel: p.freeboard * 0.35,
      bowStart: p.bowStart,
      fullness: p.fullness,
      sheer: key === 'tug' ? 0.7 : 0.4,
      transom: key === 'tug' ? 0.82 : 0.88,
      ...res,
      hull: p.paint.hull,
      bootTop: p.paint.bootTop,
      deck: p.paint.deck,
      hullTint: lod === 0 ? 1 : 0,
      // LOD1 shows status on the deck plane (what a top-down regional view sees); LOD2 leaves paint alone.
      deckTint: lod === 0 ? 1 : lod === 1 ? 0.6 : 0,
    }),
  };
}

function glyph(): Part[] {
  const { hull, deck, shape } = hullFor('other', 0);
  const fb = SHIP_PRESETS.other.freeboard;
  return [hull, deck, box(shape.halfBreadth(0.12) * 1.7, fb * 1.6, 0.08, 0, fb, zOf(0.12), COL.house, 0.4)];
}

const cache = new Map<string, THREE.BufferGeometry>();

/** Merged, indexed geometry for a model at a LOD; cached and shared by every instance. LOD0 ignores `key`. */
export function buildShipGeometry(key: ShipModelKey, lod: ShipLod): THREE.BufferGeometry {
  const cacheKey = lod === 0 ? 'glyph' : `${key}:${lod}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  let parts: Part[];
  if (lod === 0) parts = glyph();
  else {
    const { hull, deck, shape, beam } = hullFor(key, lod);
    const c: Ctx = {
      key,
      lod,
      beam,
      fb: SHIP_PRESETS[key].freeboard,
      shape,
      parts: [hull, deck],
      rand: seeded(key.length * 7919 + lod * 104729),
      seg: (lo, hi) => (lod === 2 ? hi : lo),
    };
    BUILDERS[key](c);
    if (lod === 2) railings(c, key === 'roro' ? 0.88 : 0.03, 0.95);
    parts = c.parts;
  }
  const flat = mergeGeometries(parts, false);
  if (!flat) throw new Error(`Ship geometry merge failed for ${cacheKey}`);
  parts.forEach((p) => p.dispose());
  // Hundreds of instances share this mesh: indexing shares corner vertices and cuts vertex shader work.
  const merged = mergeVertices(flat, 1e-6);
  if (merged !== flat) flat.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.name = `ship:${cacheKey}`;
  cache.set(cacheKey, merged);
  return merged;
}

/**
 * Wake: Kelvin arms (19.5°) from the stern quarters plus a central wash, from the stern (z = 0.5) one ship length
 * aft. The shader stretches it by the instance wake length; `fade` runs 1 → 0 along it.
 */
export function wakeGeometry(): THREE.BufferGeometry {
  const hit = cache.get('wake');
  if (hit) return hit;
  const pos: number[] = [];
  const fade: number[] = [];
  const K = 10;
  const tanK = Math.tan((19.5 * Math.PI) / 180);
  const hs = 0.06;
  const strip = (lateral: (d: number) => number, width: (d: number) => number, alpha: (d: number) => number) => {
    for (let k = 0; k < K; k++) {
      const d0 = k / K;
      const d1 = (k + 1) / K;
      const a = [lateral(d0) - width(d0) / 2, 0, 0.5 + d0];
      const b = [lateral(d0) + width(d0) / 2, 0, 0.5 + d0];
      const c = [lateral(d1) - width(d1) / 2, 0, 0.5 + d1];
      const d = [lateral(d1) + width(d1) / 2, 0, 0.5 + d1];
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      fade.push(alpha(d0), alpha(d1), alpha(d0), alpha(d0), alpha(d1), alpha(d1));
    }
  };
  for (const side of [-1, 1]) strip((d) => side * (hs + d * tanK), (d) => 0.012 + d * 0.05, (d) => Math.pow(1 - d, 1.4));
  strip(() => 0, (d) => hs * 1.6 * (1 - d * 0.5), (d) => 0.8 * Math.pow(1 - d, 2.2));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
  const out = colored(g, '#dcebf0', 0);
  cache.set('wake', out);
  return out;
}

export { triangleCount };

/** Triangle counts for every model and LOD (QA page and tests). */
export function libraryStats(): Record<ShipModelKey, Record<ShipLod, number>> {
  const out = {} as Record<ShipModelKey, Record<ShipLod, number>>;
  for (const key of Object.keys(SHIP_PRESETS) as ShipModelKey[]) {
    out[key] = { 0: triangleCount(buildShipGeometry(key, 0)), 1: triangleCount(buildShipGeometry(key, 1)), 2: triangleCount(buildShipGeometry(key, 2)) };
  }
  return out;
}

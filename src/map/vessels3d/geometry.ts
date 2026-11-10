import * as THREE from 'three';

/**
 * Geometry primitives for procedural ships in the model frame of `contract.ts` (bow −Z, up +Y, starboard +X,
 * length 1). Every part carries `partColor` (its own paint) and `tint` (0..1 mix towards the instance status colour)
 * so one instanced draw per model can show status without painting whole hulls.
 */
export type Part = THREE.BufferGeometry;

export function colored(g: THREE.BufferGeometry, color: string | ((x: number, y: number, z: number) => string), tint: number): Part {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const c = new THREE.Color();
  const fixed = typeof color === 'string' ? new THREE.Color(color) : null;
  for (let i = 0; i < n; i++) {
    const col = fixed ?? c.set((color as (x: number, y: number, z: number) => string)(pos.getX(i), pos.getY(i), pos.getZ(i)));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('partColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1));
  return geo;
}

/** Box with its base at `y0`, centred on (cx, cz). */
export function box(w: number, h: number, l: number, cx: number, y0: number, cz: number, color: string, tint = 0): Part {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(cx, y0 + h / 2, cz);
  return colored(g, color, tint);
}

/** Box rotated about X (pitch, + raises the −Z end) then placed with its centre at (cx, cy, cz). */
export function tiltedBox(w: number, h: number, l: number, pitch: number, yaw: number, cx: number, cy: number, cz: number, color: string): Part {
  const g = new THREE.BoxGeometry(w, h, l);
  g.rotateX(pitch);
  g.rotateY(yaw);
  g.translate(cx, cy, cz);
  return colored(g, color, 0);
}

export type Axis = 'x' | 'y' | 'z';

/** Cylinder of radius r and length h along `axis`; for 'y' the base sits at y0, otherwise the axis is at height y0. */
export function cylinder(r: number, h: number, seg: number, cx: number, y0: number, cz: number, color: string, axis: Axis = 'y', tint = 0): Part {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  g.translate(cx, axis === 'y' ? y0 + h / 2 : y0, cz);
  return colored(g, color, tint);
}

/** Upper hemisphere of radius r centred at (cx, y0, cz). */
export function dome(r: number, wSeg: number, hSeg: number, cx: number, y0: number, cz: number, color: string): Part {
  const g = new THREE.SphereGeometry(r, wSeg, hSeg, 0, Math.PI * 2, 0, Math.PI / 2);
  g.translate(cx, y0, cz);
  return colored(g, color, 0);
}

/** Capsule (lifeboat) lying along Z. */
export function capsule(r: number, len: number, seg: number, cx: number, y0: number, cz: number, color: string): Part {
  const g = new THREE.CapsuleGeometry(r, len, Math.max(2, seg >> 1), seg);
  g.rotateX(Math.PI / 2);
  g.translate(cx, y0 + r, cz);
  return colored(g, color, 0);
}

export interface HullSpec {
  beam: number;
  freeboard: number;
  /** Depth of the visible boot-top below the waterline (fraction of length). */
  keel: number;
  bowStart: number;
  fullness: number;
  /** Extra deck height at the stem, as a fraction of the freeboard. */
  sheer: number;
  /** Transom half-breadth relative to the mid-body. */
  transom: number;
  stations: number;
  sections: number;
  hull: string;
  bootTop: string;
  deck: string;
  hullTint: number;
  deckTint: number;
}

export interface HullShape {
  halfBreadth(s: number): number;
  deckY(s: number): number;
}

/** s = 0 at the stern, 1 at the stem. z = 0.5 − s. */
export function hullShape(spec: Pick<HullSpec, 'beam' | 'freeboard' | 'bowStart' | 'sheer' | 'transom'>): HullShape {
  const h = spec.beam / 2;
  const sternRun = 0.07;
  return {
    halfBreadth(s) {
      if (s < sternRun) return h * (spec.transom + (1 - spec.transom) * Math.sin(((s / sternRun) * Math.PI) / 2));
      if (s <= spec.bowStart) return h;
      const t = Math.min(1, (s - spec.bowStart) / (1 - spec.bowStart));
      return h * Math.pow(Math.max(0, Math.cos((t * Math.PI) / 2)), 0.72);
    },
    deckY(s) {
      const t = Math.max(0, (s - 0.72) / 0.28);
      return spec.freeboard * (1 + spec.sheer * t * t);
    },
  };
}

/**
 * Lofted hull: superellipse sections (boxy mid-body with a rounded bilge, finer towards the stem), raked stem, flat
 * transom and a deck at the sheer line. Stations cluster towards both ends where the shape changes fastest.
 */
export function loftedHull(spec: HullSpec): { hull: Part; deck: Part; shape: HullShape } {
  const shape = hullShape(spec);
  const N = spec.stations;
  const M = spec.sections;
  const pos: number[] = [];
  const idx: number[] = [];
  const station = (i: number) => {
    const u = i / (N - 1);
    return 0.5 - 0.5 * Math.cos(Math.PI * u);
  };
  const fullnessAt = (s: number) => {
    const bow = s > spec.bowStart ? (s - spec.bowStart) / (1 - spec.bowStart) : 0;
    return spec.fullness + (2 - spec.fullness) * Math.min(1, bow * 1.15);
  };
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i < N; i++) {
      const s = station(i);
      const hb = shape.halfBreadth(s);
      const dy = shape.deckY(s);
      const p = fullnessAt(s);
      for (let j = 0; j < M; j++) {
        const t = (j / (M - 1)) * (Math.PI / 2);
        const x = hb * Math.pow(Math.cos(t), 2 / p);
        const y = dy - (dy + spec.keel) * Math.pow(Math.sin(t), 2 / p);
        pos.push(side * x, y, 0.5 - s);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < M - 1; j++) {
        const a = base + i * M + j;
        const b = base + (i + 1) * M + j;
        const c = a + 1;
        const d = b + 1;
        if (side === 1) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  }
  // Transom: fan over the stern section, facing aft (+Z).
  const tc = pos.length / 3;
  const dy0 = shape.deckY(0);
  pos.push(0, (dy0 - spec.keel) / 2, 0.5);
  const ring: number[] = [];
  for (let j = 0; j < M; j++) ring.push(j);
  for (let j = M - 1; j >= 0; j--) ring.push(N * M + j);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % ring.length]!;
    idx.push(tc, b, a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const bootLine = spec.freeboard * 0.14;
  const hull = colored(g, (_x, y) => (y < bootLine ? spec.bootTop : spec.hull), spec.hullTint);

  const dpos: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    const s0 = station(i);
    const s1 = station(i + 1);
    const h0 = shape.halfBreadth(s0) * 0.985;
    const h1 = shape.halfBreadth(s1) * 0.985;
    const y0 = shape.deckY(s0);
    const y1 = shape.deckY(s1);
    const R0 = [h0, y0, 0.5 - s0];
    const R1 = [h1, y1, 0.5 - s1];
    const L0 = [-h0, y0, 0.5 - s0];
    const L1 = [-h1, y1, 0.5 - s1];
    dpos.push(...R0, ...R1, ...L0, ...L0, ...R1, ...L1);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
  dg.computeVertexNormals();
  return { hull, deck: colored(dg, spec.deck, spec.deckTint), shape };
}

/** Deterministic PRNG (mulberry32) so cargo layouts are stable per model seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Flat marker glyphs in the deck plane (y = 0, +Y up): selection / incident rings and the port diamond. Ships live in
 * `src/map/vessels3d`. Every part carries `partColor` and `tint` (0..1 mix toward the instance status colour).
 */
type Pt = [number, number];

function withColor(g: THREE.BufferGeometry, color: string, tint: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  const col = new THREE.Color(color);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('partColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(new Float32Array(n).fill(tint), 1));
  return geo;
}

function upNormals(count: number): THREE.Float32BufferAttribute {
  return new THREE.Float32BufferAttribute(new Array(count * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3);
}

/** Flat polygon at height y, facing +Y. Points are [x, z]. */
function flat(pts: Pt[], y: number, color: string, tint: number): THREE.BufferGeometry {
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  const pos: number[] = [];
  for (const [a, b, c] of tris) {
    const A = pts[a]!;
    const B = pts[b]!;
    const C = pts[c]!;
    const ny = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
    for (const [x, z] of ny >= 0 ? [A, B, C] : [A, C, B]) pos.push(x, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', upNormals(pos.length / 3));
  return withColor(g, color, tint);
}

/** Flat ring (annulus) in the deck plane; `gaps` > 0 cuts it into dashes (incident marker vs selection ring). */
export function ringGeometry(inner: number, outer: number, gaps = 0, segments = 40): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < segments; i++) {
    if (gaps > 0 && Math.floor((i / segments) * gaps * 2) % 2 === 1) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (r: number, a: number) => [Math.sin(a) * r, 0, Math.cos(a) * r];
    pos.push(...p(inner, a0), ...p(outer, a1), ...p(outer, a0), ...p(inner, a0), ...p(inner, a1), ...p(outer, a1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', upNormals(pos.length / 3));
  return withColor(g, '#ffffff', 1);
}

/** Port glyph: light diamond frame with a status-coloured core. */
export function portGeometry(): THREE.BufferGeometry {
  const d = (r: number): Pt[] => [
    [0, r],
    [r, 0],
    [0, -r],
    [-r, 0],
  ];
  const parts = [flat(d(0.5), 0, '#0b1d2a', 0), flat(d(0.42), 0.001, '#e8eef2', 0), flat(d(0.3), 0.002, '#ffffff', 1)];
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

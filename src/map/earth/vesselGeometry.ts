import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VesselClass } from '@/selectors/mapLayers';

/**
 * Procedural vessel models. Local frame: bow +Z, up +Y, waterline y = 0, hull length normalised to 1
 * (stern z = -0.5, bow z = +0.5). Every part carries `partColor` (own colour) and `tint` (0..1 mix toward the instance
 * status colour), so one instanced draw per class can show status without painting whole ships orange.
 */
export type VesselDetail = 0 | 1 | 2;

/** Illustrative proportions only (spec 04/01); not design data. */
export const CLASS_PRESETS: Record<VesselClass, { label: string; lengthToBeam: number; freeboard: number }> = {
  container: { label: 'Container ship', lengthToBeam: 7.6, freeboard: 0.035 },
  bulk: { label: 'Bulk carrier', lengthToBeam: 6.2, freeboard: 0.03 },
  tanker: { label: 'Oil tanker', lengthToBeam: 5.8, freeboard: 0.026 },
  lng: { label: 'LNG carrier', lengthToBeam: 6.4, freeboard: 0.034 },
  roro: { label: 'Car carrier / RoRo', lengthToBeam: 6.0, freeboard: 0.03 },
  general: { label: 'General cargo', lengthToBeam: 6.4, freeboard: 0.03 },
};

export const TRIANGLE_BUDGET: Record<VesselDetail, number> = { 0: 40, 1: 600, 2: 5000 };

const C = {
  hull: '#ffffff',
  deck: '#4f5d67',
  superstructure: '#e3e8ec',
  window: '#1b2730',
  hatch: '#36434c',
  pipe: '#8d99a2',
  tank: '#d9dfe4',
  carDeck: '#bcc5cc',
  crane: '#a9b3ba',
  funnel: '#2a353d',
  cargo: ['#7f919d', '#a5815c', '#5f7d8d', '#946757', '#b9a57d', '#6b8a78'],
};

type Pt = [number, number];

function withColor(g: THREE.BufferGeometry, color: string, tint: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count;
  const col = new THREE.Color(color);
  const colors = new Float32Array(n * 3);
  const tints = new Float32Array(n).fill(tint);
  for (let i = 0; i < n; i++) colors.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('partColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('tint', new THREE.BufferAttribute(tints, 1));
  return geo;
}

/** Flat polygon in the deck plane at height y, facing +Y. Points are [x, z]. */
function flat(pts: Pt[], y: number, color: string, tint: number): THREE.BufferGeometry {
  const tris = THREE.ShapeUtils.triangulateShape(
    pts.map(([x, z]) => new THREE.Vector2(x, z)),
    [],
  );
  const pos: number[] = [];
  for (const [a, b, c] of tris) {
    const A = pts[a];
    const B = pts[b];
    const Cc = pts[c];
    const ny = (B[1] - A[1]) * (Cc[0] - A[0]) - (B[0] - A[0]) * (Cc[1] - A[1]);
    const order = ny >= 0 ? [A, B, Cc] : [A, Cc, B];
    for (const [x, z] of order) pos.push(x, y, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return withColor(g, color, tint);
}

function rect(cx: number, cz: number, w: number, l: number): Pt[] {
  return [
    [cx - w / 2, cz - l / 2],
    [cx + w / 2, cz - l / 2],
    [cx + w / 2, cz + l / 2],
    [cx - w / 2, cz + l / 2],
  ];
}

function circle(cx: number, cz: number, r: number, seg = 14): Pt[] {
  return Array.from({ length: seg }, (_, i) => {
    const a = (i / seg) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as Pt;
  });
}

function box(w: number, h: number, l: number, cx: number, cz: number, y0: number, color: string, tint = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, l);
  g.translate(cx, y0 + h / 2, cz);
  return withColor(g, color, tint);
}

function cylinder(r: number, h: number, cx: number, cz: number, y0: number, color: string, alongZ = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, 8, 1);
  if (alongZ) g.rotateX(Math.PI / 2);
  g.translate(cx, alongZ ? y0 + r : y0 + h / 2, cz);
  return withColor(g, color, 0);
}

function dome(r: number, cx: number, cz: number, y0: number, color: string): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.translate(cx, y0, cz);
  return withColor(g, color, 0);
}

/** Top-view hull outline: squared stern, parallel mid-body, elliptical bow to a tip at z = +0.5. */
export function hullOutline(beam: number, bowLength = 0.17): Pt[] {
  const h = beam / 2;
  const bowStart = 0.5 - bowLength;
  const right: Pt[] = [
    [h * 0.86, -0.5],
    [h, -0.45],
    [h, bowStart],
  ];
  for (let i = 1; i < 7; i++) {
    const a = (i / 7) * (Math.PI / 2);
    right.push([h * Math.cos(a), bowStart + bowLength * Math.sin(a)]);
  }
  const left = right.map(([x, z]) => [-x, z] as Pt).reverse();
  return [...right, [0, 0.5], ...left];
}

function extrudedHull(outline: Pt[], height: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const y0 = -0.004;
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[(i + 1) % outline.length];
    const nx = bz - az;
    const nz = -(bx - ax);
    const len = Math.hypot(nx, nz) || 1;
    // hullOutline runs stern→bow on +X then bow→stern on −X, so (dz, −dx) is the outward side normal.
    const quad = [
      [ax, y0, az],
      [bx, y0, bz],
      [bx, height, bz],
      [ax, y0, az],
      [bx, height, bz],
      [ax, height, az],
    ];
    for (const q of quad) {
      pos.push(...q);
      nor.push(nx / len, 0, nz / len);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return withColor(g, C.hull, 1);
}

function bridgeBlock(beam: number, z: number, depth: number, height: number, deckY: number): THREE.BufferGeometry[] {
  return [
    box(beam * 0.92, height, depth, 0, z, deckY, C.superstructure),
    box(beam * 0.96, height * 0.16, depth * 1.04, 0, z, deckY + height * 0.72, C.window),
    box(beam * 0.18, height * 0.5, depth * 0.45, 0, z - depth * 0.62, deckY + height * 0.2, C.funnel),
  ];
}

function arrow(): THREE.BufferGeometry {
  return flat(
    [
      [0, 0.5],
      [-0.32, -0.5],
      [0, -0.26],
      [0.32, -0.5],
    ],
    0,
    C.hull,
    1,
  );
}

function silhouette(cls: VesselClass): THREE.BufferGeometry[] {
  // Beam exaggerated ×1.6 at regional scale so the silhouette stays legible at 12–32 px. Deck details are drawn
  // narrower than the hull and half-tinted so the status colour still reads at this size.
  const b = (1 / CLASS_PRESETS[cls].lengthToBeam) * 1.6;
  const parts: THREE.BufferGeometry[] = [flat(hullOutline(b), 0, C.hull, 1)];
  const y = 0.002;
  const t = 0.45;
  const bridge = (z: number) => parts.push(flat(rect(0, z, b * 0.8, 0.07), y * 2, C.superstructure, 0.15), flat(rect(0, z + 0.03, b * 0.8, 0.014), y * 3, C.window, 0));
  switch (cls) {
    case 'container':
      for (let i = 0; i < 7; i++) parts.push(flat(rect(0, -0.2 + i * 0.075, b * 0.64, 0.058), y, C.cargo[i % C.cargo.length], t));
      bridge(-0.33);
      break;
    case 'bulk':
      for (let i = 0; i < 6; i++) parts.push(flat(rect(0, -0.22 + i * 0.09, b * 0.48, 0.055), y, C.hatch, t));
      bridge(-0.38);
      break;
    case 'tanker':
      parts.push(flat(rect(0, 0.04, b * 0.1, 0.62), y * 2, C.pipe, 0), flat(rect(0, 0.02, b * 0.6, 0.028), y * 2, C.pipe, 0));
      bridge(-0.38);
      break;
    case 'lng':
      for (let i = 0; i < 4; i++) parts.push(flat(circle(0, -0.2 + i * 0.16, b * 0.33), y, C.tank, 0.3));
      bridge(-0.38);
      break;
    case 'roro':
      parts.push(flat(rect(0, -0.04, b * 0.8, 0.82), y, C.carDeck, t), flat(rect(0, 0.36, b * 0.76, 0.02), y * 2, C.window, 0));
      break;
    case 'general':
      for (let i = 0; i < 3; i++) parts.push(flat(rect(0, -0.12 + i * 0.16, b * 0.5, 0.1), y, C.hatch, t));
      for (let i = 0; i < 3; i++) parts.push(flat(circle(b * 0.32, -0.04 + i * 0.16, b * 0.09, 8), y * 2, C.crane, 0));
      bridge(-0.36);
      break;
  }
  return parts;
}

function model(cls: VesselClass): THREE.BufferGeometry[] {
  const preset = CLASS_PRESETS[cls];
  const b = 1 / preset.lengthToBeam;
  const fb = preset.freeboard;
  const outline = hullOutline(b);
  const parts: THREE.BufferGeometry[] = [extrudedHull(outline, fb), flat(hullOutline(b * 0.97, 0.165), fb, C.deck, 0.3)];
  const bridge = (z: number, h = 0.07) => parts.push(...bridgeBlock(b, z, 0.06, h, fb));
  switch (cls) {
    case 'container':
      for (let i = 0; i < 7; i++) parts.push(box(b * 0.84, 0.022 + (i % 3) * 0.008, 0.064, 0, -0.2 + i * 0.075, fb, C.cargo[i % C.cargo.length], 0.08));
      bridge(-0.32, 0.085);
      break;
    case 'bulk':
      for (let i = 0; i < 6; i++) parts.push(box(b * 0.6, 0.01, 0.062, 0, -0.22 + i * 0.09, fb, C.hatch, 0.1));
      for (let i = 0; i < 4; i++) parts.push(cylinder(b * 0.035, 0.05, b * 0.34, -0.17 + i * 0.12, fb, C.crane));
      bridge(-0.38);
      break;
    case 'tanker':
      parts.push(cylinder(b * 0.05, 0.64, 0, 0.04, fb, C.pipe, true), box(b * 0.66, 0.012, 0.03, 0, 0.02, fb, C.pipe), box(b * 0.12, 0.03, 0.03, 0, 0.42, fb, C.superstructure));
      bridge(-0.38);
      break;
    case 'lng':
      for (let i = 0; i < 4; i++) parts.push(cylinder(b * 0.4, 0.012, 0, -0.2 + i * 0.16, fb, C.deck), dome(b * 0.4, 0, -0.2 + i * 0.16, fb + 0.012, C.tank));
      bridge(-0.38);
      break;
    case 'roro':
      parts.push(box(b * 0.96, 0.075, 0.82, 0, -0.06, fb, C.carDeck, 0.12), box(b * 0.98, 0.012, 0.06, 0, 0.31, fb + 0.058, C.window));
      break;
    case 'general':
      for (let i = 0; i < 3; i++) parts.push(box(b * 0.6, 0.012, 0.1, 0, -0.12 + i * 0.16, fb, C.hatch, 0.1));
      for (let i = 0; i < 3; i++) parts.push(cylinder(b * 0.04, 0.06, b * 0.36, -0.04 + i * 0.16, fb, C.crane), box(b * 0.03, 0.006, 0.08, b * 0.36, -0.01 + i * 0.16, fb + 0.055, C.crane));
      bridge(-0.36);
      break;
  }
  return parts;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** One merged, non-indexed geometry per (class, detail); cached and shared by every instance of that class. */
export function buildVesselGeometry(cls: VesselClass, detail: VesselDetail): THREE.BufferGeometry {
  const key = `${detail === 0 ? 'any' : cls}:${detail}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const parts = detail === 0 ? [arrow()] : detail === 1 ? silhouette(cls) : model(cls);
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`Vessel geometry merge failed for ${key}`);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  cache.set(key, merged);
  return merged;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
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
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return withColor(g, C.hull, 1);
}

/** Port glyph: light diamond frame with a status-coloured core. */
export function portGeometry(): THREE.BufferGeometry {
  const d = (r: number): Pt[] => [
    [0, r],
    [r, 0],
    [0, -r],
    [-r, 0],
  ];
  const parts = [flat(d(0.5), 0, '#0b1d2a', 0), flat(d(0.42), 0.001, '#e8eef2', 0), flat(d(0.3), 0.002, C.hull, 1)];
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  return merged;
}

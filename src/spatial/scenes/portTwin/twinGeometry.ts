import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-poly port structures in metres, local frame: +X along the quay, +Y up, +Z seaward, origin on the quay edge at
 * deck level. Illustrative shapes only; no vendor or terminal-specific equipment is modelled.
 */

const FRAME = new THREE.Color('#c3cdd2');
const HOUSE = new THREE.Color('#e3e8ea');
const SPREADER = new THREE.Color('#cdb874');
const DARK = new THREE.Color('#5b666c');

function tinted(g: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g;
  const n = flat.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(c, i * 3);
  flat.setAttribute('color', new THREE.BufferAttribute(c, 3));
  flat.deleteAttribute('uv');
  return flat;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color) {
  return tinted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
}

/** Square beam between two points. */
function beam(from: THREE.Vector3, to: THREE.Vector3, t: number, color: THREE.Color) {
  const len = from.distanceTo(to);
  const g = new THREE.BoxGeometry(t, t, len);
  const m = new THREE.Matrix4().lookAt(from, to, new THREE.Vector3(0, 1, 0));
  m.setPosition(from.clone().add(to).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return tinted(g, color);
}

function merged(parts: THREE.BufferGeometry[]) {
  const g = mergeVertices(mergeGeometries(parts, false)!, 1e-4);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Ship-to-shore gantry crane, boom lowered over the water: ~30 m rail gauge, 55 m outreach, ~72 m apex. */
export function stsCraneGeometry(): THREE.BufferGeometry {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [];
  const legX = 9;
  const water = -3;
  const land = -33;
  for (const x of [-legX, legX]) {
    for (const z of [water, land]) parts.push(box(1.8, 45, 1.8, x, 22.5, z, FRAME));
    parts.push(box(1.2, 1.2, 30, x, 12, (water + land) / 2, FRAME));
    parts.push(box(1.6, 1.6, 30, x, 44, (water + land) / 2, FRAME));
    parts.push(box(2.4, 1.4, 4, x, 0.7, water, DARK), box(2.4, 1.4, 4, x, 0.7, land, DARK));
  }
  for (const z of [water, land]) parts.push(box(2 * legX, 1.6, 1.6, 0, 44, z, FRAME));
  parts.push(box(5, 3, 103, 0, 47.5, 3.5, FRAME));
  parts.push(box(9, 6, 12, 0, 52, -30, HOUSE));
  const apex = v(0, 72, -20);
  for (const x of [-4, 4]) {
    parts.push(beam(v(x * 1.6, 49, land), apex, 1.4, FRAME), beam(v(x * 1.6, 49, water), apex, 1.4, FRAME));
    parts.push(beam(apex, v(x * 0.5, 49, 54), 0.6, FRAME), beam(apex, v(x * 0.5, 49, -48), 0.6, FRAME));
  }
  parts.push(box(4.5, 3, 7, 0, 45, 22, HOUSE));
  parts.push(box(0.25, 18, 0.25, -1.2, 35, 22, DARK), box(0.25, 18, 0.25, 1.2, 35, 22, DARK));
  parts.push(box(2.6, 1.2, 12.4, 0, 25.5, 22, SPREADER));
  return merged(parts);
}

/** 40 ft box: 2.44 m wide (X), 2.59 m high, 12.19 m long (Z); origin at the base centre. */
export function containerGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(2.44, 2.59, 12.19).translate(0, 1.295, 0);
  g.deleteAttribute('uv');
  return g;
}

/** Muted box liveries that read on the dark ocean without competing with status colours. */
export const CONTAINER_COLORS = ['#7d3a30', '#2f5670', '#5d6a37', '#a8a296', '#3a6159', '#6a4660', '#a27a3c', '#4f5d66'].map((c) => new THREE.Color(c));

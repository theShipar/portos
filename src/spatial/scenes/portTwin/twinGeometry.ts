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
const BELT = new THREE.Color('#3d4549');
const SILO = new THREE.Color('#b9bfbd');
const TANK = new THREE.Color('#d6dcdf');

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

/**
 * Ship-to-shore gantry crane frame, boom lowered over the water: ~30 m rail gauge, 55 m outreach, ~72 m apex. The
 * trolley, ropes and spreader are separate meshes so transfer events can move them (`STS_TROLLEY_Y`, `STS_LANE_Z`).
 */
export function stsCraneFrameGeometry(): THREE.BufferGeometry {
  return stsCraneGeometry(false);
}

/** Boom rail height of the trolley and the spreader's top position (metres, crane frame). */
export const STS_TROLLEY_Y = 45;
export const STS_SPREADER_TOP_Y = 36;
/** Trolley travel along the boom: landside truck lane between the legs → hatch line over a moored ship. */
export const STS_LANE_Z = { land: -18, ship: 28 };

export function stsTrolleyGeometry(): THREE.BufferGeometry {
  return merged([box(4.5, 3, 7, 0, 1.5, 0, HOUSE), box(5.4, 0.6, 7.6, 0, 3.2, 0, DARK)]);
}

/** Spreader frame with twistlock corners; origin at its top centre so a box hangs below it. */
export function spreaderGeometry(): THREE.BufferGeometry {
  return merged([box(2.6, 1.0, 12.4, 0, -0.5, 0, SPREADER), box(3.0, 0.4, 0.6, 0, -0.2, 6.0, DARK), box(3.0, 0.4, 0.6, 0, -0.2, -6.0, DARK)]);
}

/** Hoist ropes: unit height, origin at the top (scaled in Y to the drop). */
export function ropeGeometry(): THREE.BufferGeometry {
  return merged([box(0.22, 1, 0.22, -1.1, -0.5, 0, DARK), box(0.22, 1, 0.22, 1.1, -0.5, 0, DARK)]);
}

/** Straddle carrier parked on the apron: four legs and a cab, ~15 m tall. */
export function straddleCarrierGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-2.4, 2.4]) for (const z of [-4.8, 4.8]) parts.push(box(0.6, 13, 0.6, x, 6.5, z, FRAME));
  parts.push(box(5.4, 1.2, 10.6, 0, 13.6, 0, FRAME), box(2.2, 2.2, 2.6, -1.2, 15.2, 4, HOUSE));
  return merged(parts);
}

/** Rail-mounted ship loader portal (local +Z seaward, origin on the quay edge); the boom is separate. */
export function shipLoaderBaseGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-6, 6]) for (const z of [-3, -17]) parts.push(box(1.4, 18, 1.4, x, 9, z, FRAME));
  parts.push(box(14, 1.6, 16, 0, 18.8, -10, FRAME), box(5, 10, 5, 0, 24.6, -14, FRAME), box(6, 4, 6, 0, 30.6, -14, HOUSE));
  return merged(parts);
}

/** Loader boom with conveyor and telescopic chute; origin at the pivot, boom along +Z (40 m). */
export function shipLoaderBoomGeometry(): THREE.BufferGeometry {
  return merged([box(3.2, 2.2, 40, 0, 0, 20, FRAME), box(1.6, 0.6, 40, 0, 1.3, 20, BELT), box(2.2, 9, 2.2, 0, -4.5, 39, DARK)]);
}

/** Stockpile mound: unit radius and height, base at y = 0 (scaled per tonnage). */
export function stockpileGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1, 1, 36, 1, false).translate(0, 0.5, 0);
  g.deleteAttribute('uv');
  return g;
}

/** Row of six concrete silos (static: their fill is not modelled). */
export function siloRowGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const x = (k - 2.5) * 17;
    parts.push(tinted(new THREE.CylinderGeometry(8, 8, 34, 20).translate(x, 17, 0), SILO), tinted(new THREE.ConeGeometry(8.4, 4, 20).translate(x, 36, 0), FRAME));
  }
  parts.push(box(108, 4, 6, 0, 40, 0, FRAME));
  return merged(parts);
}

/** LNG full-containment tank: concrete wall and dome, ~84 m across and ~48 m to the dome crown. */
export function lngTankGeometry(): THREE.BufferGeometry {
  const dome = new THREE.SphereGeometry(48, 32, 8, 0, Math.PI * 2, 0, 0.5).translate(0, 38 - 48 * Math.cos(0.5), 0);
  return merged([tinted(new THREE.CylinderGeometry(42, 42, 38, 40).translate(0, 19, 0), TANK), tinted(dome, TANK)]);
}

/** Fill level band on a tank wall (open ring, unit height at y = 0). */
export function tankLevelGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(42.6, 42.6, 1.4, 48, 1, true);
  g.deleteAttribute('uv');
  return g;
}

/** Marine loading arm riser on the jetty head (static); the two booms are separate meshes. */
export function armRiserGeometry(): THREE.BufferGeometry {
  return merged([box(2.4, 1, 2.4, 0, 0.5, 0, DARK), box(1.1, 14, 1.1, 0, 7, 0, FRAME)]);
}

/** One arm boom, 13 m long along +Z from its pivot. */
export function armBoomGeometry(): THREE.BufferGeometry {
  return merged([box(0.9, 0.9, 13, 0, 0, 6.5, FRAME), box(1.4, 1.4, 1.4, 0, 0, 0, DARK)]);
}

/** Linkspan ramp, hinged at the quay edge (origin), 34 m long along +Z and 22 m wide. */
export function rampGeometry(): THREE.BufferGeometry {
  return merged([box(22, 1.2, 34, 0, 0, 17, FRAME), box(0.4, 1.2, 34, -11, 1.0, 17, DARK), box(0.4, 1.2, 34, 11, 1.0, 17, DARK)]);
}

/** Grouped vehicle block (one per five vehicles): 1.9 × 1.5 × 4.6 m, base at y = 0. */
export function vehicleGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.9, 1.5, 4.6).translate(0, 0.75, 0);
  g.deleteAttribute('uv');
  return g;
}

/** Conveyor gallery: side rails on trestles every ~25 m, `lengthM` along +Z centred on the origin (belt separate). */
export function conveyorFrameGeometry(lengthM: number): THREE.BufferGeometry {
  const parts = [box(0.3, 1.0, lengthM, -1.2, 0.5, 0, FRAME), box(0.3, 1.0, lengthM, 1.2, 0.5, 0, FRAME)];
  const n = Math.max(2, Math.round(lengthM / 25) + 1);
  for (let k = 0; k < n; k++) {
    const z = -lengthM / 2 + (k * lengthM) / (n - 1);
    parts.push(box(0.5, 5, 0.5, -1.2, -2.5, z, DARK), box(0.5, 5, 0.5, 1.2, -2.5, z, DARK));
  }
  return merged(parts);
}

/** LNG jetty head: deck (top at y = 0), piles and breasting / mooring dolphins along the berth (local X). */
export function jettyHeadGeometry(berthLengthM: number): THREE.BufferGeometry {
  const parts = [box(70, 2, 26, 0, -1, 0, FRAME), box(30, 6, 10, 0, 3, -6, HOUSE)];
  for (const x of [-30, -10, 10, 30]) for (const z of [-10, 10]) parts.push(box(1.2, 8, 1.2, x, -6, z, DARK));
  const half = berthLengthM / 2;
  for (const x of [-0.3 * half, 0.3 * half, -0.75 * half, 0.75 * half]) parts.push(tinted(new THREE.CylinderGeometry(4, 4, 8, 12).translate(x, -3, 10), DARK));
  parts.push(box(berthLengthM * 0.75, 1, 2.4, 0, 0.2, 10, FRAME));
  return merged(parts);
}

/** Jetty trestle to shore with its pipe rack, `lengthM` along +Z centred on the origin (deck top at y = 0). */
export function trestleGeometry(lengthM: number): THREE.BufferGeometry {
  const parts = [box(8, 1.2, lengthM, 0, -0.6, 0, FRAME), box(0.9, 0.9, lengthM, -1.6, 1.4, 0, HOUSE), box(0.9, 0.9, lengthM, 0, 1.4, 0, HOUSE), box(0.6, 0.6, lengthM, 1.6, 1.3, 0, HOUSE)];
  const n = Math.max(2, Math.round(lengthM / 40) + 1);
  for (let k = 0; k < n; k++) parts.push(box(6, 7, 1, 0, -4.5, -lengthM / 2 + (k * lengthM) / (n - 1), DARK));
  return merged(parts);
}

/** Paved staging area with lane markings: `lanes` lanes along +Z, `widthM` across (X) by `depthM` deep (Z). */
export function lanePadGeometry(lanes: number, widthM: number, depthM: number): THREE.BufferGeometry {
  const parts = [box(widthM, 0.3, depthM, 0, 0.15, 0, BELT)];
  for (let k = 0; k <= lanes; k++) parts.push(box(0.3, 0.1, depthM - 6, -widthM / 2 + (k * widthM) / lanes, 0.35, 0, HOUSE));
  return merged(parts);
}

/** Plain terminal building block, base at y = 0. */
export function buildingGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  return merged([box(w, h, d, 0, h / 2, 0, HOUSE), box(w + 1, 1, d + 1, 0, h + 0.5, 0, FRAME)]);
}

/** Ship-to-shore gantry crane, boom lowered over the water: ~30 m rail gauge, 55 m outreach, ~72 m apex. */
export function stsCraneGeometry(withTrolley = true): THREE.BufferGeometry {
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
  if (withTrolley) {
    parts.push(box(4.5, 3, 7, 0, 45, 22, HOUSE));
    parts.push(box(0.25, 18, 0.25, -1.2, 35, 22, DARK), box(0.25, 18, 0.25, 1.2, 35, 22, DARK));
    parts.push(box(2.6, 1.2, 12.4, 0, 25.5, 22, SPREADER));
  }
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

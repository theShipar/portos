// SPDX-License-Identifier: GPL-3.0-or-later
// Extruded geography builders for the PORTOS region / country / city scenes.
// Modified from three-scope-map-skill by 宋夏天Dazzle (ZhejiangThreeMap.vue: makeShape, createPolygonSideWalls,
// createSideGradientMaterial, applyMapTerrainUv, makeBoundarySegments; mapTerrainMaterial.ts: terrain material).
// Changes: Y-up scene axes with north on −Z, geometry from reversible projections instead of a fixed lon/lat scale,
// V2 colours instead of the neon HUD palette, no displacement map. See third_party/three-scope-map/NOTICE.
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
// Original repository: https://github.com/songsummer920-dazzle/three-scope-map-skill
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import normalMapUrl from '@/assets/textures/terrain/terrain-normal.jpg';
import roughnessMapUrl from '@/assets/textures/terrain/terrain-roughness.jpg';
import type { GeoProjection } from '../projection';
import type { GeoRing } from '../geoData';

/** Projected ring in scene ground coordinates: x = east, y = north (becomes −z after `toGround`). */
export type GroundRing = THREE.Vector2[];

export function projectRing(ring: GeoRing, p: GeoProjection): GroundRing {
  const out: GroundRing = [];
  for (const [lon, lat] of ring) {
    const w = p.lonLatToWorld(lon, lat);
    const v = new THREE.Vector2(w.x, -w.z);
    const last = out[out.length - 1];
    if (!last || last.x !== v.x || last.y !== v.y) out.push(v);
  }
  if (out.length > 1 && out[0].equals(out[out.length - 1])) out.pop();
  return out;
}

/** Shape with holes; outer ring clockwise and holes counter-clockwise as Three's triangulator expects. */
export function makeShape(rings: GroundRing[]): THREE.Shape {
  let outer = rings[0];
  if (!THREE.ShapeUtils.isClockWise(outer)) outer = [...outer].reverse();
  const shape = new THREE.Shape(outer);
  for (const ring of rings.slice(1)) {
    const hole = THREE.ShapeUtils.isClockWise(ring) ? [...ring].reverse() : ring;
    shape.holes.push(new THREE.Path(hole));
  }
  return shape;
}

/** ShapeGeometry is built in XY; the ground plane is XZ with north on −Z. */
export function toGround(g: THREE.BufferGeometry, y: number): THREE.BufferGeometry {
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** World-space UVs so the terrain texture tiles at the same ground scale across features. */
export function applyGroundUv(g: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / tile;
    uv[i * 2 + 1] = -pos.getZ(i) / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Vertical quads from `bottomY` to `topY` along every ring edge (outer rings and holes). */
export function createSideWalls(rings: GroundRing[], topY: number, bottomY: number, material: THREE.Material): THREE.Mesh {
  let quads = 0;
  for (const r of rings) quads += r.length;
  const positions = new Float32Array(quads * 12);
  const indices: number[] = [];
  let o = 0;
  let v = 0;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      positions.set([a.x, topY, -a.y, b.x, topY, -b.y, b.x, bottomY, -b.y, a.x, bottomY, -a.y], o);
      o += 12;
      indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.renderOrder = 2;
  return mesh;
}

export interface WallColors {
  top: THREE.Color;
  mid: THREE.Color;
  bottom: THREE.Color;
}

/** Vertical gradient for the extruded walls: dark at the waterline, catching light at the coast edge. */
export function createSideGradientMaterial(colors: WallColors, topY: number, bottomY: number, alpha = 0.96): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: alpha < 1,
    side: THREE.DoubleSide,
    depthWrite: true,
    uniforms: {
      topColor: { value: colors.top.clone() },
      midColor: { value: colors.mid.clone() },
      bottomColor: { value: colors.bottom.clone() },
      alpha: { value: alpha },
      topY: { value: topY },
      bottomY: { value: bottomY },
    },
    vertexShader: /* glsl */ `
      uniform float topY;
      uniform float bottomY;
      varying float vDepth;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDepth = clamp((position.y - bottomY) / max(1e-6, topY - bottomY), 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 bottomColor;
      uniform float alpha;
      varying float vDepth;
      void main() {
        vec3 lower = mix(bottomColor, midColor, smoothstep(0.0, 0.35, vDepth));
        vec3 color = mix(lower, topColor, smoothstep(0.55, 1.0, vDepth));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

let terrainTextures: { normal: THREE.Texture; roughness: THREE.Texture; ready: Promise<void> } | null = null;

/** Shared, lazily loaded terrain detail maps (normal + roughness; the colour comes from the palette). */
export function terrainMaps() {
  if (!terrainTextures) {
    const loader = new THREE.TextureLoader();
    let pending = 2;
    let done!: () => void;
    const ready = new Promise<void>((r) => (done = r));
    const settle = () => {
      if (--pending === 0) done();
    };
    const load = (url: string) => {
      const t = loader.load(url, settle, undefined, settle);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    terrainTextures = { normal: load(normalMapUrl), roughness: load(roughnessMapUrl), ready };
  }
  return terrainTextures;
}

/** Land top material: palette colour with the skill's terrain normal/roughness detail, no displacement. */
export function createTerrainMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
  const maps = terrainMaps();
  const m = new THREE.MeshStandardMaterial({
    color: color.clone(),
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: maps.roughness,
    roughness: 0.94,
    metalness: 0.02,
    side: THREE.FrontSide,
  });
  m.polygonOffset = true;
  m.polygonOffsetFactor = 1;
  m.polygonOffsetUnits = 1;
  return m;
}

/** Ring outlines as one LineSegments batch at height `y`. */
export function boundarySegments(rings: GroundRing[], y: number, material: THREE.LineBasicMaterial): THREE.LineSegments {
  let n = 0;
  for (const r of rings) n += r.length;
  const pos = new Float32Array(n * 6);
  let o = 0;
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      pos.set([a.x, y, -a.y, b.x, y, -b.y], o);
      o += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, material);
  lines.renderOrder = 4;
  return lines;
}

/** Screen-width contour (fat lines) for the selected feature. */
export function createContour(rings: GroundRing[], y: number, material: LineMaterial): LineSegments2 {
  const pos: number[] = [];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      pos.push(a.x, y, -a.y, b.x, y, -b.y);
    }
  const g = new LineSegmentsGeometry();
  g.setPositions(pos);
  const line = new LineSegments2(g, material);
  line.renderOrder = 6;
  line.frustumCulled = false;
  return line;
}

/** Graticule polylines (meridians and parallels every `step` degrees) projected into the scene. */
export function graticule(frame: { west: number; south: number; east: number; north: number }, step: number, p: GeoProjection, y: number, material: THREE.LineBasicMaterial): THREE.LineSegments {
  const pos: number[] = [];
  const seg = (a: { x: number; z: number }, b: { x: number; z: number }) => pos.push(a.x, y, a.z, b.x, y, b.z);
  const samples = 48;
  const w0 = Math.ceil(frame.west / step) * step;
  for (let lon = w0; lon <= frame.east + 1e-9; lon += step) {
    let prev = p.lonLatToWorld(lon, frame.south);
    for (let i = 1; i <= samples; i++) {
      const cur = p.lonLatToWorld(lon, frame.south + ((frame.north - frame.south) * i) / samples);
      seg(prev, cur);
      prev = cur;
    }
  }
  const s0 = Math.ceil(frame.south / step) * step;
  for (let lat = s0; lat <= frame.north + 1e-9; lat += step) {
    let prev = p.lonLatToWorld(frame.west, lat);
    for (let i = 1; i <= samples; i++) {
      const cur = p.lonLatToWorld(frame.west + ((frame.east - frame.west) * i) / samples, lat);
      seg(prev, cur);
      prev = cur;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(g, material);
  lines.renderOrder = 1;
  return lines;
}

/** Dashed frame of an illustrative operational region (never drawn as a border). */
export function illustrativeFrame(b: { west: number; south: number; east: number; north: number }, p: GeoProjection, y: number, material: THREE.LineDashedMaterial): THREE.Line {
  const pts: THREE.Vector3[] = [];
  const n = 64;
  const push = (lon: number, lat: number) => {
    const w = p.lonLatToWorld(lon, lat);
    pts.push(new THREE.Vector3(w.x, y, w.z));
  };
  for (let i = 0; i <= n; i++) push(b.west + ((b.east - b.west) * i) / n, b.south);
  for (let i = 1; i <= n; i++) push(b.east, b.south + ((b.north - b.south) * i) / n);
  for (let i = 1; i <= n; i++) push(b.east - ((b.east - b.west) * i) / n, b.north);
  for (let i = 1; i <= n; i++) push(b.west, b.north - ((b.north - b.south) * i) / n);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
  line.computeLineDistances();
  line.renderOrder = 3;
  return line;
}

export { LineMaterial };

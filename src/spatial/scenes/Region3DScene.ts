// SPDX-License-Identifier: GPL-3.0-or-later
// PORTOS extruded region / country / city scene. Visual structure (extruded land with gradient side walls, terrain
// detail material, hover lift, lit contour on the selected feature, orbit camera over a dark base) modified from
// three-scope-map-skill by 宋夏天Dazzle (ZhejiangThreeMap.vue, mapTerrainMaterial.ts); see regionGeometry.ts and
// third_party/three-scope-map/NOTICE. 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import gsap from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flags } from '@/core/flags';
import type { Bounds, EntityRef } from '@/core/types';
import { EARTH_RADIUS, type CameraPose, type CameraPreset } from '@/map/earth/camera';
import type { Country } from '@/map/earth/worldGeo';
import type { MapSurface, ScreenPoint, SurfaceEvents, SurfacePointerHit } from '@/map/surface';
import { planarTheme as T } from '@/map/theme';
import type { RegistryEntry } from '../registry';
import type { InputRouter } from '../InputRouter';
import type { OverlayProjectionAdapter } from '../OverlayProjectionAdapter';
import { loadGeoDoc, type GeoDoc, type GeoFeatureDoc } from '../geoData';
import { angleDelta, behindAzimuth, followAlpha, FOLLOW_RELEASE_DISTANCE, modePolar, modeSteersAzimuth, type FollowStatus, type FollowTarget } from '@/core/follow';
import { EARTH_RADIUS_M, gridConvergence, normalizeLon, projectionForLevel, type GeoProjection } from '../projection';
import type { CameraState, FrameContext, SceneKind, SceneTarget, SpatialScene } from '../types';
import {
  applyGroundUv,
  boundarySegments,
  createContour,
  createSideGradientMaterial,
  createSideWalls,
  createTerrainMaterial,
  graticule,
  illustrativeFrame,
  LineMaterial as FatLineMaterial,
  makeShape,
  projectRing,
  terrainMaps,
  toGround,
  type GroundRing,
} from './regionGeometry';

export type PlanarLevel = 'region' | 'country' | 'city';

/** Land height and hover lift as fractions of the frame's larger horizontal span. */
export const EXTRUDE_FRACTION = 0.012;
export const HOVER_LIFT_FRACTION = 0.006;
export const UNITS_PER_METRE = 0.001;
/** Port twin scenes are true scale: land is a few metres above the water, not a fraction of the frame. */
export const PORT_LAND_M = 3;
const PORT_TILT = 0.95;
const DEG = Math.PI / 180;
/** Default camera tilt from vertical per level: wider frames look flatter, cities more oblique. */
const TILT: Record<PlanarLevel, number> = { region: 0.58, country: 0.66, city: 0.78 };
const MAX_POLAR = 1.15;
/** V3 whole-geometry extrusion: a scope's framing may grow towards its focus land by this fraction of its span per side. */
export const FIT_GROW = 0.25;
/** V3 hover elevation (spec 23): top and side walls rise by this fraction of the extrusion, eased over LIFT_MS. */
export const HOVER_LIFT_EXTRUSION = 0.16;
export const LIFT_MS = 260;
/** Fraction of the frame span a hovered feature's top rises under V3 (test and QA figure). */
export const V3_HOVER_LIFT_FRACTION = HOVER_LIFT_EXTRUSION * EXTRUDE_FRACTION;
/** Features smaller than this fraction of the span get an invisible, larger hit disc (narrow coastal states). */
export const SMALL_FEATURE_FRACTION = 0.025;
const RIM_IDLE = { coast: 0.55, border: 0.32 };
const RIM_HOVER = 0.95;
/** Isometric camera presets: tilt from vertical and azimuth in degrees (spec 25: 30–55° oblique). */
export const VIEW_PRESETS = {
  fit: null,
  iso: { polarDeg: 50, azimuthDeg: 35 },
  top: { polarDeg: 4, azimuthDeg: 0 },
} as const;
export type ViewPresetId = keyof typeof VIEW_PRESETS;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
/** Ghost (context) land: flat fill and outline opacities, within the spec's 0.08–0.22 for lines. */
export const GHOST_FILL_OPACITY = 0.34;
export const GHOST_LINE_OPACITY = 0.2;

export const sceneKindForLevel = (level: PlanarLevel): SceneKind => (level === 'region' ? 'region3d' : level === 'country' ? 'country3d' : 'city3d');
export const planarSceneKey = (level: PlanarLevel, id: string) => `${sceneKindForLevel(level)}:${id}`;
export const portSceneKey = (portId: string) => `port3d:${portId}`;

/** Host-owned scene content (port twin): rendered with the scene, picked before land, disposed with it. */
export interface PlanarSceneLayer {
  readonly object: THREE.Object3D;
  pick?(raycaster: THREE.Raycaster): { distance: number; berthId?: string } | null;
  /** Per-frame animation; returns true when the frame must be redrawn. */
  update?(nowMs: number, dtMs: number): boolean;
  dispose(): void;
}

/** Globe distance (R = 2, from the centre) ↔ planar camera distance in world units for the same ground scale. */
export function globeToPlanarDistance(d: number, unitsPerMetre = UNITS_PER_METRE): number {
  return Math.max(1e-4, ((d - EARTH_RADIUS) / EARTH_RADIUS) * EARTH_RADIUS_M * unitsPerMetre);
}
export function planarToGlobeDistance(u: number, unitsPerMetre = UNITS_PER_METRE): number {
  return EARTH_RADIUS + (u / (EARTH_RADIUS_M * unitsPerMetre)) * EARTH_RADIUS;
}

interface FeatureParts {
  doc: GeoFeatureDoc;
  group: THREE.Group;
  top: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  wall: THREE.ShaderMaterial;
  rings: GroundRing[];
  contour: THREE.Object3D | null;
  country: Country;
  rim: THREE.LineBasicMaterial;
  rimIdle: number;
  /** Lift tween (0 = rest, 1 = raised): from, to, progress, current. */
  lift: { from: number; to: number; t: number; v: number };
}

export interface Region3DOptions {
  entry: Pick<RegistryEntry, 'id' | 'type' | 'label' | 'bbox' | 'geometryPath' | 'illustrativeBounds'>;
  renderer: THREE.WebGLRenderer;
  host: HTMLElement;
  projection: OverlayProjectionAdapter;
  /** Camera move for a director target (the host knows presets and the scope stack). */
  focus: (target: SceneTarget, restore: CameraState | null, surface: Region3DScene) => Promise<boolean>;
  reducedMotion?: boolean;
  loadDoc?: (path: string, signal: AbortSignal) => Promise<GeoDoc>;
  /** After the geometry is built (projection known): attach overlays. */
  onBuilt?: (scene: Region3DScene) => void;
  /** Before GPU resources are released (cache eviction): detach overlays. */
  onDispose?: (scene: Region3DScene) => void;
  /** Builds the port twin variant of a city scene (true-scale land, ships at the waterline, oblique camera). */
  port?: { portId: string };
}

interface Orbit {
  target: THREE.Vector3;
  distance: number;
  polar: number;
  azimuth: number;
}

/**
 * Extruded geography for one registry entry (region, country or city). Implements the director lifecycle and the
 * shared map-surface contract, so the maritime overlay, DOM labels, clustering and camera presets of the globe work
 * here unchanged. Shares the globe's WebGL renderer (one context, one canvas).
 */
export class Region3DScene implements SpatialScene, MapSurface {
  readonly surfaceKind = 'planar' as const;
  readonly key: string;
  readonly kind: SceneKind;
  readonly level: PlanarLevel;
  readonly entryId: string;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1e6);
  readonly controls: OrbitControls;
  readonly overlay = new THREE.Group();
  readonly globeUnitScale = (EARTH_RADIUS_M / EARTH_RADIUS) * UNITS_PER_METRE;
  readonly portId: string | null;
  readonly shipsDepthTested: boolean;

  private readonly opts: Region3DOptions;
  private readonly host: HTMLElement;
  private readonly land = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly listeners: { [K in keyof SurfaceEvents]: Set<SurfaceEvents[K]> } = {
    hover: new Set(),
    click: new Set(),
    dblclick: new Set(),
    userInteract: new Set(),
    cameraSettled: new Set(),
    contextLost: new Set(),
  };
  private readonly frameHooks = new Set<(nowMs: number, dirty: boolean) => void>();
  private readonly features: FeatureParts[] = [];
  private readonly topMeshes: THREE.Mesh[] = [];
  private readonly fatLines = new Set<LineMaterial>();
  private readonly resizeObserver: ResizeObserver;
  private doc: GeoDoc | null = null;
  private proj: GeoProjection | null = null;
  private span = 1;
  private topY = 1;
  private frameBounds: Bounds | null = null;
  /** Pointer or wheel interaction in progress (OrbitControls start → end). */
  private userDragging = false;
  private readonly dragStartTarget = new THREE.Vector3();
  private width = 1;
  private height = 1;
  private viewOffsetPx = 0;
  private viewOffsetBottomPx = 0;
  private dirty = true;
  private activeValue = false;
  private disposed = false;
  private reducedMotion: boolean;
  private flight: gsap.core.Tween | null = null;
  private resolveFlight: ((done: boolean) => void) | null = null;
  private scopeIso3 = new Set<string>();
  private hoverIso3: string | null = null;
  private selectedIso3: string | null = null;
  private inputUnsubs: (() => void)[] = [];
  private preloadPromise: Promise<void> | null = null;
  private readonly tilt: number;
  private readonly layers = new Set<PlanarSceneLayer>();
  private readonly wholeGeometry = flags.v3RegionExtrusion;
  private contextGroup: THREE.Group | null = null;
  private readonly labelPoints = new Map<string, { lat: number; lon: number } | null>();

  constructor(opts: Region3DOptions) {
    this.opts = opts;
    this.level = opts.entry.type as PlanarLevel;
    this.entryId = opts.entry.id;
    this.portId = opts.port?.portId ?? null;
    this.kind = this.portId ? 'port3d' : sceneKindForLevel(this.level);
    this.key = this.portId ? portSceneKey(this.portId) : planarSceneKey(this.level, opts.entry.id);
    this.shipsDepthTested = !!this.portId;
    this.tilt = this.portId ? PORT_TILT : TILT[this.level];
    this.renderer = opts.renderer;
    this.host = opts.host;
    this.reducedMotion = !!opts.reducedMotion;
    this.scene.background = T.ocean.clone();
    this.scene.add(this.land, this.overlay);
    this.overlay.name = 'planar-overlay';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = MAX_POLAR;
    this.controls.zoomSpeed = 0.9;
    this.controls.addEventListener('start', this.onControlsStart);
    this.controls.addEventListener('end', this.onControlsEnd);
    this.controls.addEventListener('change', this.invalidate);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
  }

  // ---- SpatialScene lifecycle ---------------------------------------------------------------------------------

  preload(signal: AbortSignal): Promise<void> {
    this.preloadPromise ??= (async () => {
      const path = this.opts.entry.geometryPath;
      if (!path) throw new Error(`${this.entryId} has no geometry`);
      const doc = await (this.opts.loadDoc ?? loadGeoDoc)(path, signal);
      await terrainMaps().ready;
      if (this.disposed) return;
      this.build(doc);
      this.opts.onBuilt?.(this);
      // Parallel shader compilation keeps the first frame of a new scene off the main thread where supported.
      if (typeof this.renderer.compileAsync === 'function') await this.renderer.compileAsync(this.scene, this.camera);
    })();
    const p = this.preloadPromise;
    p.catch(() => {
      if (this.preloadPromise === p) this.preloadPromise = null;
    });
    return p;
  }

  renderStaticFrame(): void {
    if (this.doc) this.renderer.compile(this.scene, this.camera);
    this.dirty = true;
  }

  activate(): void {
    this.activeValue = true;
    this.controls.enabled = !this.flight;
    this.resize();
    this.opts.projection.setProjector((lon, lat) => this.project(lat, lon));
    this.opts.projection.setViewport(this.width, this.height);
    this.invalidate();
  }

  updateFrame(ctx: FrameContext): boolean {
    if (this.disposed || !this.doc) return false;
    if (this.controls.update()) this.dirty = true;
    this.clampTarget();
    if (this.animateLift(ctx.dtMs)) this.dirty = true;
    for (const l of this.layers) if (l.update?.(ctx.nowMs, ctx.dtMs)) this.dirty = true;
    this.updateClip();
    this.opts.projection.setViewport(this.width, this.height);
    for (const fn of this.frameHooks) fn(ctx.nowMs, this.dirty);
    if (!this.dirty) return false;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  async focus(target: SceneTarget, signal: AbortSignal, opts: { restore: CameraState | null }): Promise<boolean> {
    if (signal.aborted) return false;
    const onAbort = () => this.cancelFlight();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.opts.focus(target, opts.restore, this);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  setSelection(_sel: EntityRef | null): void {}

  deactivate(): void {
    this.cancelFlight();
    this.activeValue = false;
    this.controls.enabled = false;
    // No sticky hover after a drilldown or back (spec 23 B.04): the cached scene comes back at rest.
    if (this.hoverIso3 !== null) {
      this.hoverIso3 = null;
      this.applyTones();
      this.animateLift(0);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFlight();
    this.opts.onDispose?.(this);
    for (const l of this.layers) l.dispose();
    this.layers.clear();
    this.detachInput();
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.removeEventListener('end', this.onControlsEnd);
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    const terrain = terrainMaps();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture && v !== terrain.normal && v !== terrain.roughness) v.dispose();
        mat.dispose();
      }
    });
    for (const s of Object.values(this.listeners)) s.clear();
    this.frameHooks.clear();
    this.features.length = 0;
    this.topMeshes.length = 0;
  }

  getCameraState(): CameraState {
    const p = this.camera.position;
    const t = this.controls.target;
    return { sceneKey: this.key, position: [p.x, p.y, p.z], target: [t.x, t.y, t.z] };
  }

  restoreCameraState(state: CameraState): void {
    this.camera.position.set(...state.position);
    this.controls.target.set(...state.target);
    this.camera.lookAt(this.controls.target);
    this.invalidate();
  }

  // ---- geometry -----------------------------------------------------------------------------------------------

  private build(doc: GeoDoc) {
    this.doc = doc;
    const proj = projectionForLevel(this.level, doc.origin, UNITS_PER_METRE);
    this.proj = proj;
    const f = doc.frame;
    const sw = proj.lonLatToWorld(f.west, f.south);
    const ne = proj.lonLatToWorld(f.east, f.north);
    const nw = proj.lonLatToWorld(f.west, f.north);
    const se = proj.lonLatToWorld(f.east, f.south);
    const xs = [sw.x, ne.x, nw.x, se.x];
    const zs = [sw.z, ne.z, nw.z, se.z];
    this.span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    this.frameBounds = { west: Math.min(...xs), east: Math.max(...xs), north: Math.min(...zs), south: Math.max(...zs) };
    this.topY = this.portId ? PORT_LAND_M * UNITS_PER_METRE : this.span * EXTRUDE_FRACTION;
    const tile = this.span / 7;
    if (this.wholeGeometry && this.level !== 'city') this.frameBounds = this.unionWorldBounds(this.frameBounds, this.fitBounds(doc.bbox), proj);

    // V3: the sea and graticule run well past the frame and fade into fog, so no rectangle edge is ever visible.
    const seaScale = this.wholeGeometry ? 14 : 6;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(this.span * seaScale, this.span * seaScale), new THREE.MeshBasicMaterial({ color: T.ocean, fog: true }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(this.wholeGeometry ? (this.frameBounds.west + this.frameBounds.east) / 2 : 0, this.portId ? -1.5 * UNITS_PER_METRE : -this.topY * 0.02, this.wholeGeometry ? (this.frameBounds.north + this.frameBounds.south) / 2 : 0);
    ocean.renderOrder = 0;
    this.scene.add(ocean);

    const step = this.level === 'region' ? 5 : this.level === 'country' ? (this.span > 1500 ? 5 : 1) : 0.05;
    const gridMat = new THREE.LineBasicMaterial({ color: T.oceanGrid, transparent: true, opacity: 0.55, depthWrite: false, fog: true });
    const gridFrame = this.wholeGeometry ? growLonLat(f, 1) : f;
    this.scene.add(graticule(gridFrame, step, proj, this.portId ? -1.2 * UNITS_PER_METRE : -this.topY * 0.01, gridMat));
    if (this.wholeGeometry && !this.portId) this.buildContext(doc, proj);

    const hemi = new THREE.HemisphereLight(0xcfe3ea, 0x0b1e28, 1.15);
    const sun = new THREE.DirectionalLight(0xffffff, 1.35);
    sun.position.set(-0.6 * this.span, 1.4 * this.span, -0.4 * this.span);
    this.scene.add(hemi, sun);
    this.scene.fog = new THREE.Fog(T.ocean, this.span * 2, this.span * 6);

    for (const feature of doc.features) {
      const group = new THREE.Group();
      group.userData.iso3 = feature.iso3;
      const wall = createSideGradientMaterial({ top: T.wallTop, mid: T.wallMid, bottom: T.wallBottom }, this.topY, 0, 1);
      const allRings: GroundRing[] = [];
      const tops: FeatureParts['top'] = [];
      const tone = feature.focus ? T.landScope : T.land;
      const material = createTerrainMaterial(tone);
      // A few metres of land seen from kilometres away: depth offset would sink the tops below the water.
      if (this.portId) material.polygonOffset = false;
      for (const poly of feature.polygons) {
        const rings = poly.map((r) => projectRing(r, proj)).filter((r) => r.length >= 3);
        if (!rings.length) continue;
        allRings.push(...rings);
        const top = new THREE.Mesh(applyGroundUv(toGround(new THREE.ShapeGeometry(makeShape(rings)), this.topY), tile), material);
        top.userData.iso3 = feature.iso3;
        top.renderOrder = 3;
        tops.push(top);
        this.topMeshes.push(top);
        group.add(top);
      }
      if (!allRings.length) continue;
      group.add(createSideWalls(allRings, this.topY, 0, wall));
      const rimIdle = feature.focus ? RIM_IDLE.coast : RIM_IDLE.border;
      const rim = new THREE.LineBasicMaterial({ color: feature.focus ? T.coast : T.border, transparent: true, opacity: rimIdle, depthWrite: false });
      group.add(boundarySegments(allRings, this.portId ? this.topY + 0.4 * UNITS_PER_METRE : this.topY * 1.002, rim));
      if (this.wholeGeometry && !this.portId) this.addHitDisc(group, allRings, feature.iso3);
      this.land.add(group);
      const country: Country = { iso3: feature.iso3, name: feature.name, polygons: feature.polygons, bbox: ringsBbox(feature.polygons) };
      this.features.push({ doc: feature, group, top: tops, wall, rings: allRings, contour: null, country, rim, rimIdle, lift: { from: 0, to: 0, t: 1, v: 0 } });
      if (feature.focus) this.scopeIso3.add(feature.iso3);
    }

    if (doc.illustrativeBounds) {
      const dashed = new THREE.LineDashedMaterial({ color: T.frame, dashSize: this.span / 80, gapSize: this.span / 120, transparent: true, opacity: 0.8, depthWrite: false });
      this.scene.add(illustrativeFrame(doc.bbox, proj, this.topY * 0.2, dashed));
    }
    if (this.level !== 'region') this.selectFeature(doc.features.find((x) => x.focus)?.iso3 ?? null);

    const origin = proj.lonLatToWorld(doc.origin.lon, doc.origin.lat);
    this.applyOrbit({ target: new THREE.Vector3(origin.x, 0, origin.z), distance: this.span * 0.9, polar: this.tilt, azimuth: 0 });
    this.controls.minDistance = this.span * 0.01;
    this.controls.maxDistance = this.span * 1.6;
  }

  /**
   * Neighbouring land as ghost context: one batched flat fill just above the sea and one batched outline, both
   * outside `topMeshes`, so they never take a hover, click or drill-down.
   */
  private buildContext(doc: GeoDoc, proj: GeoProjection) {
    if (!doc.context.length) return;
    const fills: THREE.BufferGeometry[] = [];
    const rings: GroundRing[] = [];
    for (const c of doc.context)
      for (const r of c.rings) {
        const ring = projectRing(r, proj);
        if (ring.length < 3) continue;
        rings.push(ring);
        fills.push(toGround(new THREE.ShapeGeometry(makeShape([ring])), this.topY * 0.04));
      }
    if (!rings.length) return;
    const group = new THREE.Group();
    group.name = 'context-ghost';
    const merged = mergeGeometries(fills, false);
    for (const g of fills) g.dispose();
    if (merged) {
      const fill = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: T.land, transparent: true, opacity: GHOST_FILL_OPACITY, depthWrite: false, fog: true }));
      fill.renderOrder = 1;
      fill.name = 'context-fill';
      group.add(fill);
    }
    const lineMat = new THREE.LineBasicMaterial({ color: T.ghost, transparent: true, opacity: GHOST_LINE_OPACITY, depthWrite: false, fog: true });
    const outline = boundarySegments(rings, this.topY * 0.06, lineMat);
    outline.name = 'context-outline';
    outline.renderOrder = 2;
    group.add(outline);
    this.contextGroup = group;
    this.scene.add(group);
  }

  /**
   * Lon/lat framing of a scope: its bounds grown towards the whole focus geometry, at most FIT_GROW of the span on
   * each side, so a plate whose coastline runs past the operational box is framed whole without shrinking the ports.
   */
  fitBounds(bounds: Bounds): Bounds {
    const g = this.doc?.focusBounds;
    if (!this.wholeGeometry || !g || this.level === 'city') return bounds;
    const west = bounds.west;
    let east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
    // Antimeridian files keep longitudes in 0..360; align the request with them.
    const shift = g.east > 180 && east < g.west ? 360 : 0;
    const w = west + shift;
    east += shift;
    const sx = east - w;
    const sy = bounds.north - bounds.south;
    return {
      west: Math.max(Math.min(w, g.west), w - sx * FIT_GROW),
      east: Math.min(Math.max(east, g.east), east + sx * FIT_GROW),
      south: Math.max(Math.min(bounds.south, g.south), bounds.south - sy * FIT_GROW),
      north: Math.min(Math.max(bounds.north, g.north), bounds.north + sy * FIT_GROW),
    };
  }

  private unionWorldBounds(world: Bounds, geo: Bounds, proj: GeoProjection): Bounds {
    const midLon = (geo.west + geo.east) / 2;
    const midLat = (geo.south + geo.north) / 2;
    const pts = [
      proj.lonLatToWorld(geo.west, geo.south),
      proj.lonLatToWorld(geo.east, geo.south),
      proj.lonLatToWorld(geo.west, geo.north),
      proj.lonLatToWorld(geo.east, geo.north),
      proj.lonLatToWorld(midLon, geo.north),
      proj.lonLatToWorld(midLon, geo.south),
      proj.lonLatToWorld(geo.west, midLat),
      proj.lonLatToWorld(geo.east, midLat),
    ];
    return {
      west: Math.min(world.west, ...pts.map((p) => p.x)),
      east: Math.max(world.east, ...pts.map((p) => p.x)),
      north: Math.min(world.north, ...pts.map((p) => p.z)),
      south: Math.max(world.south, ...pts.map((p) => p.z)),
    };
  }

  /** Ghost context for QA: number of context rings and whether any of it is pickable (it never is). */
  contextStats(): { rings: number; pickable: boolean; lineOpacity: number } {
    const outline = this.contextGroup?.getObjectByName('context-outline') as THREE.LineSegments | undefined;
    const rings = this.doc?.context.reduce((n, c) => n + c.rings.length, 0) ?? 0;
    const pickable = !!this.contextGroup && this.topMeshes.some((m) => this.contextGroup!.children.includes(m));
    return { rings: outline ? rings : 0, pickable, lineOpacity: outline ? (outline.material as THREE.LineBasicMaterial).opacity : 0 };
  }

  // ---- highlight ----------------------------------------------------------------------------------------------

  setRegionHighlight(iso3: string[] | null): void {
    if (!this.doc) return;
    this.scopeIso3 = new Set(iso3 && iso3.length ? iso3 : this.doc.features.filter((f) => f.focus).map((f) => f.iso3));
    this.applyTones();
  }

  setHoverHighlight(iso3: string[] | null): void {
    const next = iso3?.[0] ?? null;
    if (next === this.hoverIso3) return;
    this.hoverIso3 = next;
    this.applyTones();
  }

  /** Lit contour on one feature (the scope focus for country/city scenes, a clicked country in a region). */
  selectFeature(iso3: string | null): void {
    this.selectedIso3 = iso3;
    for (const f of this.features) {
      const on = f.doc.iso3 === iso3;
      if (on && !f.contour) {
        const m = new FatLineMaterial({ color: T.contour.getHex(), linewidth: 2.2, transparent: true, opacity: 0.95, depthTest: false, worldUnits: false });
        m.resolution.set(this.width, this.height);
        this.fatLines.add(m);
        f.contour = createContour(f.rings, this.topY * 1.004, m);
        f.group.add(f.contour);
      } else if (!on && f.contour) {
        f.group.remove(f.contour);
        const line = f.contour as THREE.Mesh;
        line.geometry.dispose();
        const m = line.material as LineMaterial;
        this.fatLines.delete(m);
        m.dispose();
        f.contour = null;
      }
    }
    if (this.wholeGeometry) this.applyTones();
    this.invalidate();
  }

  get selectedFeature() {
    return this.selectedIso3;
  }

  private applyTones() {
    for (const f of this.features) {
      const hovered = f.doc.iso3 === this.hoverIso3;
      const color = hovered ? T.landHover : this.scopeIso3.has(f.doc.iso3) ? T.landScope : T.land;
      for (const t of f.top) t.material.color.copy(color);
      (f.wall.uniforms.topColor.value as THREE.Color).copy(hovered ? T.border : T.wallTop);
      if (this.wholeGeometry) {
        f.rim.opacity = hovered ? RIM_HOVER : f.rimIdle;
        // A committed selection in a region keeps its lift while the camera moves (spec 23 B.03).
        const raised = !this.portId && (hovered || (this.level === 'region' && f.doc.iso3 === this.selectedIso3));
        const to = raised ? 1 : 0;
        if (to !== f.lift.to) f.lift = { from: f.lift.v, to, t: 0, v: f.lift.v };
      } else f.group.userData.targetLift = hovered && !this.portId ? this.span * HOVER_LIFT_FRACTION : 0;
    }
    this.invalidate();
  }

  /** Invisible, larger pick target over a feature too small to hit reliably (it lifts with the feature). */
  private addHitDisc(group: THREE.Group, rings: GroundRing[], iso3: string) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const r of rings)
      for (const p of r) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.y);
        z1 = Math.max(z1, p.y);
      }
    if (Math.max(x1 - x0, z1 - z0) >= this.span * SMALL_FEATURE_FRACTION) return;
    // Baked like the tops: raycasts may run before the first render updates matrixWorld.
    const circle = new THREE.CircleGeometry(this.span * SMALL_FEATURE_FRACTION * 0.6, 20).translate((x0 + x1) / 2, (z0 + z1) / 2, 0);
    const disc = new THREE.Mesh(toGround(circle, this.topY * 1.01), new THREE.MeshBasicMaterial({ visible: false }));
    disc.userData.iso3 = iso3;
    disc.userData.hitDisc = true;
    group.add(disc);
    this.topMeshes.push(disc);
  }

  private animateLift(dtMs: number): boolean {
    if (this.wholeGeometry) return this.animateLiftV3(dtMs);
    let moving = false;
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dtMs / 70);
    for (const f of this.features) {
      const target = (f.group.userData.targetLift as number | undefined) ?? 0;
      const y = f.group.position.y;
      if (Math.abs(target - y) < this.span * 1e-6) {
        if (y !== target) {
          f.group.position.y = target;
          moving = true;
        }
        continue;
      }
      f.group.position.y = y + (target - y) * (dtMs ? k : 1);
      moving = true;
    }
    return moving;
  }

  /**
   * V3: the whole feature group (tops, side walls, rim, contour) scales up from the sea level, so the top rises by
   * HOVER_LIFT_EXTRUSION of the extrusion and the walls stretch with it: no gap between top and wall.
   */
  private animateLiftV3(dtMs: number): boolean {
    let moving = false;
    for (const f of this.features) {
      const l = f.lift;
      if (l.t >= 1 && l.v === l.to) continue;
      l.t = this.reducedMotion || !dtMs ? 1 : Math.min(1, l.t + dtMs / LIFT_MS);
      l.v = l.from + (l.to - l.from) * easeOutCubic(l.t);
      f.group.scale.y = 1 + HOVER_LIFT_EXTRUSION * l.v;
      moving = true;
    }
    return moving;
  }

  /** Current hover lift of a feature's top as a fraction of the frame span (spec: ≤ 2 %). */
  liftFraction(iso3: string): number {
    const f = this.features.find((x) => x.doc.iso3 === iso3);
    if (!f) return 0;
    return this.wholeGeometry ? ((f.group.scale.y - 1) * this.topY) / this.span : f.group.position.y / this.span;
  }

  /** Lift progress of a feature, 0 (rest) to 1 (raised), for QA. */
  liftProgress(iso3: string): number {
    return this.features.find((x) => x.doc.iso3 === iso3)?.lift.v ?? 0;
  }

  /** Label anchor for a feature: area-weighted centroid of its largest outer ring, or null before the build. */
  featureLabelPoint(iso3: string): { lat: number; lon: number } | null {
    const cached = this.labelPoints.get(iso3);
    if (cached !== undefined) return cached;
    const f = this.features.find((x) => x.doc.iso3 === iso3);
    if (!f || !this.proj) return null;
    let best: [number, number][] | null = null;
    let bestArea = 0;
    for (const poly of f.doc.polygons) {
      const a = Math.abs(ringArea(poly[0]));
      if (a > bestArea) {
        bestArea = a;
        best = poly[0];
      }
    }
    const c = best ? ringCentroid(best) : null;
    const pt = c ? { lon: normalizeLon(c[0]), lat: c[1] } : null;
    this.labelPoints.set(iso3, pt);
    return pt;
  }

  /** Camera preset on the current target and distance: isometric (50° tilt, 35° azimuth) or near top-down. */
  applyViewPreset(id: Exclude<ViewPresetId, 'fit'>): Promise<boolean> {
    const p = VIEW_PRESETS[id];
    const o = this.orbit();
    const goal: Orbit = { target: o.target, distance: o.distance, polar: Math.min(MAX_POLAR, p.polarDeg * DEG), azimuth: p.azimuthDeg * DEG };
    return this.flyToOrbit(goal, this.reducedMotion ? 0 : 0.6);
  }

  // ---- camera ---------------------------------------------------------------------------------------------------

  private orbit(): Orbit {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(offset);
    return { target: this.controls.target.clone(), distance: s.radius, polar: s.phi, azimuth: s.theta };
  }

  private applyOrbit(o: Orbit) {
    this.controls.target.copy(o.target);
    const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(o.distance, Math.min(MAX_POLAR, Math.max(0.001, o.polar)), o.azimuth));
    this.camera.position.copy(o.target).add(off);
    this.camera.lookAt(o.target);
    this.updateClip();
    this.invalidate();
  }

  private updateClip() {
    const d = this.camera.position.distanceTo(this.controls.target);
    const near = Math.max(this.span * 1e-5, d / 200);
    const far = d * 4 + this.span * 4;
    if (Math.abs(this.camera.near - near) / near > 0.05 || Math.abs(this.camera.far - far) / far > 0.05) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
      if (this.scene.fog instanceof THREE.Fog) {
        this.scene.fog.near = d * 1.8 + this.span * 0.5;
        this.scene.fog.far = d * 4 + this.span * 3;
      }
    }
  }

  /** Keep the orbit target over the frame so the user cannot pan into empty ocean. */
  private clampTarget() {
    const b = this.frameBounds;
    if (!b) return;
    const t = this.controls.target;
    const x = Math.min(b.east, Math.max(b.west, t.x));
    const z = Math.min(b.south, Math.max(b.north, t.z));
    if (x !== t.x || z !== t.z || t.y !== 0) {
      const dx = x - t.x;
      const dz = z - t.z;
      t.set(x, 0, z);
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
  }

  private toWorld(lat: number, lon: number, y = 0): THREE.Vector3 {
    const w = this.proj!.lonLatToWorld(lon, lat);
    return new THREE.Vector3(w.x, y, w.z);
  }

  /** Native framing of geographic bounds on this surface, expressed as a globe-unit preset. */
  fitPreset(id: string, scope: CameraPreset['scope'], bounds: Bounds, fill = 0.86): CameraPreset {
    const proj = this.proj;
    const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
    const center = { lon: normalizeLon((bounds.west + east) / 2), lat: (bounds.south + bounds.north) / 2 };
    if (!proj) return { id, scope, center, distance: 2.5, minDistance: 2.01, maxDistance: 4 };
    const pts = [
      proj.lonLatToWorld(bounds.west, bounds.south),
      proj.lonLatToWorld(east, bounds.south),
      proj.lonLatToWorld(bounds.west, bounds.north),
      proj.lonLatToWorld(east, bounds.north),
      proj.lonLatToWorld(center.lon, bounds.north),
      proj.lonLatToWorld(center.lon, bounds.south),
    ];
    const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const h = Math.max(...pts.map((p) => p.z)) - Math.min(...pts.map((p) => p.z));
    const { fov, aspect } = this.viewAspect;
    const tanV = Math.tan((fov / 2) * DEG) * fill * ((this.height - this.viewOffsetBottomPx) / this.height);
    const tilt = this.tilt;
    // The tilted view foreshortens depth by cos(tilt); fit both axes.
    const d = Math.max(h * Math.cos(tilt) / 2 / tanV + (h / 2) * Math.sin(tilt) * 0.35, w / 2 / (tanV * aspect));
    const distance = planarToGlobeDistance(d);
    return {
      id,
      scope,
      center,
      distance,
      minDistance: planarToGlobeDistance(this.portId ? Math.min(0.09, d * 0.06) : Math.max(this.span * 0.004, d * 0.06)),
      maxDistance: planarToGlobeDistance(Math.min(this.span * 1.6, Math.max(d * 2.2, this.span * 0.5))),
    };
  }

  flyTo(preset: CameraPreset, opts: { duration?: number } = {}): Promise<boolean> {
    if (!this.proj) return Promise.resolve(false);
    this.cancelFlight();
    const from = this.orbit();
    const keepAngles = !/^(REG|CNT|CTY|PRT)-/.test(preset.id);
    const goal: Orbit = {
      target: this.toWorld(preset.center.lat, preset.center.lon),
      distance: Math.min(this.span * 1.6, globeToPlanarDistance(preset.distance)),
      polar: keepAngles ? from.polar : this.tilt,
      azimuth: keepAngles ? from.azimuth : 0,
    };
    this.controls.minDistance = Math.min(globeToPlanarDistance(preset.minDistance), goal.distance);
    this.controls.maxDistance = Math.max(Math.min(this.span * 1.6, globeToPlanarDistance(preset.maxDistance)), goal.distance);
    const travel = from.target.distanceTo(goal.target) / Math.max(goal.distance, from.distance);
    const duration = opts.duration ?? (this.reducedMotion ? 0 : Math.min(1.2, 0.7 + travel * 0.25 + Math.abs(Math.log(goal.distance / from.distance)) * 0.15));
    return this.flyToOrbit(goal, duration);
  }

  /** Tweens the orbit to a goal (log-distance, shortest azimuth); resolves false when cancelled. */
  private flyToOrbit(goal: Orbit, duration: number): Promise<boolean> {
    this.cancelFlight();
    const from = this.orbit();
    let dAz = goal.azimuth - from.azimuth;
    if (dAz > Math.PI) dAz -= 2 * Math.PI;
    if (dAz < -Math.PI) dAz += 2 * Math.PI;
    if (duration <= 0) {
      this.applyOrbit(goal);
      this.emit('cameraSettled', this.getPose());
      return Promise.resolve(true);
    }
    this.controls.enabled = false;
    return new Promise<boolean>((resolve) => {
      this.resolveFlight = resolve;
      const s = { t: 0 };
      const logFrom = Math.log(from.distance);
      const logTo = Math.log(goal.distance);
      this.flight = gsap.to(s, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          const t = s.t;
          this.applyOrbit({
            target: from.target.clone().lerp(goal.target, t),
            distance: Math.exp(logFrom + (logTo - logFrom) * t),
            polar: from.polar + (goal.polar - from.polar) * t,
            azimuth: from.azimuth + dAz * t,
          });
        },
        onComplete: () => {
          this.flight = null;
          this.resolveFlight = null;
          this.applyOrbit(goal);
          this.controls.enabled = this.activeValue;
          this.emit('cameraSettled', this.getPose());
          resolve(true);
        },
      });
    });
  }

  /**
   * Camera for the handoff's static frame: higher and flatter than the preset (the settle flight eases into the
   * oblique, north-up framing), or exactly the preset for reduced motion.
   */
  setEntryCamera(preset: CameraPreset, exact: boolean): void {
    if (!this.proj) return;
    this.cancelFlight();
    const distance = Math.min(this.span * 1.6, globeToPlanarDistance(preset.distance));
    this.controls.minDistance = Math.min(globeToPlanarDistance(preset.minDistance), distance);
    this.controls.maxDistance = Math.max(Math.min(this.span * 1.6, globeToPlanarDistance(preset.maxDistance)), distance * 1.4);
    this.applyOrbit({
      target: this.toWorld(preset.center.lat, preset.center.lon),
      distance: exact ? distance : distance * 1.4,
      polar: exact ? this.tilt : this.tilt * 0.45,
      azimuth: exact ? 0 : -0.16,
    });
  }

  /** Draws this scene into the shared canvas now (handoff static frame), outside the director's frame loop. */
  drawNow(): void {
    if (!this.doc) return;
    this.updateClip();
    this.renderer.render(this.scene, this.camera);
    this.dirty = true;
  }

  flyToPose(pose: CameraPose, limits: { min: number; max: number }): Promise<boolean> {
    return this.flyTo({ id: 'restore', scope: 'earth', center: { lat: pose.lat, lon: pose.lon }, distance: pose.distance, minDistance: limits.min, maxDistance: limits.max });
  }

  jumpToPose(pose: CameraPose): Promise<boolean> {
    const { min, max } = this.distanceLimits;
    return this.flyTo({ id: 'handoff', scope: 'earth', center: { lat: pose.lat, lon: pose.lon }, distance: Math.max(min, Math.min(max, pose.distance)), minDistance: min, maxDistance: max }, { duration: 0 });
  }

  focusPoint(lat: number, lon: number, opts: { maxDistance?: number } = {}): Promise<boolean> {
    const distance = Math.min(this.equivalentDistance, opts.maxDistance ?? Infinity);
    const { min, max } = this.distanceLimits;
    return this.flyTo({ id: 'focus', scope: 'earth', center: { lat, lon }, distance, minDistance: min, maxDistance: max });
  }

  followStep(t: FollowTarget, dtMs: number): FollowStatus {
    if (!this.proj || this.flight || !this.activeValue) return 'idle';
    const goal = this.toWorld(t.lat, t.lon);
    const o = this.orbit();
    if (this.userDragging) {
      const panned = Math.hypot(o.target.x - this.dragStartTarget.x, o.target.z - this.dragStartTarget.z);
      return panned > FOLLOW_RELEASE_DISTANCE * o.distance ? 'released' : 'following';
    }
    const b = this.frameBounds;
    const edge = !!b && (goal.x < b.west || goal.x > b.east || goal.z < b.north || goal.z > b.south);
    const a = followAlpha(dtMs);
    const target = o.target.clone().lerp(goal, a);
    target.y = 0;
    let distance = o.distance;
    if (t.frameMetres !== null) {
      const want = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, t.frameMetres * UNITS_PER_METRE));
      distance = Math.exp(Math.log(distance) + (Math.log(want) - Math.log(distance)) * a);
    }
    const wantPolar = modePolar(t.mode);
    const polar = wantPolar === null ? o.polar : o.polar + (Math.min(MAX_POLAR, wantPolar) - o.polar) * a * 0.6;
    let azimuth = o.azimuth;
    if (modeSteersAzimuth(t.mode) && t.courseDeg !== null) azimuth += angleDelta(o.azimuth, behindAzimuth(t.courseDeg, this.headingOffset(t.lat, t.lon))) * a * 0.6;
    this.applyOrbit({ target, distance, polar, azimuth });
    this.clampTarget();
    return edge ? 'edge' : 'following';
  }

  cancelFlight(): void {
    if (this.flight) {
      this.flight.kill();
      this.flight = null;
    }
    if (this.resolveFlight) {
      const r = this.resolveFlight;
      this.resolveFlight = null;
      r(false);
    }
    this.controls.enabled = this.activeValue;
  }

  getPose(): CameraPose {
    const t = this.controls.target;
    const g = this.proj ? this.proj.worldToLonLat(t.x, t.z) : { lon: 0, lat: 0 };
    return { lat: g.lat, lon: normalizeLon(g.lon), distance: this.equivalentDistance };
  }

  isComfortablyInView(lat: number, lon: number, margin = 0.12): boolean {
    const s = this.project(lat, lon);
    const w = this.width - this.viewOffsetPx;
    const h = this.height - this.viewOffsetBottomPx;
    return s.visible && s.x > w * margin && s.x < w * (1 - margin) && s.y > h * margin && s.y < h * (1 - margin);
  }

  setRightInset(px: number, opts: { instant?: boolean } = {}): void {
    const state = { v: this.viewOffsetPx };
    gsap.to(state, {
      v: px,
      duration: this.reducedMotion || opts.instant ? 0 : 0.18,
      ease: 'power2.out',
      onUpdate: () => {
        this.viewOffsetPx = state.v;
        this.applyViewOffset();
        this.invalidate();
      },
    });
  }

  /** Panels docked along the bottom (port schedule) shift the view centre up, like the inspector does sideways. */
  setBottomInset(px: number, opts: { instant?: boolean } = {}): void {
    const state = { v: this.viewOffsetBottomPx };
    gsap.to(state, {
      v: px,
      duration: this.reducedMotion || opts.instant ? 0 : 0.18,
      ease: 'power2.out',
      onUpdate: () => {
        this.viewOffsetBottomPx = state.v;
        this.applyViewOffset();
        this.invalidate();
      },
    });
  }

  private applyViewOffset() {
    if (this.viewOffsetPx > 0.5 || this.viewOffsetBottomPx > 0.5) this.camera.setViewOffset(this.width, this.height, this.viewOffsetPx / 2, this.viewOffsetBottomPx / 2, this.width, this.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setIdleRotation(): void {}

  setReducedMotion(v: boolean): void {
    this.reducedMotion = v;
  }

  get distanceLimits() {
    return { min: planarToGlobeDistance(this.controls.minDistance), max: planarToGlobeDistance(this.controls.maxDistance) };
  }

  get equivalentDistance() {
    return planarToGlobeDistance(this.camera.position.distanceTo(this.controls.target));
  }

  get flying() {
    return this.flight !== null;
  }

  get motionReduced() {
    return this.reducedMotion;
  }

  get viewport() {
    return { width: this.width, height: this.height };
  }

  get viewAspect() {
    return { fov: this.camera.fov, aspect: (this.width - this.viewOffsetPx) / (this.height - this.viewOffsetBottomPx) };
  }

  get pxToWorld() {
    return (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.height;
  }

  get active() {
    return this.activeValue;
  }

  get ready() {
    return this.doc !== null;
  }

  get geoDoc() {
    return this.doc;
  }

  get illustrativeBounds() {
    return !!this.doc?.illustrativeBounds;
  }

  // ---- surface geometry -------------------------------------------------------------------------------------------

  readonly invalidate = () => {
    this.dirty = true;
  };

  project(lat: number, lon: number): ScreenPoint {
    if (!this.proj) return { x: -9999, y: -9999, visible: false };
    const p = this.toWorld(lat, lon, this.anchorY).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height, visible: p.z > -1 && p.z < 1 };
  }

  /**
   * Overlay anchors sit just above the land tops so berths drawn inside coarse coastlines stay visible; port twins
   * float ships on the water.
   */
  markerCenter(lat: number, lon: number): [number, number, number] {
    if (!this.proj) return [0, -1e6, 0];
    const w = this.proj.lonLatToWorld(lon, lat);
    return [w.x, this.anchorY, w.z];
  }

  private get anchorY() {
    return this.portId ? 0.2 * UNITS_PER_METRE : this.topY * 1.02;
  }

  /** World position of a geographic point at a height in metres (host-built scene layers). */
  geoToWorld(lat: number, lon: number, heightM = 0): THREE.Vector3 {
    return this.toWorld(lat, lon, heightM * UNITS_PER_METRE);
  }

  addLayer(layer: PlanarSceneLayer): void {
    this.layers.add(layer);
    this.scene.add(layer.object);
    this.invalidate();
  }

  removeLayer(layer: PlanarSceneLayer): void {
    if (!this.layers.delete(layer)) return;
    this.scene.remove(layer.object);
    layer.dispose();
    this.invalidate();
  }

  /** Land height in metres (port twins: true scale). */
  get landHeightM() {
    return this.topY / UNITS_PER_METRE;
  }

  linePosition(lat: number, lon: number): [number, number, number] {
    return this.markerCenter(lat, lon);
  }

  headingOffset(lat: number, lon: number): number {
    return this.proj ? gridConvergence(this.proj, lon, lat) : 0;
  }

  markerAltitude(): number {
    return this.equivalentDistance - EARTH_RADIUS;
  }

  /** Hazard fills and density use the globe's equirectangular canvas; planar scenes show outlines only. */
  setOverlayCanvas(): void {}

  /** Camera orbit in degrees and scene units (test adapter and QA evidence). */
  orbitState(): { polarDeg: number; azimuthDeg: number; distance: number } {
    const o = this.orbit();
    return { polarDeg: THREE.MathUtils.radToDeg(o.polar), azimuthDeg: THREE.MathUtils.radToDeg(o.azimuth), distance: o.distance };
  }

  /** North arrow rotation (degrees clockwise on screen) and ground metres per CSS pixel at the view centre. */
  compass(): { northDeg: number; metresPerPx: number } | null {
    if (!this.proj) return null;
    const t = this.controls.target;
    const c = this.proj.worldToLonLat(t.x, t.z);
    const screen = (v: THREE.Vector3) => {
      const p = v.project(this.camera);
      return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
    };
    const a = screen(this.toWorld(c.lat, c.lon));
    const n = screen(this.toWorld(Math.min(89.9, c.lat + 0.01), c.lon));
    const stepM = Math.max(10, (this.span / UNITS_PER_METRE) * 0.02);
    const e = screen(new THREE.Vector3(t.x + stepM * UNITS_PER_METRE, 0, t.z));
    const px = Math.hypot(e.x - a.x, e.y - a.y);
    return { northDeg: (Math.atan2(n.x - a.x, -(n.y - a.y)) * 180) / Math.PI, metresPerPx: px > 0 ? stepM / px : Infinity };
  }

  pick(clientX: number, clientY: number): SurfacePointerHit | null {
    if (!this.proj) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.topMeshes, false);
    const ground = hits[0]?.point ?? this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!ground) return null;
    const g = this.proj.worldToLonLat(ground.x, ground.z);
    const iso3 = hits[0]?.object.userData.iso3 as string | undefined;
    let berthId: string | undefined;
    let nearest = Infinity;
    for (const l of this.layers) {
      const h = l.pick?.(this.raycaster);
      if (h?.berthId && h.distance < nearest) {
        nearest = h.distance;
        berthId = h.berthId;
      }
    }
    return {
      lat: g.lat,
      lon: normalizeLon(g.lon),
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      country: iso3 ? (this.features.find((f) => f.doc.iso3 === iso3)?.country ?? null) : null,
      ...(berthId ? { berthId } : {}),
    };
  }

  // ---- events & input ---------------------------------------------------------------------------------------------

  on<K extends keyof SurfaceEvents>(event: K, fn: SurfaceEvents[K]): () => void {
    (this.listeners[event] as Set<SurfaceEvents[K]>).add(fn);
    return () => (this.listeners[event] as Set<SurfaceEvents[K]>).delete(fn);
  }

  private emit<K extends keyof SurfaceEvents>(event: K, ...args: Parameters<SurfaceEvents[K]>) {
    for (const fn of this.listeners[event] as Set<(...a: Parameters<SurfaceEvents[K]>) => void>) fn(...args);
  }

  onFrame(fn: (nowMs: number, dirty: boolean) => void): () => void {
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }

  attachInput(router: InputRouter) {
    this.detachInput();
    this.inputUnsubs = [
      router.on('click', (_h, e) => {
        if (this.activeValue && this.doc) this.emit('click', this.pick(e.clientX, e.clientY), e as PointerEvent);
      }),
      router.on('dblclick', (_h, e) => {
        if (this.activeValue && this.doc) this.emit('dblclick', this.pick(e.clientX, e.clientY), e as PointerEvent);
      }),
      router.on('hover', (_h, e) => {
        if (this.activeValue && this.doc) this.emit('hover', this.pick(e.clientX, e.clientY), e as PointerEvent);
      }),
      router.on('leave', (e) => {
        if (this.activeValue) this.emit('hover', null, e as PointerEvent);
      }),
    ];
  }

  private detachInput() {
    this.inputUnsubs.forEach((u) => u());
    this.inputUnsubs = [];
  }

  private readonly onControlsStart = () => {
    if (this.flight) this.cancelFlight();
    this.userDragging = true;
    this.dragStartTarget.copy(this.controls.target);
    this.emit('userInteract');
  };

  private readonly onControlsEnd = () => {
    this.userDragging = false;
  };

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.width = w;
    this.height = h;
    this.camera.aspect = w / h;
    this.applyViewOffset();
    for (const m of this.fatLines) m.resolution.set(w, h);
    this.invalidate();
  }

  stats() {
    const info = this.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points, geometries: info.memory.geometries, textures: info.memory.textures };
  }

  /** Scene-owned figures for the cache budget (the renderer is shared). */
  sceneStats() {
    let geometries = 0;
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).geometry) geometries++;
    });
    return { geometries, textures: 2, features: this.features.length };
  }
}

/** Lon/lat bounds grown by `k` times their span on each side, at most 30° (latitudes clamped to ±80). */
function growLonLat(b: Bounds, k: number): Bounds {
  const gx = Math.min(30, (b.east - b.west) * k);
  const gy = Math.min(30, (b.north - b.south) * k);
  return { west: b.west - gx, east: b.east + gx, south: Math.max(-80, b.south - gy), north: Math.min(80, b.north + gy) };
}

function ringArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

/** Area-weighted centroid of a lon/lat ring (planar; fine for label anchors inside one scope). */
function ringCentroid(ring: [number, number][]): [number, number] | null {
  const a = ringArea(ring);
  if (Math.abs(a) < 1e-12) return null;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  const c: [number, number] = [cx / (6 * a), cy / (6 * a)];
  return pointInRing(c, ring) ? c : widestSpanMidpoint(ring, c[1]);
}

function pointInRing(p: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Concave rings (Vietnam, Chile): the middle of the widest interior run along the centroid's latitude. */
function widestSpanMidpoint(ring: [number, number][], y: number): [number, number] | null {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  let width = 0;
  for (let k = 0; k + 1 < xs.length; k += 2)
    if (xs[k + 1] - xs[k] > width) {
      width = xs[k + 1] - xs[k];
      best = [(xs[k] + xs[k + 1]) / 2, y];
    }
  return best;
}

function ringsBbox(polys: [number, number][][][]): Bounds {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of polys)
    for (const [lon, lat] of p[0]) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  return { west, south, east, north };
}

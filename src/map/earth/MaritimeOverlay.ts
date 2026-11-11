import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { GeoPoint } from '@/core/types';
import type { TrackRun, TrackRunKind } from '@/engines/tracks';
import type { DensityCell, HazardShape, MapFocus, PortMarker, RouteLine, VesselMarker } from '@/selectors/mapLayers';
import { markerColors as MC } from '../theme';
import { EARTH_RADIUS } from './camera';
import type { MapSurface } from '../surface';
import { flags } from '@/core/flags';
import { allocateBands, BAND_CAPS, LOD_BANDS, markerPxForAltitude, nextBand, nextLod, selectedBand, type BandCandidate, type LodBand, type VesselDetail } from './lod';
import { createInstanceBuffers, createMarkerMaterial, createWakeMaterial, instancedFrom, variantWithBeam, type InstanceBuffers } from './markerShader';
import { portGeometry, ringGeometry } from './markerGeometry';
import { modelKeyOf, SHIP_MODEL_KEYS, type ShipModelKey } from '../vessels3d/categories';
import { buildShipGeometry, buildShipIcon, LOD_BEAM_BOOST, shipDotGeometry, triangleCount, wakeGeometry } from '../vessels3d/library';
import { displayHeadingDeg, motionStateOf, wakeLength, type MotionState } from '../vessels3d/motion';

export interface OverlayLayers {
  fleet: boolean;
  ambient: boolean;
  ports: boolean;
  routes: boolean;
  weather: boolean;
  incidents: boolean;
  traffic: boolean;
}

export type MapHitKind = 'vessel' | 'port' | 'route';
export interface MapHit {
  kind: MapHitKind;
  id: string;
  screenX: number;
  screenY: number;
  /** Vessels whose glyph cores overlap at the hit point, including the hit itself. */
  stacked?: number;
}

const DEG = Math.PI / 180;
const EARTH_RADIUS_M = 6371008.8;
/** Ships drawn with the LOD2 model at once (the selection); everyone else stays at LOD1. */
const DETAIL_CAPACITY = 4;
/** Models and wakes are only instanced for ships within the viewport plus this margin (fraction of each side). */
const CULL_MARGIN = 0.15;
/** How often the on-screen set is re-checked while the camera moves. */
const CULL_INTERVAL_MS = 200;
const LINE_RADIUS = EARTH_RADIUS * 1.0025;
const OVERLAY_W = 2048;
const OVERLAY_H = 1024;

const RENDER_ORDER = { hazards: 4, routes: 5, track: 6, ports: 8, depthReset: 9, vessels: 10, wakes: 11, rings: 12 } as const;

function toneColor(m: VesselMarker): THREE.Color {
  return MC[m.tone];
}

function linePositions(surface: MapSurface, points: GeoPoint[], radius = LINE_RADIUS): number[] {
  const out: number[] = [];
  for (const p of points) out.push(...surface.linePosition(p.lat, p.lon, radius));
  return out;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface ModelBatch {
  buffers: InstanceBuffers;
  mesh: THREE.Mesh;
}

export interface VesselPose {
  model: ShipModelKey;
  state: MotionState;
  headingDeg: number;
  wake: number;
  detail: 0 | 1 | 2;
  /** V3 band (dot … inspection) and the projected hull length in CSS px that chose it. */
  band?: LodBand;
  px?: number;
}

/**
 * Maritime layers on a map surface (the globe or an extruded region / country / city scene): instanced ships from the
 * `vessels3d` library (LOD0 glyphs, LOD1 per-type models, LOD2 for the selected ship only) with wakes, port glyphs,
 * selection and incident rings, corridor lines, the focused voyage track, hazard outlines, and the surface overlay
 * texture for hazard fills and traffic density. Holds no domain logic: everything arrives as view models.
 */
export class MaritimeOverlay {
  readonly group = new THREE.Group();
  private readonly scene: MapSurface;
  private readonly planar: boolean;
  private readonly vesselMaterial: THREE.ShaderMaterial;
  private readonly modelMaterial: THREE.ShaderMaterial;
  private readonly detailMaterial: THREE.ShaderMaterial;
  private readonly wakeMaterial: THREE.ShaderMaterial;
  private readonly portMaterial: THREE.ShaderMaterial;
  private readonly ringMaterial: THREE.ShaderMaterial;
  private readonly lineMaterials = new Set<LineMaterial>();

  private readonly glyphBuffers: InstanceBuffers;
  private readonly glyphMesh: THREE.Mesh;
  private readonly modelBatches = new Map<ShipModelKey, ModelBatch>();
  private readonly detailBatches = new Map<ShipModelKey, ModelBatch>();
  private readonly wakeBuffers: InstanceBuffers;
  private readonly wakeMesh: THREE.Mesh;
  private readonly poses = new Map<string, VesselPose>();
  private sceneTimeMs = 0;
  private readonly selectionBuffers = createInstanceBuffers(16);
  private readonly selectionMesh: THREE.Mesh;
  private readonly incidentBuffers: InstanceBuffers;
  private readonly incidentMesh: THREE.Mesh;
  private readonly portBuffers: InstanceBuffers;
  private readonly portMesh: THREE.Mesh;

  private markers: VesselMarker[] = [];
  private markerById = new Map<string, VesselMarker>();
  private drawn: VesselMarker[] = [];
  private ports: PortMarker[] = [];
  private drawnPorts: PortMarker[] = [];
  private routes = new Map<string, { data: RouteLine; line: Line2; material: LineMaterial }>();
  private trackLines: { kind: TrackRunKind; line: Line2 }[] = [];
  private hazardLines: Line2[] = [];
  private hazards: HazardShape[] = [];
  private density: DensityCell[] = [];
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly hatch: HTMLCanvasElement;

  private layers: OverlayLayers = { fleet: true, ambient: true, ports: true, routes: true, weather: true, incidents: true, traffic: false };
  private focus: MapFocus = { vesselIds: [], routeIds: [], hazardIds: [], portIds: [], voyageId: null, point: null };
  private clustered: ReadonlySet<string> = new Set();
  /** Per-frame pose of the followed vessel (between 10 Hz clock commits) and the instance slots it occupies. */
  private live: { id: string; point: GeoPoint; cogDeg: number | null } | null = null;
  private liveSlots: { b: InstanceBuffers; mesh: THREE.Mesh; k: number; ring: boolean }[] = [];
  private hoverId: string | null = null;
  private hoverPortId: string | null = null;
  private lod: VesselDetail = 0;
  private px = 8;
  private onScreen = new Set<string>();
  private cullCheckedAt = -Infinity;
  private resolution = new THREE.Vector2(1, 1);
  private lodListeners = new Set<(lod: VesselDetail) => void>();

  /** V3 per-ship bands by projected length (`v3ShipPreview`); V2 keeps one overlay-wide LOD. */
  private readonly v3Lod = flags.v3ShipPreview;
  private readonly metre: number;
  /** Band before the close-model caps, kept per ship for hysteresis. */
  private readonly rawBands = new Map<string, LodBand>();
  private readonly dotMaterial: THREE.ShaderMaterial | null = null;
  private readonly dotBuffers: InstanceBuffers | null = null;
  private readonly dotMesh: THREE.Mesh | null = null;
  private readonly iconBatches = new Map<ShipModelKey, ModelBatch>();
  private readonly inspectBatches = new Map<ShipModelKey, ModelBatch>();
  private readonly capacity: number;
  private readonly tmp = new THREE.Vector3();

  constructor(scene: MapSurface, capacity: number) {
    this.scene = scene;
    this.planar = scene.surfaceKind === 'planar';
    this.capacity = capacity;
    const metre = (scene.globeUnitScale * EARTH_RADIUS) / EARTH_RADIUS_M;
    this.metre = metre;
    this.vesselMaterial = createMarkerMaterial({ planar: this.planar, metre, beam: LOD_BEAM_BOOST[0] });
    this.modelMaterial = variantWithBeam(this.vesselMaterial, LOD_BEAM_BOOST[1]);
    this.detailMaterial = variantWithBeam(this.vesselMaterial, LOD_BEAM_BOOST[2]);
    this.wakeMaterial = createWakeMaterial(this.vesselMaterial, LOD_BEAM_BOOST[1]);
    this.portMaterial = createMarkerMaterial(EARTH_RADIUS * 1.0015, this.planar);
    this.ringMaterial = createMarkerMaterial({ radius: EARTH_RADIUS * 1.002, planar: this.planar, metre });
    this.group.name = 'maritime-overlay';
    scene.overlay.add(this.group);

    if (this.planar && !scene.shipsDepthTested) {
      // Screen-sized ships are far larger than true scale at region zoom; extruded coast must not swallow them.
      const reset = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      reset.renderOrder = RENDER_ORDER.depthReset;
      reset.frustumCulled = false;
      reset.onBeforeRender = (renderer) => renderer.clearDepth();
      this.group.add(reset);
    }
    this.glyphBuffers = createInstanceBuffers(capacity);
    this.glyphMesh = this.mesh(instancedFrom(buildShipGeometry('other', 0), this.glyphBuffers), this.vesselMaterial, RENDER_ORDER.vessels, false);
    for (const key of SHIP_MODEL_KEYS) {
      const buffers = createInstanceBuffers(capacity);
      const mesh = this.mesh(instancedFrom(buildShipGeometry(key, 1), buffers), this.modelMaterial, RENDER_ORDER.vessels, true);
      mesh.visible = false;
      this.modelBatches.set(key, { buffers, mesh });
    }
    this.wakeBuffers = createInstanceBuffers(capacity);
    this.wakeMesh = this.mesh(instancedFrom(wakeGeometry(), this.wakeBuffers), this.wakeMaterial, RENDER_ORDER.wakes, true);
    this.wakeMesh.visible = false;
    if (this.v3Lod) {
      this.dotMaterial = variantWithBeam(this.vesselMaterial, 1);
      this.dotBuffers = createInstanceBuffers(capacity);
      this.dotMesh = this.mesh(instancedFrom(shipDotGeometry(), this.dotBuffers), this.dotMaterial, RENDER_ORDER.vessels, false);
      this.glyphMesh.visible = false;
      this.wakeMesh.visible = true;
      for (const b of this.modelBatches.values()) b.mesh.visible = true;
      for (const key of SHIP_MODEL_KEYS) this.iconBatch(key);
    }
    this.selectionMesh = this.mesh(instancedFrom(ringGeometry(0.4, 0.5), this.selectionBuffers), this.ringMaterial, RENDER_ORDER.rings, false);
    this.incidentBuffers = createInstanceBuffers(128);
    this.incidentMesh = this.mesh(instancedFrom(ringGeometry(0.44, 0.5, 3), this.incidentBuffers), this.ringMaterial, RENDER_ORDER.rings, false);
    this.portBuffers = createInstanceBuffers(256);
    this.portMesh = this.mesh(instancedFrom(portGeometry(), this.portBuffers), this.portMaterial, RENDER_ORDER.ports, false);

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = OVERLAY_W;
    this.overlayCanvas.height = OVERLAY_H;
    this.hatch = document.createElement('canvas');
    this.hatch.width = 12;
    this.hatch.height = 12;
    const hc = this.hatch.getContext('2d')!;
    hc.strokeStyle = 'rgba(255,255,255,0.55)';
    hc.lineWidth = 1.5;
    hc.beginPath();
    hc.moveTo(0, 12);
    hc.lineTo(12, 0);
    hc.stroke();
  }

  private mesh(g: THREE.BufferGeometry, m: THREE.Material, order: number, depth: boolean): THREE.Mesh {
    const mesh = new THREE.Mesh(g, depth ? m : this.flatVariant(m as THREE.ShaderMaterial));
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.group.add(mesh);
    return mesh;
  }

  private flatVariants = new Map<THREE.ShaderMaterial, THREE.ShaderMaterial>();

  /** Flat glyphs skip the depth test (hemisphere culling happens in the shader) so coplanar markers never z-fight. */
  private flatVariant(m: THREE.ShaderMaterial): THREE.ShaderMaterial {
    let v = this.flatVariants.get(m);
    if (!v) {
      v = m.clone();
      v.uniforms = m.uniforms;
      v.depthTest = false;
      v.depthWrite = false;
      this.flatVariants.set(m, v);
    }
    return v;
  }

  get currentLod(): VesselDetail {
    return this.lod;
  }

  get markerPx(): number {
    return this.px;
  }

  onLodChange(fn: (lod: VesselDetail) => void): () => void {
    this.lodListeners.add(fn);
    return () => this.lodListeners.delete(fn);
  }

  /** Per-frame: pixel scale, LOD with hysteresis, fat-line resolution. Cheap; no buffer writes unless LOD changes. */
  update() {
    const px = markerPxForAltitude(this.scene.markerAltitude());
    const pxToWorld = this.scene.pxToWorld;
    this.px = px;
    for (const m of [this.vesselMaterial, this.ringMaterial]) {
      m.uniforms.uPx.value = px;
      m.uniforms.uPxToWorld.value = pxToWorld;
    }
    this.portMaterial.uniforms.uPx.value = Math.min(18, Math.max(8, px * 0.62));
    this.portMaterial.uniforms.uPxToWorld.value = pxToWorld;
    const lod = nextLod(this.lod, px);
    if (lod !== this.lod) {
      this.lod = lod;
      this.applyLodVisibility();
      for (const fn of this.lodListeners) fn(lod);
    } else if (lod >= 1 || this.v3Lod) {
      const now = performance.now();
      if (now - this.cullCheckedAt >= CULL_INTERVAL_MS) {
        this.cullCheckedAt = now;
        if (this.onScreenChanged() || (this.v3Lod && this.bandsChanged())) this.writeVessels();
      }
    }
    const { width, height } = this.scene.viewport;
    if (width !== this.resolution.x || height !== this.resolution.y) {
      this.resolution.set(width, height);
      for (const m of this.lineMaterials) m.resolution.copy(this.resolution);
    }
  }

  /** Starts compiling every ship program now (in parallel where supported) so the first LOD switch cannot stall a flight. */
  warmUp(): void {
    let root: THREE.Object3D = this.glyphMesh;
    while (root.parent) root = root.parent;
    if (!(root as THREE.Scene).isScene || typeof this.scene.renderer.compileAsync !== 'function') return;
    const shown: THREE.Object3D[] = [this.glyphMesh, this.wakeMesh, ...(this.dotMesh ? [this.dotMesh] : []), ...[...this.modelBatches.values(), ...this.iconBatches.values()].map((b) => b.mesh)];
    for (let o = this.glyphMesh.parent; o; o = o.parent) shown.push(o);
    const was = shown.map((o) => o.visible);
    for (const o of shown) o.visible = true;
    void this.scene.renderer.compileAsync(root, this.scene.camera).catch(() => undefined);
    shown.forEach((o, i) => (o.visible = was[i]!));
  }

  private applyLodVisibility() {
    if (this.v3Lod) {
      this.writeVessels();
      return;
    }
    this.glyphMesh.visible = this.lod === 0;
    for (const b of this.modelBatches.values()) b.mesh.visible = this.lod >= 1;
    for (const b of this.detailBatches.values()) b.mesh.visible = this.lod === 2;
    this.wakeMesh.visible = this.lod >= 1;
    // Which ship uses the detailed model depends on the LOD.
    this.writeVessels();
  }

  /**
   * Close-model batch for a model, built on first use. V2: the selected ship's inspection model (library LOD3, which
   * V2 called LOD2). V3: the detailed band's medium model (LOD2), up to the detailed cap.
   */
  private detailBatch(key: ShipModelKey): ModelBatch {
    let b = this.detailBatches.get(key);
    if (!b) {
      const buffers = createInstanceBuffers(this.v3Lod ? BAND_CAPS.detailed : DETAIL_CAPACITY);
      const mesh = this.mesh(instancedFrom(buildShipGeometry(key, this.v3Lod ? 2 : 3), buffers), this.detailMaterial, RENDER_ORDER.vessels, true);
      mesh.visible = this.v3Lod || this.lod === 2;
      b = { buffers, mesh };
      this.detailBatches.set(key, b);
    }
    return b;
  }

  /** V3 inspection band (> 160 px): library LOD3, at most `BAND_CAPS.inspection` ships. */
  private inspectBatch(key: ShipModelKey): ModelBatch {
    let b = this.inspectBatches.get(key);
    if (!b) {
      const buffers = createInstanceBuffers(BAND_CAPS.inspection);
      const mesh = this.mesh(instancedFrom(buildShipGeometry(key, 3), buffers), this.detailMaterial, RENDER_ORDER.vessels, true);
      b = { buffers, mesh };
      this.inspectBatches.set(key, b);
    }
    return b;
  }

  /** V3 icon band (4–16 px): flat oriented type icons, drawn without depth like the V2 glyph. */
  private iconBatch(key: ShipModelKey): ModelBatch {
    let b = this.iconBatches.get(key);
    if (!b) {
      const buffers = createInstanceBuffers(this.capacity);
      const mesh = this.mesh(instancedFrom(buildShipIcon(key), buffers), this.vesselMaterial, RENDER_ORDER.vessels, false);
      b = { buffers, mesh };
      this.iconBatches.set(key, b);
    }
    return b;
  }

  /**
   * Displayed hull length in CSS px: the screen-sized marker (`size × px`) or the true length at the ship's depth,
   * whichever is larger (the marker shader draws the same maximum).
   */
  private projectedPx(pt: GeoPoint, lengthM: number, size: number): number {
    const [x, y, z] = this.scene.markerCenter(pt.lat, pt.lon);
    const v = this.tmp.set(x, y, z);
    if (!this.planar) v.normalize().multiplyScalar(this.vesselMaterial.uniforms.uRadius.value as number);
    v.applyMatrix4(this.group.matrixWorld).applyMatrix4(this.scene.camera.matrixWorldInverse);
    const depth = Math.max(-v.z, 1e-9);
    const truePx = (lengthM * this.metre) / (depth * this.scene.pxToWorld);
    return Math.max(size * this.px, truePx);
  }

  private sizeOf(m: VesselMarker): number {
    const base = m.fleet === 'own' ? Math.min(1.2, Math.max(0.85, 0.85 + (m.lengthM - 180) / 500)) : 0.72;
    return base * (this.isPinned(m.vesselId) ? 1.45 : m.vesselId === this.hoverId ? 1.22 : 1);
  }

  /** True when a drawn ship would now pick a different band (zoom or camera move since the last write). */
  private bandsChanged(): boolean {
    for (const m of this.drawn) {
      const pinned = this.isPinned(m.vesselId);
      if (!pinned && !this.onScreen.has(m.vesselId)) continue;
      const prev = this.rawBands.get(m.vesselId);
      const pt = this.live?.id === m.vesselId ? this.live.point : m.point;
      if (nextBand(prev, this.projectedPx(pt, m.lengthM, this.sizeOf(m))) !== prev) return true;
    }
    return false;
  }

  setLayers(layers: OverlayLayers) {
    const weatherOrTraffic = layers.weather !== this.layers.weather || layers.traffic !== this.layers.traffic;
    this.layers = { ...layers };
    this.writeVessels();
    this.writePorts();
    this.styleRoutes();
    for (const l of this.hazardLines) l.visible = layers.weather;
    if (weatherOrTraffic) this.drawSurface();
  }

  /** `scenarioMs` drives deterministic anchor swing; omit to keep the last time. */
  setVessels(markers: VesselMarker[], scenarioMs?: number) {
    if (scenarioMs !== undefined) this.sceneTimeMs = scenarioMs;
    this.markers = markers;
    this.markerById = new Map(markers.map((m) => [m.vesselId, m]));
    this.writeVessels();
  }

  setClustered(ids: ReadonlySet<string>) {
    this.clustered = ids;
    this.writeVessels();
  }

  setFocus(focus: MapFocus) {
    const hazardsChanged = focus.hazardIds.join() !== this.focus.hazardIds.join();
    this.focus = focus;
    if (hazardsChanged) this.setHazards(this.hazards);
    this.writeVessels();
    this.writePorts();
    this.styleRoutes();
  }

  setHover(vesselId: string | null, portId: string | null = null) {
    if (vesselId === this.hoverId && portId === this.hoverPortId) return;
    this.hoverId = vesselId;
    this.hoverPortId = portId;
    this.writeVessels();
    this.writePorts();
  }

  private isPinned(id: string) {
    return this.focus.vesselIds.includes(id);
  }

  private vesselVisible(m: VesselMarker): boolean {
    if (this.isPinned(m.vesselId)) return true;
    if (this.clustered.has(m.vesselId)) return false;
    return m.fleet === 'own' ? this.layers.fleet : this.layers.ambient;
  }

  private isOnScreen(m: VesselMarker): boolean {
    const p = this.scene.project(m.point.lat, m.point.lon);
    const { width, height } = this.scene.viewport;
    const mx = width * CULL_MARGIN;
    const my = height * CULL_MARGIN;
    return p.visible && p.x >= -mx && p.x <= width + mx && p.y >= -my && p.y <= height + my;
  }

  private onScreenChanged(): boolean {
    let n = 0;
    for (const m of this.drawn) {
      if (!this.isPinned(m.vesselId) && !this.isOnScreen(m)) continue;
      if (!this.onScreen.has(m.vesselId)) return true;
      n++;
    }
    return n !== this.onScreen.size;
  }

  private writeVessels() {
    const order = this.markers.filter((m) => this.vesselVisible(m));
    // Draw order = paint order for flat glyphs: exceptions above normal traffic, hover and selection last.
    const rank = (m: VesselMarker) => (this.isPinned(m.vesselId) ? 10 : m.vesselId === this.hoverId ? 9 : m.tone === 'incident' ? 4 : m.tone === 'atRisk' ? 3 : m.tone === 'delayed' ? 2 : m.fleet === 'own' ? 1 : 0);
    order.sort((a, b) => rank(a) - rank(b));
    this.drawn = order;
    if (this.v3Lod) {
      this.writeVesselsV3(order);
      return;
    }
    const counts = new Map<ShipModelKey, number>(SHIP_MODEL_KEYS.map((c) => [c, 0]));
    const detailCounts = new Map<ShipModelKey, number>();
    let wakes = 0;
    this.poses.clear();
    this.onScreen.clear();
    this.cullCheckedAt = performance.now();
    const col = new THREE.Color();
    this.liveSlots = [];
    order.forEach((m, i) => {
      const live = this.live?.id === m.vesselId ? this.live : null;
      const pt = live?.point ?? m.point;
      const [x, y, z] = this.scene.markerCenter(pt.lat, pt.lon);
      const pinned = this.isPinned(m.vesselId);
      const hovered = m.vesselId === this.hoverId;
      const base = m.fleet === 'own' ? Math.min(1.2, Math.max(0.85, 0.85 + (m.lengthM - 180) / 500)) : 0.72;
      const size = base * (pinned ? 1.45 : hovered ? 1.22 : 1);
      col.copy(toneColor(m));
      if (m.stale) col.lerp(MC.stale, 0.6);
      if (hovered || pinned) col.lerp(new THREE.Color('#ffffff'), 0.18);
      const model = modelKeyOf(m.vesselType);
      const state = motionStateOf(m.navStatus, m.sogKn);
      const headingDeg = displayHeadingDeg({ vesselId: m.vesselId, cogDeg: live?.cogDeg ?? m.cogDeg, state, berthHeadingDeg: m.berthHeadingDeg }, this.sceneTimeMs);
      const heading = headingDeg * DEG + (this.planar ? this.scene.headingOffset(pt.lat, pt.lon) : 0);
      const wake = wakeLength(state, m.sogKn);
      const write = (b: InstanceBuffers, k: number) => {
        b.center.setXYZ(k, x, y, z);
        b.heading.setX(k, heading);
        b.color.setXYZ(k, col.r, col.g, col.b);
        b.size.setX(k, size);
        b.length.setX(k, m.lengthM);
        b.wake.setX(k, wake);
      };
      const slot = (b: InstanceBuffers, mesh: THREE.Mesh, k: number) => {
        if (live) this.liveSlots.push({ b, mesh, k, ring: false });
      };
      write(this.glyphBuffers, i);
      slot(this.glyphBuffers, this.glyphMesh, i);
      const onScreen = this.lod >= 1 && (pinned || this.isOnScreen(m));
      if (onScreen) this.onScreen.add(m.vesselId);
      const detailed = onScreen && pinned && this.lod === 2 && (detailCounts.get(model) ?? 0) < DETAIL_CAPACITY;
      if (detailed) {
        const k = detailCounts.get(model) ?? 0;
        const batch = this.detailBatch(model);
        write(batch.buffers, k);
        slot(batch.buffers, batch.mesh, k);
        detailCounts.set(model, k + 1);
      } else if (onScreen) {
        const k = counts.get(model)!;
        const batch = this.modelBatches.get(model)!;
        write(batch.buffers, k);
        slot(batch.buffers, batch.mesh, k);
        counts.set(model, k + 1);
      }
      if (onScreen && wake > 0) {
        slot(this.wakeBuffers, this.wakeMesh, wakes);
        write(this.wakeBuffers, wakes++);
      }
      this.poses.set(m.vesselId, { model, state, headingDeg, wake, detail: !onScreen ? 0 : detailed ? 2 : 1 });
    });
    this.commit(this.glyphBuffers, this.glyphMesh, order.length);
    for (const [key, b] of this.modelBatches) this.commit(b.buffers, b.mesh, counts.get(key)!);
    for (const [key, b] of this.detailBatches) this.commit(b.buffers, b.mesh, detailCounts.get(key) ?? 0);
    this.commit(this.wakeBuffers, this.wakeMesh, wakes);
    this.writeRings();
  }

  /**
   * V3: each on-screen (or selected) ship takes the band of its projected length with hysteresis; the selection sits
   * one band up; close-model caps demote the smallest overflow. Off-screen ships cost nothing. Wakes only from the
   * low-poly band up, and only underway (moored and anchored ships never draw one).
   */
  private writeVesselsV3(order: VesselMarker[]) {
    this.poses.clear();
    this.onScreen.clear();
    this.cullCheckedAt = performance.now();
    this.liveSlots = [];
    const cands: BandCandidate[] = [];
    const px = new Map<string, number>();
    for (const m of order) {
      const pinned = this.isPinned(m.vesselId);
      if (!pinned && !this.isOnScreen(m)) continue;
      this.onScreen.add(m.vesselId);
      const pt = this.live?.id === m.vesselId ? this.live.point : m.point;
      const p = this.projectedPx(pt, m.lengthM, this.sizeOf(m));
      const raw = nextBand(this.rawBands.get(m.vesselId), p);
      this.rawBands.set(m.vesselId, raw);
      px.set(m.vesselId, p);
      cands.push({ id: m.vesselId, band: pinned ? selectedBand(raw) : raw, px: p, pinned });
    }
    const bands = allocateBands(cands);
    let dots = 0;
    let wakes = 0;
    const counts = new Map<ModelBatch, number>();
    const col = new THREE.Color();
    for (const m of order) {
      const band = bands.get(m.vesselId);
      if (band === undefined) continue;
      const live = this.live?.id === m.vesselId ? this.live : null;
      const pt = live?.point ?? m.point;
      const [x, y, z] = this.scene.markerCenter(pt.lat, pt.lon);
      const pinned = this.isPinned(m.vesselId);
      const hovered = m.vesselId === this.hoverId;
      col.copy(toneColor(m));
      if (m.stale) col.lerp(MC.stale, 0.6);
      if (hovered || pinned) col.lerp(new THREE.Color('#ffffff'), 0.18);
      const model = modelKeyOf(m.vesselType);
      const state = motionStateOf(m.navStatus, m.sogKn);
      const headingDeg = displayHeadingDeg({ vesselId: m.vesselId, cogDeg: live?.cogDeg ?? m.cogDeg, state, berthHeadingDeg: m.berthHeadingDeg }, this.sceneTimeMs);
      const heading = headingDeg * DEG + (this.planar ? this.scene.headingOffset(pt.lat, pt.lon) : 0);
      const wake = band >= 2 ? wakeLength(state, m.sogKn) : 0;
      const size = this.sizeOf(m);
      const write = (b: InstanceBuffers, mesh: THREE.Mesh, k: number) => {
        b.center.setXYZ(k, x, y, z);
        b.heading.setX(k, heading);
        b.color.setXYZ(k, col.r, col.g, col.b);
        b.size.setX(k, size);
        b.length.setX(k, m.lengthM);
        b.wake.setX(k, wake);
        if (live) this.liveSlots.push({ b, mesh, k, ring: false });
      };
      if (band === 0) write(this.dotBuffers!, this.dotMesh!, dots++);
      else {
        const batch = band === 1 ? this.iconBatch(model) : band === 2 ? this.modelBatches.get(model)! : band === 3 ? this.detailBatch(model) : this.inspectBatch(model);
        const k = counts.get(batch) ?? 0;
        write(batch.buffers, batch.mesh, k);
        counts.set(batch, k + 1);
      }
      if (wake > 0) write(this.wakeBuffers, this.wakeMesh, wakes++);
      this.poses.set(m.vesselId, { model, state, headingDeg, wake, detail: band <= 1 ? 0 : band === 2 ? 1 : 2, band, px: Math.round(px.get(m.vesselId)! * 10) / 10 });
    }
    this.commit(this.glyphBuffers, this.glyphMesh, 0);
    this.commit(this.dotBuffers!, this.dotMesh!, dots);
    for (const b of [...this.iconBatches.values(), ...this.modelBatches.values(), ...this.detailBatches.values(), ...this.inspectBatches.values()]) this.commit(b.buffers, b.mesh, counts.get(b) ?? 0);
    this.commit(this.wakeBuffers, this.wakeMesh, wakes);
    this.writeRings();
  }

  /** Ship meshes that draw this frame (one instanced call each) and their triangles. */
  private shipBudget(): { drawCalls: number; triangles: number } {
    const meshes = [this.glyphMesh, this.wakeMesh, ...(this.dotMesh ? [this.dotMesh] : []), ...[...this.iconBatches.values(), ...this.modelBatches.values(), ...this.detailBatches.values(), ...this.inspectBatches.values()].map((b) => b.mesh)];
    let drawCalls = 0;
    let triangles = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry as THREE.InstancedBufferGeometry;
      if (!mesh.visible || g.instanceCount <= 0) continue;
      drawCalls++;
      triangles += triangleCount(g) * g.instanceCount;
    }
    return { drawCalls, triangles };
  }

  private commit(b: InstanceBuffers, mesh: THREE.Mesh, count: number) {
    for (const a of [b.center, b.heading, b.color, b.size, b.length, b.wake]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, count) * a.itemSize);
      a.needsUpdate = true;
    }
    (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count;
    this.scene.invalidate();
  }

  private writeRings() {
    this.liveSlots = this.liveSlots.filter((s) => !s.ring);
    let n = 0;
    const put = (b: InstanceBuffers, k: number, p: GeoPoint, color: THREE.Color, size: number, lengthM = 0) => {
      const [x, y, z] = this.scene.markerCenter(p.lat, p.lon);
      b.center.setXYZ(k, x, y, z);
      b.heading.setX(k, 0);
      b.color.setXYZ(k, color.r, color.g, color.b);
      b.size.setX(k, size);
      // At true scale the ring keeps enclosing the hull.
      b.length.setX(k, lengthM * 1.6);
    };
    for (const id of this.focus.vesselIds) {
      const m = this.markerById.get(id);
      if (!m || n >= 16) continue;
      if (this.live?.id === id) this.liveSlots.push({ b: this.selectionBuffers, mesh: this.selectionMesh, k: n, ring: true });
      put(this.selectionBuffers, n++, this.pointOf(m), MC.selected, 2.1, m.lengthM);
    }
    if (this.layers.routes) {
      for (const id of this.focus.portIds) {
        const p = this.ports.find((x) => x.portId === id);
        if (p && n < 16) put(this.selectionBuffers, n++, p.point, MC.routeFocus, 1.5);
      }
    }
    this.commit(this.selectionBuffers, this.selectionMesh, n);
    let k = 0;
    if (this.layers.incidents) {
      for (const m of this.drawn) {
        if (m.tone !== 'incident' || k >= 128) continue;
        if (this.live?.id === m.vesselId) this.liveSlots.push({ b: this.incidentBuffers, mesh: this.incidentMesh, k, ring: true });
        put(this.incidentBuffers, k++, this.pointOf(m), MC.incident, this.isPinned(m.vesselId) ? 2.4 : 1.35, m.lengthM * (this.isPinned(m.vesselId) ? 1.15 : 1));
      }
    }
    this.commit(this.incidentBuffers, this.incidentMesh, k);
  }

  setPorts(ports: PortMarker[]) {
    this.ports = ports;
    this.writePorts();
  }

  private writePorts() {
    const focusPorts = new Set(this.focus.portIds);
    const list = this.layers.ports ? this.ports : this.ports.filter((p) => focusPorts.has(p.portId));
    this.drawnPorts = list;
    const toneColors = { healthy: MC.portHealthy, warning: MC.portWarning, critical: MC.portCritical, unknown: MC.portUnknown };
    list.forEach((p, i) => {
      const [x, y, z] = this.scene.markerCenter(p.point.lat, p.point.lon);
      this.portBuffers.center.setXYZ(i, x, y, z);
      this.portBuffers.heading.setX(i, 0);
      const c = toneColors[p.tone];
      this.portBuffers.color.setXYZ(i, c.r, c.g, c.b);
      this.portBuffers.size.setX(i, focusPorts.has(p.portId) ? 1.35 : p.portId === this.hoverPortId ? 1.25 : 1);
    });
    this.commit(this.portBuffers, this.portMesh, list.length);
    this.writeRings();
  }

  private lineMaterial(opts: { color: THREE.Color; width: number; opacity: number; dashed?: boolean; dash?: number }): LineMaterial {
    const m = new LineMaterial({
      color: opts.color.getHex(),
      linewidth: opts.width,
      transparent: true,
      opacity: opts.opacity,
      depthWrite: false,
      // Planar scenes extrude land above the water: corridors and hazards stay readable over it.
      depthTest: !this.planar,
      dashed: !!opts.dashed,
      dashSize: (opts.dash ?? 0.02) * this.scene.globeUnitScale,
      gapSize: (opts.dash ?? 0.02) * 0.8 * this.scene.globeUnitScale,
      worldUnits: false,
    });
    m.resolution.copy(this.resolution);
    this.lineMaterials.add(m);
    return m;
  }

  private disposeLine(l: Line2) {
    this.group.remove(l);
    l.geometry.dispose();
    const m = l.material as LineMaterial;
    this.lineMaterials.delete(m);
    m.dispose();
  }

  setRoutes(routes: RouteLine[]) {
    for (const r of this.routes.values()) this.disposeLine(r.line);
    this.routes.clear();
    for (const data of routes) {
      const g = new LineGeometry();
      g.setPositions(linePositions(this.scene, data.points));
      const material = this.lineMaterial({ color: MC.route, width: 1.25, opacity: 0.5, dashed: data.isScenarioAlternative, dash: 0.025 });
      const line = new Line2(g, material);
      line.computeLineDistances();
      line.renderOrder = RENDER_ORDER.routes;
      line.frustumCulled = false;
      this.group.add(line);
      this.routes.set(data.routeId, { data, line, material });
    }
    this.styleRoutes();
  }

  private styleRoutes() {
    const focused = new Set(this.focus.routeIds);
    const anyFocus = focused.size > 0;
    for (const { data, line, material } of this.routes.values()) {
      const isFocus = focused.has(data.routeId);
      line.visible = isFocus || (this.layers.routes && !data.isScenarioAlternative);
      material.color.copy(isFocus ? MC.routeFocus : MC.route);
      material.linewidth = isFocus ? 3 : 1.25;
      material.opacity = isFocus ? 1 : anyFocus ? 0.2 : 0.48;
      line.renderOrder = isFocus ? RENDER_ORDER.routes + 1 : RENDER_ORDER.routes;
    }
    for (const t of this.trackLines) t.line.visible = this.layers.routes || anyFocus;
    this.scene.invalidate();
  }

  /**
   * Visited path of the focused vessel up to the simulation time: observed reports solid, modelled keyframes finely
   * dotted, and reporting gaps longer than the interpolation limit as a long-dashed "position unverified" hint.
   */
  setTrack(runs: TrackRun[] | null) {
    for (const t of this.trackLines) this.disposeLine(t.line);
    this.trackLines = [];
    for (const r of runs ?? []) {
      if (r.points.length < 2) continue;
      const g = new LineGeometry();
      g.setPositions(linePositions(this.scene, r.points, LINE_RADIUS * 1.0004));
      const style =
        r.kind === 'observed'
          ? { color: MC.track, width: 2, opacity: 0.9 }
          : r.kind === 'modelled'
            ? { color: MC.track, width: 1.8, opacity: 0.75, dashed: true, dash: 0.006 }
            : { color: MC.unverified, width: 1.6, opacity: 0.85, dashed: true, dash: 0.03 };
      const line = new Line2(g, this.lineMaterial(style));
      line.computeLineDistances();
      line.renderOrder = RENDER_ORDER.track;
      line.frustumCulled = false;
      this.group.add(line);
      this.trackLines.push({ kind: r.kind, line });
    }
    this.styleRoutes();
  }

  setHazards(hazards: HazardShape[]) {
    for (const l of this.hazardLines) this.disposeLine(l);
    this.hazardLines = [];
    this.hazards = hazards;
    const focused = new Set(this.focus.hazardIds);
    for (const h of hazards) {
      const g = new LineGeometry();
      g.setPositions(linePositions(this.scene, h.outline, LINE_RADIUS * 0.9998));
      const color = h.severity === 'severe' ? MC.hazardSevere : h.severity === 'high' ? MC.hazardHigh : MC.hazardModerate;
      const line = new Line2(g, this.lineMaterial({ color, width: focused.has(h.hazardId) ? 2.6 : 1.4, opacity: h.phase === 'active' ? 0.95 : 0.7, dashed: h.phase !== 'active', dash: 0.02 }));
      line.computeLineDistances();
      line.renderOrder = RENDER_ORDER.hazards;
      line.frustumCulled = false;
      line.visible = this.layers.weather;
      this.group.add(line);
      this.hazardLines.push(line);
    }
    this.drawSurface();
  }

  setDensity(cells: DensityCell[]) {
    this.density = cells;
    if (this.layers.traffic) this.drawSurface();
  }

  /** Repaint the equirectangular surface overlay (density cells under hazard fills). */
  private drawSurface() {
    const ctx = this.overlayCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, OVERLAY_W, OVERLAY_H);
    const x = (lon: number) => ((lon + 180) / 360) * OVERLAY_W;
    const y = (lat: number) => ((90 - lat) / 180) * OVERLAY_H;
    let painted = false;
    if (this.layers.traffic && this.density.length) {
      const max = Math.max(...this.density.map((c) => c.count));
      const d = MC.density;
      for (const c of this.density) {
        const a = 0.12 + 0.5 * Math.sqrt(c.count / max);
        ctx.fillStyle = `rgba(${Math.round(d.r * 255)},${Math.round(d.g * 255)},${Math.round(d.b * 255)},${a.toFixed(3)})`;
        ctx.fillRect(x(c.west), y(c.south + c.sizeDeg), x(c.west + c.sizeDeg) - x(c.west), y(c.south) - y(c.south + c.sizeDeg));
      }
      painted = true;
    }
    if (this.layers.weather) {
      const pattern = ctx.createPattern(this.hatch, 'repeat');
      for (const h of this.hazards) {
        if (h.phase !== 'active') continue;
        const color = h.severity === 'severe' ? MC.hazardSevere : h.severity === 'high' ? MC.hazardHigh : MC.hazardModerate;
        const hex = `#${color.getHexString()}`;
        const lons = h.polygon.map((p) => p.lon);
        const wraps = Math.max(...lons) - Math.min(...lons) > 180;
        const draw = (shift: number) => {
          ctx.beginPath();
          h.polygon.forEach((p, i) => {
            const lon = wraps && p.lon < 0 ? p.lon + 360 : p.lon;
            const px = x(lon) + shift;
            if (i) ctx.lineTo(px, y(p.lat));
            else ctx.moveTo(px, y(p.lat));
          });
          ctx.closePath();
          ctx.globalAlpha = h.severity === 'moderate' ? 0.14 : h.severity === 'high' ? 0.2 : 0.24;
          ctx.fillStyle = hex;
          ctx.fill();
          if (pattern && h.severity !== 'moderate') {
            ctx.globalAlpha = h.severity === 'severe' ? 0.3 : 0.16;
            ctx.fillStyle = pattern;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        };
        draw(0);
        if (wraps) draw(-OVERLAY_W);
        painted = true;
      }
    }
    this.scene.setOverlayCanvas(painted ? this.overlayCanvas : null);
  }

  /** Screen-space hit test in priority order: vessels, then ports, then corridors. */
  hitTest(x: number, y: number): MapHit | null {
    let best: MapHit | null = null;
    let bestD = Infinity;
    const vesselR = Math.max(8, this.px * 0.62);
    const coreR = Math.max(5, this.px * 0.35);
    let top: MapHit | null = null;
    let stacked = 0;
    // `drawn` is in paint order, so walking it backwards meets the glyph the user actually sees first.
    for (let i = this.drawn.length - 1; i >= 0; i--) {
      const m = this.drawn[i]!;
      const mp = this.pointOf(m);
      const p = this.scene.project(mp.lat, mp.lon);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      const scale = this.isPinned(m.vesselId) ? 1.4 : 1;
      if (d <= coreR * scale) {
        stacked++;
        top ??= { kind: 'vessel', id: m.vesselId, screenX: p.x, screenY: p.y };
      }
      if (d <= vesselR * scale && d < bestD) {
        bestD = d;
        best = { kind: 'vessel', id: m.vesselId, screenX: p.x, screenY: p.y };
      }
    }
    if (top) return { ...top, stacked };
    if (best) return { ...best, stacked: 1 };
    const portR = Math.max(8, (this.portMaterial.uniforms.uPx.value as number) * 0.7);
    for (const pm of this.drawnPorts) {
      const p = this.scene.project(pm.point.lat, pm.point.lon);
      if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= portR && d < bestD) {
        bestD = d;
        best = { kind: 'port', id: pm.portId, screenX: p.x, screenY: p.y };
      }
    }
    if (best) return best;
    for (const { data, line } of this.routes.values()) {
      if (!line.visible) continue;
      let prev: { x: number; y: number; visible: boolean } | null = null;
      for (const pt of data.points) {
        const p = this.scene.project(pt.lat, pt.lon, LINE_RADIUS);
        if (prev && prev.visible && p.visible) {
          const d = segmentDistance(x, y, prev.x, prev.y, p.x, p.y);
          if (d <= 5 && d < bestD) {
            bestD = d;
            best = { kind: 'route', id: data.routeId, screenX: x, screenY: y };
          }
        }
        prev = p;
      }
    }
    return best;
  }

  /** Screen position of a vessel (for tooltips and focus checks). */
  vesselScreen(id: string) {
    const m = this.markerById.get(id);
    if (!m) return null;
    const p = this.pointOf(m);
    return this.scene.project(p.lat, p.lon);
  }

  private pointOf(m: VesselMarker): GeoPoint {
    return this.live?.id === m.vesselId ? this.live.point : m.point;
  }

  /**
   * Per-frame position of one vessel (the followed one) between clock commits, from the same track engine at the
   * frame's scenario time. Only its own instance slots are rewritten; `null` returns it to the committed marker.
   */
  setLivePose(id: string | null, point?: GeoPoint, cogDeg: number | null = null) {
    if (!id || !point) {
      if (this.live) {
        this.live = null;
        this.writeVessels();
      }
      return;
    }
    const retarget = this.live?.id !== id;
    this.live = { id, point, cogDeg };
    if (retarget || !this.liveSlots.length) {
      this.writeVessels();
      return;
    }
    const m = this.markerById.get(id);
    if (!m) return;
    const [x, y, z] = this.scene.markerCenter(point.lat, point.lon);
    const state = motionStateOf(m.navStatus, m.sogKn);
    const headingDeg = displayHeadingDeg({ vesselId: id, cogDeg: cogDeg ?? m.cogDeg, state, berthHeadingDeg: m.berthHeadingDeg }, this.sceneTimeMs);
    const heading = headingDeg * DEG + (this.planar ? this.scene.headingOffset(point.lat, point.lon) : 0);
    for (const s of this.liveSlots) {
      s.b.center.setXYZ(s.k, x, y, z);
      if (!s.ring) s.b.heading.setX(s.k, heading);
      for (const a of s.ring ? [s.b.center] : [s.b.center, s.b.heading]) {
        a.clearUpdateRanges();
        a.addUpdateRange(s.k * a.itemSize, a.itemSize);
        a.needsUpdate = true;
      }
    }
    const pose = this.poses.get(id);
    if (pose) this.poses.set(id, { ...pose, headingDeg });
    this.scene.invalidate();
  }

  marker(id: string): VesselMarker | undefined {
    return this.markerById.get(id);
  }

  /** How a drawn vessel is rendered: model, motion state, displayed heading, wake length and LOD tier. */
  vesselPose(id: string): VesselPose | null {
    return this.poses.get(id) ?? null;
  }

  stats() {
    const highlighted = [...this.routes.values()].filter((r) => r.line.visible && r.material.color.equals(MC.routeFocus)).map((r) => r.data.routeId);
    return {
      vessels: this.markers.length,
      drawnVessels: this.drawn.length,
      clustered: this.clustered.size,
      ports: this.drawnPorts.length,
      routes: this.routes.size,
      highlightedRoutes: highlighted,
      focusVessels: [...this.focus.vesselIds],
      trackPoints: this.trackLines.reduce((n, t) => n + ((t.line.geometry as LineGeometry).attributes.instanceStart?.count ?? 0), 0) + (this.trackLines.length ? 1 : 0),
      trackRuns: this.trackLines.map((t) => t.kind),
      hazards: this.hazards.length,
      lod: this.lod,
      wakes: (this.wakeMesh.geometry as THREE.InstancedBufferGeometry).instanceCount,
      shipDrawCalls: this.shipBudget().drawCalls,
      shipTriangles: this.shipBudget().triangles,
      detailVessels: [...this.poses].filter(([, p]) => p.detail === 2).map(([id]) => id),
      modelVessels: this.v3Lod ? [...this.poses.values()].filter((p) => (p.band ?? 0) >= 2).length : this.lod >= 1 ? this.onScreen.size : 0,
      px: Math.round(this.px * 10) / 10,
      bandMode: this.v3Lod ? ('v3' as const) : ('v2' as const),
      bands: Object.fromEntries(LOD_BANDS.map((name, i) => [name, [...this.poses.values()].filter((p) => p.band === i).length])) as Record<(typeof LOD_BANDS)[number], number>,
    };
  }

  dispose() {
    for (const r of this.routes.values()) this.disposeLine(r.line);
    for (const t of this.trackLines) this.disposeLine(t.line);
    for (const l of this.hazardLines) this.disposeLine(l);
    this.scene.setOverlayCanvas(null);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry instanceof THREE.InstancedBufferGeometry) mesh.geometry.dispose();
    });
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh.geometry instanceof THREE.InstancedBufferGeometry) && mesh.renderOrder === RENDER_ORDER.depthReset) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    for (const m of [this.vesselMaterial, this.modelMaterial, this.detailMaterial, this.wakeMaterial, this.portMaterial, this.ringMaterial, ...(this.dotMaterial ? [this.dotMaterial] : []), ...this.flatVariants.values()]) m.dispose();
    this.scene.overlay.remove(this.group);
    this.lodListeners.clear();
  }
}

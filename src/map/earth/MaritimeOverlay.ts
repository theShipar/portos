import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { sphericalPosition } from '@/core/geo';
import type { GeoPoint } from '@/core/types';
import { VESSEL_CLASSES, type DensityCell, type HazardShape, type MapFocus, type PortMarker, type RouteLine, type VesselClass, type VesselMarker } from '@/selectors/mapLayers';
import { markerColors as MC } from '../theme';
import { EARTH_RADIUS } from './camera';
import type { EarthScene } from './EarthScene';
import { markerPxForAltitude, nextLod } from './lod';
import { createInstanceBuffers, createMarkerMaterial, instancedFrom, type InstanceBuffers } from './markerShader';
import { buildVesselGeometry, portGeometry, ringGeometry, type VesselDetail } from './vesselGeometry';

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
const LINE_RADIUS = EARTH_RADIUS * 1.0025;
const OVERLAY_W = 2048;
const OVERLAY_H = 1024;

const RENDER_ORDER = { hazards: 4, routes: 5, track: 6, ports: 8, vessels: 10, rings: 12 } as const;

function toneColor(m: VesselMarker): THREE.Color {
  return MC[m.tone];
}

function linePositions(points: GeoPoint[], radius = LINE_RADIUS): number[] {
  const out: number[] = [];
  for (const p of points) out.push(...sphericalPosition(p.lat, p.lon, radius));
  return out;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface ClassBatch {
  buffers: InstanceBuffers;
  meshes: Record<1 | 2, THREE.Mesh>;
}

/**
 * Maritime layers on the Earth scene: instanced vessels (LOD0 arrows / LOD1 silhouettes / LOD2 models), port glyphs,
 * selection and incident rings, corridor lines, the focused voyage track, hazard outlines, and the surface overlay
 * texture for hazard fills and traffic density. Holds no domain logic: everything arrives as view models.
 */
export class MaritimeOverlay {
  readonly group = new THREE.Group();
  private readonly scene: EarthScene;
  private readonly vesselMaterial = createMarkerMaterial();
  private readonly portMaterial = createMarkerMaterial(EARTH_RADIUS * 1.0015);
  private readonly ringMaterial = createMarkerMaterial(EARTH_RADIUS * 1.002);
  private readonly lineMaterials = new Set<LineMaterial>();

  private readonly arrowBuffers: InstanceBuffers;
  private readonly arrowMesh: THREE.Mesh;
  private readonly classBatches = new Map<VesselClass, ClassBatch>();
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
  private trackLine: Line2 | null = null;
  private hazardLines: Line2[] = [];
  private hazards: HazardShape[] = [];
  private density: DensityCell[] = [];
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly hatch: HTMLCanvasElement;

  private layers: OverlayLayers = { fleet: true, ambient: true, ports: true, routes: true, weather: true, incidents: true, traffic: false };
  private focus: MapFocus = { vesselIds: [], routeIds: [], hazardIds: [], portIds: [], voyageId: null, point: null };
  private clustered: ReadonlySet<string> = new Set();
  private hoverId: string | null = null;
  private hoverPortId: string | null = null;
  private lod: VesselDetail = 0;
  private px = 8;
  private resolution = new THREE.Vector2(1, 1);
  private lodListeners = new Set<(lod: VesselDetail) => void>();

  constructor(scene: EarthScene, capacity: number) {
    this.scene = scene;
    this.group.name = 'maritime-overlay';
    scene.overlay.add(this.group);

    this.arrowBuffers = createInstanceBuffers(capacity);
    this.arrowMesh = this.mesh(instancedFrom(buildVesselGeometry('general', 0), this.arrowBuffers), this.vesselMaterial, RENDER_ORDER.vessels, false);
    for (const cls of VESSEL_CLASSES) {
      const buffers = createInstanceBuffers(capacity);
      const meshes = {
        1: this.mesh(instancedFrom(buildVesselGeometry(cls, 1), buffers), this.vesselMaterial, RENDER_ORDER.vessels, false),
        2: this.mesh(instancedFrom(buildVesselGeometry(cls, 2), buffers), this.vesselMaterial, RENDER_ORDER.vessels, true),
      };
      meshes[1].visible = false;
      meshes[2].visible = false;
      this.classBatches.set(cls, { buffers, meshes });
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
    const altitude = this.scene.camera.position.length() - EARTH_RADIUS;
    const px = markerPxForAltitude(altitude);
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
    }
    const { width, height } = this.scene.viewport;
    if (width !== this.resolution.x || height !== this.resolution.y) {
      this.resolution.set(width, height);
      for (const m of this.lineMaterials) m.resolution.copy(this.resolution);
    }
  }

  private applyLodVisibility() {
    this.arrowMesh.visible = this.lod === 0;
    for (const b of this.classBatches.values()) {
      b.meshes[1].visible = this.lod === 1;
      b.meshes[2].visible = this.lod === 2;
    }
    this.scene.invalidate();
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

  setVessels(markers: VesselMarker[]) {
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

  private writeVessels() {
    const order = this.markers.filter((m) => this.vesselVisible(m));
    // Draw order = paint order for flat glyphs: exceptions above normal traffic, hover and selection last.
    const rank = (m: VesselMarker) => (this.isPinned(m.vesselId) ? 10 : m.vesselId === this.hoverId ? 9 : m.tone === 'incident' ? 4 : m.tone === 'atRisk' ? 3 : m.tone === 'delayed' ? 2 : m.fleet === 'own' ? 1 : 0);
    order.sort((a, b) => rank(a) - rank(b));
    this.drawn = order;
    const counts = new Map<VesselClass, number>(VESSEL_CLASSES.map((c) => [c, 0]));
    const col = new THREE.Color();
    order.forEach((m, i) => {
      const [x, y, z] = sphericalPosition(m.point.lat, m.point.lon, 1);
      const pinned = this.isPinned(m.vesselId);
      const hovered = m.vesselId === this.hoverId;
      const base = m.fleet === 'own' ? Math.min(1.2, Math.max(0.85, 0.85 + (m.lengthM - 180) / 500)) : 0.72;
      const size = base * (pinned ? 1.45 : hovered ? 1.22 : 1);
      col.copy(toneColor(m));
      if (m.stale) col.lerp(MC.stale, 0.6);
      if (hovered || pinned) col.lerp(new THREE.Color('#ffffff'), 0.18);
      const heading = (m.cogDeg ?? 0) * DEG;
      const write = (b: InstanceBuffers, k: number) => {
        b.center.setXYZ(k, x, y, z);
        b.heading.setX(k, heading);
        b.color.setXYZ(k, col.r, col.g, col.b);
        b.size.setX(k, size);
      };
      write(this.arrowBuffers, i);
      const batch = this.classBatches.get(m.vesselClass)!;
      const k = counts.get(m.vesselClass)!;
      write(batch.buffers, k);
      counts.set(m.vesselClass, k + 1);
    });
    this.commit(this.arrowBuffers, this.arrowMesh, order.length);
    for (const [cls, b] of this.classBatches) {
      const n = counts.get(cls)!;
      this.commit(b.buffers, b.meshes[1], n);
      (b.meshes[2].geometry as THREE.InstancedBufferGeometry).instanceCount = n;
    }
    this.writeRings();
  }

  private commit(b: InstanceBuffers, mesh: THREE.Mesh, count: number) {
    for (const a of [b.center, b.heading, b.color, b.size]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, count) * a.itemSize);
      a.needsUpdate = true;
    }
    (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count;
    this.scene.invalidate();
  }

  private writeRings() {
    let n = 0;
    const put = (b: InstanceBuffers, k: number, p: GeoPoint, color: THREE.Color, size: number) => {
      const [x, y, z] = sphericalPosition(p.lat, p.lon, 1);
      b.center.setXYZ(k, x, y, z);
      b.heading.setX(k, 0);
      b.color.setXYZ(k, color.r, color.g, color.b);
      b.size.setX(k, size);
    };
    for (const id of this.focus.vesselIds) {
      const m = this.markerById.get(id);
      if (m && n < 16) put(this.selectionBuffers, n++, m.point, MC.selected, 2.1);
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
        put(this.incidentBuffers, k++, m.point, MC.incident, this.isPinned(m.vesselId) ? 2.4 : 1.35);
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
      const [x, y, z] = sphericalPosition(p.point.lat, p.point.lon, 1);
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
      dashed: !!opts.dashed,
      dashSize: opts.dash ?? 0.02,
      gapSize: (opts.dash ?? 0.02) * 0.8,
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
      g.setPositions(linePositions(data.points));
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
    if (this.trackLine) this.trackLine.visible = this.layers.routes || anyFocus;
    this.scene.invalidate();
  }

  /** Recorded positions of the focused vessel up to the simulation time (historical path, dotted). */
  setTrack(points: GeoPoint[] | null) {
    if (this.trackLine) {
      this.disposeLine(this.trackLine);
      this.trackLine = null;
    }
    if (points && points.length >= 2) {
      const g = new LineGeometry();
      g.setPositions(linePositions(points, LINE_RADIUS * 1.0004));
      this.trackLine = new Line2(g, this.lineMaterial({ color: MC.track, width: 2, opacity: 0.9, dashed: true, dash: 0.006 }));
      this.trackLine.computeLineDistances();
      this.trackLine.renderOrder = RENDER_ORDER.track;
      this.trackLine.frustumCulled = false;
      this.group.add(this.trackLine);
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
      g.setPositions(linePositions(h.outline, LINE_RADIUS * 0.9998));
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
      const p = this.scene.project(m.point.lat, m.point.lon);
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
    return m ? this.scene.project(m.point.lat, m.point.lon) : null;
  }

  marker(id: string): VesselMarker | undefined {
    return this.markerById.get(id);
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
      trackPoints: this.trackLine ? ((this.trackLine.geometry as LineGeometry).attributes.instanceStart?.count ?? 0) + 1 : 0,
      hazards: this.hazards.length,
      lod: this.lod,
      px: Math.round(this.px * 10) / 10,
    };
  }

  dispose() {
    for (const r of this.routes.values()) this.disposeLine(r.line);
    if (this.trackLine) this.disposeLine(this.trackLine);
    for (const l of this.hazardLines) this.disposeLine(l);
    this.scene.setOverlayCanvas(null);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry instanceof THREE.InstancedBufferGeometry) mesh.geometry.dispose();
    });
    for (const m of [this.vesselMaterial, this.portMaterial, this.ringMaterial, ...this.flatVariants.values()]) m.dispose();
    this.scene.overlay.remove(this.group);
    this.lodListeners.clear();
  }
}

import * as THREE from 'three';
import { bearingDeg, haversineDistanceNm, offsetMeters } from '@/core/geo';
import type { GeoPoint } from '@/core/types';
import { tokens } from '@/styles/tokens';
import type { PortTwinModel, TwinBerth, TwinBerthStatus, TwinTerminal } from '@/selectors/portTwin';
import type { PlanarSceneLayer } from '../Region3DScene';
import { CONTAINER_COLORS, containerGeometry, stsCraneGeometry } from './twinGeometry';

/** Geographic point at a height in metres → scene world position. */
export type TwinProjector = (lat: number, lon: number, heightM: number) => THREE.Vector3;

/** Terminal deck height above the water; land in the port scene sits at 3 m. */
export const DECK_M = 4;
const APRON_M = 62;
const STRIP_M = 16;
const ROW_W = 2.74;
const BAY_L = 12.6;
const ROWS_PER_BLOCK = 7;
const BAYS_PER_BLOCK = 18;
const BLOCK_GAP_M = 22;
const MAX_TIER = 5;
const TYPICAL_TIER = 2.5;
const METRE = new THREE.Vector3(0.001, 0.001, 0.001);

export const BERTH_STATUS_COLOR: Record<TwinBerthStatus, string> = {
  occupied: '#5AADB7',
  reserved: '#8C98A1',
  free: '#2E9C84',
  unavailable: '#A84444',
  unknown: '#A6A9B4',
};
const FOCUS = new THREE.Color(tokens.status.selected);
const CONFLICT = new THREE.Color('#D49A2E');
const CRANE_IDLE = new THREE.Color('#ffffff');

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic [0, 1) stream per seed (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BerthParts {
  berth: TwinBerth;
  strip: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edge: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  proxy: THREE.Mesh;
  craneRange: [number, number];
}

/**
 * Port twin scene content (spec 07): terminal decks, berth strips coloured by status at the scenario instant, static
 * STS cranes (no service records drive them), the declared yard box count, anchorage zones and the pilot boarding
 * place. Everything is illustrative; geometry comes from the simulated layout, never an official plan.
 */
export class PortTwinLayer implements PlanarSceneLayer {
  readonly object = new THREE.Group();
  private readonly berths = new Map<string, BerthParts>();
  private readonly proxies: THREE.Mesh[] = [];
  private readonly cranes: THREE.InstancedMesh;
  private readonly containers: THREE.InstancedMesh;
  private readonly project: TwinProjector;
  private selected: string | null = null;
  private conflictBerths = new Set<string>();
  private counts = { terminals: 0, berths: 0, cranes: 0, containers: 0, anchorages: 0 };

  constructor(model: PortTwinModel, project: TwinProjector) {
    this.project = project;
    this.object.name = 'port-twin';
    const craneTotal = model.berths.reduce((n, b) => n + b.craneCount, 0);
    const boxTotal = model.terminals.reduce((n, t) => n + t.yardContainers, 0);
    this.cranes = new THREE.InstancedMesh(stsCraneGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), Math.max(1, craneTotal));
    this.containers = new THREE.InstancedMesh(containerGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 }), Math.max(1, boxTotal));
    this.cranes.name = 'twin-cranes';
    this.containers.name = 'twin-containers';

    const deckMat = new THREE.MeshStandardMaterial({ color: '#4c5d64', roughness: 0.95 });
    const deckEdge = new THREE.LineBasicMaterial({ color: '#8FB7C2', transparent: true, opacity: 0.7 });
    let crane = 0;
    let box = 0;
    for (const t of model.terminals) {
      this.object.add(this.deck(t, deckMat), this.quayEdge(t, deckEdge));
      box = this.yard(t, box);
      for (const b of model.berths.filter((x) => x.terminalId === t.terminalId)) crane = this.berth(b, crane);
    }
    this.cranes.count = crane;
    this.containers.count = box;
    for (const m of [this.cranes, this.containers]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      this.object.add(m);
    }
    for (const a of model.anchorages) this.object.add(this.anchorage(a.polygon, a.usage));
    this.object.add(this.pilotMark(model.pilotBoardingPlace));
    this.counts = { terminals: model.terminals.length, berths: model.berths.length, cranes: crane, containers: box, anchorages: model.anchorages.length };
    this.setState(model, null);
  }

  // ---- construction -------------------------------------------------------------------------------------------

  private ring(points: GeoPoint[], heightM: number): THREE.Vector3[] {
    return points.map((p) => this.project(p.lat, p.lon, heightM));
  }

  private shape(points: GeoPoint[]): THREE.Shape {
    return new THREE.Shape(this.ring(points, 0).map((v) => new THREE.Vector2(v.x, -v.z)));
  }

  private deck(t: TwinTerminal, mat: THREE.Material) {
    const g = new THREE.ExtrudeGeometry(this.shape(t.footprint), { depth: DECK_M * 0.001, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.name = `deck-${t.terminalId}`;
    return m;
  }

  private quayEdge(t: TwinTerminal, mat: THREE.LineBasicMaterial) {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.ring(t.quayLine, DECK_M + 0.4)), mat);
  }

  /** Yaw that turns local +Z (seaward) onto a geographic bearing at a point. */
  private yawAt(p: GeoPoint, bearingDeg: number): number {
    const a = this.project(p.lat, p.lon, 0);
    const q = offsetMeters(p, bearingDeg, 100);
    const b = this.project(q.lat, q.lon, 0);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  private place(mesh: THREE.InstancedMesh, i: number, p: GeoPoint, heightM: number, yaw: number) {
    const m = new THREE.Matrix4().compose(this.project(p.lat, p.lon, heightM), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), METRE);
    mesh.setMatrixAt(i, m);
  }

  private berth(b: TwinBerth, craneStart: number): number {
    const yaw = this.yawAt(b.center, b.seawardDeg);
    const landward = (b.seawardDeg + 180) % 360;
    const stripCenter = offsetMeters(b.center, landward, STRIP_M / 2 + 1);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(b.lengthM * 0.96 * 0.001, 0.5 * 0.001, STRIP_M * 0.001), new THREE.MeshStandardMaterial({ roughness: 0.7, emissiveIntensity: 0.35 }));
    strip.position.copy(this.project(stripCenter.lat, stripCenter.lon, DECK_M + 0.3));
    strip.rotation.y = yaw;
    strip.userData.berthId = b.berthId;
    const edgeCenter = offsetMeters(b.center, landward, 1);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(b.lengthM * 0.96 * 0.001, 0.8 * 0.001, 2.2 * 0.001), new THREE.MeshBasicMaterial({ color: CONFLICT }));
    edge.position.copy(this.project(edgeCenter.lat, edgeCenter.lon, DECK_M + 0.5));
    edge.rotation.y = yaw;
    edge.visible = false;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(b.lengthM * 0.001, 0.05, 0.11), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(this.project(b.center.lat, b.center.lon, 25));
    proxy.rotation.y = yaw;
    proxy.userData.berthId = b.berthId;
    this.proxies.push(proxy);
    this.object.add(strip, edge, proxy);

    const n = b.craneCount;
    const spacing = n > 1 ? Math.min(60, (b.lengthM * 0.8) / (n - 1)) : 0;
    for (let k = 0; k < n; k++) {
      const p = offsetMeters(b.center, b.quayBearingDeg, (k - (n - 1) / 2) * spacing);
      this.place(this.cranes, craneStart + k, p, DECK_M, yaw);
      this.cranes.setColorAt(craneStart + k, CRANE_IDLE);
    }
    this.berths.set(b.berthId, { berth: b, strip, edge, proxy, craneRange: [craneStart, craneStart + n] });
    return craneStart + n;
  }

  /**
   * Fills the yard behind each quay segment with blocks of 40 ft stacks (about three tiers, at most five) until the
   * declared box count is reached. Used blocks are spread evenly over the yard and stack heights are seeded by
   * terminal ID, so the yard is stable between sessions.
   */
  private yard(t: TwinTerminal, start: number): number {
    const blocks: { p: GeoPoint; yaw: number }[][] = [];
    const usable = t.yardDepthM - APRON_M - 30;
    const blockDepth = ROWS_PER_BLOCK * ROW_W;
    const blockRows = Math.max(1, Math.floor((usable + BLOCK_GAP_M) / (blockDepth + BLOCK_GAP_M)));
    for (let s = 0; s + 1 < t.quayLine.length; s++) {
      const a = t.quayLine[s];
      const b = t.quayLine[s + 1];
      const lenM = haversineDistanceNm(a, b) * 1852;
      const bearing = bearingDeg(a, b);
      const yaw = this.yawAt(a, bearing);
      const blockLen = BAYS_PER_BLOCK * BAY_L;
      const perRow = Math.max(1, Math.floor((lenM - 20 + BLOCK_GAP_M) / (blockLen + BLOCK_GAP_M)));
      const used = perRow * blockLen + (perRow - 1) * BLOCK_GAP_M;
      const startAlong = (lenM - used) / 2;
      for (let br = 0; br < blockRows; br++)
        for (let bl = 0; bl < perRow; bl++) {
          const slots: { p: GeoPoint; yaw: number }[] = [];
          for (let row = 0; row < ROWS_PER_BLOCK; row++) {
            const back = APRON_M + br * (blockDepth + BLOCK_GAP_M) + row * ROW_W + ROW_W / 2;
            for (let bay = 0; bay < BAYS_PER_BLOCK; bay++) {
              const along = startAlong + bl * (blockLen + BLOCK_GAP_M) + bay * BAY_L + BAY_L / 2;
              slots.push({ p: offsetMeters(offsetMeters(a, bearing, along), t.landwardDeg, back), yaw });
            }
          }
          blocks.push(slots);
        }
    }
    if (!blocks.length) return start;
    const perBlock = ROWS_PER_BLOCK * BAYS_PER_BLOCK;
    const target = Math.min(t.yardContainers, blocks.length * perBlock * MAX_TIER);
    const take = Math.min(blocks.length, Math.max(1, Math.ceil(target / (perBlock * TYPICAL_TIER))));
    const slots = Array.from({ length: take }, (_, k) => blocks[Math.floor((k * blocks.length) / take)]).flat();
    const r = rng(hash(t.terminalId));
    const mean = target / slots.length;
    const tiers = slots.map(() => Math.max(1, Math.min(MAX_TIER, Math.round(mean + (r() - 0.5) * 2.4))));
    let total = tiers.reduce((n, x) => n + x, 0);
    for (let i = 0, guard = 0; total !== target && guard < slots.length * MAX_TIER * 2; i = (i + 7) % slots.length, guard++) {
      if (total < target && tiers[i] < MAX_TIER) {
        tiers[i]++;
        total++;
      } else if (total > target && tiers[i] > 0) {
        tiers[i]--;
        total--;
      }
    }
    let i = start;
    const color = new THREE.Color();
    slots.forEach((s, k) => {
      for (let tier = 0; tier < tiers[k]; tier++) {
        this.place(this.containers, i, s.p, DECK_M + tier * 2.62, s.yaw);
        color.copy(CONTAINER_COLORS[Math.floor(r() * CONTAINER_COLORS.length)]).multiplyScalar(0.92 + r() * 0.16);
        this.containers.setColorAt(i, color);
        i++;
      }
    });
    return i;
  }

  private anchorage(polygon: GeoPoint[], usage: 'waiting' | 'illustrative') {
    const g = new THREE.Group();
    const tone = new THREE.Color(usage === 'waiting' ? '#5AADB7' : '#A6A9B4');
    const fillGeo = new THREE.ShapeGeometry(this.shape(polygon));
    fillGeo.rotateX(-Math.PI / 2);
    fillGeo.translate(0, 0.15 * 0.001, 0);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: tone, transparent: true, opacity: usage === 'waiting' ? 0.1 : 0.06, depthWrite: false }));
    const pts = this.ring([...polygon, polygon[0]], 0.3);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: tone, dashSize: 0.06, gapSize: 0.04, transparent: true, opacity: 0.85 }));
    line.computeLineDistances();
    g.add(fill, line);
    g.name = 'anchorage';
    return g;
  }

  private pilotMark(p: GeoPoint) {
    const g = new THREE.RingGeometry(0.03, 0.045, 32);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#d3dde3', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    m.position.copy(this.project(p.lat, p.lon, 0.4));
    m.name = 'pilot-boarding-place';
    return m;
  }

  // ---- state ---------------------------------------------------------------------------------------------------

  /** Berth status at the scenario instant, conflicts and the selected berth (focus colour, lit cranes). */
  setState(model: PortTwinModel, selectedBerthId: string | null): void {
    this.selected = selectedBerthId;
    this.conflictBerths = new Set(model.conflicts.map((c) => c.berthId));
    for (const b of model.berths) {
      const parts = this.berths.get(b.berthId);
      if (!parts) continue;
      parts.berth = b;
      const on = b.berthId === selectedBerthId;
      const base = new THREE.Color(BERTH_STATUS_COLOR[b.status]);
      parts.strip.material.color.copy(on ? FOCUS : base);
      parts.strip.material.emissive.copy(on ? FOCUS : base).multiplyScalar(on ? 0.6 : 0.25);
      parts.strip.scale.y = on ? 3 : 1;
      parts.edge.visible = this.conflictBerths.has(b.berthId);
      const [from, to] = parts.craneRange;
      for (let i = from; i < to; i++) this.cranes.setColorAt(i, on ? FOCUS.clone().lerp(CRANE_IDLE, 0.35) : CRANE_IDLE);
    }
    if (this.cranes.instanceColor) this.cranes.instanceColor.needsUpdate = true;
  }

  get selectedBerth() {
    return this.selected;
  }

  pick(raycaster: THREE.Raycaster): { distance: number; berthId: string } | null {
    const hit = raycaster.intersectObjects(this.proxies, false)[0];
    return hit ? { distance: hit.distance, berthId: hit.object.userData.berthId as string } : null;
  }

  stats() {
    return { ...this.counts, conflicts: this.conflictBerths.size, selected: this.selected };
  }

  dispose(): void {
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) mat.dispose();
    });
    this.object.removeFromParent();
    this.berths.clear();
    this.proxies.length = 0;
  }
}

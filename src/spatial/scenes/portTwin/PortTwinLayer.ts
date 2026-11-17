import * as THREE from 'three';
import { bearingDeg, haversineDistanceNm, offsetMeters } from '@/core/geo';
import type { YardSlot } from '@/core/cargoTypes';
import type { EquipmentStatus, HazardZone, TerminalEquipment } from '@/core/terminalTypes';
import type { GeoPoint } from '@/core/types';
import { craneStateAt, type CraneState } from '@/engines/terminalOps';
import { tokens } from '@/styles/tokens';
import type { PortTwinModel, TwinBerth, TwinBerthStatus, TwinTerminal } from '@/selectors/portTwin';
import type { TwinOpsFrame } from '@/selectors/terminalOps';
import type { PlanarSceneLayer } from '../Region3DScene';
import {
  armBoomGeometry,
  armRiserGeometry,
  buildingGeometry,
  CONTAINER_COLORS,
  containerGeometry,
  conveyorFrameGeometry,
  jettyHeadGeometry,
  lanePadGeometry,
  lngTankGeometry,
  rampGeometry,
  ropeGeometry,
  shipLoaderBaseGeometry,
  shipLoaderBoomGeometry,
  siloRowGeometry,
  spreaderGeometry,
  STS_LANE_Z,
  STS_SPREADER_TOP_Y,
  STS_TROLLEY_Y,
  stockpileGeometry,
  straddleCarrierGeometry,
  stsCraneFrameGeometry,
  stsTrolleyGeometry,
  tankLevelGeometry,
  trestleGeometry,
  vehicleGeometry,
} from './twinGeometry';

/** Geographic point at a height in metres → scene world position. */
export type TwinProjector = (lat: number, lon: number, heightM: number) => THREE.Vector3;

/** V3 typed terminal input: equipment to draw and hazard zones to outline (from the simulated terminal module). */
export interface TwinTypedInput {
  equipment: TerminalEquipment[];
  zones: HazardZone[];
}

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
const TIER_M = 2.62;
const BOX_H = 2.59;
const METRE = new THREE.Vector3(0.001, 0.001, 0.001);
const ZERO = new THREE.Vector3(0, 0, 0);
const DEG = Math.PI / 180;
/** V3 container yard: 8 blocks (A–D import nearest the quay, E–H export behind) of 10 bays × 6 rows. */
const V3_BAYS = 10;
const V3_ROWS = 6;
const V3_BLOCKS = 'ABCDEFGH';
const V3_BLOCK_L = V3_BAYS * BAY_L;
const V3_BLOCK_D = V3_ROWS * ROW_W;
const V3_HALF_ALONG = (4 * V3_BLOCK_L + 3 * BLOCK_GAP_M) / 2 + 12;
const V3_BACK = [APRON_M - 6, APRON_M + 2 * V3_BLOCK_D + BLOCK_GAP_M + 6] as const;
/** Grouped Ro-Ro vehicles: one block per five vehicles. */
const VEHICLES_PER_BLOCK = 5;

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
const HAZARD_ON = new THREE.Color('#D49A2E');
const HAZARD_OFF = new THREE.Color('#A6A9B4');
const PARKED: CraneState = craneStateAt(undefined, '', 0);

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

const unitColor = (unitId: string) => CONTAINER_COLORS[hash(unitId) % CONTAINER_COLORS.length];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Metres along the quay and landward of `o` (flat approximation, fine within a terminal). */
function localM(o: GeoPoint, p: GeoPoint, alongDeg: number, backDeg: number) {
  const east = (p.lon - o.lon) * Math.cos(o.lat * DEG) * 111_320;
  const north = (p.lat - o.lat) * 110_540;
  return { along: east * Math.sin(alongDeg * DEG) + north * Math.cos(alongDeg * DEG), back: east * Math.sin(backDeg * DEG) + north * Math.cos(backDeg * DEG) };
}

/** Repeating light/dark belt texture; its offset follows the quantity moved. */
function stripeTexture(lengthM: number): THREE.DataTexture {
  const data = new Uint8Array([70, 76, 80, 255, 70, 76, 80, 255, 132, 140, 146, 255, 70, 76, 80, 255]);
  const tex = new THREE.DataTexture(data, 1, 4);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.repeat.set(1, lengthM / 6);
  tex.needsUpdate = true;
  return tex;
}

interface BerthParts {
  berth: TwinBerth;
  strip: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edge: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  proxy: THREE.Mesh;
  craneRange: [number, number];
}

interface CraneSlot {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  equipmentId: string | null;
}

interface EquipParts {
  equipment: TerminalEquipment;
  /** Vertex-coloured meshes that take the focus or maintenance material. */
  meshes: THREE.Mesh[];
  /** Own-material meshes (stockpiles, tanks, lanes) that glow when focused. */
  glow: THREE.MeshStandardMaterial[];
  anchor: GeoPoint;
  anchorHeightM: number;
  craneIndex: number | null;
}

/**
 * Port twin scene content (spec 07, V3 05/02–05/09): terminal decks, berth strips coloured by status at the scenario
 * instant, the declared yard box count, anchorage zones and the pilot boarding place, plus V3 typed terminals whose
 * equipment moves only from the simulated operations and transfer events (`setOps`). Geometry is illustrative and
 * comes from the simulated layout, never an official plan.
 */
export class PortTwinLayer implements PlanarSceneLayer {
  readonly object = new THREE.Group();
  private readonly berths = new Map<string, BerthParts>();
  private readonly proxies: THREE.Mesh[] = [];
  private readonly equipProxies: THREE.Mesh[] = [];
  private readonly cranes: THREE.InstancedMesh;
  private readonly trolleys: THREE.InstancedMesh;
  private readonly ropes: THREE.InstancedMesh;
  private readonly spreaders: THREE.InstancedMesh;
  private readonly carried: THREE.InstancedMesh;
  private readonly craneSlots: CraneSlot[] = [];
  private readonly containers: THREE.InstancedMesh;
  private readonly project: TwinProjector;
  private readonly equipMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  private readonly focusMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, color: FOCUS.clone().lerp(CRANE_IDLE, 0.25), emissive: FOCUS, emissiveIntensity: 0.25 });
  private readonly maintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, color: '#c9826e' });
  private readonly equipment = new Map<string, EquipParts>();
  private readonly loaders = new Map<string, { group: THREE.Group; boom: THREE.Group; base: THREE.Vector3; along: THREE.Vector3; berthId: string; lengthM: number }>();
  private readonly arms = new Map<string, { inner: THREE.Group; outer: THREE.Group }>();
  private readonly ramps = new Map<string, THREE.Group>();
  private readonly belts: { tex: THREE.DataTexture; berthIds: string[] }[] = [];
  private readonly stockpiles = new Map<string, THREE.Mesh>();
  private readonly tankLevels = new Map<string, THREE.Mesh>();
  private readonly lanes = new Map<string, { mesh: THREE.InstancedMesh; capacity: number }>();
  private readonly hazardRings = new Map<string, { group: THREE.Group; ring: THREE.MeshBasicMaterial; fill: THREE.MeshBasicMaterial }>();
  private yardRegion: { terminalId: string; berth: TwinBerth; landwardDeg: number } | null = null;
  private yardMesh: THREE.InstancedMesh | null = null;
  private yardIndex = new Map<string, number>();
  private yardKey = '';
  private yardBoxes = 0;
  private opsSource: ((nowMs: number) => TwinOpsFrame | null) | null = null;
  private frame: TwinOpsFrame | null = null;
  private hazardVisible = true;
  private selected: string | null = null;
  private selectedEquipment: string | null = null;
  private conflictBerths = new Set<string>();
  private counts = { terminals: 0, berths: 0, cranes: 0, containers: 0, anchorages: 0 };

  constructor(model: PortTwinModel, project: TwinProjector, typed: TwinTypedInput | null = null) {
    this.project = project;
    this.object.name = 'port-twin';
    const terminalIds = new Set(model.terminals.map((t) => t.terminalId));
    const equipment = (typed?.equipment ?? []).filter((e) => terminalIds.has(e.terminalId));
    const cranesByBerth = new Map<string, string[]>();
    for (const e of equipment) if (e.kind === 'sts_crane' && e.berthId) cranesByBerth.set(e.berthId, [...(cranesByBerth.get(e.berthId) ?? []), e.equipmentId].sort());
    const craneTotal = Math.max(1, model.berths.reduce((n, b) => n + b.craneCount, 0));
    const boxTotal = model.terminals.reduce((n, t) => n + t.yardContainers, 0);
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, n: number, name: string) => {
      const mesh = new THREE.InstancedMesh(g, m, Math.max(1, n));
      mesh.name = name;
      return mesh;
    };
    this.cranes = inst(stsCraneFrameGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), craneTotal, 'twin-cranes');
    this.trolleys = inst(stsTrolleyGeometry(), this.equipMat, craneTotal, 'twin-trolleys');
    this.ropes = inst(ropeGeometry(), this.equipMat, craneTotal, 'twin-ropes');
    this.spreaders = inst(spreaderGeometry(), this.equipMat, craneTotal, 'twin-spreaders');
    this.carried = inst(containerGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 }), craneTotal, 'twin-carried');
    this.containers = inst(containerGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 }), boxTotal, 'twin-containers');

    for (const t of model.terminals) {
      if (t.terminalType !== 'container' || this.yardRegion) continue;
      const b = model.berths.find((x) => x.terminalId === t.terminalId && cranesByBerth.has(x.berthId));
      if (b) this.yardRegion = { terminalId: t.terminalId, berth: b, landwardDeg: t.landwardDeg };
    }

    const deckMat = new THREE.MeshStandardMaterial({ color: '#4c5d64', roughness: 0.95 });
    const deckEdge = new THREE.LineBasicMaterial({ color: '#8FB7C2', transparent: true, opacity: 0.7 });
    let crane = 0;
    let box = 0;
    for (const t of model.terminals) {
      this.object.add(this.deck(t, deckMat), this.quayEdge(t, deckEdge));
      box = this.yard(t, box);
      for (const b of model.berths.filter((x) => x.terminalId === t.terminalId)) crane = this.berth(b, crane, cranesByBerth.get(b.berthId) ?? [], equipment);
    }
    this.cranes.count = crane;
    this.containers.count = box;
    for (const m of [this.trolleys, this.ropes, this.spreaders, this.carried]) m.count = crane;
    for (const m of [this.cranes, this.containers, this.trolleys, this.ropes, this.spreaders, this.carried]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      this.object.add(m);
    }
    for (const t of model.terminals) {
      const berths = model.berths.filter((x) => x.terminalId === t.terminalId);
      const list = equipment.filter((e) => e.terminalId === t.terminalId);
      if (!berths.length || !list.length) continue;
      if (t.terminalType === 'dry_bulk') this.buildBulk(t, berths, list);
      else if (t.terminalType === 'lng') this.buildLng(t, berths, list, (typed?.zones ?? []).filter((z) => z.terminalId === t.terminalId));
      else if (t.terminalType === 'roro') this.buildRoro(t, berths, list);
      else this.buildContainerExtras(t);
    }
    for (const a of model.anchorages) this.object.add(this.anchorage(a.polygon, a.usage));
    this.object.add(this.pilotMark(model.pilotBoardingPlace));
    this.counts = { terminals: model.terminals.length, berths: model.berths.length, cranes: crane, containers: box, anchorages: model.anchorages.length };
    this.applyCranes();
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

  /** A metre-scaled group at a point whose local +Z points along `bearing`; children are placed in metres. */
  private frameAt(p: GeoPoint, bearing: number, heightM: number, name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    g.position.copy(this.project(p.lat, p.lon, heightM));
    g.rotation.y = this.yawAt(p, bearing);
    g.scale.copy(METRE);
    this.object.add(g);
    return g;
  }

  /** Point `along` metres along the quay bearing and `back` metres landward of `o` (negative = seaward). */
  private at(o: GeoPoint, t: TwinTerminal, along: number, back: number): GeoPoint {
    return offsetMeters(offsetMeters(o, t.quayBearingDeg, along), t.landwardDeg, back);
  }

  private mesh(g: THREE.BufferGeometry, parent: THREE.Object3D, mat: THREE.Material = this.equipMat): THREE.Mesh {
    const m = new THREE.Mesh(g, mat);
    parent.add(m);
    return m;
  }

  /** Registers equipment with an invisible pick box (local metres of `parent`). */
  private register(e: TerminalEquipment, parent: THREE.Object3D, size: [number, number, number], at: [number, number, number], anchor: GeoPoint, anchorHeightM: number, meshes: THREE.Mesh[] = [], glow: THREE.MeshStandardMaterial[] = []) {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.set(...at);
    proxy.userData.equipmentId = e.equipmentId;
    proxy.userData.berthId = e.berthId;
    parent.add(proxy);
    this.equipProxies.push(proxy);
    const prev = this.equipment.get(e.equipmentId);
    if (prev) {
      prev.meshes.push(...meshes);
      prev.glow.push(...glow);
      return;
    }
    this.equipment.set(e.equipmentId, { equipment: e, meshes, glow, anchor, anchorHeightM, craneIndex: null });
  }

  private berth(b: TwinBerth, craneStart: number, craneIds: string[], equipment: TerminalEquipment[]): number {
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
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (let k = 0; k < n; k++) {
      const p = offsetMeters(b.center, b.quayBearingDeg, (k - (n - 1) / 2) * spacing);
      const i = craneStart + k;
      this.place(this.cranes, i, p, DECK_M, yaw);
      this.cranes.setColorAt(i, CRANE_IDLE);
      const id = craneIds[k] ?? null;
      this.craneSlots[i] = { pos: this.project(p.lat, p.lon, DECK_M), quat, equipmentId: id };
      const e = id ? equipment.find((x) => x.equipmentId === id) : undefined;
      if (e) {
        const g = this.frameAt(p, b.seawardDeg, DECK_M, `crane-${id}`);
        this.register(e, g, [22, 78, 104], [0, 38, 3], p, 50);
        this.equipment.get(e.equipmentId)!.craneIndex = i;
      }
    }
    this.berths.set(b.berthId, { berth: b, strip, edge, proxy, craneRange: [craneStart, craneStart + n] });
    return craneStart + n;
  }

  /** Inside the V3 yard footprint behind the working container berth (declared stacks keep out of it). */
  private inV3Yard(p: GeoPoint): boolean {
    const r = this.yardRegion;
    if (!r) return false;
    const l = localM(r.berth.center, p, r.berth.quayBearingDeg, r.landwardDeg);
    return Math.abs(l.along) < V3_HALF_ALONG && l.back > V3_BACK[0] && l.back < V3_BACK[1];
  }

  /**
   * Fills the yard behind each quay segment with blocks of 40 ft stacks (about three tiers, at most five) until the
   * declared box count is reached. Used blocks are spread evenly over the yard and stack heights are seeded by
   * terminal ID, so the yard is stable between sessions. The V3 event-sourced yard keeps its own footprint.
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
              const p = offsetMeters(offsetMeters(a, bearing, along), t.landwardDeg, back);
              if (!this.inV3Yard(p)) slots.push({ p, yaw });
            }
          }
          if (slots.length) blocks.push(slots);
        }
    }
    if (!blocks.length || !t.yardContainers) return start;
    const perBlock = ROWS_PER_BLOCK * BAYS_PER_BLOCK;
    const target = Math.min(t.yardContainers, blocks.reduce((n, b) => n + b.length, 0) * MAX_TIER);
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
        this.place(this.containers, i, s.p, DECK_M + tier * TIER_M, s.yaw);
        color.copy(CONTAINER_COLORS[Math.floor(r() * CONTAINER_COLORS.length)]).multiplyScalar(0.92 + r() * 0.16);
        this.containers.setColorAt(i, color);
        i++;
      }
    });
    return i;
  }

  /** Container terminal extras: straddle carriers parked on the apron behind the working berth (static). */
  private buildContainerExtras(t: TwinTerminal) {
    const r = this.yardRegion;
    if (!r || r.terminalId !== t.terminalId) return;
    for (const along of [-150, -60, 60, 150]) {
      const p = this.at(r.berth.center, t, along, 44);
      this.mesh(straddleCarrierGeometry(), this.frameAt(p, t.quayBearingDeg, DECK_M, 'straddle-carrier'));
    }
  }

  /** Signed metres along the quay from the first to the last berth centre of a terminal. */
  private span(t: TwinTerminal, berths: TwinBerth[]): number {
    return berths.length > 1 ? localM(berths[0].center, berths[berths.length - 1].center, t.quayBearingDeg, t.landwardDeg).along : 0;
  }

  /** Dry bulk: rail-mounted ship loaders, quay and yard conveyors, two stockpiles and a silo row. */
  private buildBulk(t: TwinTerminal, berths: TwinBerth[], list: TerminalEquipment[]) {
    const seaward = (t.landwardDeg + 180) % 360;
    const span = this.span(t, berths);
    const mid = this.at(berths[0].center, t, span / 2, 0);
    for (const e of list) {
      const b = berths.find((x) => x.berthId === e.berthId);
      if (e.kind === 'ship_loader' && b) {
        const p = this.at(b.center, t, 0, 2);
        const g = this.frameAt(p, seaward, DECK_M, `loader-${e.equipmentId}`);
        const base = this.mesh(shipLoaderBaseGeometry(), g);
        const boom = new THREE.Group();
        boom.position.set(0, 22, -6);
        g.add(boom);
        const arm = this.mesh(shipLoaderBoomGeometry(), boom);
        const q = this.at(b.center, t, 1, 2);
        const along = this.project(q.lat, q.lon, DECK_M).sub(g.position);
        this.loaders.set(e.equipmentId, { group: g, boom, base: g.position.clone(), along, berthId: b.berthId, lengthM: b.lengthM });
        this.register(e, g, [16, 40, 60], [0, 18, 6], p, 30, [base, arm]);
      } else if (e.kind === 'conveyor') {
        const quay = e.equipmentId.endsWith('1');
        const len = quay ? Math.abs(span) + 220 : 150;
        const p = quay ? this.at(mid, t, 0, 24) : this.at(mid, t, 0, 24 + len / 2);
        const g = this.frameAt(p, quay ? t.quayBearingDeg : t.landwardDeg, DECK_M + 5, `conveyor-${e.equipmentId}`);
        const frame = this.mesh(conveyorFrameGeometry(len), g);
        const tex = stripeTexture(len);
        const belt = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, len), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
        belt.position.y = 0.9;
        g.add(belt);
        this.belts.push({ tex, berthIds: berths.map((x) => x.berthId) });
        this.register(e, g, [8, 10, len], [0, 0, 0], p, 8, [frame]);
      } else if (e.kind === 'stockpile') {
        const side = e.equipmentId.endsWith('A') ? -1 : 1;
        const p = this.at(mid, t, side * 75, 200);
        const g = this.frameAt(p, t.landwardDeg, DECK_M, `stockpile-${e.equipmentId}`);
        this.mesh(new THREE.BoxGeometry(100, 0.4, 150).translate(0, 0.2, 0), g, new THREE.MeshStandardMaterial({ color: '#3d4a4f', roughness: 1 }));
        const mat = new THREE.MeshStandardMaterial({ color: '#a8935e', roughness: 1, flatShading: true });
        const pile = this.mesh(stockpileGeometry(), g, mat);
        this.stockpiles.set(e.equipmentId, pile);
        this.register(e, g, [90, 30, 140], [0, 12, 0], p, 20, [], [mat]);
      } else if (e.kind === 'silo') {
        const p = this.at(mid, t, 0, 330);
        const g = this.frameAt(p, t.landwardDeg, DECK_M, `silo-${e.equipmentId}`);
        this.register(e, g, [110, 45, 20], [0, 22, 0], p, 40, [this.mesh(siloRowGeometry(), g)]);
      }
    }
  }

  /** LNG: jetty heads with articulated arms, trestles to shore, two full-containment tanks and the safety zone. */
  private buildLng(t: TwinTerminal, berths: TwinBerth[], list: TerminalEquipment[], zones: HazardZone[]) {
    const seaward = (t.landwardDeg + 180) % 360;
    const heads = new Map<string, THREE.Group>();
    const trestles: THREE.Mesh[] = [];
    for (const b of berths) {
      const head = this.frameAt(this.at(b.center, t, 0, 10), seaward, DECK_M, `jetty-${b.berthId}`);
      this.mesh(jettyHeadGeometry(b.lengthM), head);
      heads.set(b.berthId, head);
      const len = Math.max(40, t.jettyOffsetM - 23);
      const tr = this.frameAt(this.at(b.center, t, 0, 23 + len / 2), t.landwardDeg, DECK_M, `trestle-${b.berthId}`);
      trestles.push(this.mesh(trestleGeometry(len), tr));
    }
    const mid = this.at(berths[0].center, t, this.span(t, berths) / 2, 0);
    const xs = [-15, -5, 5, 15];
    const perBerth = new Map<string, number>();
    for (const e of list) {
      if ((e.kind === 'loading_arm' || e.kind === 'vapour_arm') && e.berthId && heads.has(e.berthId)) {
        const head = heads.get(e.berthId)!;
        const k = perBerth.get(e.berthId) ?? 0;
        perBerth.set(e.berthId, k + 1);
        const root = new THREE.Group();
        root.position.set(xs[k % xs.length], 0, 8);
        head.add(root);
        const riser = this.mesh(armRiserGeometry(), root);
        const inner = new THREE.Group();
        inner.position.set(0, 14, 0);
        root.add(inner);
        const a = this.mesh(armBoomGeometry(), inner);
        const outer = new THREE.Group();
        outer.position.set(0, 0, 13);
        inner.add(outer);
        const o = this.mesh(armBoomGeometry(), outer);
        this.arms.set(e.equipmentId, { inner, outer });
        const b = berths.find((x) => x.berthId === e.berthId)!;
        this.register(e, root, [6, 30, 22], [0, 14, 6], this.at(b.center, t, 0, 2), 18, [riser, a, o]);
      } else if (e.kind === 'pipeline') {
        for (const m of trestles) this.register(e, m.parent!, [10, 6, Math.max(40, t.jettyOffsetM - 23)], [0, 1, 0], this.at(berths[0].center, t, 0, t.jettyOffsetM / 2), 6, [m]);
      } else if (e.kind === 'lng_tank') {
        const side = e.equipmentId.endsWith('1') ? -1 : 1;
        const p = this.at(mid, t, side * 80, t.jettyOffsetM + 230);
        const g = this.frameAt(p, t.landwardDeg, DECK_M, `tank-${e.equipmentId}`);
        const tank = this.mesh(lngTankGeometry(), g);
        const mat = new THREE.MeshStandardMaterial({ color: '#5AADB7', emissive: '#5AADB7', emissiveIntensity: 0.35, roughness: 0.6, side: THREE.DoubleSide });
        const level = this.mesh(tankLevelGeometry(), g, mat);
        this.tankLevels.set(e.equipmentId, level);
        this.register(e, g, [86, 50, 86], [0, 25, 0], p, 50, [tank], [mat]);
      }
    }
    for (const z of zones) {
      const b = berths.find((x) => x.berthId === z.berthId);
      if (!b) continue;
      const g = this.frameAt(b.center, seaward, 0.6, `hazard-${z.zoneId}`);
      const ring = new THREE.MeshBasicMaterial({ color: HAZARD_OFF, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
      const fill = new THREE.MeshBasicMaterial({ color: HAZARD_OFF, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide });
      const rg = new THREE.RingGeometry(z.radiusMeters - 3, z.radiusMeters + 3, 128).rotateX(-Math.PI / 2);
      const fg = new THREE.CircleGeometry(z.radiusMeters - 3, 96).rotateX(-Math.PI / 2);
      g.add(new THREE.Mesh(fg, fill), new THREE.Mesh(rg, ring));
      this.hazardRings.set(z.berthId, { group: g, ring, fill });
    }
  }

  /** Ro-Ro: linkspan ramps, import and export staging lanes with grouped vehicles, and the terminal building. */
  private buildRoro(t: TwinTerminal, berths: TwinBerth[], list: TerminalEquipment[]) {
    const seaward = (t.landwardDeg + 180) % 360;
    const mid = this.at(berths[0].center, t, this.span(t, berths) / 2, 0);
    for (const e of list) {
      const b = berths.find((x) => x.berthId === e.berthId);
      if (e.kind === 'ramp' && b) {
        const p = this.at(b.center, t, b.lengthM * 0.38, 0);
        const g = this.frameAt(p, seaward, DECK_M, `ramp-${e.equipmentId}`);
        const hinge = new THREE.Group();
        g.add(hinge);
        const ramp = this.mesh(rampGeometry(), hinge);
        this.ramps.set(e.equipmentId, hinge);
        this.register(e, g, [26, 16, 38], [0, 6, 16], p, 10, [ramp]);
      } else if (e.kind === 'staging_lanes') {
        const imp = e.equipmentId.endsWith('IMP');
        const blocks = Math.ceil((e.ratedCapacity ?? 0) / VEHICLES_PER_BLOCK);
        const laneCount = Math.max(4, Math.ceil(blocks / 20));
        const width = laneCount * 10;
        const p = this.at(mid, t, imp ? -(width / 2 + 15) : width / 2 + 15, 150);
        const g = this.frameAt(p, t.landwardDeg, DECK_M, `lanes-${e.equipmentId}`);
        const pad = this.mesh(lanePadGeometry(laneCount, width, 116), g);
        const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 });
        const veh = new THREE.InstancedMesh(vehicleGeometry(), mat, Math.max(1, blocks));
        veh.name = `vehicles-${e.equipmentId}`;
        const m = new THREE.Matrix4();
        const c = new THREE.Color();
        const palette = ['#c9cfd2', '#2b3236', '#7d8a91', '#8a2f2a', '#2f4f6e', '#e4e6e3'].map((x) => new THREE.Color(x));
        for (let k = 0; k < blocks; k++) {
          const lane = k % laneCount;
          const row = Math.floor(k / laneCount);
          m.makeTranslation(-width / 2 + 5 + lane * 10, 0.3, -52 + row * 5.4);
          veh.setMatrixAt(k, m);
          veh.setColorAt(k, c.copy(palette[hash(`${e.equipmentId}${k}`) % palette.length]));
        }
        veh.count = 0;
        g.add(veh);
        this.lanes.set(e.equipmentId, { mesh: veh, capacity: e.ratedCapacity ?? 0 });
        this.register(e, g, [width, 6, 116], [0, 3, 0], p, 6, [pad], [mat]);
      }
    }
    this.mesh(buildingGeometry(70, 14, 34), this.frameAt(this.at(mid, t, 0, 290), t.landwardDeg, DECK_M, 'roro-building'));
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

  // ---- V3 yard -------------------------------------------------------------------------------------------------

  /** Container terminal whose yard is event-sourced (the one with crane equipment), if any. */
  get yardTerminalId(): string | null {
    return this.yardRegion?.terminalId ?? null;
  }

  /**
   * Event-sourced yard behind the working container berth: one instance per declared slot, shown only while a box
   * occupies it at the committed scenario time (`occupancy`: slot → unit, from the cargo engine).
   */
  setYard(slots: YardSlot[], occupancy: Map<string, string>): void {
    const r = this.yardRegion;
    if (!r) return;
    if (!this.yardMesh) {
      const mine = slots.filter((s) => s.terminalId === r.terminalId);
      if (!mine.length) return;
      const mesh = new THREE.InstancedMesh(containerGeometry(), new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 }), mine.length);
      mesh.name = 'twin-yard-v3';
      const tw = { terminalId: r.terminalId, quayBearingDeg: r.berth.quayBearingDeg, landwardDeg: r.landwardDeg } as TwinTerminal;
      const yaw = this.yawAt(r.berth.center, r.berth.quayBearingDeg);
      mine.forEach((s, i) => {
        const bi = Math.max(0, V3_BLOCKS.indexOf(s.block));
        const col = bi % 4;
        const deep = Math.floor(bi / 4);
        const along = (col - 1.5) * (V3_BLOCK_L + BLOCK_GAP_M) + (s.bay - (V3_BAYS + 1) / 2) * BAY_L;
        const back = APRON_M + deep * (V3_BLOCK_D + BLOCK_GAP_M) + (s.row - 0.5) * ROW_W;
        this.yardIndex.set(s.yardSlotId, i);
        const p = this.at(r.berth.center, tw, along, back);
        mesh.setMatrixAt(i, new THREE.Matrix4().compose(this.project(p.lat, p.lon, DECK_M + (s.tier - 1) * TIER_M), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), ZERO));
        mesh.setColorAt(i, CONTAINER_COLORS[0]);
      });
      mesh.userData.full = mine.map((_, i) => {
        const m = new THREE.Matrix4();
        mesh.getMatrixAt(i, m);
        return m;
      });
      this.yardMesh = mesh;
      this.object.add(mesh);
    }
    const key = [...occupancy].map(([s, u]) => `${s}=${u}`).join(',');
    if (key === this.yardKey) return;
    this.yardKey = key;
    const mesh = this.yardMesh;
    const full = mesh.userData.full as THREE.Matrix4[];
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const m = new THREE.Matrix4();
    let n = 0;
    for (const [slotId, i] of this.yardIndex) {
      full[i].decompose(pos, q, s);
      const unit = occupancy.get(slotId);
      mesh.setMatrixAt(i, m.compose(pos, q, unit ? METRE : ZERO));
      if (unit) {
        mesh.setColorAt(i, unitColor(unit));
        n++;
      }
    }
    this.yardBoxes = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }

  // ---- operations ----------------------------------------------------------------------------------------------

  /** Frame provider called once per rendered frame; the layer redraws only when the scenario instant changes. */
  setOpsSource(source: ((nowMs: number) => TwinOpsFrame | null) | null): void {
    this.opsSource = source;
  }

  update(nowMs: number): boolean {
    if (!this.opsSource || !this.equipment.size) return false;
    const f = this.opsSource(nowMs);
    if (!f || f.atMs === this.frame?.atMs) return false;
    this.setOps(f);
    return true;
  }

  /** Applies one instant of the simulated operations: crane poses, loader luff, belts, levels, arms, ramps, hazard. */
  setOps(f: TwinOpsFrame): void {
    this.frame = f;
    const status = (id: string): EquipmentStatus => f.equipment.get(id) ?? 'idle';
    this.applyCranes();
    for (const [id, l] of this.loaders) {
      const st = status(id);
      const ops = f.berths.get(l.berthId);
      const luff = st === 'transferring' ? -8 : st === 'paused' || st === 'hazard' || st === 'moored' ? 20 : 65;
      l.boom.rotation.x = -luff * DEG;
      const hold = ops ? Math.min(4, Math.floor(ops.shipFill * 5)) : 2;
      l.group.position.copy(l.base).addScaledVector(l.along, (hold - 2) * l.lengthM * 0.16);
    }
    for (const b of this.belts) {
      const m = b.berthIds.reduce((n, id) => n + (f.berths.get(id)?.beltM ?? 0), 0);
      b.tex.offset.y = -((m / 6) % 1);
    }
    for (const [id, mesh] of this.stockpiles) {
      const s = Math.cbrt(Math.max(0.01, f.levels.get(id) ?? 0));
      mesh.scale.set(34 * s, 20 * s, 62 * s);
    }
    for (const [id, mesh] of this.tankLevels) mesh.position.y = 1 + 36 * Math.max(0, Math.min(1, f.levels.get(id) ?? 0));
    for (const [id, l] of this.lanes) l.mesh.count = Math.min(l.mesh.instanceMatrix.count, Math.round(((f.levels.get(id) ?? 0) * l.capacity) / VEHICLES_PER_BLOCK));
    for (const [id, a] of this.arms) {
      const st = status(id);
      const connected = st !== 'idle' && st !== 'maintenance';
      a.inner.rotation.x = (connected ? -40 : -88) * DEG;
      a.outer.rotation.x = (connected ? 120 : 176) * DEG;
    }
    for (const [id, hinge] of this.ramps) {
      const st = status(id);
      hinge.rotation.x = (st === 'idle' || st === 'maintenance' ? -55 : 6) * DEG;
    }
    for (const [berthId, h] of this.hazardRings) {
      const on = f.hazard.has(berthId);
      h.group.visible = this.hazardVisible;
      h.ring.color.copy(on ? HAZARD_ON : HAZARD_OFF);
      h.ring.opacity = on ? 0.95 : 0.55;
      h.fill.color.copy(on ? HAZARD_ON : HAZARD_OFF);
      h.fill.opacity = on ? 0.12 : 0.05;
    }
    this.applyEquipmentLook();
  }

  setHazardVisible(on: boolean): void {
    this.hazardVisible = on;
    for (const h of this.hazardRings.values()) h.group.visible = on;
  }

  /** Trolley, ropes, spreader and the carried box of every crane at the current frame (parked without events). */
  private applyCranes() {
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const local = (slot: CraneSlot, y: number, z: number) => p.set(0, y * 0.001, z * 0.001).applyQuaternion(slot.quat).add(slot.pos);
    this.craneSlots.forEach((slot, i) => {
      if (!slot) return;
      const st = (slot.equipmentId && this.frame?.cranes.get(slot.equipmentId)) || PARKED;
      const z = lerp(STS_LANE_Z.land, STS_LANE_Z.ship, st.trolley);
      const surface = lerp(1.6, 6, st.trolley);
      const top = lerp(surface + BOX_H + 1, STS_SPREADER_TOP_Y, st.hoist);
      const trolleyY = STS_TROLLEY_Y - 2;
      this.trolleys.setMatrixAt(i, m.compose(local(slot, trolleyY, z), slot.quat, METRE));
      s.set(0.001, Math.max(0.5, trolleyY - top) * 0.001, 0.001);
      this.ropes.setMatrixAt(i, m.compose(local(slot, trolleyY, z), slot.quat, s));
      q.copy(slot.quat).multiply(q90);
      this.spreaders.setMatrixAt(i, m.compose(local(slot, top, z), q, METRE));
      this.carried.setMatrixAt(i, m.compose(local(slot, top - 1 - BOX_H, z), q, st.carrying ? METRE : ZERO));
      const sel = !!slot.equipmentId && slot.equipmentId === this.selectedEquipment;
      if (st.cargoUnitId) this.carried.setColorAt(i, sel ? FOCUS : unitColor(st.cargoUnitId));
    });
    for (const mesh of [this.trolleys, this.ropes, this.spreaders, this.carried]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  /** Focus material for the selected equipment, a muted red for maintenance, the plain material otherwise. */
  private applyEquipmentLook() {
    for (const [id, e] of this.equipment) {
      const on = id === this.selectedEquipment;
      const maint = this.frame?.equipment.get(id) === 'maintenance';
      for (const m of e.meshes) m.material = on ? this.focusMat : maint ? this.maintMat : this.equipMat;
      for (const g of e.glow) {
        g.emissive.copy(on ? FOCUS : g.color);
        g.emissiveIntensity = on ? 0.6 : g.map ? 0 : 0.15;
      }
    }
  }

  // ---- state ---------------------------------------------------------------------------------------------------

  /** Berth status at the scenario instant, conflicts, the selected berth (focus colour, lit cranes) and equipment. */
  setState(model: PortTwinModel, selectedBerthId: string | null, selectedEquipmentId: string | null = null): void {
    this.selected = selectedBerthId;
    this.selectedEquipment = selectedEquipmentId && this.equipment.has(selectedEquipmentId) ? selectedEquipmentId : null;
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
      const craneFocus = !!this.selectedEquipment && this.equipment.get(this.selectedEquipment)?.craneIndex != null;
      for (let i = from; i < to; i++) {
        const own = craneFocus && this.craneSlots[i]?.equipmentId === this.selectedEquipment;
        this.cranes.setColorAt(i, own ? FOCUS : on && !craneFocus ? FOCUS.clone().lerp(CRANE_IDLE, 0.35) : CRANE_IDLE);
      }
    }
    if (this.cranes.instanceColor) this.cranes.instanceColor.needsUpdate = true;
    this.applyCranes();
    this.applyEquipmentLook();
  }

  get selectedBerth() {
    return this.selected;
  }

  /**
   * Pointer hit: equipment wins when it has no berth or its berth is already selected (or no berth is under the
   * pointer); otherwise the berth wins, so the first click focuses the berth and the second its equipment.
   */
  pick(raycaster: THREE.Raycaster): { distance: number; berthId?: string; equipmentId?: string } | null {
    const b = raycaster.intersectObjects(this.proxies, false)[0];
    const e = this.equipProxies.length ? raycaster.intersectObjects(this.equipProxies, false)[0] : undefined;
    if (e) {
      const eb = (e.object.userData.berthId as string | null) ?? null;
      if (!b || !eb || eb === this.selected) return { distance: e.distance, equipmentId: e.object.userData.equipmentId as string, ...(eb ? { berthId: eb } : {}) };
    }
    return b ? { distance: b.distance, berthId: b.object.userData.berthId as string } : null;
  }

  /** Geographic anchor of a piece of equipment (labels, tests). */
  equipmentAnchor(id: string): { point: GeoPoint; heightM: number } | null {
    const e = this.equipment.get(id);
    return e ? { point: e.anchor, heightM: e.anchorHeightM } : null;
  }

  /** Current crane pose (tests, the equipment card's live check). */
  cranePose(id: string): { phase: string; trolley: number; hoist: number; carrying: boolean; cargoUnitId: string | null } | null {
    const e = this.equipment.get(id);
    if (!e || e.craneIndex === null) return null;
    const s = this.frame?.cranes.get(id) ?? PARKED;
    return { phase: s.phase, trolley: s.trolley, hoist: s.hoist, carrying: s.carrying, cargoUnitId: s.cargoUnitId };
  }

  /** Visual state of the typed equipment (tests): loader luff, arm connection, ramp, levels drawn. */
  opsStats() {
    const loaders = Object.fromEntries([...this.loaders].map(([id, l]) => [id, Math.round(-l.boom.rotation.x / DEG)]));
    const arms = Object.fromEntries([...this.arms].map(([id, a]) => [id, a.inner.rotation.x > -60 * DEG ? 'connected' : 'stowed']));
    const ramps = Object.fromEntries([...this.ramps].map(([id, r]) => [id, r.rotation.x > 0 ? 'lowered' : 'raised']));
    const piles = Object.fromEntries([...this.stockpiles].map(([id, m]) => [id, +m.scale.y.toFixed(2)]));
    const tanks = Object.fromEntries([...this.tankLevels].map(([id, m]) => [id, +m.position.y.toFixed(2)]));
    const lanes = Object.fromEntries([...this.lanes].map(([id, l]) => [id, l.mesh.count]));
    const belts = this.belts.map((b) => +b.tex.offset.y.toFixed(4));
    const hazard = [...this.hazardRings].map(([berthId, h]) => ({ berthId, visible: h.group.visible, active: !!this.frame?.hazard.has(berthId) }));
    return { atMs: this.frame?.atMs ?? null, loaders, arms, ramps, piles, tanks, lanes, belts, hazard };
  }

  stats() {
    return {
      ...this.counts,
      conflicts: this.conflictBerths.size,
      selected: this.selected,
      equipment: this.equipment.size,
      selectedEquipment: this.selectedEquipment,
      yardBoxes: this.yardBoxes,
      opsAtMs: this.frame?.atMs ?? null,
    };
  }

  dispose(): void {
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
    });
    for (const mat of [this.equipMat, this.focusMat, this.maintMat]) mat.dispose();
    this.object.removeFromParent();
    this.berths.clear();
    this.equipment.clear();
    this.proxies.length = 0;
    this.equipProxies.length = 0;
    this.opsSource = null;
  }
}

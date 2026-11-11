import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CargoArchetype, StowagePlan } from '@/core/cargoTypes';
import { planarTheme, portosMapTheme } from '@/map/theme';
import { buildShipGeometry, shipHullProfile, type HullProfile } from '@/map/vessels3d/library';
import type { ShipModelKey } from '@/map/vessels3d/categories';

/**
 * Vessel workshop (V3 spec 04/04): the selected vessel's inspection model with its real stowage. Container ships draw
 * one instanced box per filled slot of the stowage plan; holds, tanks and vehicle decks are picked as compartments.
 * Model frame per `contract.ts` (bow −Z, up +Y, starboard +X, length 1). Renders on demand into its own small canvas.
 */
export type WorkshopCameraMode = 'chase' | 'above' | 'orbit' | 'deck' | 'free';
export const WORKSHOP_CAMERA_MODES: readonly WorkshopCameraMode[] = ['chase', 'above', 'orbit', 'deck', 'free'];
/** Chase rig distance behind the ship's centre, in ship lengths (spec: 1.3 L aft). */
export const CHASE_DISTANCE_L = 1.3;
export const WORKSHOP_TWEEN_MS = 450;
const EXPLODE_MS = 380;

/** Discharge-port swatches (palette index from `destinationOrder`): cool hues so the orange selection always stands out. */
export const CARGO_SWATCHES = ['#6FB3C4', '#A99BDB', '#93C181', '#D8C27A', '#7F9AB8', '#C79BB4'];
const SELECT = new THREE.Color(portosMapTheme.accent);

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  fov: number;
}

/** Bridge position by hull (fraction of length from the stern), matching the library's accommodation blocks. */
const BRIDGE_S: Partial<Record<ShipModelKey, number>> = { container: 0.2, tanker: 0.09, gas: 0.09, bulk: 0.09, general: 0.12, roro: 0.86 };

/** Distance that fits `span` (model units) across the narrower of the two frustum dimensions. */
export function fitDistance(span: number, fovDeg: number, aspect: number): number {
  const half = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  return span / 2 / (half * Math.min(1, aspect));
}

/** Camera rig per mode. `orbitDeg` is the azimuth for orbit and free; chase/above/deck are fixed rigs. */
export function workshopCameraPose(mode: WorkshopCameraMode, key: ShipModelKey, aspect: number, orbitDeg = 35): Pose {
  const prof = shipHullProfile(key);
  const up = new THREE.Vector3(0, 1, 0);
  // Ro-Ro decks stack far above the freeboard; frame from the top of the cargo so perspective never clips it.
  const top = key === 'roro' ? prof.freeboard * 5.6 : prof.freeboard * 2;
  switch (mode) {
    case 'chase':
      return { position: new THREE.Vector3(0, 0.46, CHASE_DISTANCE_L), target: new THREE.Vector3(0, prof.freeboard, -0.22), up, fov: 30 };
    case 'above': {
      // Fit the length (1.12 with margin) across the frame width; the beam always fits the height.
      const d = Math.max(0.6, 0.56 / (Math.tan(THREE.MathUtils.degToRad(16)) * Math.max(aspect, 0.5)));
      // A 2° tilt towards starboard keeps Y-up while putting the bow to the right and port at the top of the frame.
      return { position: new THREE.Vector3(d * Math.tan(THREE.MathUtils.degToRad(2)), d + top, 0), target: new THREE.Vector3(0, top, 0), up, fov: 32 };
    }
    case 'deck': {
      const s = BRIDGE_S[key] ?? 0.12;
      const y = key === 'roro' ? prof.freeboard * 5.4 : prof.freeboard * (key === 'container' ? 4.9 : 4.4);
      const z = prof.zOf(s) - (key === 'roro' ? 0.02 : 0.035);
      return { position: new THREE.Vector3(0, y, z), target: new THREE.Vector3(0, prof.freeboard * 0.8, key === 'roro' ? 0.6 : -0.5), up, fov: 58 };
    }
    case 'orbit':
    case 'free': {
      const r = Math.max(0.78, fitDistance(1.05, 34, aspect) * 0.6) * (key === 'roro' ? 1.22 : 1);
      const a = THREE.MathUtils.degToRad(orbitDeg);
      const el = THREE.MathUtils.degToRad(24);
      const ty = key === 'roro' ? top * 0.5 : prof.freeboard;
      return { position: new THREE.Vector3(Math.sin(a) * Math.cos(el) * r, ty + Math.sin(el) * r, Math.cos(a) * Math.cos(el) * r), target: new THREE.Vector3(0, ty, 0), up, fov: 34 };
    }
  }
}

/** Stowage box for one slot in the model frame (illustrative: bays are spread over the cargo length, not to scale). */
export interface SlotBox {
  slotId: string;
  bay: number;
  center: THREE.Vector3;
  size: THREE.Vector3;
  bayIndex: number;
  tierIndex: number;
  above: boolean;
}

const CARGO_S0 = 0.245;
const CARGO_S1 = 0.9;

export function containerLayout(plan: StowagePlan, prof: HullProfile): SlotBox[] {
  const g = plan.grid;
  if (!g) return [];
  const bays = [...g.bays].sort((a, b) => a - b);
  const pitch = (CARGO_S1 - CARGO_S0) / bays.length;
  const rowsOrdered = [...g.rows.filter((r) => r % 2 === 0).sort((a, b) => b - a), ...g.rows.filter((r) => r % 2 === 1).sort((a, b) => a - b)];
  const below = [...g.tiersBelow].sort((a, b) => a - b);
  const above = [...g.tiersAbove].sort((a, b) => a - b);
  const out: SlotBox[] = [];
  for (const s of plan.slots) {
    const bi = bays.indexOf(s.bay);
    // Bay 02 is forward (ISO numbering runs from the bow), so the lowest bay sits nearest the stem.
    const sMid = CARGO_S1 - pitch * (bi + 0.5);
    const width = Math.min(prof.beam * 0.92, prof.halfBreadth(sMid) * 2 * 0.94);
    const rowPitch = width / rowsOrdered.length;
    const h = Math.min(rowPitch * 1.02, prof.freeboard * 0.32);
    const ri = rowsOrdered.indexOf(s.row);
    const isAbove = s.tier >= 80;
    const ti = isAbove ? above.indexOf(s.tier) : below.indexOf(s.tier);
    const y = isAbove ? prof.deckY(sMid) + h * 0.12 + ti * h : prof.freeboard - (below.length - ti) * h;
    out.push({
      slotId: s.slotId,
      bay: s.bay,
      center: new THREE.Vector3(-width / 2 + rowPitch * (ri + 0.5), y + h / 2, prof.zOf(sMid)),
      size: new THREE.Vector3(rowPitch * 0.9, h * 0.92, pitch * 0.9),
      bayIndex: bi,
      tierIndex: isAbove ? below.length + ti : ti,
      above: isAbove,
    });
  }
  return out;
}

export interface CompartmentBox {
  compartmentId: string;
  center: THREE.Vector3;
  size: THREE.Vector3;
  shape: 'box' | 'sphere';
  fill: number;
  index: number;
}

export function compartmentLayout(plan: StowagePlan, prof: HullProfile, archetype: CargoArchetype): CompartmentBox[] {
  const n = plan.compartments.length;
  const fb = prof.freeboard;
  return plan.compartments.map((c, i) => {
    let s: number;
    let size: THREE.Vector3;
    let y: number;
    let shape: CompartmentBox['shape'] = 'box';
    switch (archetype) {
      case 'lng':
        s = 0.3 + (n - 1 - i) * 0.165;
        size = new THREE.Vector3(prof.beam * 0.8, prof.beam * 0.8, prof.beam * 0.8);
        y = fb * 1.5;
        shape = 'sphere';
        break;
      case 'roro': {
        const h = (fb * 4.2) / n;
        s = 0.45;
        size = new THREE.Vector3(prof.beam * 0.9, h * 0.8, 0.78);
        y = fb + h * (i + 0.5);
        break;
      }
      default: {
        const s0 = archetype === 'tanker' ? 0.2 : archetype === 'general' ? 0.27 : 0.165;
        const s1 = archetype === 'tanker' ? 0.84 : archetype === 'general' ? 0.79 : 0.785;
        const pitch = (s1 - s0) / n;
        s = s1 - pitch * (i + 0.5);
        size = new THREE.Vector3(prof.beam * (archetype === 'tanker' ? 0.84 : 0.66), fb * 0.86, pitch * 0.88);
        y = fb * 0.52;
      }
    }
    return { compartmentId: c.compartmentId, center: new THREE.Vector3(0, y, prof.zOf(s)), size, shape, fill: c.fillFraction, index: i };
  });
}

export interface WorkshopSlotState {
  swatch: number;
  restricted: boolean;
}

export interface WorkshopCargo {
  /** Filled slots at the current time (slotId → colour key). Ignored for compartment plans. */
  filled: Map<string, WorkshopSlotState>;
  selected: string | null;
  hold: number | null;
  holdOfSlot?: (slotId: string) => number;
}

export interface WorkshopStats {
  mode: WorkshopCameraMode;
  exploded: boolean;
  explode: number;
  modelKey: ShipModelKey | null;
  archetype: CargoArchetype | null;
  slots: number;
  filled: number;
  compartments: number;
  selected: string | null;
  hold: number | null;
  hullOpacity: number;
  cameraDistance: number;
  cameraBehind: number;
  drawCalls: number;
  triangles: number;
  frames: number;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export class VesselWorkshopScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.005, 20);
  readonly controls: OrbitControls;
  onPick: ((hit: { kind: 'slot' | 'compartment'; id: string } | null) => void) | null = null;
  onModeChange: ((mode: WorkshopCameraMode) => void) | null = null;

  private ship = new THREE.Group();
  private hull: THREE.Mesh | null = null;
  private hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05, transparent: true });
  private boxes: THREE.InstancedMesh | null = null;
  private boxSlots: SlotBox[] = [];
  private instanceSlot: string[] = [];
  private compartments = new THREE.Group();
  private compartmentBoxes: CompartmentBox[] = [];
  private outline: THREE.LineSegments;
  private key: ShipModelKey | null = null;
  private plan: StowagePlan | null = null;
  private archetype: CargoArchetype | null = null;
  private cargo: WorkshopCargo = { filled: new Map(), selected: null, hold: null };
  private mode: WorkshopCameraMode = 'free';
  private exploded = false;
  private explode = 0;
  private tween: { from: Pose; to: Pose; start: number } | null = null;
  private raf = 0;
  private explodeFrom: { value: number; start: number } | null = null;
  private frames = 0;
  private width = 1;
  private height = 1;
  private disposed = false;
  private suppressInteract = false;
  private readonly reducedMotion: boolean;

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean } = {}) {
    this.reducedMotion = !!opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xdfe9ec, 0x22343a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.6, 1.2, 0.8);
    this.scene.add(sun);
    const ocean = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: planarTheme.ocean, transparent: true, opacity: 0.85 }));
    ocean.position.y = -0.001;
    ocean.renderOrder = -1;
    const grid = new THREE.PolarGridHelper(1.5, 8, 6, 64, planarTheme.oceanGrid, planarTheme.oceanGrid);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(ocean, grid, this.ship);
    this.ship.add(this.compartments);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: SELECT, depthTest: false }));
    this.outline.renderOrder = 10;
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 4;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.addEventListener('start', () => {
      if (this.suppressInteract) return;
      this.tween = null;
      if (this.mode !== 'free') this.setMode('free', { animate: false, emit: true });
    });
    this.controls.addEventListener('change', () => this.requestRender());
  }

  setVessel(key: ShipModelKey, plan: StowagePlan | null) {
    if (this.key === key && this.plan === plan) return;
    this.key = key;
    this.plan = plan;
    this.archetype = plan?.archetype ?? null;
    this.clearModel();
    const geo = buildShipGeometry(key, 3, { cargo: false }).clone();
    geo.setAttribute('color', geo.getAttribute('partColor'));
    this.hull = new THREE.Mesh(geo, this.hullMat);
    this.ship.add(this.hull);
    const prof = shipHullProfile(key);
    if (plan?.archetype === 'container') {
      this.boxSlots = containerLayout(plan, prof);
      const geom = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
      this.boxes = new THREE.InstancedMesh(geom, mat, Math.max(1, this.boxSlots.length));
      this.boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.boxes.count = 0;
      this.boxes.frustumCulled = false;
      this.ship.add(this.boxes);
    } else if (plan) {
      this.compartmentBoxes = compartmentLayout(plan, prof, plan.archetype);
      for (const c of this.compartmentBoxes) {
        const shell = new THREE.Mesh(
          c.shape === 'sphere' ? new THREE.SphereGeometry(0.5, 28, 18) : new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({ color: '#9fb4bb', transparent: true, opacity: 0.22, roughness: 0.4, depthWrite: false }),
        );
        shell.scale.copy(c.size);
        shell.userData.compartmentId = c.compartmentId;
        const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: CARGO_SWATCHES[0], roughness: 0.7 }));
        const fs = c.shape === 'sphere' ? 0.7 : 0.96;
        fill.scale.set(c.size.x * fs, c.size.y * fs * c.fill, c.size.z * fs);
        fill.position.y = -(c.size.y * fs * (1 - c.fill)) / 2;
        fill.userData.compartmentId = c.compartmentId;
        const g = new THREE.Group();
        g.position.copy(c.center);
        g.userData.compartmentId = c.compartmentId;
        g.add(shell, fill);
        this.compartments.add(g);
      }
    }
    this.applyCargo();
    this.snapCamera();
  }

  setCargo(cargo: WorkshopCargo) {
    this.cargo = cargo;
    this.applyCargo();
  }

  setExploded(on: boolean) {
    if (this.exploded === on) return;
    this.exploded = on;
    if (this.reducedMotion) {
      this.explode = on ? 1 : 0;
      this.applyCargo();
    } else {
      this.explodeFrom = { value: this.explode, start: performance.now() };
      this.requestRender();
    }
  }

  getMode(): WorkshopCameraMode {
    return this.mode;
  }

  setMode(mode: WorkshopCameraMode, opts: { animate?: boolean; emit?: boolean } = {}) {
    const changed = mode !== this.mode;
    this.mode = mode;
    this.controls.autoRotate = mode === 'orbit' && !this.reducedMotion;
    if (mode !== 'free' && this.key) {
      const to = workshopCameraPose(mode, this.key, this.width / this.height, this.currentAzimuth());
      if (opts.animate === false || this.reducedMotion) this.applyPose(to);
      else this.tween = { from: this.currentPose(), to, start: performance.now() };
    }
    if (changed && opts.emit) this.onModeChange?.(mode);
    this.requestRender();
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    if (this.mode !== 'free') this.setMode(this.mode, { animate: false });
    this.requestRender();
  }

  /** Pick at canvas-relative CSS pixels. */
  pickAt(x: number, y: number): { kind: 'slot' | 'compartment'; id: string } | null {
    const ndc = new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    this.ship.updateMatrixWorld(true);
    if (this.boxes && this.boxes.count) {
      const hit = ray.intersectObject(this.boxes, false)[0];
      if (hit?.instanceId !== undefined) return { kind: 'slot', id: this.instanceSlot[hit.instanceId]! };
    }
    const hits = ray.intersectObjects(this.compartments.children, true);
    for (const h of hits) {
      const id = h.object.userData.compartmentId as string | undefined;
      if (id) return { kind: 'compartment', id };
    }
    return null;
  }

  /** Canvas CSS-pixel position of a slot or compartment centre (test adapter and labels). */
  project(id: string): { x: number; y: number } | null {
    const p = this.worldCenter(id);
    if (!p) return null;
    p.project(this.camera);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
  }

  stats(): WorkshopStats {
    const info = this.renderer.info.render;
    const behind = this.camera.position.z;
    return {
      mode: this.mode,
      exploded: this.exploded,
      explode: this.explode,
      modelKey: this.key,
      archetype: this.archetype,
      slots: this.boxSlots.length,
      filled: this.boxes?.count ?? 0,
      compartments: this.compartmentBoxes.length,
      selected: this.cargo.selected,
      hold: this.cargo.hold,
      hullOpacity: this.hullMat.opacity,
      cameraDistance: this.camera.position.distanceTo(this.controls.target),
      cameraBehind: behind,
      drawCalls: info.calls,
      triangles: info.triangles,
      frames: this.frames,
    };
  }

  requestRender() {
    if (this.raf || this.disposed) return;
    this.raf = requestAnimationFrame(() => this.frame());
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.clearModel();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.hullMat.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ---------------- internals ----------------

  private frame() {
    this.raf = 0;
    if (this.disposed) return;
    let again = false;
    const target = this.exploded ? 1 : 0;
    if (this.explode !== target) {
      // Wall-clock tween: completes in EXPLODE_MS whatever the frame rate.
      const from = this.explodeFrom ?? { value: this.explode, start: performance.now() };
      const k = this.reducedMotion ? 1 : Math.min(1, (performance.now() - from.start) / (EXPLODE_MS * Math.max(0.05, Math.abs(target - from.value))));
      this.explode = k >= 1 ? target : from.value + (target - from.value) * k;
      this.applyCargo();
      again = this.explode !== target;
      if (!again) this.explodeFrom = null;
    }
    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.start) / WORKSHOP_TWEEN_MS);
      const e = 1 - Math.pow(1 - k, 3);
      this.applyPose(lerpPose(this.tween.from, this.tween.to, e));
      if (k >= 1) this.tween = null;
      else again = true;
    }
    if (this.controls.autoRotate) {
      this.suppressInteract = true;
      this.controls.update();
      this.suppressInteract = false;
      again = true;
    }
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (again) this.requestRender();
  }

  private applyCargo() {
    const e = this.explode;
    const focusBelow = this.focusIsBelowDeck();
    this.hullMat.opacity = THREE.MathUtils.lerp(focusBelow ? 0.32 : 1, 0.22, e);
    this.hullMat.depthWrite = this.hullMat.opacity > 0.99;
    if (this.boxes) {
      const sel = this.cargo.selected;
      const hold = this.cargo.hold;
      const col = new THREE.Color();
      let n = 0;
      this.instanceSlot.length = 0;
      const bays = Math.max(1, ...this.boxSlots.map((b) => b.bayIndex + 1));
      for (const b of this.boxSlots) {
        const st = this.cargo.filled.get(b.slotId);
        if (!st) continue;
        tmpV.copy(b.center);
        tmpV.z += (b.bayIndex - (bays - 1) / 2) * 0.018 * e;
        tmpV.y += b.tierIndex * b.size.y * 0.45 * e + (b.above ? 0.03 * e : 0);
        tmpS.copy(b.size);
        tmpM.compose(tmpV, tmpQ.identity(), tmpS);
        this.boxes.setMatrixAt(n, tmpM);
        col.set(CARGO_SWATCHES[st.swatch % CARGO_SWATCHES.length]!);
        if (st.restricted) col.lerp(new THREE.Color('#5d666b'), 0.55);
        const inHold = hold === null || this.cargo.holdOfSlot?.(b.slotId) === hold;
        if (!inHold) col.multiplyScalar(0.28);
        if (b.slotId === sel) col.copy(SELECT);
        this.boxes.setColorAt(n, col);
        this.instanceSlot[n] = b.slotId;
        n++;
      }
      this.boxes.count = n;
      this.boxes.instanceMatrix.needsUpdate = true;
      if (this.boxes.instanceColor) this.boxes.instanceColor.needsUpdate = true;
      this.boxes.computeBoundingSphere();
    }
    for (const g of this.compartments.children) {
      const c = this.compartmentBoxes.find((x) => x.compartmentId === g.userData.compartmentId)!;
      g.position.copy(c.center);
      g.position.y += e * (this.archetype === 'roro' ? c.index * 0.016 : 0.09 + (c.index % 2) * 0.02);
      const selected = this.cargo.selected === c.compartmentId;
      const [shell, fill] = g.children as THREE.Mesh[];
      const sm = shell!.material as THREE.MeshStandardMaterial;
      sm.color.set(selected ? SELECT : new THREE.Color('#9fb4bb'));
      sm.opacity = selected ? 0.42 : 0.22;
      (fill!.material as THREE.MeshStandardMaterial).color.set(selected ? SELECT : CARGO_SWATCHES[0]!);
    }
    this.placeOutline();
    this.requestRender();
  }

  private focusIsBelowDeck(): boolean {
    if (this.archetype && this.archetype !== 'container') return this.cargo.selected !== null;
    if (this.cargo.hold !== null) return true;
    const b = this.cargo.selected ? this.boxSlots.find((x) => x.slotId === this.cargo.selected) : null;
    return !!b && !b.above;
  }

  private placeOutline() {
    const id = this.cargo.selected;
    const box = id ? this.selectedBox(id) : null;
    this.outline.visible = !!box;
    if (box) {
      this.outline.position.copy(box.center);
      this.outline.scale.copy(box.size).multiplyScalar(1.08);
    }
  }

  private selectedBox(id: string): { center: THREE.Vector3; size: THREE.Vector3 } | null {
    const center = this.worldCenter(id);
    if (!center) return null;
    const b = this.boxSlots.find((x) => x.slotId === id);
    if (b) return { center, size: b.size.clone() };
    const c = this.compartmentBoxes.find((x) => x.compartmentId === id);
    return c ? { center, size: c.size.clone() } : null;
  }

  private worldCenter(id: string): THREE.Vector3 | null {
    const e = this.explode;
    const b = this.boxSlots.find((x) => x.slotId === id);
    if (b) {
      const bays = Math.max(1, ...this.boxSlots.map((x) => x.bayIndex + 1));
      const p = b.center.clone();
      p.z += (b.bayIndex - (bays - 1) / 2) * 0.018 * e;
      p.y += b.tierIndex * b.size.y * 0.45 * e + (b.above ? 0.03 * e : 0);
      return p;
    }
    const g = this.compartments.children.find((x) => x.userData.compartmentId === id);
    return g ? g.position.clone() : null;
  }

  private currentAzimuth(): number {
    const p = this.camera.position.clone().sub(this.controls.target);
    return p.lengthSq() < 1e-9 ? 35 : THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z));
  }

  private currentPose(): Pose {
    return { position: this.camera.position.clone(), target: this.controls.target.clone(), up: this.camera.up.clone(), fov: this.camera.fov };
  }

  private applyPose(p: Pose) {
    this.camera.position.copy(p.position);
    this.camera.up.copy(p.up);
    this.controls.target.copy(p.target);
    if (this.camera.fov !== p.fov) {
      this.camera.fov = p.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(p.target);
    this.suppressInteract = true;
    this.controls.update();
    this.suppressInteract = false;
  }

  private snapCamera() {
    if (!this.key) return;
    this.applyPose(workshopCameraPose(this.mode === 'free' ? 'free' : this.mode, this.key, this.width / this.height));
    this.requestRender();
  }

  private clearModel() {
    if (this.hull) {
      this.hull.geometry.dispose();
      this.ship.remove(this.hull);
      this.hull = null;
    }
    if (this.boxes) {
      this.boxes.geometry.dispose();
      (this.boxes.material as THREE.Material).dispose();
      this.boxes.dispose();
      this.ship.remove(this.boxes);
      this.boxes = null;
    }
    for (const g of [...this.compartments.children]) {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      this.compartments.remove(g);
    }
    this.boxSlots = [];
    this.compartmentBoxes = [];
    this.instanceSlot = [];
  }
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    position: a.position.clone().lerp(b.position, t),
    target: a.target.clone().lerp(b.target, t),
    up: a.up.clone().lerp(b.up, t).normalize(),
    fov: THREE.MathUtils.lerp(a.fov, b.fov, t),
  };
}

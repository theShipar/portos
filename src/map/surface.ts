import type * as THREE from 'three';
import type { CameraPose, CameraPreset } from './earth/camera';
import type { Country } from './earth/worldGeo';

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

/** What is under the pointer on a map surface (globe or extruded geography). */
export interface SurfacePointerHit {
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
  country: Country | null;
  /** Port twin berth under the pointer (port scenes only). */
  berthId?: string;
}

export interface SurfaceEvents {
  hover: (hit: SurfacePointerHit | null, e: PointerEvent) => void;
  click: (hit: SurfacePointerHit | null, e: PointerEvent) => void;
  dblclick: (hit: SurfacePointerHit | null, e: PointerEvent) => void;
  userInteract: () => void;
  cameraSettled: (pose: CameraPose) => void;
  contextLost: () => void;
}

/**
 * The camera, projection and overlay contract shared by the globe (`EarthScene`) and the extruded region / country /
 * city scenes (`Region3DScene`). Maritime overlays, DOM labels, clustering and camera presets talk to this interface
 * only, so the same layers and flows work on every surface. Camera presets and poses stay in globe units (centre
 * lat/lon + distance from the globe centre, R = 2); planar surfaces convert them to an equivalent altitude.
 */
export interface MapSurface {
  readonly surfaceKind: 'globe' | 'planar';
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  /** Group in which overlays add their objects (geographic frame of the surface). */
  readonly overlay: THREE.Group;
  readonly viewport: { width: number; height: number };
  /** World units per CSS pixel at view depth 1. */
  readonly pxToWorld: number;
  readonly viewAspect: { fov: number; aspect: number };
  readonly distanceLimits: { min: number; max: number };
  /** Camera distance in globe units (what the globe camera would need for the same ground scale). */
  readonly equivalentDistance: number;
  /** World units per globe unit (1 on the globe); scales world-space sizes such as line dash lengths. */
  readonly globeUnitScale: number;
  readonly flying: boolean;
  readonly motionReduced: boolean;
  /** True-scale scenes (port twin) depth-test ships against land and structures instead of drawing them on top. */
  readonly shipsDepthTested?: boolean;
  invalidate(): void;
  resize(): void;
  project(lat: number, lon: number, radius?: number): ScreenPoint;
  /** Instance centre for screen-sized markers (globe: unit sphere; planar: world position on the water). */
  markerCenter(lat: number, lon: number): [number, number, number];
  /** World position for line vertices; `radius` (globe units) lifts lines off the surface on the globe. */
  linePosition(lat: number, lon: number, radius: number): [number, number, number];
  /** Added to a true course so markers keep their real heading on the surface (grid convergence). */
  headingOffset(lat: number, lon: number): number;
  /** Camera altitude above the surface in globe units (drives marker size and LOD). */
  markerAltitude(): number;
  setOverlayCanvas(canvas: HTMLCanvasElement | null): void;
  flyTo(preset: CameraPreset, opts?: { duration?: number }): Promise<boolean>;
  flyToPose(pose: CameraPose, limits: { min: number; max: number }): Promise<boolean>;
  jumpToPose(pose: CameraPose): Promise<boolean>;
  focusPoint(lat: number, lon: number, opts?: { maxDistance?: number }): Promise<boolean>;
  cancelFlight(): void;
  getPose(): CameraPose;
  isComfortablyInView(lat: number, lon: number, margin?: number): boolean;
  setRightInset(px: number, opts?: { instant?: boolean }): void;
  setIdleRotation(allowed: boolean): void;
  setReducedMotion(v: boolean): void;
  /** Countries in the current scope (globe: lit land; planar: focus tone). */
  setRegionHighlight(iso3: string[] | null): void;
  setHoverHighlight(iso3: string[] | null): void;
  on<K extends keyof SurfaceEvents>(event: K, fn: SurfaceEvents[K]): () => void;
  onFrame(fn: (nowMs: number, dirty: boolean) => void): () => void;
  stats(): { calls: number; triangles: number; lines: number; points: number; geometries: number; textures: number };
}

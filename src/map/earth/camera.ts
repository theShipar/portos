import gsap from 'gsap';
import { PerspectiveCamera, Vector3 } from 'three';
import { boundsCenter, boundsSpanDeg, inverseSpherical, sphericalPosition } from '@/core/geo';
import type { Bounds, GeoPoint } from '@/core/types';

export const EARTH_RADIUS = 2;

/** Camera pose around the globe centre: sub-camera point + distance from the centre (scene units, R = 2). */
export interface CameraPose {
  lat: number;
  lon: number;
  distance: number;
}

export interface CameraPreset {
  id: string;
  scope: 'earth' | 'region' | 'country' | 'city' | 'port' | 'vessel';
  center: GeoPoint;
  distance: number;
  minDistance: number;
  maxDistance: number;
}

export const EARTH_PRESET: CameraPreset = { id: 'earth', scope: 'earth', center: { lon: 72, lat: 12 }, distance: 7.4, minDistance: 2.6, maxDistance: 12 };

const DEG = Math.PI / 180;

export function poseToPosition(p: CameraPose, out = new Vector3()): Vector3 {
  const [x, y, z] = sphericalPosition(p.lat, p.lon, p.distance);
  return out.set(x, y, z);
}

export function positionToPose(v: Vector3): CameraPose {
  const g = inverseSpherical(v.x, v.y, v.z);
  return { lat: g.lat, lon: g.lon, distance: v.length() };
}

/** Great-circle angle between two geo points (radians). */
export function angularDistance(a: GeoPoint, b: GeoPoint): number {
  const va = new Vector3(...sphericalPosition(a.lat, a.lon, 1));
  const vb = new Vector3(...sphericalPosition(b.lat, b.lon, 1));
  return va.angleTo(vb);
}

/**
 * Distance from the globe centre at which a spherical cap of half-angle `alpha` fits the vertical/horizontal FOV.
 * tanβ = R·sinα / (D − R·cosα)  ⇒  D = R·cosα + R·sinα / tanβ
 */
export function distanceToFitBounds(b: Bounds, camera: Pick<PerspectiveCamera, 'fov' | 'aspect'>, fill = 0.82): number {
  const span = boundsSpanDeg(b);
  const c = boundsCenter(b);
  const halfLat = (span.lat / 2) * DEG;
  const halfLon = (span.lon / 2) * DEG * Math.cos(c.lat * DEG);
  const vHalf = (camera.fov / 2) * DEG * fill;
  const hHalf = Math.atan(Math.tan((camera.fov / 2) * DEG) * camera.aspect) * fill;
  const d = (alpha: number, beta: number) => EARTH_RADIUS * Math.cos(alpha) + (EARTH_RADIUS * Math.sin(alpha)) / Math.tan(beta);
  return Math.max(d(Math.min(halfLat, 1.2), vHalf), d(Math.min(halfLon, 1.2), hHalf));
}

/** Region data stores `cameraPreset.distance` with Earth radius = 100 (design default at 16:10). */
export function regionPreset(id: string, bounds: Bounds, dataDistance: number, camera: Pick<PerspectiveCamera, 'fov' | 'aspect'>): CameraPreset {
  const fitted = distanceToFitBounds(bounds, camera);
  const hinted = (dataDistance / 100) * EARTH_RADIUS;
  const distance = Math.min(hinted * 1.35, Math.max(hinted * 0.75, fitted));
  return { id, scope: 'region', center: boundsCenter(bounds), distance, minDistance: 2.25, maxDistance: Math.max(9, distance * 1.6) };
}

/** Country and city framing on the globe: fit the registry bounds, never closer than a city-scale altitude. */
export function boundsPreset(id: string, scope: 'country' | 'city', bounds: Bounds, camera: Pick<PerspectiveCamera, 'fov' | 'aspect'>): CameraPreset {
  const distance = Math.max(EARTH_RADIUS + (scope === 'city' ? 0.06 : 0.25), distanceToFitBounds(bounds, camera, 0.78));
  return { id, scope, center: boundsCenter(bounds), distance, minDistance: 2.06, maxDistance: Math.max(6, distance * 2) };
}

export function pointPreset(id: string, scope: 'port' | 'vessel', center: GeoPoint, altitude: number): CameraPreset {
  return { id, scope, center, distance: EARTH_RADIUS + altitude, minDistance: 2.08, maxDistance: 9 };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Slerp between two sub-camera points; returns lat/lon along the great circle. */
function slerpGeo(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const va = new Vector3(...sphericalPosition(a.lat, a.lon, 1));
  const vb = new Vector3(...sphericalPosition(b.lat, b.lon, 1));
  const omega = va.angleTo(vb);
  if (omega < 1e-6) return { ...b };
  const s = Math.sin(omega);
  const v = va.multiplyScalar(Math.sin((1 - t) * omega) / s).add(vb.multiplyScalar(Math.sin(t * omega) / s));
  return inverseSpherical(v.x, v.y, v.z);
}

export function interpolatePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  const g = slerpGeo(from, to, t);
  const omega = angularDistance(from, to);
  const lift = Math.sin(Math.PI * t) * Math.min(2.2, omega * 1.5) * (Math.max(from.distance, to.distance) > 4 ? 0.6 : 1);
  return { lat: g.lat, lon: g.lon, distance: lerp(from.distance, to.distance, t) + lift };
}

export function flightDuration(from: CameraPose, to: CameraPose, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const omega = angularDistance(from, to);
  const zoom = Math.abs(Math.log(to.distance / from.distance));
  return Math.min(1.4, Math.max(0.8, 0.8 + omega * 0.35 + zoom * 0.25));
}

/**
 * One controller per view. A new flight cancels the current one and starts from the camera's actual pose.
 * Resolves `true` when the flight completed, `false` when cancelled.
 */
export class CameraTransitionController {
  private tween: gsap.core.Tween | null = null;
  private resolveCurrent: ((done: boolean) => void) | null = null;

  constructor(
    private readonly getPose: () => CameraPose,
    private readonly applyPose: (p: CameraPose) => void,
  ) {}

  get active() {
    return this.tween !== null;
  }

  flyTo(target: CameraPose, opts: { duration?: number; reducedMotion?: boolean } = {}): Promise<boolean> {
    this.cancel();
    const from = this.getPose();
    const duration = opts.duration ?? flightDuration(from, target, !!opts.reducedMotion);
    if (duration <= 0) {
      this.applyPose(target);
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      this.resolveCurrent = resolve;
      const state = { t: 0 };
      this.tween = gsap.to(state, {
        t: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => this.applyPose(interpolatePose(from, target, state.t)),
        onComplete: () => {
          this.applyPose(target);
          this.tween = null;
          this.resolveCurrent = null;
          resolve(true);
        },
      });
    });
  }

  cancel() {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
    if (this.resolveCurrent) {
      const r = this.resolveCurrent;
      this.resolveCurrent = null;
      r(false);
    }
  }
}

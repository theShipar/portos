/**
 * Follow camera contract (spec 09). Pure: modes, damping and the course → camera azimuth mapping shared by the globe
 * and the extruded scenes. The camera eases toward the vessel with an exponential response; it never moves the vessel.
 */

export const FOLLOW_MODES = [
  { key: 'chase', label: 'Chase', hint: 'Behind the ship, looking along its course' },
  { key: 'above', label: 'Above', hint: 'Top-down over the ship' },
  { key: 'orbit', label: 'Orbit', hint: 'Keeps the ship centred; drag to orbit around it' },
  { key: 'courseUp', label: 'Course up', hint: 'Oblique view with the course pointing up' },
] as const;
export type FollowMode = (typeof FOLLOW_MODES)[number]['key'];

/** Exponential time constant: ~95 % of a step is caught up in 3τ ≈ 270 ms (spec: 200–350 ms, no jitter). */
export const FOLLOW_TAU_MS = 90;
/** Camera distance on entry, in ship lengths (zoom only ever moves closer on entry). */
export const FOLLOW_FRAME_LENGTHS = 14;
/** A drag that moves the view centre this far (in camera distances) is a pan and releases follow; a rotate does not. */
export const FOLLOW_RELEASE_DISTANCE = 0.08;

export interface FollowTarget {
  lat: number;
  lon: number;
  /** True course over ground; null when unknown (moored, no COG): chase and course-up then keep the current azimuth. */
  courseDeg: number | null;
  mode: FollowMode;
  /** Requested camera distance in metres while engaging; null keeps the user's zoom. */
  frameMetres: number | null;
}

/** Result of one follow step on a surface. */
export type FollowStatus = 'following' | 'released' | 'edge' | 'idle';

export function isFollowMode(v: unknown): v is FollowMode {
  return FOLLOW_MODES.some((m) => m.key === v);
}

/** Fraction of the remaining offset to close in a frame of `dtMs` (frame-rate independent). */
export function followAlpha(dtMs: number, tauMs = FOLLOW_TAU_MS): number {
  if (dtMs <= 0) return 0;
  return 1 - Math.exp(-dtMs / tauMs);
}

/** Shortest signed angle from `a` to `b`, radians in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Orbit azimuth (three.js `Spherical.theta` about +Y, world x east, z south) that puts the camera behind a ship on
 * `courseDeg`, so the bow points up the screen. `gridOffsetRad` is the surface's grid convergence at the ship.
 */
export function behindAzimuth(courseDeg: number, gridOffsetRad = 0): number {
  return -((courseDeg * Math.PI) / 180 + gridOffsetRad);
}

/** Polar angle (from straight down) per mode on extruded scenes; null keeps the current tilt. */
export function modePolar(mode: FollowMode): number | null {
  switch (mode) {
    case 'chase':
      return 1.08;
    case 'above':
      return 0.12;
    case 'courseUp':
      return 0.62;
    default:
      return null;
  }
}

/** Whether a mode steers the azimuth from the course. */
export function modeSteersAzimuth(mode: FollowMode): boolean {
  return mode === 'chase' || mode === 'courseUp';
}

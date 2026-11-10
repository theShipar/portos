/**
 * Ship model coordinate contract (spec 08). Every hull is built with its bow towards −Z, deck up +Y, starboard +X,
 * origin at mid-length on the calm waterline (y = 0) and length normalised to 1 (bow z = −0.5, stern z = +0.5).
 * Scene frames use +X east, +Y up and −Z north, so a heading of 0° true needs no rotation.
 */
export const MODEL_FORWARD = Object.freeze({ x: 0, y: 0, z: -1 });
export const MODEL_UP = Object.freeze({ x: 0, y: 1, z: 0 });

const TAU = Math.PI * 2;

/** Wrap an angle to (−π, π]. */
export function wrapRadians(a: number): number {
  const w = ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return w === -Math.PI ? Math.PI : w;
}

/** Wrap degrees to [0, 360). */
export function wrapDegrees(d: number): number {
  return ((d % 360) + 360) % 360;
}

/**
 * Three.js yaw (rotation about +Y, right-handed) that points the model bow along a true heading measured clockwise
 * from north. North → 0, east → −π/2, south → π, west → +π/2.
 */
export function headingToYaw(headingDeg: number): number {
  return wrapRadians((-wrapDegrees(headingDeg) * Math.PI) / 180);
}

/** Inverse of {@link headingToYaw}: degrees true in [0, 360). */
export function yawToHeading(yaw: number): number {
  return wrapDegrees((-yaw * 180) / Math.PI);
}

/** Unit bow direction in the scene frame (+X east, −Z north) for a true heading. */
export function forwardForHeading(headingDeg: number): { x: number; z: number } {
  const yaw = headingToYaw(headingDeg);
  // Rotating (0, 0, −1) about +Y by `yaw`.
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

import type { GeoPoint } from '@/core/types';

/** Mean Earth radius (IUGG) for the spherical azimuthal projection. */
export const EARTH_RADIUS_M = 6_371_008.8;
const WGS84_A = 6_378_137;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const DEG = Math.PI / 180;

/** Scene axes: +x east, +y up, −z north (a camera with default orientation looks north). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Reversible map projection for a planar scene. `lonLatToWorld` and `worldToLonLat` are exact inverses (to floating
 * point) over the scene's frame; longitudes come back within ±180° of the origin so frames that cross the
 * antimeridian (REG-OCE) stay continuous.
 */
export interface GeoProjection {
  readonly kind: 'laea' | 'enu';
  readonly origin: GeoPoint;
  /** World units per metre on the ground. */
  readonly unitsPerMetre: number;
  lonLatToWorld(lon: number, lat: number, altitudeM?: number): Vec3;
  /** Inverse for a ground point; `y` is read as altitude in world units and ignored for the position. */
  worldToLonLat(x: number, z: number): GeoPoint;
}

/** Longitude in (−180, 180]. */
export function normalizeLon(lon: number): number {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return l === -180 ? 180 : l;
}

/** Longitude moved to within ±180° of a reference (keeps a frame continuous across the antimeridian). */
export function lonNear(lon: number, ref: number): number {
  return ref + normalizeLon(lon - ref);
}

/**
 * Lambert azimuthal equal-area on the sphere (Snyder 1987, eq. 24-2 … 24-4 and 20-14 … 20-15), centred on the
 * region. Equal area keeps traffic density honest across a whole operational region; distortion of shapes and
 * distances stays under 1 % within ~1,500 km of the centre.
 */
export function azimuthalProjection(origin: GeoPoint, unitsPerMetre = 0.001): GeoProjection {
  const lam0 = origin.lon * DEG;
  const phi1 = origin.lat * DEG;
  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const R = EARTH_RADIUS_M;
  return {
    kind: 'laea',
    origin: { ...origin },
    unitsPerMetre,
    lonLatToWorld(lon, lat, altitudeM = 0) {
      const phi = lat * DEG;
      const dl = lon * DEG - lam0;
      const sinP = Math.sin(phi);
      const cosP = Math.cos(phi);
      const cosD = Math.cos(dl);
      const denom = 1 + sin1 * sinP + cos1 * cosP * cosD;
      const k = Math.sqrt(2 / Math.max(denom, 1e-12));
      const east = R * k * cosP * Math.sin(dl);
      const north = R * k * (cos1 * sinP - sin1 * cosP * cosD);
      return { x: east * unitsPerMetre, y: altitudeM * unitsPerMetre, z: -north * unitsPerMetre };
    },
    worldToLonLat(x, z) {
      const east = x / unitsPerMetre;
      const north = -z / unitsPerMetre;
      const rho = Math.hypot(east, north);
      if (rho < 1e-9) return { lon: origin.lon, lat: origin.lat };
      const c = 2 * Math.asin(Math.min(1, rho / (2 * R)));
      const sinC = Math.sin(c);
      const cosC = Math.cos(c);
      const phi = Math.asin(Math.max(-1, Math.min(1, cosC * sin1 + (north * sinC * cos1) / rho)));
      const lam = lam0 + Math.atan2(east * sinC, rho * cos1 * cosC - north * sin1 * sinC);
      return { lon: lonNear(lam / DEG, origin.lon), lat: phi / DEG };
    },
  };
}

function toEcef(lon: number, lat: number, h: number): [number, number, number] {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const sinP = Math.sin(phi);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinP * sinP);
  return [(N + h) * Math.cos(phi) * Math.cos(lam), (N + h) * Math.cos(phi) * Math.sin(lam), (N * (1 - WGS84_E2) + h) * sinP];
}

/** ECEF → geodetic (Bowring start, three Newton refinements: sub-millimetre for any terrestrial point). */
function fromEcef(X: number, Y: number, Z: number): { lon: number; lat: number; h: number } {
  const lon = Math.atan2(Y, X);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - WGS84_E2));
  let h = 0;
  for (let i = 0; i < 4; i++) {
    const sinP = Math.sin(lat);
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinP * sinP);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(Z, p * (1 - (WGS84_E2 * N) / (N + h)));
  }
  return { lon: lon / DEG, lat: lat / DEG, h };
}

/**
 * Local east-north-up metres on the WGS84 ellipsoid, flattened: a ground point keeps its exact east/north offset from
 * the origin and its altitude becomes `y`, so city and port scenes are true to scale horizontally (berth lengths,
 * anchorage radii) while the few metres of Earth curvature across a city are dropped.
 */
export function enuProjection(origin: GeoPoint, unitsPerMetre = 0.001): GeoProjection {
  const phi0 = origin.lat * DEG;
  const lam0 = origin.lon * DEG;
  const sinP = Math.sin(phi0);
  const cosP = Math.cos(phi0);
  const sinL = Math.sin(lam0);
  const cosL = Math.cos(lam0);
  const [X0, Y0, Z0] = toEcef(origin.lon, origin.lat, 0);
  const toEnu = (X: number, Y: number, Z: number) => {
    const dx = X - X0;
    const dy = Y - Y0;
    const dz = Z - Z0;
    return {
      e: -sinL * dx + cosL * dy,
      n: -sinP * cosL * dx - sinP * sinL * dy + cosP * dz,
      u: cosP * cosL * dx + cosP * sinL * dy + sinP * dz,
    };
  };
  const fromEnu = (e: number, n: number, u: number): [number, number, number] => [
    X0 - sinL * e - sinP * cosL * n + cosP * cosL * u,
    Y0 + cosL * e - sinP * sinL * n + cosP * sinL * u,
    Z0 + cosP * n + sinP * u,
  ];
  return {
    kind: 'enu',
    origin: { ...origin },
    unitsPerMetre,
    lonLatToWorld(lon, lat, altitudeM = 0) {
      const { e, n } = toEnu(...toEcef(lon, lat, 0));
      return { x: e * unitsPerMetre, y: altitudeM * unitsPerMetre, z: -n * unitsPerMetre };
    },
    worldToLonLat(x, z) {
      const e = x / unitsPerMetre;
      const n = -z / unitsPerMetre;
      // Find the ellipsoid point whose ENU east/north equal (e, n): walk `u` down the local vertical until h = 0.
      let u = -(e * e + n * n) / (2 * WGS84_A);
      let g = fromEcef(...fromEnu(e, n, u));
      for (let i = 0; i < 6 && Math.abs(g.h) > 1e-6; i++) {
        u -= g.h;
        g = fromEcef(...fromEnu(e, n, u));
      }
      return { lon: lonNear(g.lon, origin.lon), lat: g.lat };
    },
  };
}

/**
 * Angle (radians, clockwise) from scene north (−z) to true north at a point. A course over ground `cog` is drawn at
 * `cog + gridConvergence` so ships keep their true heading anywhere in an azimuthal frame.
 */
export function gridConvergence(p: GeoProjection, lon: number, lat: number): number {
  const a = p.lonLatToWorld(lon, lat);
  const b = p.lonLatToWorld(lon, Math.min(89.999, lat + 0.01));
  return Math.atan2(b.x - a.x, -(b.z - a.z));
}

/** Projection for a registry level: azimuthal equal-area for regions and countries, ENU metres for cities and ports. */
export function projectionForLevel(level: 'region' | 'country' | 'city' | 'port', origin: GeoPoint, unitsPerMetre = 0.001): GeoProjection {
  return level === 'region' || level === 'country' ? azimuthalProjection(origin, unitsPerMetre) : enuProjection(origin, unitsPerMetre);
}

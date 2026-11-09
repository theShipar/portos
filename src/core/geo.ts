import type { Bounds, GeoPoint } from './types';

export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_NM = 1.852;
const DEG = Math.PI / 180;

export function normalizeLon(lon: number): number {
  const n = ((((lon + 180) % 360) + 360) % 360) - 180;
  return n === -180 && lon > 0 ? 180 : n;
}

export function clampLatitude(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function haversineDistanceNm(a: GeoPoint, b: GeoPoint): number {
  const la1 = a.lat * DEG;
  const la2 = b.lat * DEG;
  const dLat = la2 - la1;
  const dLon = normalizeLon(b.lon - a.lon) * DEG;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return (2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(x)))) / KM_PER_NM;
}

export function polylineLengthNm(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineDistanceNm(points[i - 1], points[i]);
  return total;
}

/** Initial bearing, degrees clockwise from north (AIS convention). */
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const la1 = a.lat * DEG;
  const la2 = b.lat * DEG;
  const dl = normalizeLon(b.lon - a.lon) * DEG;
  const y = Math.sin(dl) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Linear lon/lat interpolation along the short way across the antimeridian (matches the fixture generator). */
export function lerpGeo(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const dLon = normalizeLon(b.lon - a.lon);
  return { lon: normalizeLon(a.lon + dLon * t), lat: a.lat + (b.lat - a.lat) * t };
}

/** Great-circle short-arc interpolation; only use between adjacent vetted water waypoints. */
export function interpolateGeodesicShortArc(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  const la1 = a.lat * DEG;
  const lo1 = a.lon * DEG;
  const la2 = b.lat * DEG;
  const lo2 = b.lon * DEG;
  const d =
    2 *
    Math.asin(
      Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2),
    );
  if (d < 1e-9) return { ...a };
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / DEG, lon: normalizeLon(Math.atan2(y, x) / DEG) };
}

/** Densify a waypoint path with short-arc steps no longer than `maxStepNm`. */
export function densifyPath(points: GeoPoint[], maxStepNm = 60): GeoPoint[] {
  if (points.length < 2) return points.slice();
  const out: GeoPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(haversineDistanceNm(a, b) / maxStepNm));
    for (let s = 1; s <= steps; s++) out.push(interpolateGeodesicShortArc(a, b, s / steps));
  }
  return out;
}

/** Position at fractional progress (0..1) along a path, weighted by leg distance (generator-compatible). */
export function pathAt(points: GeoPoint[], progress: number): GeoPoint {
  const p = Math.max(0, Math.min(1, progress));
  const legs: number[] = [];
  for (let i = 1; i < points.length; i++) legs.push(haversineDistanceNm(points[i - 1], points[i]));
  const total = legs.reduce((s, x) => s + x, 0);
  let target = p * total;
  for (let i = 0; i < legs.length; i++) {
    if (target <= legs[i] || i === legs.length - 1) {
      return lerpGeo(points[i], points[i + 1], legs[i] === 0 ? 0 : Math.min(1, target / legs[i]));
    }
    target -= legs[i];
  }
  return points[points.length - 1];
}

/** Split a lon/lat path into segments that never jump across ±180 (for 2D drawing). */
export function antimeridianSplit(points: GeoPoint[]): GeoPoint[][] {
  if (points.length === 0) return [];
  const segments: GeoPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (Math.abs(b.lon - a.lon) > 180) {
      const bLon = b.lon + (b.lon < a.lon ? 360 : -360);
      const edge = a.lon > 0 ? 180 : -180;
      const t = (edge - a.lon) / (bLon - a.lon);
      const lat = a.lat + (b.lat - a.lat) * t;
      segments[segments.length - 1].push({ lon: edge, lat });
      segments.push([{ lon: -edge, lat }, b]);
    } else {
      segments[segments.length - 1].push(b);
    }
  }
  return segments;
}

export function pointInPolygon(p: GeoPoint, poly: GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon;
    const yi = poly[i].lat;
    const xj = poly[j].lon;
    const yj = poly[j].lat;
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

export function boundsCrossAntimeridian(b: Bounds): boolean {
  return b.east < b.west;
}

export function boundsCenter(b: Bounds): GeoPoint {
  const width = boundsCrossAntimeridian(b) ? b.east + 360 - b.west : b.east - b.west;
  return { lon: normalizeLon(b.west + width / 2), lat: (b.south + b.north) / 2 };
}

export function boundsSpanDeg(b: Bounds): { lon: number; lat: number } {
  return { lon: boundsCrossAntimeridian(b) ? b.east + 360 - b.west : b.east - b.west, lat: b.north - b.south };
}

export function boundsContain(b: Bounds, p: GeoPoint): boolean {
  if (p.lat < b.south || p.lat > b.north) return false;
  return boundsCrossAntimeridian(b) ? p.lon >= b.west || p.lon <= b.east : p.lon >= b.west && p.lon <= b.east;
}

/** Split antimeridian-crossing bounds into two non-crossing boxes. */
export function splitBounds(b: Bounds): Bounds[] {
  if (!boundsCrossAntimeridian(b)) return [b];
  return [
    { west: b.west, south: b.south, east: 180, north: b.north },
    { west: -180, south: b.south, east: b.east, north: b.north },
  ];
}

/**
 * Sphere convention shared with the Three Scope Map Earth template so textures line up:
 * phi = 90 - lat, theta = lon + 180, x = -r sinφ cosθ, y = r cosφ, z = r sinφ sinθ.
 */
export function sphericalPosition(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return [-radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)];
}

export function inverseSpherical(x: number, y: number, z: number): GeoPoint {
  const r = Math.sqrt(x * x + y * y + z * z) || 1;
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, y / r))) / DEG;
  const lon = normalizeLon(Math.atan2(z, -x) / DEG - 180);
  return { lat, lon };
}

/** Nearest progress (0..1) of a point projected onto a path (planar approximation per leg). */
export function projectOntoPath(points: GeoPoint[], p: GeoPoint): { progress: number; distanceNm: number } {
  const legs: number[] = [];
  for (let i = 1; i < points.length; i++) legs.push(haversineDistanceNm(points[i - 1], points[i]));
  const total = legs.reduce((s, x) => s + x, 0) || 1;
  let best = { progress: 0, distanceNm: Infinity };
  let acc = 0;
  for (let i = 0; i < legs.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cos = Math.cos(((a.lat + b.lat) / 2) * DEG);
    const ax = 0;
    const ay = 0;
    const bx = normalizeLon(b.lon - a.lon) * cos;
    const by = b.lat - a.lat;
    const px = normalizeLon(p.lon - a.lon) * cos;
    const py = p.lat - a.lat;
    const len2 = bx * bx + by * by || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - ax) * bx + (py - ay) * by) / len2));
    const q = lerpGeo(a, b, t);
    const d = haversineDistanceNm(p, q);
    if (d < best.distanceNm) best = { progress: (acc + t * legs[i]) / total, distanceNm: d };
    acc += legs[i];
  }
  return best;
}

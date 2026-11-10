import { lerpGeo } from '@/core/geo';
import type { GeoPoint, NavStatus } from '@/core/types';
import type { Catalog, TrackPoint } from '@/data/catalog';

export const TRACK_GAP_POLICY = { maxInterpolationMinutes: 30, staleAfterMinutes: 30 } as const;

/** `modelled`: position comes from V2 scenario keyframes (reconstructed history or forecast), never an observed report. */
export type TrackState = 'exact' | 'interpolated' | 'modelled' | 'last-known' | 'stale' | 'unavailable';

export interface VesselAtTime {
  vesselId: string;
  point: GeoPoint | null;
  sogKn: number | null;
  cogDeg: number | null;
  navStatus: NavStatus;
  /** Timestamp of the underlying source sample(s) used (ms). */
  sourceTimeMs: number | null;
  /** Minutes between the simulation time and the most recent sample at or before it. */
  freshnessMinutes: number | null;
  state: TrackState;
}

function lowerIndex(track: TrackPoint[], t: number): number {
  let lo = 0;
  let hi = track.length - 1;
  if (t < track[0].t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function interpolateHeading(a: number | null, b: number | null, f: number): number | null {
  if (a === null) return b;
  if (b === null) return a;
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * f + 360) % 360;
}

/** Deterministic vessel state at a simulation instant. Never extrapolates beyond the last sample. */
export function vesselAtTime(track: TrackPoint[] | undefined, vesselId: string, t: number): VesselAtTime {
  if (!track || track.length === 0) {
    return { vesselId, point: null, sogKn: null, cogDeg: null, navStatus: 'unknown', sourceTimeMs: null, freshnessMinutes: null, state: 'unavailable' };
  }
  const i = lowerIndex(track, t);
  if (i < 0) {
    return { vesselId, point: null, sogKn: null, cogDeg: null, navStatus: 'unknown', sourceTimeMs: null, freshnessMinutes: null, state: 'unavailable' };
  }
  const a = track[i];
  const b = track[i + 1];
  const modelled = a.source === 'v2' || (b?.source === 'v2' && t > a.t);
  /** Keyframes report age against the last observed sample; reconstructed history has none. */
  const freshness = modelled ? (a.lastObservedT == null ? null : (t - a.lastObservedT) / 60_000) : (t - a.t) / 60_000;
  if (a.t === t) {
    return {
      vesselId,
      point: { lon: a.lon, lat: a.lat },
      sogKn: a.sogKn,
      cogDeg: a.cogDeg,
      navStatus: a.navStatus,
      sourceTimeMs: a.t,
      freshnessMinutes: modelled ? freshness : 0,
      state: modelled ? 'modelled' : 'exact',
    };
  }
  if (b && (b.t - a.t) / 60_000 <= TRACK_GAP_POLICY.maxInterpolationMinutes) {
    const f = (t - a.t) / (b.t - a.t);
    const moving = a.navStatus === 'underway' || b.navStatus === 'underway';
    const point = moving ? lerpGeo(a, b, f) : { lon: a.lon, lat: a.lat };
    return {
      vesselId,
      point,
      sogKn: a.sogKn,
      cogDeg: interpolateHeading(a.cogDeg, b.cogDeg, f),
      navStatus: f < 0.5 ? a.navStatus : b.navStatus,
      sourceTimeMs: a.t,
      freshnessMinutes: freshness,
      state: modelled ? 'modelled' : 'interpolated',
    };
  }
  if (modelled) {
    return { vesselId, point: { lon: a.lon, lat: a.lat }, sogKn: a.sogKn, cogDeg: a.cogDeg, navStatus: a.navStatus, sourceTimeMs: a.t, freshnessMinutes: freshness, state: 'stale' };
  }
  const age = freshness ?? 0;
  return {
    vesselId,
    point: { lon: a.lon, lat: a.lat },
    sogKn: a.sogKn,
    cogDeg: a.cogDeg,
    navStatus: a.navStatus,
    sourceTimeMs: a.t,
    freshnessMinutes: freshness,
    state: age > TRACK_GAP_POLICY.staleAfterMinutes ? 'stale' : 'last-known',
  };
}

export function getVesselAtTime(catalog: Catalog, vesselId: string, t: number): VesselAtTime {
  return vesselAtTime(catalog.tracks.get(vesselId), vesselId, t);
}

/** Recorded track up to time t (for drawing the visited portion). */
export function trackUntil(catalog: Catalog, vesselId: string, t: number): GeoPoint[] {
  const track = catalog.tracks.get(vesselId) ?? [];
  const out: GeoPoint[] = [];
  for (const p of track) {
    if (p.t > t) break;
    out.push({ lon: p.lon, lat: p.lat });
  }
  return out;
}

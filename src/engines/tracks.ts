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

/**
 * `observed`: reported samples; `modelled`: V2 keyframes (reconstructed or forecast); `unverified`: a reporting gap
 * longer than the interpolation limit, drawn as a straight dashed hint only — the vessel's path there is unknown.
 */
export type TrackRunKind = 'observed' | 'modelled' | 'unverified';

export interface TrackRun {
  kind: TrackRunKind;
  points: GeoPoint[];
  startMs: number;
  endMs: number;
}

/** Visited path up to `t`, split into runs; the last observed or modelled run ends at the interpolated position. */
export function trackRunsUntil(catalog: Catalog, vesselId: string, t: number): TrackRun[] {
  const track = catalog.tracks.get(vesselId) ?? [];
  const runs: TrackRun[] = [];
  const maxGap = TRACK_GAP_POLICY.maxInterpolationMinutes * 60_000;
  const kindOf = (p: TrackPoint): TrackRunKind => (p.source === 'v2' ? 'modelled' : 'observed');
  const push = (kind: TrackRunKind, p: GeoPoint, ms: number) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) {
      last.points.push(p);
      last.endMs = ms;
      return;
    }
    // Runs share their joining vertex so the drawn path stays continuous.
    const join = last ? last.points[last.points.length - 1]! : null;
    runs.push({ kind, points: join ? [join, p] : [p], startMs: join ? last!.endMs : ms, endMs: ms });
  };
  let prev: TrackPoint | null = null;
  for (const p of track) {
    if (p.t > t) break;
    const g = { lon: p.lon, lat: p.lat };
    if (prev && p.t - prev.t > maxGap) push('unverified', g, p.t);
    else push(kindOf(prev && prev.source === 'v2' ? prev : p), g, p.t);
    prev = p;
  }
  const now = vesselAtTime(track, vesselId, t);
  if (prev && now.point && (now.state === 'interpolated' || now.state === 'modelled') && t > prev.t) push(kindOf(prev), now.point, t);
  return runs.filter((r) => r.points.length >= 2);
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

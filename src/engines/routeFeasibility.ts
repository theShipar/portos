import { haversineDistanceNm } from '@/core/geo';
import type { Route, WeatherHazard } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { alternativeRoutes } from './scenario';
import type { Snapshot } from './snapshot';
import { computeRouteHazards, DEFAULT_TRANSIT_KN, hazardPhase, type RouteSegmentExposure } from './weatherRisk';

export type Feasibility = 'clear' | 'caution' | 'avoid' | 'unknown';

export interface RouteCandidate {
  routeId: string;
  corridorName: string;
  isBaseline: boolean;
  /** Great-circle sum over the stored waypoints. */
  geodesicNm: number;
  statedNm: number;
  sailingHours: number;
  detourNm: number;
  detourHours: number;
  exposure: RouteSegmentExposure[];
  feasibility: Feasibility;
  warnings: string[];
}

export interface RouteComparison {
  voyageId: string;
  nominalKn: number;
  candidates: RouteCandidate[];
  caveat: string;
}

export const ROUTE_CAVEAT = 'Planning illustration over curated synthetic corridors; not approved routing, a passage plan or weather routing.';
/** Stated and geodesic distances further apart than this share get a data warning. */
const DISTANCE_MISMATCH = 0.1;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function geodesicNm(route: Route): number {
  let nm = 0;
  for (let i = 1; i < route.waypoints.length; i++) nm += haversineDistanceNm(route.waypoints[i - 1], route.waypoints[i]);
  return nm;
}

/**
 * Route and weather feasibility for the voyage's corridor and its curated alternatives (same origin and
 * destination). Each candidate gets geodesic distance, sailing time at a nominal speed, detour against the baseline
 * and exposure to time-valid hazard polygons along its own expected traversal. Severe exposure marks `avoid`,
 * any exposure `caution`; without a weather feed the result is `unknown`, never clear.
 */
export function compareRoutes(c: Catalog, snap: Snapshot, voyageId: string, nominalKn = DEFAULT_TRANSIT_KN): RouteComparison | null {
  const vo = c.byId.voyage.get(voyageId);
  const base = vo ? c.byId.route.get(vo.routeId) : undefined;
  const vessel = vo ? c.byId.vessel.get(vo.vesselId) : undefined;
  if (!vo || !base || !vessel) return null;
  const live: WeatherHazard[] = c.weatherHazards.filter((h) => {
    const p = hazardPhase(h, snap.timeMs);
    return p === 'active' || p === 'upcoming';
  });
  const baseNm = geodesicNm(base);
  const candidates = [base, ...alternativeRoutes(c, base)].map((route): RouteCandidate => {
    const nm = geodesicNm(route);
    const warnings: string[] = [];
    if (route.waypoints.length < 2) warnings.push('Corridor has fewer than two waypoints.');
    if (Math.abs(nm - route.distanceNmEstimate) > DISTANCE_MISMATCH * route.distanceNmEstimate) warnings.push(`Stated distance ${Math.round(route.distanceNmEstimate)} nm differs from the waypoint geodesic ${Math.round(nm)} nm.`);
    // Exposure is tested geometrically on every candidate, not only on corridors a hazard record lists.
    const hazards = live.map((h) => ({ ...h, affectedRouteIds: [route.routeId] }));
    const risk = computeRouteHazards(vo, route, vessel, route.routeId === base.routeId ? snap.vessels.get(vo.vesselId) ?? null : null, hazards, snap.timeMs);
    const severe = risk.affectedSegments.some((s) => live.find((h) => h.hazardId === s.hazardId)?.severity === 'severe');
    const feasibility: Feasibility = !c.weatherHazards.length ? 'unknown' : severe ? 'avoid' : risk.affectedSegments.length ? 'caution' : 'clear';
    if (feasibility === 'unknown') warnings.push('No weather feed loaded.');
    if (risk.confidence === 'low') warnings.push('Low-confidence hazard forecast on this corridor.');
    const detourNm = Math.round(nm - baseNm);
    return {
      routeId: route.routeId,
      corridorName: route.corridorName,
      isBaseline: route.routeId === base.routeId,
      geodesicNm: Math.round(nm),
      statedNm: Math.round(route.distanceNmEstimate),
      sailingHours: round1(nm / nominalKn),
      detourNm,
      detourHours: round1(detourNm / nominalKn),
      exposure: risk.affectedSegments,
      feasibility,
      warnings,
    };
  });
  return { voyageId, nominalKn, candidates, caveat: ROUTE_CAVEAT };
}

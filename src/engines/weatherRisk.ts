import { pathAt, pointInPolygon, projectOntoPath } from '@/core/geo';
import { parseUtc, toIsoUtc } from '@/core/time';
import type { Confidence, Route, Vessel, Voyage, WeatherHazard } from '@/core/types';
import { makeProvenance, type Provenance } from './provenance';
import type { VesselAtTime } from './tracks';

export type HazardPhase = 'not-issued' | 'upcoming' | 'active' | 'expired';

export function hazardPhase(h: WeatherHazard, t: number): HazardPhase {
  const issued = parseUtc(h.issuedAtUtc) ?? 0;
  const from = parseUtc(h.validFromUtc) ?? 0;
  const to = parseUtc(h.validToUtc) ?? 0;
  if (t < issued) return 'not-issued';
  if (t < from) return 'upcoming';
  if (t > to) return 'expired';
  return 'active';
}

export type RiskBand = 'low' | 'moderate' | 'high' | 'severe';
export const RISK_BANDS: { band: RiskBand; min: number }[] = [
  { band: 'severe', min: 85 },
  { band: 'high', min: 65 },
  { band: 'moderate', min: 35 },
  { band: 'low', min: 0 },
];
export const bandFor = (score: number): RiskBand => RISK_BANDS.find((b) => score >= b.min)!.band;

const SEVERITY_WEIGHT: Record<WeatherHazard['severity'], number> = { moderate: 0.55, high: 0.8, severe: 1 };
const CLASS_SENSITIVITY: Record<string, number> = {
  'Container ship': 1,
  RoRo: 1,
  'General cargo': 0.9,
  'Bulk carrier': 0.75,
  'Oil tanker': 0.7,
  'LNG carrier': 0.7,
};
const CONFIDENCE_FACTOR: Record<Confidence, number> = { high: 1, medium: 0.85, low: 0.65, unknown: 0.5 };
/** Assumed transit speed when a voyage has not departed or the speed is unknown (explicit assumption). */
export const DEFAULT_TRANSIT_KN = 16;

export interface RouteSegmentExposure {
  hazardId: string;
  enterUtc: string;
  exitUtc: string;
  progressFrom: number;
  progressTo: number;
  overlapNm: number;
  leadHours: number;
  exposureHours: number;
  factors: { key: string; label: string; value: number }[];
  score: number;
}

export const RISK_FORMULA = 'score = 100 × severity × (0.35 + 0.25·overlap + 0.2·lead + 0.2·duration) × class × confidence; voyage score = max over intersecting hazards';

export interface RouteRiskResult {
  voyageId: string;
  score: number;
  /** `unknown` only when no weather feed is loaded; absence of intersections is `low`, never "clear". */
  band: RiskBand | 'unknown';
  affectedSegments: RouteSegmentExposure[];
  hazardIds: string[];
  nearbyHazardIds: string[];
  validAtUtc: string;
  confidence: Confidence;
  rationale: string[];
  limitations: string[];
  provenance: Provenance;
}

export interface VoyageKinematics {
  progressAtSource: number;
  sourceMs: number;
  sogKn: number;
  assumptions: string[];
}

/** Where the voyage is along its route and how fast it advances (dead reckoning between samples). */
export function voyageKinematics(voyage: Voyage, route: Route, vessel: Vessel, snap: VesselAtTime | null, t: number): VoyageKinematics {
  const assumptions: string[] = [];
  if (!voyage.departedAtUtc) {
    const dep = parseUtc(voyage.estimatedDepartureUtc) ?? t;
    assumptions.push(`Not yet departed; assumes departure at ${voyage.estimatedDepartureUtc} and ${DEFAULT_TRANSIT_KN} kn transit.`);
    return { progressAtSource: 0, sourceMs: Math.max(dep, t), sogKn: DEFAULT_TRANSIT_KN, assumptions };
  }
  if (snap?.point && snap.sourceTimeMs !== null) {
    const proj = projectOntoPath(route.waypoints, snap.point);
    const sog = snap.sogKn && snap.sogKn > 1 ? snap.sogKn : vessel.sogKn && vessel.sogKn > 1 ? vessel.sogKn : DEFAULT_TRANSIT_KN;
    if (!(snap.sogKn && snap.sogKn > 1)) assumptions.push(`Speed unknown; assumes ${DEFAULT_TRANSIT_KN} kn.`);
    if (snap.state === 'stale') assumptions.push('Position stale; dead-reckoned from last report.');
    return { progressAtSource: proj.progress, sourceMs: snap.state === 'interpolated' ? t : snap.sourceTimeMs, sogKn: sog, assumptions };
  }
  assumptions.push('No position; uses fixture route progress.');
  return { progressAtSource: voyage.routeProgressAsOf, sourceMs: t, sogKn: DEFAULT_TRANSIT_KN, assumptions };
}

const STEP_MS = 30 * 60_000;

/** Time + geometry intersection of a voyage's expected traversal with time-valid hazard polygons. */
export function computeRouteHazards(
  voyage: Voyage,
  route: Route,
  vessel: Vessel,
  snap: VesselAtTime | null,
  hazards: WeatherHazard[],
  t: number,
): RouteRiskResult {
  const kin = voyageKinematics(voyage, route, vessel, snap, t);
  const D = route.distanceNmEstimate;
  const progressAt = (ms: number) => kin.progressAtSource + ((ms - kin.sourceMs) / 3_600_000) * (kin.sogKn / D);
  const segments: RouteSegmentExposure[] = [];
  const nearby: string[] = [];
  const rationale: string[] = [];

  for (const h of hazards) {
    if (!h.affectedRouteIds.includes(route.routeId)) continue;
    const phase = hazardPhase(h, t);
    if (phase === 'not-issued' || phase === 'expired') continue;
    const from = Math.max(parseUtc(h.validFromUtc) ?? t, t, kin.sourceMs);
    const to = parseUtc(h.validToUtc) ?? t;
    let enter: number | null = null;
    let exit: number | null = null;
    let pFrom = 0;
    let pTo = 0;
    for (let ms = from; ms <= to; ms += STEP_MS) {
      const p = progressAt(ms);
      if (p >= 1) break;
      if (pointInPolygon(pathAt(route.waypoints, p), h.polygon)) {
        if (enter === null) {
          enter = ms;
          pFrom = p;
        }
        exit = ms;
        pTo = p;
      } else if (enter !== null) break;
    }
    if (enter === null || exit === null) {
      nearby.push(h.hazardId);
      continue;
    }
    const overlapNm = Math.max((pTo - pFrom) * D, kin.sogKn * 0.5);
    const leadHours = Math.max(0, (enter - t) / 3_600_000);
    const exposureHours = Math.max(0.5, (exit - enter) / 3_600_000);
    const factors = [
      { key: 'severity', label: `Severity (${h.severity})`, value: SEVERITY_WEIGHT[h.severity] },
      { key: 'overlap', label: `Route overlap ${Math.round(overlapNm)} nm ÷ 300`, value: Math.min(1, overlapNm / 300) },
      { key: 'lead', label: `Lead time ${leadHours.toFixed(1)} h`, value: leadHours <= 12 ? 1 : leadHours <= 48 ? 0.7 : 0.4 },
      { key: 'duration', label: `Exposure ${exposureHours.toFixed(1)} h ÷ 12`, value: Math.min(1, exposureHours / 12) },
      { key: 'class', label: `Vessel class (${vessel.vesselType})`, value: CLASS_SENSITIVITY[vessel.vesselType] ?? 0.85 },
      { key: 'confidence', label: `Forecast confidence (${h.confidence})`, value: CONFIDENCE_FACTOR[h.confidence] },
    ];
    const f = Object.fromEntries(factors.map((x) => [x.key, x.value]));
    const score = Math.round(100 * f.severity * (0.35 + 0.25 * f.overlap + 0.2 * f.lead + 0.2 * f.duration) * f.class * f.confidence);
    segments.push({
      hazardId: h.hazardId,
      enterUtc: new Date(enter).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      exitUtc: new Date(exit).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      progressFrom: pFrom,
      progressTo: pTo,
      overlapNm,
      leadHours,
      exposureHours,
      factors,
      score,
    });
    rationale.push(`Forecast ${h.type.replace(/_/g, ' ')} over route segment (${h.hazardId}) from ${leadHours.toFixed(1)} h ahead.`);
  }
  const score = segments.reduce((m, s) => Math.max(m, s.score), 0);
  const noFeed = hazards.length === 0;
  if (noFeed) rationale.push('No weather feed loaded; route risk is unknown.');
  else if (!segments.length && nearby.length) rationale.push(`Hazard on corridor (${nearby.join(', ')}) but expected traversal is outside its validity window.`);
  else if (!segments.length) rationale.push('No issued hazard forecast intersects the expected traversal.');
  const considered = hazards.filter((h) => segments.some((s) => s.hazardId === h.hazardId) || nearby.includes(h.hazardId));
  const confidences = considered.filter((h) => segments.some((s) => s.hazardId === h.hazardId)).map((h) => h.confidence);
  const confidence: Confidence = confidences.includes('low') ? 'low' : confidences.length ? 'medium' : 'unknown';
  const limitations = [
    ...kin.assumptions,
    'Hazard polygons are coarse synthetic forecasts; intersection is approximate (30 min steps).',
    'Not a weather-routing recommendation or statement of navigational safety.',
  ];
  const latestIssue = considered.map((h) => parseUtc(h.issuedAtUtc)).filter((x): x is number => x !== null).sort((a, b) => b - a)[0] ?? null;
  const top = [...segments].sort((a, b) => b.score - a.score)[0];
  return {
    voyageId: voyage.voyageId,
    score,
    band: noFeed ? 'unknown' : bandFor(score),
    affectedSegments: segments,
    hazardIds: segments.map((s) => s.hazardId),
    nearbyHazardIds: nearby,
    validAtUtc: toIsoUtc(t),
    confidence,
    rationale,
    limitations,
    provenance: makeProvenance({
      sourceClass: 'derived-model',
      evidence: noFeed ? 'unknown' : 'estimated',
      method: 'Expected traversal (dead-reckoned along the corridor) intersected with time-valid hazard polygons',
      feed: 'weather',
      asOf: latestIssue ?? t,
      nowMs: t,
      confidence,
      formula: top ? `${RISK_FORMULA} → ${top.hazardId}: ${top.factors.map((f) => `${f.key} ${f.value.toFixed(2)}`).join(', ')} = ${top.score}` : RISK_FORMULA,
      sources: [
        { kind: 'record', id: route.routeId, label: `Corridor ${route.corridorName} · routes.json` },
        ...(snap?.sourceTimeMs != null && voyage.departedAtUtc ? [{ kind: 'record' as const, id: vessel.vesselId, label: `Position sample (${snap.state}) · positions.json`, atUtc: toIsoUtc(snap.sourceTimeMs) }] : []),
        ...considered.map((h) => ({ kind: 'record' as const, id: h.hazardId, label: `${h.severity} ${h.type.replace(/_/g, ' ')} forecast${segments.some((s) => s.hazardId === h.hazardId) ? ' · intersects' : ' · outside traversal window'}`, atUtc: h.issuedAtUtc })),
      ],
      assumptions: limitations,
    }),
  };
}

import type { CaseStage, Incident, Severity, TimelineEvent, Voyage, WeatherHazard } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { computeEta, type EtaResult } from './eta';
import { emptyFold, foldEvents, incidentFromFold, type FoldState } from './fold';
import { computeExposure, type ExposureEstimate, type RateAssumption } from './exposure';
import { computeRouteHazards, hazardPhase, type HazardPhase, type RouteRiskResult } from './weatherRisk';
import { getVesselAtTime, type VesselAtTime } from './tracks';

export interface IncidentState {
  incidentId: string;
  visible: boolean;
  status: CaseStage;
  ownerUserId: string | null;
  /** Fixture severity, or the local escalation when one was recorded. */
  severity: Severity;
  escalated: boolean;
  /** True when the status comes from local demo decisions rather than fixture history. */
  locallyModified: boolean;
}

export interface UserRateOverride {
  usdPerDay: number;
  setByUserId: string;
  setAtUtc: string;
}

/**
 * Local overlay. Incident decisions apply only at or after the fixture anchor ("Now"), never to history.
 * Daily-rate overrides are what-if assumptions and apply at every time, labelled as user scenario.
 */
export interface WorkflowOverlay {
  incidents?: Record<string, { status: CaseStage; ownerUserId: string | null; severity: Severity | null }>;
  dailyRates?: Record<string, UserRateOverride>;
}

export interface Snapshot {
  timeMs: number;
  isHistorical: boolean;
  vessels: Map<string, VesselAtTime>;
  etas: Map<string, EtaResult>;
  exposures: Map<string, ExposureEstimate>;
  incidents: Map<string, IncidentState>;
  hazards: Map<string, HazardPhase>;
  /** Route risk for voyages whose corridor has an issued, unexpired hazard; absent ⇒ no hazard on the corridor. */
  risks: Map<string, RouteRiskResult>;
  weatherFeedLoaded: boolean;
  portWait: Map<string, { hours: number; asOfUtc: string }>;
  /** Recorded history folded to `timeMs` (fixture events only). */
  fold: FoldState;
}

export function rateAssumption(vo: Voyage, override: UserRateOverride | undefined): RateAssumption {
  return override
    ? { kind: 'user', usdPerDay: override.usdPerDay, fixtureUsdPerDay: vo.dailyDelayCostUsd, setByUserId: override.setByUserId, setAtUtc: override.setAtUtc }
    : { kind: 'fixture', usdPerDay: vo.dailyDelayCostUsd };
}

/** Fixture lifecycle of one incident at time t, folded from its own events. */
export function incidentStatusAt(c: Catalog, i: Incident, t: number): { visible: boolean; status: CaseStage; ownerUserId: string | null } {
  const fold = foldEvents(emptyFold(), c.eventsByEntity.get(`incident:${i.incidentId}`) ?? [], t, () => i);
  return incidentFromFold(fold, i, t);
}

export function voyageEvents(c: Catalog, voyageId: string): TimelineEvent[] {
  return c.eventsByEntity.get(`voyage:${voyageId}`) ?? [];
}

/** Pure fold of all temporal read models at one simulation instant. Same inputs ⇒ same output. */
export function getSnapshotAt(c: Catalog, t: number, overlay?: WorkflowOverlay): Snapshot {
  const vessels = new Map<string, VesselAtTime>();
  for (const v of c.vessels) vessels.set(v.vesselId, getVesselAtTime(c, v.vesselId, t));

  const etas = new Map<string, EtaResult>();
  const exposures = new Map<string, ExposureEstimate>();
  for (const vo of c.voyages) {
    const eta = computeEta(vo, vessels.get(vo.vesselId) ?? null, voyageEvents(c, vo.voyageId), t);
    etas.set(vo.voyageId, eta);
    exposures.set(
      vo.voyageId,
      computeExposure({
        voyageId: vo.voyageId,
        incrementalHours: eta.etaShiftMinutes === null ? null : eta.etaShiftMinutes / 60,
        rate: rateAssumption(vo, overlay?.dailyRates?.[vo.voyageId]),
        asOfUtc: eta.asOfUtc,
        confidence: eta.confidence,
        nowMs: t,
        etaSources: eta.provenance.sources.filter((s) => s.kind === 'event'),
      }),
    );
  }

  const live = t >= c.anchorMs;
  const fold = foldEvents(emptyFold(), c.events, t, (id) => c.byId.incident.get(id));
  const incidents = new Map<string, IncidentState>();
  for (const i of c.incidents) {
    const base = incidentFromFold(fold, i, t);
    const o = live ? overlay?.incidents?.[i.incidentId] : undefined;
    incidents.set(i.incidentId, {
      incidentId: i.incidentId,
      visible: base.visible,
      status: o?.status ?? base.status,
      ownerUserId: o ? o.ownerUserId : base.ownerUserId,
      severity: o?.severity ?? i.severity,
      escalated: !!o?.severity && o.severity !== i.severity,
      locallyModified: !!o,
    });
  }

  const hazards = new Map<string, HazardPhase>();
  for (const h of c.weatherHazards) hazards.set(h.hazardId, hazardPhase(h, t));

  const hazardsByRoute = new Map<string, WeatherHazard[]>();
  for (const h of c.weatherHazards) {
    const phase = hazards.get(h.hazardId);
    if (phase !== 'active' && phase !== 'upcoming') continue;
    for (const r of h.affectedRouteIds) hazardsByRoute.set(r, [...(hazardsByRoute.get(r) ?? []), h]);
  }
  const risks = new Map<string, RouteRiskResult>();
  for (const vo of c.voyages) {
    const hz = hazardsByRoute.get(vo.routeId);
    const route = c.byId.route.get(vo.routeId);
    const vessel = c.byId.vessel.get(vo.vesselId);
    if (!hz || !route || !vessel) continue;
    risks.set(vo.voyageId, computeRouteHazards(vo, route, vessel, vessels.get(vo.vesselId) ?? null, hz, t));
  }

  const portWait = new Map<string, { hours: number; asOfUtc: string }>();
  for (const [portId, w] of fold.portWait) portWait.set(portId, { hours: w.hours, asOfUtc: w.asOfUtc });

  return { timeMs: t, isHistorical: !live, vessels, etas, exposures, incidents, hazards, risks, weatherFeedLoaded: c.weatherHazards.length > 0, portWait, fold };
}

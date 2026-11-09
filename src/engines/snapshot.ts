import { parseUtc } from '@/core/time';
import type { Incident, IncidentStatus, TimelineEvent, Voyage, WeatherHazard } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { computeEta, type EtaResult } from './eta';
import { computeExposure, type ExposureEstimate, type RateAssumption } from './exposure';
import { computeRouteHazards, hazardPhase, type HazardPhase, type RouteRiskResult } from './weatherRisk';
import { getVesselAtTime, type VesselAtTime } from './tracks';

export interface IncidentState {
  incidentId: string;
  visible: boolean;
  status: IncidentStatus;
  ownerUserId: string | null;
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
  incidents?: Record<string, { status: IncidentStatus; ownerUserId: string | null }>;
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
}

export function rateAssumption(vo: Voyage, override: UserRateOverride | undefined): RateAssumption {
  return override
    ? { kind: 'user', usdPerDay: override.usdPerDay, fixtureUsdPerDay: vo.dailyDelayCostUsd, setByUserId: override.setByUserId, setAtUtc: override.setAtUtc }
    : { kind: 'fixture', usdPerDay: vo.dailyDelayCostUsd };
}

/** Fixture lifecycle of an incident at time t (folded from its timestamps/events). */
export function incidentStatusAt(i: Incident, t: number): { visible: boolean; status: IncidentStatus; ownerUserId: string | null } {
  const opened = parseUtc(i.openedAtUtc) ?? 0;
  const ack = parseUtc(i.acknowledgedAtUtc);
  const res = parseUtc(i.resolvedAtUtc);
  if (t < opened) return { visible: false, status: 'open', ownerUserId: null };
  if (res !== null && t >= res) return { visible: true, status: 'resolved', ownerUserId: i.ownerUserId };
  if (ack !== null && t >= ack) {
    const progressed = ['investigating', 'mitigation_planned', 'monitoring'].includes(i.status) && t >= ack + 60_000;
    return { visible: true, status: progressed ? i.status : 'acknowledged', ownerUserId: i.ownerUserId };
  }
  return { visible: true, status: 'open', ownerUserId: null };
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
  const incidents = new Map<string, IncidentState>();
  for (const i of c.incidents) {
    const base = incidentStatusAt(i, t);
    const o = live ? overlay?.incidents?.[i.incidentId] : undefined;
    incidents.set(i.incidentId, {
      incidentId: i.incidentId,
      visible: base.visible,
      status: o?.status ?? base.status,
      ownerUserId: o ? o.ownerUserId : base.ownerUserId,
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
  for (const e of c.events) {
    if (e.type !== 'PORT_WAIT_UPDATED') continue;
    if ((c.eventMs.get(e.eventId) ?? Infinity) > t) break;
    portWait.set(e.payload.portId as string, { hours: e.payload.waitingEstimateHours as number, asOfUtc: e.occurredAtUtc });
  }

  return { timeMs: t, isHistorical: !live, vessels, etas, exposures, incidents, hazards, risks, weatherFeedLoaded: c.weatherHazards.length > 0, portWait };
}

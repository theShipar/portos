import { formatCoord, formatKn, formatNm, formatTimestampFreshness, formatUtc } from '@/core/format';
import type { GeoPoint, IncidentStatus, Severity, TimelineEvent } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { EtaResult } from '@/engines/eta';
import type { ExposureEstimate } from '@/engines/exposure';
import type { Snapshot } from '@/engines/snapshot';
import type { TrackState } from '@/engines/tracks';
import { makeProvenance, type Provenance } from '@/engines/provenance';
import { statusStyle, type StatusStyle } from '@/styles/tokens';
import { selectVoyageImpact, type VoyageImpact } from './impact';

export interface InspectorField {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
  provenance?: Provenance;
}

export interface LinkedIncident {
  incidentId: string;
  title: string;
  severity: Severity;
  status: IncidentStatus;
  statusStyle: StatusStyle;
  severityStyle: StatusStyle;
}

export interface EventRow {
  eventId: string;
  type: TimelineEvent['type'];
  timeUtc: string;
  label: string;
  quality: string;
}

export interface VesselInspectorModel {
  vesselId: string;
  name: string;
  subtitle: string;
  fleet: 'own' | 'ambient';
  navStyle: StatusStyle;
  positionState: TrackState;
  positionLabel: string;
  positionStale: boolean;
  identity: InspectorField[];
  position: InspectorField[];
  point: GeoPoint | null;
  voyage: null | {
    voyageId: string;
    routeId: string;
    originName: string;
    destinationName: string;
    stage: string;
    fields: InspectorField[];
  };
  impact: VoyageImpact | null;
  eta: EtaResult | null;
  etaShiftText: string;
  etaShiftTone: 'critical' | 'warning' | 'healthy' | 'unknown';
  exposure: ExposureEstimate | null;
  exposureText: string;
  incidents: LinkedIncident[];
  activeIncident: LinkedIncident | null;
  events: EventRow[];
  asOfText: string;
}

const STAGE_LABEL: Record<string, string> = {
  in_transit: 'In transit',
  awaiting_berth: 'Awaiting berth',
  awaiting_departure: 'Awaiting departure',
  arrived: 'Arrived',
};

const POSITION_LABEL: Record<TrackState, string> = {
  exact: 'Reported',
  interpolated: 'Interpolated between reports',
  'last-known': 'Last known',
  stale: 'Last reported (stale)',
  unavailable: 'No position at this time',
};

const POSITION_METHOD: Record<TrackState, string> = {
  exact: 'Reported sample at the simulation time',
  interpolated: 'Interpolated between the two bracketing samples',
  'last-known': 'Most recent sample before the simulation time',
  stale: 'Most recent sample, older than the 30 min freshness limit',
  unavailable: 'No sample at or before the simulation time',
};

export function describeEvent(e: TimelineEvent, c: Catalog): string {
  const p = e.payload;
  switch (e.type) {
    case 'AIS_REPORT':
      return 'Synthetic AIS-style position report';
    case 'ETA_REVISED':
      return `ETA revised to ${formatUtc(p.newEstimatedArrivalUtc as string)}${p.driver ? ` · ${String(p.driver).replace(/_/g, ' ')}` : ''}`;
    case 'ANCHORAGE_ENTER':
      return `Entered ${c.byId.anchorage.get(p.anchorageId as string)?.name ?? 'anchorage'}`;
    case 'ANCHORAGE_EXIT':
      return `Left ${c.byId.anchorage.get(p.anchorageId as string)?.name ?? 'anchorage'}`;
    case 'BERTH_SCHEDULED':
      return `Berth ${c.byId.berth.get(p.berthId as string)?.name ?? p.berthId} scheduled from ${formatUtc(p.windowStartUtc as string)}`;
    case 'BERTH_OCCUPIED':
      return `Moored at ${c.byId.berth.get(p.berthId as string)?.name ?? p.berthId}`;
    case 'WEATHER_WARNING_ISSUED':
      return `Weather warning ${p.hazardId ?? ''} issued`;
    case 'INCIDENT_OPENED':
      return `Incident ${p.incidentId ?? ''} opened`;
    case 'INCIDENT_ACKNOWLEDGED':
      return `Incident ${p.incidentId ?? ''} acknowledged`;
    case 'ACTION_ASSIGNED':
      return `Action assigned on ${p.incidentId ?? 'incident'}`;
    case 'INCIDENT_RESOLVED':
      return `Incident ${p.incidentId ?? ''} resolved`;
    case 'PORT_WAIT_UPDATED':
      return `${c.byId.port.get(p.portId as string)?.name ?? 'Port'} wait estimate ${p.previousEstimateHours ?? '—'} → ${p.waitingEstimateHours} h`;
  }
}

function eventsFor(c: Catalog, keys: string[], t: number): EventRow[] {
  const seen = new Set<string>();
  const rows: EventRow[] = [];
  for (const k of keys) {
    for (const e of c.eventsByEntity.get(k) ?? []) {
      if (seen.has(e.eventId) || (c.eventMs.get(e.eventId) ?? Infinity) > t) continue;
      seen.add(e.eventId);
      rows.push({ eventId: e.eventId, type: e.type, timeUtc: formatUtc(e.occurredAtUtc), label: describeEvent(e, c), quality: e.quality });
    }
  }
  return rows.sort((a, b) => (a.timeUtc < b.timeUtc ? 1 : a.timeUtc > b.timeUtc ? -1 : a.eventId < b.eventId ? 1 : -1));
}

export function buildVesselInspector(c: Catalog, snap: Snapshot, vesselId: string): VesselInspectorModel | null {
  const v = c.byId.vessel.get(vesselId);
  if (!v) return null;
  const pos = snap.vessels.get(vesselId);
  const state: TrackState = pos?.state ?? 'unavailable';
  const firstSample = c.tracks.get(vesselId)?.[0]?.t ?? null;
  const notYetTracked = state === 'unavailable' && firstSample !== null && snap.timeMs < firstSample;
  const voyage = v.currentVoyageId ? c.byId.voyage.get(v.currentVoyageId) ?? null : null;
  const impact = voyage ? selectVoyageImpact(snap, voyage.voyageId) : null;
  const eta = impact?.eta ?? null;
  const exposure = impact?.exposure ?? null;
  const portName = (id: string) => c.byId.port.get(id)?.name ?? id;

  const incidents: LinkedIncident[] = (voyage ? c.incidentsByVoyage.get(voyage.voyageId) ?? [] : c.incidentsByVessel.get(vesselId) ?? [])
    .map((i) => ({ i, st: snap.incidents.get(i.incidentId) }))
    .filter(({ st }) => st?.visible)
    .map(({ i, st }) => ({
      incidentId: i.incidentId,
      title: i.title,
      severity: i.severity,
      status: st!.status,
      statusStyle: statusStyle('incident', st!.status),
      severityStyle: statusStyle('severity', i.severity),
    }));
  const sevRank: Record<Severity, number> = { critical: 3, high: 2, medium: 1 };
  const active = incidents.filter((i) => i.status !== 'resolved').sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || a.incidentId.localeCompare(b.incidentId));

  return {
    vesselId,
    name: v.name,
    subtitle: `${v.vesselType} · ${v.vesselId}`,
    fleet: v.fleet,
    navStyle: statusStyle('nav', pos?.navStatus ?? 'unknown'),
    positionState: state,
    positionLabel: notYetTracked ? `Not yet tracked · first report ${formatUtc(firstSample, { date: false })}` : POSITION_LABEL[state],
    positionStale: state === 'stale' || state === 'unavailable',
    identity: [
      { label: 'IMO (demo)', value: v.imoDemo, mono: true, hint: 'Synthetic identifier, not a registered IMO number' },
      { label: 'Flag', value: v.flagCountryIso2, mono: true },
      { label: 'Dimensions', value: `${v.lengthMeters} × ${v.beamMeters} m`, mono: true },
      { label: 'Draught', value: `${v.draughtMeters.toFixed(1)} m`, mono: true },
      { label: 'Fleet', value: v.fleet === 'own' ? 'Managed fleet' : 'Ambient traffic' },
    ],
    point: pos?.point ?? null,
    position: [
      {
        label: 'Position',
        value: pos?.point ? formatCoord(pos.point) : '—',
        mono: true,
        provenance: makeProvenance({
          sourceClass: 'simulated-fixture',
          evidence: state === 'interpolated' ? 'estimated' : state === 'unavailable' ? 'unknown' : 'observed',
          method: POSITION_METHOD[state],
          feed: 'position',
          asOf: pos?.sourceTimeMs ?? null,
          nowMs: snap.timeMs,
          confidence: state === 'exact' ? 'high' : state === 'interpolated' ? 'medium' : state === 'unavailable' ? 'unknown' : 'low',
          sources: pos?.sourceTimeMs ? [{ kind: 'record', id: vesselId, label: 'Synthetic AIS-style sample · positions.json', atUtc: formatUtc(pos.sourceTimeMs) }] : [],
          assumptions: ['Positions are never extrapolated past the last sample.'],
        }),
      },
      { label: 'Speed', value: formatKn(pos?.sogKn), mono: true },
      { label: 'Course', value: pos?.cogDeg === null || pos?.cogDeg === undefined ? '—' : `${Math.round(pos.cogDeg)}°`, mono: true },
      { label: 'Last report', value: pos?.sourceTimeMs ? formatUtc(pos.sourceTimeMs) : '—', mono: true, hint: formatTimestampFreshness(pos?.sourceTimeMs ?? null, snap.timeMs) },
    ],
    voyage: voyage
      ? {
          voyageId: voyage.voyageId,
          routeId: voyage.routeId,
          originName: portName(voyage.originPortId),
          destinationName: portName(voyage.destinationPortId),
          stage: STAGE_LABEL[voyage.currentStage] ?? voyage.currentStage,
          fields: [
            { label: 'Voyage', value: voyage.voyageId, mono: true },
            { label: 'Route', value: c.byId.route.get(voyage.routeId)?.corridorName ?? voyage.routeId },
            { label: 'Departure (planned)', value: formatUtc(voyage.plannedDepartureUtc), mono: true },
            { label: 'Departure (estimated)', value: voyage.departedAtUtc ? formatUtc(voyage.departedAtUtc) : formatUtc(voyage.estimatedDepartureUtc), mono: true, hint: voyage.departedAtUtc ? 'Actual' : 'Not yet departed' },
            { label: 'Distance remaining', value: formatNm(voyage.remainingNmAsOf), mono: true, hint: `Fixture estimate as of ${formatUtc(voyage.estimatedAsOfUtc)}` },
          ],
        }
      : null,
    impact,
    eta,
    etaShiftText: impact?.shiftText ?? '—',
    etaShiftTone: impact?.shiftTone ?? 'unknown',
    exposure,
    exposureText: impact?.exposureText ?? '—',
    incidents,
    activeIncident: active[0] ?? null,
    events: eventsFor(c, [`vessel:${vesselId}`, ...(voyage ? [`voyage:${voyage.voyageId}`] : [])], snap.timeMs),
    asOfText: formatUtc(snap.timeMs),
  };
}

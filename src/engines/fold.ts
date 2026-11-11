import { parseUtc } from '@/core/time';
import { STAGE_FROM_FIXTURE } from '@/core/caseStage';
import type { CaseStage, GeoPoint, Incident, IncidentStatus, TimelineEvent } from '@/core/types';

/** Fixture statuses that follow the recorded assignment (the dataset has no separate "investigating" event). */
const PROGRESSED: ReadonlySet<IncidentStatus> = new Set(['investigating', 'mitigation_planned', 'monitoring']);

export interface FoldedIncident {
  visible: boolean;
  status: CaseStage;
  ownerUserId: string | null;
  lastEventId: string | null;
}

/**
 * Recorded history folded up to one instant. Built only from fixture events — local demo decisions are a separate
 * overlay and never enter this state.
 */
export interface FoldState {
  /** Number of events applied (events with occurredAt ≤ t). */
  applied: number;
  lastEventId: string | null;
  incidents: Map<string, FoldedIncident>;
  portWait: Map<string, { hours: number; asOfUtc: string; eventId: string }>;
  /** portId → vessels currently inside the anchorage. */
  anchored: Map<string, Set<string>>;
  /** vesselId → latest anchorage entry still in force. */
  anchoredSince: Map<string, { portId: string; anchorageId: string | null; sinceUtc: string; eventId: string }>;
  /** berthId → current occupant. */
  berths: Map<string, { vesselId: string; sinceUtc: string }>;
  /** vesselId → latest scheduled berth window. */
  berthWindows: Map<string, { berthId: string; windowStartUtc: string | null; eventId: string }>;
  /** vesselId → berth queue entry (port queue, distinct from anchorage entry). */
  queued: Map<string, { portId: string; sinceUtc: string; eventId: string }>;
  /** vesselId → latest berth-time estimate (an estimate is never a confirmed slot). */
  berthEstimates: Map<string, { estimatedBerthUtc: string; confirmed: boolean; eventId: string }>;
  /** Weather warnings issued so far. */
  warnings: Set<string>;
  /** vesselId → latest position report event. */
  reports: Map<string, { eventId: string; atUtc: string; point: GeoPoint | null }>;
  /** voyageId → latest recorded ETA revision. */
  etaShift: Map<string, { hours: number; eventId: string; atUtc: string }>;
}

export function emptyFold(): FoldState {
  return {
    applied: 0,
    lastEventId: null,
    incidents: new Map(),
    portWait: new Map(),
    anchored: new Map(),
    anchoredSince: new Map(),
    berths: new Map(),
    berthWindows: new Map(),
    queued: new Map(),
    berthEstimates: new Map(),
    warnings: new Set(),
    reports: new Map(),
    etaShift: new Map(),
  };
}

function clone(s: FoldState): FoldState {
  return {
    applied: s.applied,
    lastEventId: s.lastEventId,
    incidents: new Map(s.incidents),
    portWait: new Map(s.portWait),
    anchored: new Map([...s.anchored].map(([k, v]) => [k, new Set(v)])),
    anchoredSince: new Map(s.anchoredSince),
    berths: new Map(s.berths),
    berthWindows: new Map(s.berthWindows),
    queued: new Map(s.queued),
    berthEstimates: new Map(s.berthEstimates),
    warnings: new Set(s.warnings),
    reports: new Map(s.reports),
    etaShift: new Map(s.etaShift),
  };
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function point(v: unknown): GeoPoint | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const lon = num(p.lon);
  const lat = num(p.lat);
  return lon === null || lat === null ? null : { lon, lat };
}

function apply(s: FoldState, e: TimelineEvent, record: (id: string) => Incident | undefined) {
  const p = e.payload;
  const incidentId = str(p.incidentId);
  const prev = incidentId ? s.incidents.get(incidentId) : undefined;
  switch (e.type) {
    case 'INCIDENT_OPENED':
      if (incidentId) s.incidents.set(incidentId, { visible: true, status: 'untriaged', ownerUserId: null, lastEventId: e.eventId });
      break;
    case 'INCIDENT_ACKNOWLEDGED':
      if (incidentId && prev) s.incidents.set(incidentId, { ...prev, status: 'investigating', ownerUserId: prev.ownerUserId ?? str(p.userId), lastEventId: e.eventId });
      break;
    case 'ACTION_ASSIGNED':
      if (incidentId && prev) {
        const recorded = record(incidentId)?.status;
        const status = recorded && PROGRESSED.has(recorded) && prev.status === 'investigating' ? STAGE_FROM_FIXTURE[recorded] : prev.status;
        s.incidents.set(incidentId, { ...prev, status, ownerUserId: str(p.assigneeUserId) ?? prev.ownerUserId, lastEventId: e.eventId });
      }
      break;
    case 'INCIDENT_RESOLVED':
      if (incidentId && prev) s.incidents.set(incidentId, { ...prev, status: 'resolved', ownerUserId: prev.ownerUserId ?? record(incidentId)?.ownerUserId ?? null, lastEventId: e.eventId });
      break;
    case 'PORT_WAIT_UPDATED': {
      const portId = str(p.portId);
      const hours = num(p.waitingEstimateHours);
      if (portId && hours !== null) s.portWait.set(portId, { hours, asOfUtc: e.occurredAtUtc, eventId: e.eventId });
      break;
    }
    case 'ANCHORAGE_ENTER':
    case 'ANCHORAGE_EXIT': {
      const portId = str(p.portId);
      const vesselId = str(p.vesselId);
      if (!portId || !vesselId) break;
      const set = s.anchored.get(portId) ?? new Set<string>();
      if (e.type === 'ANCHORAGE_ENTER') {
        set.add(vesselId);
        s.anchoredSince.set(vesselId, { portId, anchorageId: str(p.anchorageId), sinceUtc: e.occurredAtUtc, eventId: e.eventId });
      } else {
        set.delete(vesselId);
        s.anchoredSince.delete(vesselId);
      }
      s.anchored.set(portId, set);
      break;
    }
    case 'BERTH_SCHEDULED': {
      const vesselId = str(p.vesselId);
      const berthId = str(p.berthId);
      if (vesselId && berthId) s.berthWindows.set(vesselId, { berthId, windowStartUtc: str(p.windowStartUtc), eventId: e.eventId });
      break;
    }
    case 'BERTH_OCCUPIED': {
      const vesselId = str(p.vesselId);
      const berthId = str(p.berthId);
      const portId = str(p.portId);
      if (!vesselId || !berthId) break;
      s.berths.set(berthId, { vesselId, sinceUtc: e.occurredAtUtc });
      if (portId) s.anchored.get(portId)?.delete(vesselId);
      s.anchoredSince.delete(vesselId);
      s.queued.delete(vesselId);
      break;
    }
    case 'PORT_QUEUE_JOINED': {
      const vesselId = str(p.vesselId);
      const portId = str(p.portId);
      if (vesselId && portId) s.queued.set(vesselId, { portId, sinceUtc: e.occurredAtUtc, eventId: e.eventId });
      break;
    }
    case 'BERTH_ESTIMATE_UPDATED': {
      const vesselId = str(p.vesselId);
      const at = str(p.estimatedBerthUtc);
      if (vesselId && at) s.berthEstimates.set(vesselId, { estimatedBerthUtc: at, confirmed: p.confirmed === true, eventId: e.eventId });
      break;
    }
    case 'WEATHER_WARNING_ISSUED': {
      const hazardId = str(p.hazardId);
      if (hazardId) s.warnings.add(hazardId);
      break;
    }
    case 'AIS_REPORT': {
      const vesselId = str(p.vesselId);
      if (vesselId) s.reports.set(vesselId, { eventId: e.eventId, atUtc: e.occurredAtUtc, point: point(p.location) });
      break;
    }
    case 'ETA_REVISED': {
      const voyageId = str(p.voyageId);
      const hours = num(p.newEtaShiftHours);
      if (voyageId && hours !== null) s.etaShift.set(voyageId, { hours, eventId: e.eventId, atUtc: e.occurredAtUtc });
      break;
    }
  }
  s.applied += 1;
  s.lastEventId = e.eventId;
}

const eventMs = (e: TimelineEvent) => parseUtc(e.occurredAtUtc) ?? 0;
const byTime = (a: TimelineEvent, b: TimelineEvent) => eventMs(a) - eventMs(b) || a.eventId.localeCompare(b.eventId);

/**
 * Pure, stable fold: applies every event with occurredAt ≤ t on top of `base`, in (occurredAt, eventId) order.
 * Out-of-order arrival is handled by that sort; ingestion time is provenance only. `base` is never mutated.
 */
export function foldEvents(base: FoldState, events: readonly TimelineEvent[], t: number, record: (id: string) => Incident | undefined = () => undefined): FoldState {
  const s = clone(base);
  const sorted = events.every((e, i) => i === 0 || byTime(events[i - 1], e) <= 0) ? events : [...events].sort(byTime);
  for (const e of sorted) {
    if (eventMs(e) > t) break;
    apply(s, e, record);
  }
  return s;
}

/** Incident lifecycle at t from the fold, falling back to record timestamps when the incident has no events. */
export function incidentFromFold(fold: FoldState, inc: Incident, t: number): Omit<FoldedIncident, 'lastEventId'> {
  const f = fold.incidents.get(inc.incidentId);
  if (f) return { visible: f.visible, status: f.status, ownerUserId: f.ownerUserId };
  // Before INCIDENT_OPENED the rule has fired (`detectedAtUtc`) but no case exists yet: not visible, stage detected.
  const opened = parseUtc(inc.openedAtUtc);
  const visible = opened !== null && t >= opened;
  return { visible, status: visible ? 'untriaged' : 'detected', ownerUserId: null };
}

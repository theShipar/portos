import { parseUtc } from '@/core/time';
import type {
  Anchorage,
  Berth,
  EntityRef,
  Evidence,
  Incident,
  Manifest,
  Port,
  PortCall,
  PositionSample,
  RawDataset,
  Region,
  Route,
  Terminal,
  TimelineEvent,
  User,
  Vessel,
  Voyage,
  WeatherHazard,
} from '@/core/types';

/** Track sample with pre-parsed time for fast interpolation. */
export interface TrackPoint {
  t: number;
  lon: number;
  lat: number;
  sogKn: number | null;
  cogDeg: number | null;
  navStatus: PositionSample['navStatus'];
  positionId: string;
}

export interface Catalog {
  manifest: Manifest;
  anchorMs: number;
  replayStartMs: number;
  replayEndMs: number;
  regions: Region[];
  ports: Port[];
  terminals: Terminal[];
  berths: Berth[];
  anchorages: Anchorage[];
  routes: Route[];
  vessels: Vessel[];
  voyages: Voyage[];
  portCalls: PortCall[];
  incidents: Incident[];
  evidence: Evidence[];
  weatherHazards: WeatherHazard[];
  /** Sorted by occurredAtUtc then eventId (stable). */
  events: TimelineEvent[];
  users: User[];
  byId: {
    region: Map<string, Region>;
    port: Map<string, Port>;
    terminal: Map<string, Terminal>;
    berth: Map<string, Berth>;
    anchorage: Map<string, Anchorage>;
    route: Map<string, Route>;
    vessel: Map<string, Vessel>;
    voyage: Map<string, Voyage>;
    incident: Map<string, Incident>;
    evidence: Map<string, Evidence>;
    weather: Map<string, WeatherHazard>;
    user: Map<string, User>;
    event: Map<string, TimelineEvent>;
  };
  tracks: Map<string, TrackPoint[]>;
  portCallsByPort: Map<string, PortCall[]>;
  portCallsByVessel: Map<string, PortCall[]>;
  incidentsByVoyage: Map<string, Incident[]>;
  incidentsByVessel: Map<string, Incident[]>;
  eventsByEntity: Map<string, TimelineEvent[]>;
  anchorageByPort: Map<string, Anchorage>;
  berthsByPort: Map<string, Berth[]>;
  voyageByVessel: Map<string, Voyage>;
  eventMs: Map<string, number>;
  /** Optional datasets that failed to load; the app runs without them and says so. */
  missingDatasets: string[];
}

export class CatalogValidationError extends Error {
  constructor(public issues: string[]) {
    super(`Fixture validation failed: ${issues.slice(0, 5).join('; ')}${issues.length > 5 ? ` (+${issues.length - 5} more)` : ''}`);
  }
}

function index<T, K extends keyof T>(rows: T[], key: K, label: string, issues: string[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const id = r[key] as unknown as string;
    if (typeof id !== 'string' || !id) issues.push(`${label}: missing ${String(key)}`);
    else if (m.has(id)) issues.push(`${label}: duplicate ${id}`);
    else m.set(id, r);
  }
  return m;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export const entityKey = (ref: EntityRef) => `${ref.kind}:${ref.id}`;

/** Build a validated, indexed, immutable catalog. Throws CatalogValidationError when references do not resolve. */
export function buildCatalog(raw: RawDataset, missingDatasets: string[] = []): Catalog {
  const issues: string[] = [];
  const byId = {
    region: index(raw.regions, 'regionId', 'regions', issues),
    port: index(raw.ports, 'portId', 'ports', issues),
    terminal: index(raw.terminals, 'terminalId', 'terminals', issues),
    berth: index(raw.berths, 'berthId', 'berths', issues),
    anchorage: index(raw.anchorages, 'anchorageId', 'anchorages', issues),
    route: index(raw.routes, 'routeId', 'routes', issues),
    vessel: index(raw.vessels, 'vesselId', 'vessels', issues),
    voyage: index(raw.voyages, 'voyageId', 'voyages', issues),
    incident: index(raw.incidents, 'incidentId', 'incidents', issues),
    evidence: index(raw.evidence, 'evidenceId', 'evidence', issues),
    weather: index(raw.weatherHazards, 'hazardId', 'weatherHazards', issues),
    user: index(raw.users, 'userId', 'users', issues),
    event: index(raw.events, 'eventId', 'events', issues),
  };
  const need = (map: Map<string, unknown>, id: string | null | undefined, ctx: string, optional = false) => {
    if ((id === null || id === undefined) && optional) return;
    if (!id || !map.has(id)) issues.push(`${ctx} → missing ${id}`);
  };
  const refMap: Record<string, Map<string, unknown>> = {
    vessel: byId.vessel,
    voyage: byId.voyage,
    port: byId.port,
    incident: byId.incident,
    route: byId.route,
    weather: byId.weather,
    region: byId.region,
  };

  for (const p of raw.ports) need(byId.region, p.regionId, `port ${p.portId}`);
  for (const t of raw.terminals) need(byId.port, t.portId, `terminal ${t.terminalId}`);
  for (const b of raw.berths) {
    need(byId.terminal, b.terminalId, `berth ${b.berthId}`);
    need(byId.vessel, b.occupiedByVesselId, `berth ${b.berthId} occupant`, true);
    need(byId.vessel, b.scheduledVesselId, `berth ${b.berthId} scheduled`, true);
  }
  for (const v of raw.vessels) need(byId.voyage, v.currentVoyageId, `vessel ${v.vesselId}`, true);
  for (const v of raw.voyages) {
    need(byId.vessel, v.vesselId, `voyage ${v.voyageId}`);
    need(byId.route, v.routeId, `voyage ${v.voyageId}`);
    need(byId.port, v.originPortId, `voyage ${v.voyageId}`);
    need(byId.port, v.destinationPortId, `voyage ${v.voyageId}`);
  }
  for (const c of raw.portCalls) {
    need(byId.port, c.portId, `portCall ${c.portCallId}`);
    need(byId.vessel, c.vesselId, `portCall ${c.portCallId}`);
    need(byId.voyage, c.voyageId, `portCall ${c.portCallId}`, true);
  }
  for (const i of raw.incidents) {
    need(byId.vessel, i.vesselId, `incident ${i.incidentId}`);
    need(byId.voyage, i.voyageId, `incident ${i.incidentId}`);
    for (const e of i.evidenceIds) need(byId.evidence, e, `incident ${i.incidentId}`);
  }
  for (const w of raw.weatherHazards) for (const v of w.affectedVoyageIds) need(byId.voyage, v, `weather ${w.hazardId}`);
  const weatherMissing = missingDatasets.includes('weatherHazards');
  for (const ev of raw.events)
    for (const r of ev.entityRefs) {
      if (r.kind === 'weather' && weatherMissing) continue;
      need(refMap[r.kind] ?? new Map(), r.id, `event ${ev.eventId}`);
    }

  const tracks = new Map<string, TrackPoint[]>();
  for (const p of raw.positions) {
    const t = parseUtc(p.timestampUtc);
    if (t === null) {
      issues.push(`position ${p.positionId} invalid time`);
      continue;
    }
    push(tracks, p.vesselId, {
      t,
      lon: p.location.lon,
      lat: p.location.lat,
      sogKn: p.sogKn,
      cogDeg: p.cogDeg,
      navStatus: p.navStatus,
      positionId: p.positionId,
    });
  }
  for (const [vid, arr] of tracks) {
    if (!byId.vessel.has(vid)) issues.push(`positions for unknown vessel ${vid}`);
    arr.sort((a, b) => a.t - b.t);
  }

  if (issues.length) throw new CatalogValidationError(issues);

  const eventMs = new Map<string, number>();
  for (const e of raw.events) eventMs.set(e.eventId, parseUtc(e.occurredAtUtc) ?? 0);
  const events = raw.events
    .slice()
    .sort((a, b) => eventMs.get(a.eventId)! - eventMs.get(b.eventId)! || a.eventId.localeCompare(b.eventId));

  const portCallsByPort = new Map<string, PortCall[]>();
  const portCallsByVessel = new Map<string, PortCall[]>();
  for (const c of raw.portCalls) {
    push(portCallsByPort, c.portId, c);
    push(portCallsByVessel, c.vesselId, c);
  }
  const incidentsByVoyage = new Map<string, Incident[]>();
  const incidentsByVessel = new Map<string, Incident[]>();
  for (const i of raw.incidents) {
    push(incidentsByVoyage, i.voyageId, i);
    push(incidentsByVessel, i.vesselId, i);
  }
  const eventsByEntity = new Map<string, TimelineEvent[]>();
  for (const e of events) for (const r of e.entityRefs) push(eventsByEntity, entityKey(r), e);
  const anchorageByPort = new Map(raw.anchorages.map((a) => [a.portId, a] as const));
  const berthsByPort = new Map<string, Berth[]>();
  for (const b of raw.berths) push(berthsByPort, b.portId, b);
  const voyageByVessel = new Map(raw.voyages.map((v) => [v.vesselId, v] as const));

  const anchorMs = parseUtc(raw.manifest.fixedScenarioTimeUtc)!;
  return Object.freeze({
    manifest: raw.manifest,
    anchorMs,
    replayStartMs: parseUtc(raw.manifest.replayRange.startUtc) ?? anchorMs - 12 * 3_600_000,
    replayEndMs: parseUtc(raw.manifest.replayRange.endUtc) ?? anchorMs,
    regions: raw.regions,
    ports: raw.ports,
    terminals: raw.terminals,
    berths: raw.berths,
    anchorages: raw.anchorages,
    routes: raw.routes,
    vessels: raw.vessels,
    voyages: raw.voyages,
    portCalls: raw.portCalls,
    incidents: raw.incidents,
    evidence: raw.evidence,
    weatherHazards: raw.weatherHazards,
    events,
    users: raw.users,
    byId,
    tracks,
    portCallsByPort,
    portCallsByVessel,
    incidentsByVoyage,
    incidentsByVessel,
    eventsByEntity,
    anchorageByPort,
    berthsByPort,
    voyageByVessel,
    eventMs,
    missingDatasets: [...missingDatasets],
  }) as Catalog;
}

export const getVessel = (c: Catalog, id: string) => c.byId.vessel.get(id) ?? null;
export const getPort = (c: Catalog, id: string) => c.byId.port.get(id) ?? null;
export const getVoyage = (c: Catalog, id: string) => c.byId.voyage.get(id) ?? null;
export const getIncident = (c: Catalog, id: string) => c.byId.incident.get(id) ?? null;
export const getEvents = (c: Catalog, ref: EntityRef) => c.eventsByEntity.get(entityKey(ref)) ?? [];
export const getPortCalls = (c: Catalog, portId: string) => c.portCallsByPort.get(portId) ?? [];

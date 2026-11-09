import { densifyPath, inverseSpherical, sphericalPosition } from '@/core/geo';
import type { Bounds, EntityRef, GeoPoint, NavStatus, WeatherHazard } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { cohortSets, LATE_THRESHOLD_MINUTES, voyagesAtRisk } from '@/engines/kpis';
import type { Snapshot } from '@/engines/snapshot';
import type { TrackState } from '@/engines/tracks';
import type { HazardPhase } from '@/engines/weatherRisk';

export type VesselClass = 'container' | 'bulk' | 'tanker' | 'lng' | 'roro' | 'general';
export const VESSEL_CLASSES: VesselClass[] = ['container', 'bulk', 'tanker', 'lng', 'roro', 'general'];

const CLASS_BY_TYPE: Record<string, VesselClass> = {
  'Container ship': 'container',
  'Bulk carrier': 'bulk',
  'Oil tanker': 'tanker',
  'LNG carrier': 'lng',
  RoRo: 'roro',
  'General cargo': 'general',
};

export function vesselClassOf(vesselType: string): VesselClass {
  return CLASS_BY_TYPE[vesselType] ?? 'general';
}

/** Exception-first marker tone. Ranked so clusters can report their worst member. */
export type MarkerTone = 'incident' | 'atRisk' | 'delayed' | 'onPlan' | 'ambient';
export const TONE_RANK: Record<MarkerTone, number> = { ambient: 0, onPlan: 1, delayed: 2, atRisk: 3, incident: 4 };
export const TONE_LABEL: Record<MarkerTone, string> = {
  incident: 'Open incident',
  atRisk: 'At risk',
  delayed: `Forecast late > ${LATE_THRESHOLD_MINUTES} min`,
  onPlan: 'Managed · on plan',
  ambient: 'Other vessel',
};

export interface VesselMarker {
  vesselId: string;
  name: string;
  vesselType: string;
  vesselClass: VesselClass;
  fleet: 'own' | 'ambient';
  point: GeoPoint;
  cogDeg: number | null;
  sogKn: number | null;
  navStatus: NavStatus;
  trackState: TrackState;
  freshnessMinutes: number | null;
  stale: boolean;
  tone: MarkerTone;
  lengthM: number;
  voyageId: string | null;
  routeId: string | null;
  incidentIds: string[];
  etaShiftMinutes: number | null;
  exceptionCount: number;
}

/** Vessels with a position at the snapshot time. Vessels without one are omitted, never placed at 0,0. */
export function buildVesselMarkers(c: Catalog, snap: Snapshot): VesselMarker[] {
  const risk = voyagesAtRisk(c, snap, cohortSets(c, snap));
  const openByVessel = new Map<string, string[]>();
  for (const i of c.incidents) {
    const st = snap.incidents.get(i.incidentId);
    if (!st?.visible || st.status === 'resolved') continue;
    const list = openByVessel.get(i.vesselId) ?? [];
    list.push(i.incidentId);
    openByVessel.set(i.vesselId, list);
  }
  const out: VesselMarker[] = [];
  for (const v of c.vessels) {
    const s = snap.vessels.get(v.vesselId);
    if (!s?.point) continue;
    const voyage = v.currentVoyageId ? c.byId.voyage.get(v.currentVoyageId) : undefined;
    const eta = voyage ? snap.etas.get(voyage.voyageId) : undefined;
    const shift = eta?.etaShiftMinutes ?? null;
    const incidentIds = (openByVessel.get(v.vesselId) ?? []).sort();
    const delayed = shift !== null && shift > LATE_THRESHOLD_MINUTES;
    const atRisk = !!voyage && risk.has(voyage.voyageId);
    const tone: MarkerTone = incidentIds.length ? 'incident' : atRisk ? 'atRisk' : delayed ? 'delayed' : v.fleet === 'own' ? 'onPlan' : 'ambient';
    out.push({
      vesselId: v.vesselId,
      name: v.name,
      vesselType: v.vesselType,
      vesselClass: vesselClassOf(v.vesselType),
      fleet: v.fleet,
      point: s.point,
      cogDeg: s.cogDeg,
      sogKn: s.sogKn,
      navStatus: s.navStatus,
      trackState: s.state,
      freshnessMinutes: s.freshnessMinutes,
      stale: s.state === 'stale',
      tone,
      lengthM: v.lengthMeters,
      voyageId: voyage?.voyageId ?? null,
      routeId: voyage?.routeId ?? null,
      incidentIds,
      etaShiftMinutes: shift,
      exceptionCount: incidentIds.length + (delayed ? 1 : 0) + (atRisk && !incidentIds.length ? 1 : 0),
    });
  }
  return out;
}

export type PortTone = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface PortMarker {
  portId: string;
  name: string;
  regionId: string;
  point: GeoPoint;
  waitHours: number | null;
  waitAsOfUtc: string | null;
  tone: PortTone;
  openIncidents: number;
}

/** Waiting thresholds (hours) for the port congestion glyph; unknown wait is never shown as healthy. */
export const PORT_WAIT_THRESHOLDS = { warning: 6, critical: 18 } as const;

export function portTone(waitHours: number | null): PortTone {
  if (waitHours === null) return 'unknown';
  if (waitHours >= PORT_WAIT_THRESHOLDS.critical) return 'critical';
  if (waitHours >= PORT_WAIT_THRESHOLDS.warning) return 'warning';
  return 'healthy';
}

export function buildPortMarkers(c: Catalog, snap: Snapshot): PortMarker[] {
  const incidents = new Map<string, number>();
  for (const i of c.incidents) {
    const st = snap.incidents.get(i.incidentId);
    if (st?.visible && st.status !== 'resolved') incidents.set(i.portId, (incidents.get(i.portId) ?? 0) + 1);
  }
  return c.ports.map((p) => {
    const w = snap.portWait.get(p.portId) ?? null;
    return {
      portId: p.portId,
      name: p.name,
      regionId: p.regionId,
      point: p.location,
      waitHours: w?.hours ?? null,
      waitAsOfUtc: w?.asOfUtc ?? null,
      tone: portTone(w?.hours ?? null),
      openIncidents: incidents.get(p.portId) ?? 0,
    };
  });
}

export interface RouteLine {
  routeId: string;
  corridorName: string;
  isScenarioAlternative: boolean;
  points: GeoPoint[];
  distanceNm: number;
  voyageCount: number;
}

/** Corridors densified along short arcs between vetted waypoints (never a land-crossing chord). */
export function buildRouteLines(c: Catalog, maxStepNm = 120): RouteLine[] {
  const counts = new Map<string, number>();
  for (const vo of c.voyages) counts.set(vo.routeId, (counts.get(vo.routeId) ?? 0) + 1);
  return c.routes
    .filter((r) => r.waypoints.length >= 2)
    .map((r) => ({
      routeId: r.routeId,
      corridorName: r.corridorName,
      isScenarioAlternative: r.isScenarioAlternative,
      points: densifyPath(r.waypoints, maxStepNm),
      distanceNm: r.distanceNmEstimate,
      voyageCount: counts.get(r.routeId) ?? 0,
    }));
}

export interface MapFocus {
  vesselIds: string[];
  routeIds: string[];
  hazardIds: string[];
  portIds: string[];
  voyageId: string | null;
  /** Point the camera should keep in view, if any. */
  point: GeoPoint | null;
}

const EMPTY_FOCUS: MapFocus = { vesselIds: [], routeIds: [], hazardIds: [], portIds: [], voyageId: null, point: null };

export function polygonCentroid(poly: GeoPoint[]): GeoPoint {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of poly) {
    const v = sphericalPosition(p.lat, p.lon, 1);
    x += v[0];
    y += v[1];
    z += v[2];
  }
  return inverseSpherical(x, y, z);
}

/** What the map should emphasise for the current selection (route highlight, endpoints, hazard). */
export function focusForSelection(c: Catalog, snap: Snapshot, sel: EntityRef | null): MapFocus {
  if (!sel) return EMPTY_FOCUS;
  const forVoyage = (voyageId: string | null, vesselId: string): MapFocus => {
    const vo = voyageId ? c.byId.voyage.get(voyageId) : undefined;
    return {
      vesselIds: [vesselId],
      routeIds: vo ? [vo.routeId] : [],
      hazardIds: [],
      portIds: vo ? [vo.originPortId, vo.destinationPortId] : [],
      voyageId: vo?.voyageId ?? null,
      point: snap.vessels.get(vesselId)?.point ?? null,
    };
  };
  switch (sel.kind) {
    case 'vessel': {
      const v = c.byId.vessel.get(sel.id);
      return v ? forVoyage(v.currentVoyageId, v.vesselId) : EMPTY_FOCUS;
    }
    case 'voyage': {
      const vo = c.byId.voyage.get(sel.id);
      return vo ? forVoyage(vo.voyageId, vo.vesselId) : EMPTY_FOCUS;
    }
    case 'incident': {
      const i = c.byId.incident.get(sel.id);
      return i ? forVoyage(i.voyageId, i.vesselId) : EMPTY_FOCUS;
    }
    case 'route': {
      const r = c.byId.route.get(sel.id);
      if (!r) return EMPTY_FOCUS;
      return { ...EMPTY_FOCUS, routeIds: [r.routeId], portIds: [r.originPortId, r.destinationPortId], point: r.waypoints[Math.floor(r.waypoints.length / 2)] };
    }
    case 'weather': {
      const h = c.byId.weather.get(sel.id);
      if (!h) return EMPTY_FOCUS;
      return { ...EMPTY_FOCUS, hazardIds: [h.hazardId], routeIds: [...h.affectedRouteIds], point: polygonCentroid(h.polygon) };
    }
    case 'port': {
      const p = c.byId.port.get(sel.id);
      return p ? { ...EMPTY_FOCUS, portIds: [p.portId], point: p.location } : EMPTY_FOCUS;
    }
    default:
      return EMPTY_FOCUS;
  }
}

export interface HazardShape {
  hazardId: string;
  type: string;
  severity: WeatherHazard['severity'];
  phase: HazardPhase;
  polygon: GeoPoint[];
  outline: GeoPoint[];
  validFromUtc: string;
  validToUtc: string;
  affectedVoyageCount: number;
  confidence: WeatherHazard['confidence'];
}

/** Active hazards are filled; upcoming ones are outlined only; expired or not-yet-issued are not drawn. */
export function buildHazards(c: Catalog, snap: Snapshot): HazardShape[] {
  const out: HazardShape[] = [];
  for (const h of c.weatherHazards) {
    const phase = snap.hazards.get(h.hazardId) ?? 'not-issued';
    if (phase !== 'active' && phase !== 'upcoming') continue;
    out.push({
      hazardId: h.hazardId,
      type: h.type,
      severity: h.severity,
      phase,
      polygon: h.polygon,
      outline: densifyPath([...h.polygon, h.polygon[0]], 40),
      validFromUtc: h.validFromUtc,
      validToUtc: h.validToUtc,
      affectedVoyageCount: h.affectedVoyageIds.length,
      confidence: h.confidence,
    });
  }
  return out;
}

export interface DensityCell {
  south: number;
  west: number;
  sizeDeg: number;
  count: number;
}

/** Vessel count per lat/lon cell at the snapshot time (derived traffic density). */
export function trafficDensity(markers: VesselMarker[], sizeDeg = 2): DensityCell[] {
  const cells = new Map<string, DensityCell>();
  for (const m of markers) {
    const south = Math.floor(m.point.lat / sizeDeg) * sizeDeg;
    const west = Math.floor(m.point.lon / sizeDeg) * sizeDeg;
    const key = `${south}:${west}`;
    const cell = cells.get(key) ?? { south, west, sizeDeg, count: 0 };
    cell.count++;
    cells.set(key, cell);
  }
  return [...cells.values()].sort((a, b) => a.south - b.south || a.west - b.west);
}

export interface VesselCluster {
  id: string;
  center: GeoPoint;
  count: number;
  worstTone: MarkerTone;
  exceptionCount: number;
  bounds: Bounds;
  memberIds: string[];
}

/**
 * Fixed geographic grid clustering (stable while the globe rotates). Pinned vessels (selection, open incidents) are
 * never absorbed. Cells below `minCount` keep their individual markers.
 */
export function clusterVessels(markers: VesselMarker[], cellDeg: number, pinned: ReadonlySet<string>, minCount = 4): { clusters: VesselCluster[]; clusteredIds: Set<string> } {
  const clusteredIds = new Set<string>();
  if (cellDeg <= 0) return { clusters: [], clusteredIds };
  const cells = new Map<string, VesselMarker[]>();
  for (const m of markers) {
    if (pinned.has(m.vesselId)) continue;
    const key = `${Math.floor(m.point.lat / cellDeg)}:${Math.floor(m.point.lon / cellDeg)}`;
    const list = cells.get(key) ?? [];
    list.push(m);
    cells.set(key, list);
  }
  const clusters: VesselCluster[] = [];
  for (const [key, members] of cells) {
    if (members.length < minCount) continue;
    let worst: MarkerTone = 'ambient';
    let exceptions = 0;
    let x = 0;
    let y = 0;
    let z = 0;
    const bounds: Bounds = { west: 180, south: 90, east: -180, north: -90 };
    for (const m of members) {
      if (TONE_RANK[m.tone] > TONE_RANK[worst]) worst = m.tone;
      exceptions += m.exceptionCount > 0 ? 1 : 0;
      const v = sphericalPosition(m.point.lat, m.point.lon, 1);
      x += v[0];
      y += v[1];
      z += v[2];
      bounds.west = Math.min(bounds.west, m.point.lon);
      bounds.east = Math.max(bounds.east, m.point.lon);
      bounds.south = Math.min(bounds.south, m.point.lat);
      bounds.north = Math.max(bounds.north, m.point.lat);
      clusteredIds.add(m.vesselId);
    }
    clusters.push({ id: `cl:${cellDeg}:${key}`, center: inverseSpherical(x, y, z), count: members.length, worstTone: worst, exceptionCount: exceptions, bounds, memberIds: members.map((m) => m.vesselId).sort() });
  }
  clusters.sort((a, b) => a.id.localeCompare(b.id));
  return { clusters, clusteredIds };
}

export function describeVesselMarker(m: VesselMarker): { title: string; lines: string[] } {
  const speed = m.sogKn === null ? 'Speed n/a' : `${m.sogKn.toFixed(1)} kn`;
  const course = m.cogDeg === null ? 'COG n/a' : `COG ${Math.round(m.cogDeg)}°`;
  const age =
    m.freshnessMinutes === null ? 'No report' : m.freshnessMinutes < 1 ? 'Report < 1 min old' : `Report ${Math.round(m.freshnessMinutes)} min old${m.stale ? ' · stale' : ''}`;
  const lines = [`${m.vesselId} · ${m.vesselType}`, `${speed} · ${course} · ${age}`];
  if (m.voyageId) lines.push(`Voyage ${m.voyageId}`);
  lines.push(m.exceptionCount ? `${m.exceptionCount} exception${m.exceptionCount > 1 ? 's' : ''} · ${TONE_LABEL[m.tone]}` : TONE_LABEL[m.tone]);
  return { title: m.name, lines };
}

import { pointInPolygon } from '@/core/geo';
import { parseUtc, toIsoUtc } from '@/core/time';
import type { Anchorage, Bounds, GeoPoint, Port } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { computePortCongestion, type BerthState, type PortCongestionResult } from '@/engines/congestion';
import type { Snapshot } from '@/engines/snapshot';
import { buildVesselMarkers, type MarkerTone, type VesselMarker } from './mapLayers';

export type QueueStatus = 'at_anchor' | 'awaiting_berth';
/** Every row awaits a berth; the status says whether the vessel is anchored while it waits. */
export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = { at_anchor: 'At anchor', awaiting_berth: 'Queued · not anchored' };

export interface PortQueueRow {
  portCallId: string;
  vesselId: string;
  name: string;
  vesselType: string;
  fleet: 'own' | 'ambient';
  tone: MarkerTone;
  status: QueueStatus;
  elapsedWaitHours: number | null;
  /** Hours until the estimated berth window; null when no berth time is confirmed. */
  forecastWaitHours: number | null;
  estimatedBerthUtc: string | null;
  /** True only when both a berth and a berth time are on record; the list never shows a rank. */
  berthConfirmed: boolean;
  terminalId: string | null;
  terminalName: string | null;
  berthId: string | null;
  berthName: string | null;
  anchorageId: string | null;
  point: GeoPoint | null;
  queueEvidence: 'waiting-since recorded' | 'waiting start unknown';
}

export interface AnchorageSummary {
  anchorageId: string;
  name: string;
  polygon: GeoPoint[];
  capacityEstimate: number | null;
  /** Every vessel whose position at the snapshot time lies inside the zone. */
  vesselIds: string[];
  occupancy: number | null;
  crowded: boolean;
  queueCount: number;
  awaitingBerthConfirmed: number;
  medianWaitHours: number | null;
  p90WaitHours: number | null;
  unknownWaitCount: number;
  sourceType: string;
}

export type BerthStatusLabel = 'Occupied' | 'Scheduled' | 'Unavailable' | 'Free' | 'Unknown';
export const BERTH_STATUS_LABEL: Record<BerthState['status'], BerthStatusLabel> = {
  occupied: 'Occupied',
  scheduled: 'Scheduled',
  unavailable: 'Unavailable',
  free: 'Free',
  unknown: 'Unknown',
};

export interface BerthCallRow {
  portCallId: string;
  vesselId: string;
  name: string;
  status: 'awaiting_berth' | 'scheduled' | 'at_berth';
  arrivalAtUtc: string;
  estimatedBerthUtc: string | null;
}

export interface BerthView extends BerthState {
  location: GeoPoint;
  occupantName: string | null;
  scheduledName: string | null;
  linkedCalls: BerthCallRow[];
}

export interface TerminalView {
  terminalId: string;
  name: string;
  location: GeoPoint;
  berths: BerthView[];
  occupied: number;
  unknown: number;
  unavailable: number;
  sourceType: string;
}

export interface ArrivalRow {
  portCallId: string;
  vesselId: string;
  name: string;
  arrivalAtUtc: string;
  terminalName: string | null;
}

export interface PortKpis {
  atAnchor: number;
  awaitingBerth: number;
  arrivalsNext24h: number;
  medianKnownWaitHours: number | null;
  waitSampleSize: number;
}

export interface PortViewModel {
  port: Port;
  localTimeZone: string;
  asOfUtc: string;
  kpis: PortKpis;
  queue: PortQueueRow[];
  anchorages: AnchorageSummary[];
  terminals: TerminalView[];
  berths: BerthView[];
  arrivals: ArrivalRow[];
  congestion: PortCongestionResult;
  /** `unavailable` when the port has no berth records: shown as "Berth feed unavailable", never 0 %. */
  berthFeed: 'available' | 'unavailable';
  /** Geographic extent of the port's own features (terminals, berths, anchorage), for 2D framing. */
  bounds: Bounds;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function boundsOf(points: GeoPoint[], fallback: GeoPoint): Bounds {
  if (!points.length) return { west: fallback.lon - 0.1, east: fallback.lon + 0.1, south: fallback.lat - 0.1, north: fallback.lat + 0.1 };
  const b: Bounds = { west: 180, east: -180, south: 90, north: -90 };
  for (const p of points) {
    b.west = Math.min(b.west, p.lon);
    b.east = Math.max(b.east, p.lon);
    b.south = Math.min(b.south, p.lat);
    b.north = Math.max(b.north, p.lat);
  }
  return b;
}

function summariseAnchorage(a: Anchorage, markers: VesselMarker[], queue: PortQueueRow[]): AnchorageSummary {
  const vesselIds = markers.filter((m) => pointInPolygon(m.point, a.polygon)).map((m) => m.vesselId).sort();
  const inside = new Set(vesselIds);
  const rows = queue.filter((q) => inside.has(q.vesselId));
  const waits = rows.map((r) => r.elapsedWaitHours).filter((w): w is number => w !== null).sort((x, y) => x - y);
  const occupancy = a.capacityEstimate ? vesselIds.length / a.capacityEstimate : null;
  return {
    anchorageId: a.anchorageId,
    name: a.name,
    polygon: a.polygon,
    capacityEstimate: a.capacityEstimate,
    vesselIds,
    occupancy,
    crowded: occupancy !== null && occupancy >= 0.8,
    queueCount: rows.length,
    awaitingBerthConfirmed: rows.filter((r) => r.berthConfirmed).length,
    medianWaitHours: waits.length ? percentile(waits, 0.5) : null,
    p90WaitHours: waits.length >= 5 ? percentile(waits, 0.9) : null,
    unknownWaitCount: rows.length - waits.length,
    sourceType: a.sourceType,
  };
}

/** Everything the port screen shows, folded at one simulation instant from the same engines as every other view. */
export function buildPortViewModel(c: Catalog, snap: Snapshot, portId: string, markers: VesselMarker[] = buildVesselMarkers(c, snap)): PortViewModel | null {
  const port = c.byId.port.get(portId);
  if (!port) return null;
  const t = snap.timeMs;
  const congestion = computePortCongestion(c, portId, t);
  const byVessel = new Map(markers.map((m) => [m.vesselId, m]));
  const vesselName = (id: string | null) => (id ? (c.byId.vessel.get(id)?.name ?? id) : null);
  const terminalName = (id: string | null) => (id ? (c.byId.terminal.get(id)?.name ?? id) : null);
  const anchorages = c.anchorages.filter((a) => a.portId === portId);
  const calls = c.portCallsByPort.get(portId) ?? [];
  const callByPortCall = new Map(calls.map((pc) => [pc.portCallId, pc]));

  const queue: PortQueueRow[] = congestion.queue.map((q) => {
    const m = byVessel.get(q.vesselId);
    const v = c.byId.vessel.get(q.vesselId);
    const call = callByPortCall.get(q.portCallId);
    const berthId = call?.berthId ?? null;
    const point = m?.point ?? null;
    return {
      portCallId: q.portCallId,
      vesselId: q.vesselId,
      name: v?.name ?? q.vesselId,
      vesselType: v?.vesselType ?? 'Unknown type',
      fleet: v?.fleet ?? 'ambient',
      tone: m?.tone ?? 'ambient',
      status: q.atAnchor ? 'at_anchor' : 'awaiting_berth',
      elapsedWaitHours: q.elapsedWaitHours,
      forecastWaitHours: q.forecastWaitHours,
      estimatedBerthUtc: q.estimatedBerthUtc,
      berthConfirmed: berthId !== null && q.estimatedBerthUtc !== null,
      terminalId: q.terminalId,
      terminalName: terminalName(q.terminalId),
      berthId,
      berthName: berthId ? (c.byId.berth.get(berthId)?.name ?? berthId) : null,
      anchorageId: point ? (anchorages.find((a) => pointInPolygon(point, a.polygon))?.anchorageId ?? null) : null,
      point,
      queueEvidence: q.queueEvidence,
    };
  });

  const berthRecord = new Map((c.berthsByPort.get(portId) ?? []).map((b) => [b.berthId, b]));
  const berths: BerthView[] = congestion.berths.map((b) => {
    const linkedCalls = calls
      .filter((pc) => pc.berthId === b.berthId && (parseUtc(pc.arrivalAtUtc) ?? Infinity) <= t + 7 * 86_400_000)
      .filter((pc) => pc.status !== 'at_berth' || pc.vesselId === b.occupantVesselId)
      .map((pc) => ({ portCallId: pc.portCallId, vesselId: pc.vesselId, name: vesselName(pc.vesselId)!, status: pc.status, arrivalAtUtc: pc.arrivalAtUtc, estimatedBerthUtc: pc.estimatedBerthUtc }))
      .sort((x, y) => (x.estimatedBerthUtc ?? x.arrivalAtUtc).localeCompare(y.estimatedBerthUtc ?? y.arrivalAtUtc));
    return {
      ...b,
      location: berthRecord.get(b.berthId)!.location,
      occupantName: vesselName(b.occupantVesselId),
      scheduledName: vesselName(b.scheduledVesselId),
      linkedCalls,
    };
  });

  const terminals: TerminalView[] = c.terminals
    .filter((tm) => tm.portId === portId)
    .map((tm) => {
      const own = berths.filter((b) => b.terminalId === tm.terminalId);
      return {
        terminalId: tm.terminalId,
        name: tm.name,
        location: tm.location,
        berths: own,
        occupied: own.filter((b) => b.status === 'occupied').length,
        unknown: own.filter((b) => b.status === 'unknown').length,
        unavailable: own.filter((b) => b.status === 'unavailable').length,
        sourceType: tm.sourceType,
      };
    });

  const arrivals: ArrivalRow[] = congestion.arrivals.map((pc) => ({
    portCallId: pc.portCallId,
    vesselId: pc.vesselId,
    name: vesselName(pc.vesselId)!,
    arrivalAtUtc: pc.arrivalAtUtc,
    terminalName: terminalName(pc.terminalId),
  }));

  const features = [...terminals.map((tm) => tm.location), ...berths.map((b) => b.location), ...anchorages.flatMap((a) => a.polygon)];

  return {
    port,
    localTimeZone: port.timeZone,
    asOfUtc: toIsoUtc(t),
    kpis: {
      atAnchor: congestion.atAnchorCount,
      awaitingBerth: congestion.awaitingBerthCount,
      arrivalsNext24h: congestion.arrivalsNext24h,
      medianKnownWaitHours: congestion.medianWaitHours,
      waitSampleSize: congestion.waitSampleSize,
    },
    queue,
    anchorages: anchorages.map((a) => summariseAnchorage(a, markers, queue)),
    terminals,
    berths,
    arrivals,
    congestion,
    berthFeed: berths.length ? 'available' : 'unavailable',
    bounds: boundsOf(features, port.location),
  };
}

export type QueueFilter = 'all' | QueueStatus | 'unconfirmed';

export function filterQueue(rows: PortQueueRow[], filter: QueueFilter): PortQueueRow[] {
  if (filter === 'all') return rows;
  if (filter === 'unconfirmed') return rows.filter((r) => !r.berthConfirmed);
  return rows.filter((r) => r.status === filter);
}

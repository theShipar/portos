import { boundsCenter, haversineDistanceNm, offsetMeters } from '@/core/geo';
import type { Bounds, GeoPoint, LayoutTerminal, PortLayout } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { berthTimeline, type BerthConflict, type BerthTimelineRow } from '@/engines/berthTimeline';

/**
 * Port twin read model (spec 07): the illustrative layout of a port joined with its berth records and the DCSA
 * timeline at one instant. Geometry stays geographic (WGS84); scenes and the 2D map project it themselves.
 */

export type TwinBerthStatus = 'occupied' | 'reserved' | 'free' | 'unavailable' | 'unknown';

export interface TwinBerth {
  berthId: string;
  name: string;
  terminalId: string;
  terminalName: string;
  center: GeoPoint;
  /** Along the quay, degrees true. */
  quayBearingDeg: number;
  /** From the quay edge towards the water. */
  seawardDeg: number;
  lengthM: number;
  /** Illustrative layout depth; never a charted or validated value. */
  depthM: number;
  craneCount: number;
  status: TwinBerthStatus;
  occupantVesselId: string | null;
  timeline: BerthTimelineRow;
}

export interface TwinTerminal {
  terminalId: string;
  name: string;
  quayLine: GeoPoint[];
  quayBearingDeg: number;
  landwardDeg: number;
  yardDepthM: number;
  /** Declared simulated box count drawn in the yard. */
  yardContainers: number;
  /** Quay line plus its landward offset, closed ring. */
  footprint: GeoPoint[];
  berthIds: string[];
}

export interface MooredPose {
  vesselId: string;
  berthId: string;
  point: GeoPoint;
  headingDeg: number;
}

export type TwinAnchorage = PortLayout['anchorages'][number] & {
  /** Just inside the edge facing the port, so the name stays in the port frame. */
  labelPoint: GeoPoint;
};

export interface PortTwinModel {
  portId: string;
  detail: PortLayout['detail'];
  terminals: TwinTerminal[];
  berths: TwinBerth[];
  anchorages: TwinAnchorage[];
  pilotBoardingPlace: GeoPoint;
  /** Terminals near the port centre with a margin: the default port camera frame. */
  coreBounds: Bounds;
  conflicts: BerthConflict[];
  moored: MooredPose[];
  caption: string;
}

export const TWIN_CAPTION = 'Illustrative terminal configuration · Simulated · not for navigation';
export const BERTH_STATUS_LABEL: Record<TwinBerthStatus, string> = {
  occupied: 'Occupied',
  reserved: 'Reserved',
  free: 'Free',
  unavailable: 'Unavailable',
  unknown: 'Status unknown',
};
/** Gap between hull and quay edge (fenders). */
const FENDER_M = 4;
/** Default port frame: terminals within this distance of the port centre, plus a margin (metres). */
const CORE_RADIUS_NM = 6000 / 1852;
const CORE_MARGIN_M = { min: 600, max: 1500, fraction: 0.25 };

const SIDE_DEG: Record<LayoutTerminal['landSide'], number> = { north: 0, east: 90, south: 180, west: 270 };

const wrap = (d: number) => ((d % 360) + 360) % 360;
const angleBetween = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** The quay normal pointing at the terminal's land side. */
export function landwardBearing(t: Pick<LayoutTerminal, 'quayBearingDeg' | 'landSide'>): number {
  const a = wrap(t.quayBearingDeg - 90);
  const b = wrap(t.quayBearingDeg + 90);
  const side = SIDE_DEG[t.landSide];
  return angleBetween(a, side) <= angleBetween(b, side) ? a : b;
}

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Alongside pose: hull centre offset from the berth into the water, heading along the quay (either way, by ID). */
export function mooredPose(berth: Pick<TwinBerth, 'berthId' | 'center' | 'quayBearingDeg' | 'seawardDeg'>, vesselId: string, beamM: number): MooredPose {
  return {
    vesselId,
    berthId: berth.berthId,
    point: offsetMeters(berth.center, berth.seawardDeg, beamM / 2 + FENDER_M),
    headingDeg: wrap(berth.quayBearingDeg + (hash(vesselId) % 2 ? 180 : 0)),
  };
}

function boundsAround(points: GeoPoint[], marginM: number): Bounds {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lon);
    east = Math.max(east, p.lon);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  const c = boundsCenter({ west, east, south, north });
  const dLat = offsetMeters(c, 0, marginM).lat - c.lat;
  const dLon = offsetMeters(c, 90, marginM).lon - c.lon;
  return { west: west - dLon, east: east + dLon, south: south - dLat, north: north + dLat };
}

/** Default frame points: terminals near the port centre and the near edge of its waiting anchorages. */
function corePoints(terminals: TwinTerminal[], anchorages: PortLayout['anchorages'], centre: GeoPoint | undefined): GeoPoint[] {
  if (!centre) return terminals.flatMap((tm) => tm.footprint);
  const near = (p: GeoPoint) => haversineDistanceNm(p, centre) <= CORE_RADIUS_NM;
  const tms = terminals.filter((tm) => tm.quayLine.some(near));
  const pts = (tms.length ? tms : terminals).flatMap((tm) => tm.footprint);
  for (const a of anchorages) if (a.usage === 'waiting') pts.push(...a.polygon.filter(near));
  return pts;
}

/** Margin scales with the frame so a one-terminal port is not lost in water. */
function coreFrame(points: GeoPoint[]): Bounds {
  const b = boundsAround(points, 0);
  const extentM = haversineDistanceNm({ lat: b.south, lon: b.west }, { lat: b.north, lon: b.east }) * 1852;
  return boundsAround(points, Math.min(CORE_MARGIN_M.max, Math.max(CORE_MARGIN_M.min, extentM * CORE_MARGIN_M.fraction)));
}

function anchorageLabel(a: PortLayout['anchorages'][number], centre: GeoPoint): GeoPoint {
  const nearest = a.polygon.reduce((best, p) => (haversineDistanceNm(p, centre) < haversineDistanceNm(best, centre) ? p : best));
  const mid = boundsCenter(boundsAround(a.polygon, 0));
  return { lon: nearest.lon + (mid.lon - nearest.lon) * 0.12, lat: nearest.lat + (mid.lat - nearest.lat) * 0.12 };
}

export function buildPortTwin(c: Catalog, portId: string, t: number): PortTwinModel | null {
  const layout = c.v2?.layoutByPort.get(portId);
  if (!layout) return null;
  const bookings = c.v2!.bookingsByPort.get(portId) ?? [];
  const centre = c.byId.port.get(portId)?.location ?? boundsCenter(layout.bounds);
  const terminals: TwinTerminal[] = [];
  const berths: TwinBerth[] = [];
  for (const lt of layout.terminals) {
    const landwardDeg = landwardBearing(lt);
    const seawardDeg = wrap(landwardDeg + 180);
    const back = [...lt.quayLine].reverse().map((p) => offsetMeters(p, landwardDeg, lt.yardDepthMeters));
    terminals.push({
      terminalId: lt.terminalId,
      name: lt.name,
      quayLine: lt.quayLine,
      quayBearingDeg: lt.quayBearingDeg,
      landwardDeg,
      yardDepthM: lt.yardDepthMeters,
      yardContainers: lt.yardContainers,
      footprint: [...lt.quayLine, ...back],
      berthIds: lt.berths.map((b) => b.berthId),
    });
    for (const lb of lt.berths) {
      const record = c.byId.berth.get(lb.berthId);
      const timeline = berthTimeline(lb.berthId, bookings, t);
      const status: TwinBerthStatus =
        record?.status === 'unavailable' ? 'unavailable' : timeline.occupancy !== 'free' ? timeline.occupancy : record?.status === 'unknown' && !timeline.bars.length ? 'unknown' : 'free';
      berths.push({
        berthId: lb.berthId,
        name: record?.name ?? lb.berthId,
        terminalId: lt.terminalId,
        terminalName: lt.name,
        center: lb.center,
        quayBearingDeg: lb.quayBearingDeg,
        seawardDeg,
        lengthM: lb.lengthMeters,
        depthM: lb.depthMeters,
        craneCount: lb.craneCount,
        status,
        occupantVesselId: timeline.occupantVesselId,
        timeline,
      });
    }
  }
  const moored: MooredPose[] = [];
  for (const b of berths) {
    if (!b.occupantVesselId) continue;
    const v = c.byId.vessel.get(b.occupantVesselId);
    if (v) moored.push(mooredPose(b, v.vesselId, v.beamMeters));
  }
  return {
    portId,
    detail: layout.detail,
    terminals,
    berths,
    anchorages: layout.anchorages.map((a) => ({ ...a, labelPoint: anchorageLabel(a, centre) })),
    pilotBoardingPlace: layout.pilotBoardingPlace,
    coreBounds: coreFrame(corePoints(terminals, layout.anchorages, centre)),
    conflicts: berths.flatMap((b) => b.timeline.conflicts).sort((a, b) => a.startMs - b.startMs),
    moored,
    caption: TWIN_CAPTION,
  };
}

/** Moored poses at every twin port at instant `t`, keyed by vessel. */
export function mooredPosesAt(c: Catalog, t: number): Map<string, MooredPose> {
  const out = new Map<string, MooredPose>();
  if (!c.v2) return out;
  for (const portId of c.v2.layoutByPort.keys()) for (const p of buildPortTwin(c, portId, t)?.moored ?? []) out.set(p.vesselId, p);
  return out;
}

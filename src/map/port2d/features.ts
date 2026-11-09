import type { Feature, FeatureCollection, GeoJsonProperties, LineString, Point, Polygon } from 'geojson';
import type { GeoPoint } from '@/core/types';
import { TONE_RANK, type HazardShape, type RouteLine, type VesselMarker } from '@/selectors/mapLayers';
import type { AnchorageSummary, BerthView } from '@/selectors/port';

/** Longitudes made continuous along a line so MapLibre draws antimeridian crossings as short segments. */
export function unwrapLine(points: GeoPoint[]): [number, number][] {
  const out: [number, number][] = [];
  let prev: number | null = null;
  for (const p of points) {
    let lon = p.lon;
    if (prev !== null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    out.push([lon, p.lat]);
    prev = lon;
  }
  return out;
}

const fc = <G extends Point | LineString | Polygon, P = GeoJsonProperties>(features: Feature<G, P>[]): FeatureCollection<G, P> => ({ type: 'FeatureCollection', features });

export interface VesselFeatureProps {
  id: string;
  name: string;
  tone: VesselMarker['tone'];
  icon: string;
  rotate: number;
  rank: number;
  incident: boolean;
  stale: boolean;
}

/** Vessels split into a clustered source and a pinned one: selection and open incidents are never absorbed. */
export function vesselFeatures(markers: VesselMarker[], visible: (m: VesselMarker) => boolean, pinned: ReadonlySet<string>) {
  const clustered: Feature<Point, VesselFeatureProps>[] = [];
  const pinnedOut: Feature<Point, VesselFeatureProps>[] = [];
  for (const m of markers) {
    const isPinned = pinned.has(m.vesselId);
    if (!isPinned && !visible(m)) continue;
    const anchored = m.navStatus === 'at_anchor' || m.navStatus === 'moored' || m.cogDeg === null;
    const f: Feature<Point, VesselFeatureProps> = {
      type: 'Feature',
      id: m.vesselId,
      geometry: { type: 'Point', coordinates: [m.point.lon, m.point.lat] },
      properties: {
        id: m.vesselId,
        name: m.name,
        tone: m.tone,
        icon: `${anchored ? 'vessel-moored' : 'vessel'}-${m.stale ? 'stale' : m.tone}`,
        rotate: m.cogDeg ?? 0,
        rank: TONE_RANK[m.tone] + (isPinned ? 10 : 0),
        incident: m.tone === 'incident',
        stale: m.stale,
      },
    };
    (isPinned ? pinnedOut : clustered).push(f);
  }
  return { clustered: fc(clustered), pinned: fc(pinnedOut) };
}

export function anchorageFeatures(list: AnchorageSummary[], highlightId: string | null) {
  return fc<Polygon>(
    list.map((a) => ({
      type: 'Feature',
      id: a.anchorageId,
      geometry: { type: 'Polygon', coordinates: [unwrapLine([...a.polygon, a.polygon[0]!])] },
      properties: { id: a.anchorageId, name: a.name, crowded: a.crowded, count: a.vesselIds.length, highlight: a.anchorageId === highlightId },
    })),
  );
}

export function berthFeatures(list: BerthView[], highlightId: string | null) {
  return fc<Point>(
    list.map((b) => ({
      type: 'Feature',
      id: b.berthId,
      geometry: { type: 'Point', coordinates: [b.location.lon, b.location.lat] },
      properties: { id: b.berthId, name: b.name, status: b.status, icon: `berth-${b.status}`, highlight: b.berthId === highlightId },
    })),
  );
}

export function routeFeatures(lines: RouteLine[], focusIds: readonly string[]) {
  return fc<LineString>(
    lines
      .filter((r) => !r.isScenarioAlternative || focusIds.includes(r.routeId))
      .map((r) => ({
        type: 'Feature',
        id: r.routeId,
        geometry: { type: 'LineString', coordinates: unwrapLine(r.points) },
        properties: { id: r.routeId, name: r.corridorName, focus: focusIds.includes(r.routeId) },
      })),
  );
}

export function hazardFeatures(list: HazardShape[]) {
  return fc<Polygon>(
    list.map((h) => ({
      type: 'Feature',
      id: h.hazardId,
      geometry: { type: 'Polygon', coordinates: [unwrapLine([...h.polygon, h.polygon[0]!])] },
      properties: { id: h.hazardId, severity: h.severity, phase: h.phase, type: h.type },
    })),
  );
}

export function trackFeature(points: GeoPoint[]) {
  return fc<LineString>(points.length >= 2 ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: unwrapLine(points) }, properties: {} }] : []);
}

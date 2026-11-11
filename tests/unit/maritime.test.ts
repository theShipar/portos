import { describe, expect, it } from 'vitest';
import { getSnapshotAt } from '@/engines/snapshot';
import { allocateBands, BAND_CAPS, BAND_HYSTERESIS, BAND_THRESHOLDS_PX, bandFor, degreesPerPx, LOD_THRESHOLDS, markerPxForAltitude, nextBand, nextClusterCell, nextLod, nextStackCell, selectedBand, STACK_CELLS } from '@/map/earth/lod';
import { routeForEntity } from '@/router/navigation';
import {
  buildHazards,
  buildPortMarkers,
  buildRouteLines,
  buildVesselMarkers,
  clusterVessels,
  focusForSelection,
  portTone,
  TONE_RANK,
  trafficDensity,
  VESSEL_CLASSES,
  vesselClassOf,
} from '@/selectors/mapLayers';
import { haversineDistanceNm } from '@/core/geo';
import { catalog } from './fixtures';

const c = catalog();
const snap = getSnapshotAt(c, c.anchorMs);
const markers = buildVesselMarkers(c, snap);
const byId = new Map(markers.map((m) => [m.vesselId, m]));

describe('vessel markers', () => {
  it('places every vessel with a position and nothing at 0,0', () => {
    expect(markers.length).toBe(c.vessels.filter((v) => snap.vessels.get(v.vesselId)?.point).length);
    expect(markers.length).toBeGreaterThanOrEqual(480);
    expect(markers.some((m) => m.point.lat === 0 && m.point.lon === 0)).toBe(false);
  });

  it('marks Pacific Horizon as an open incident on RTE-SIN-RTM', () => {
    const m = byId.get('VSL-0001')!;
    expect(m.tone).toBe('incident');
    expect(m.incidentIds).toContain('INC-0001');
    expect(m.routeId).toBe('RTE-SIN-RTM');
    expect(m.exceptionCount).toBeGreaterThanOrEqual(2);
  });

  it('orders tones incident > atRisk > delayed > onPlan > ambient and never shows ambient traffic as managed', () => {
    expect([...Object.entries(TONE_RANK)].sort((a, b) => b[1] - a[1]).map(([t]) => t)).toEqual(['incident', 'atRisk', 'delayed', 'onPlan', 'ambient']);
    for (const m of markers) {
      if (m.fleet === 'ambient') expect(m.tone).not.toBe('onPlan');
      if (m.incidentIds.length) expect(m.tone).toBe('incident');
      if (m.tone === 'delayed') expect(m.etaShiftMinutes!).toBeGreaterThan(60);
    }
  });

  it('maps every dataset vessel type to a class', () => {
    expect(vesselClassOf('Container ship')).toBe('container');
    expect(vesselClassOf('LNG carrier')).toBe('lng');
    for (const v of c.vessels) expect(VESSEL_CLASSES).toContain(vesselClassOf(v.vesselType));
  });

  it('hides future incidents during replay', () => {
    const early = buildVesselMarkers(c, getSnapshotAt(c, Date.parse('2026-11-09T08:00:00Z')));
    expect(early.find((m) => m.vesselId === 'VSL-0001')!.incidentIds).toEqual([]);
  });
});

describe('selection focus', () => {
  it('selecting Pacific Horizon highlights only RTE-SIN-RTM and its endpoint ports', () => {
    const f = focusForSelection(c, snap, { kind: 'vessel', id: 'VSL-0001' });
    expect(f.routeIds).toEqual(['RTE-SIN-RTM']);
    expect(f.vesselIds).toEqual(['VSL-0001']);
    expect(f.portIds).toContain('PRT-SIN');
    expect(f.voyageId).toBe(c.byId.vessel.get('VSL-0001')!.currentVoyageId);
    expect(f.point).toEqual(snap.vessels.get('VSL-0001')!.point);
  });

  it('incident and voyage selections resolve to the same corridor', () => {
    const voyageId = c.byId.vessel.get('VSL-0001')!.currentVoyageId!;
    expect(focusForSelection(c, snap, { kind: 'incident', id: 'INC-0001' }).routeIds).toEqual(['RTE-SIN-RTM']);
    expect(focusForSelection(c, snap, { kind: 'voyage', id: voyageId }).routeIds).toEqual(['RTE-SIN-RTM']);
  });

  it('weather focus covers the hazard and its affected corridors; unknown IDs focus nothing', () => {
    const h = c.weatherHazards[0]!;
    const f = focusForSelection(c, snap, { kind: 'weather', id: h.hazardId });
    expect(f.hazardIds).toEqual([h.hazardId]);
    expect(f.routeIds).toEqual(h.affectedRouteIds);
    expect(Number.isFinite(f.point!.lat) && Number.isFinite(f.point!.lon)).toBe(true);
    expect(focusForSelection(c, snap, { kind: 'vessel', id: 'VSL-9999' }).routeIds).toEqual([]);
    expect(focusForSelection(c, snap, null).vesselIds).toEqual([]);
  });

  it('corridor and weather routes keep the scope context', () => {
    expect(routeForEntity({ kind: 'route', id: 'RTE-SIN-RTM' }, { level: 'region', regionId: 'REG-SEA' })).toMatchObject({ name: 'ops-region', params: { regionId: 'REG-SEA' }, query: { route: 'RTE-SIN-RTM' } });
    const h = c.weatherHazards[0]!.hazardId;
    expect(routeForEntity({ kind: 'weather', id: h }, { level: 'earth' })).toMatchObject({ name: 'ops-earth', query: { hazard: h } });
  });
});

describe('ports, corridors, hazards, density', () => {
  it('port wait tone thresholds; unknown wait is never healthy', () => {
    expect(portTone(null)).toBe('unknown');
    expect(portTone(0)).toBe('healthy');
    expect(portTone(6)).toBe('warning');
    expect(portTone(17.9)).toBe('warning');
    expect(portTone(18)).toBe('critical');
    const sin = buildPortMarkers(c, snap).find((p) => p.portId === 'PRT-SIN')!;
    expect(sin.openIncidents).toBeGreaterThanOrEqual(1);
  });

  it('corridors are densified into short steps and keep their endpoints', () => {
    for (const r of buildRouteLines(c, 120)) {
      const route = c.byId.route.get(r.routeId)!;
      expect(r.points[0]).toEqual(route.waypoints[0]);
      expect(r.points.at(-1)).toEqual(route.waypoints.at(-1));
      for (let i = 1; i < r.points.length; i++) expect(haversineDistanceNm(r.points[i - 1]!, r.points[i]!)).toBeLessThanOrEqual(120.5);
    }
  });

  it('draws only active and upcoming hazards with closed outlines', () => {
    const shapes = buildHazards(c, snap);
    expect(shapes.length).toBeGreaterThan(0);
    for (const h of shapes) {
      expect(['active', 'upcoming']).toContain(h.phase);
      expect(h.outline[0]).toEqual(h.outline.at(-1));
    }
  });

  it('traffic density accounts for every marker exactly once', () => {
    const cells = trafficDensity(markers, 2);
    expect(cells.reduce((n, d) => n + d.count, 0)).toBe(markers.length);
  });
});

describe('clustering', () => {
  it('never absorbs pinned vessels and keeps sparse cells individual', () => {
    const pinned = new Set(markers.filter((m) => m.tone === 'incident').map((m) => m.vesselId));
    const { clusters, clusteredIds } = clusterVessels(markers, 6, pinned);
    expect(clusters.length).toBeGreaterThan(0);
    for (const id of pinned) expect(clusteredIds.has(id)).toBe(false);
    for (const cl of clusters) {
      expect(cl.count).toBeGreaterThanOrEqual(4);
      expect(cl.memberIds.length).toBe(cl.count);
      expect(TONE_RANK[cl.worstTone]).toBe(Math.max(...cl.memberIds.map((id) => TONE_RANK[byId.get(id)!.tone])));
    }
    expect(clusteredIds.size).toBe(clusters.reduce((n, cl) => n + cl.count, 0));
  });

  it('is deterministic and keeps cluster centres inside their bounds', () => {
    const a = clusterVessels(markers, 3, new Set());
    const b = clusterVessels([...markers].reverse(), 3, new Set());
    expect(a.clusters.map((cl) => [cl.id, cl.count])).toEqual(b.clusters.map((cl) => [cl.id, cl.count]));
    for (const cl of a.clusters) {
      expect(cl.center.lat).toBeGreaterThanOrEqual(cl.bounds.south - 1e-9);
      expect(cl.center.lat).toBeLessThanOrEqual(cl.bounds.north + 1e-9);
    }
  });

  it('Singapore anchorage collapses into a stack at port scale but Pacific Horizon stays selectable', () => {
    const pinned = new Set(['VSL-0001']);
    const { clusters, clusteredIds } = clusterVessels(markers, 0.4, pinned, 6);
    expect(clusteredIds.has('VSL-0001')).toBe(false);
    const sin = clusters.find((cl) => Math.abs(cl.center.lat - 1.25) < 0.4 && Math.abs(cl.center.lon - 103.9) < 0.5);
    expect(sin?.count).toBeGreaterThanOrEqual(20);
  });
});

describe('LOD and cluster hysteresis', () => {
  it('marker size shrinks with altitude and stays clamped', () => {
    expect(markerPxForAltitude(6)).toBeLessThan(markerPxForAltitude(2));
    expect(markerPxForAltitude(1000)).toBe(7);
    expect(markerPxForAltitude(0.001)).toBe(44);
  });

  it('LOD steps up and down at different thresholds', () => {
    expect(nextLod(0, LOD_THRESHOLDS.up[0]! + 0.1)).toBe(1);
    expect(nextLod(1, LOD_THRESHOLDS.up[0]! - 0.5)).toBe(1);
    expect(nextLod(1, LOD_THRESHOLDS.down[0]! - 0.1)).toBe(0);
    expect(nextLod(0, 40)).toBe(2);
    expect(nextLod(2, LOD_THRESHOLDS.down[1]! + 0.5)).toBe(2);
    expect(nextLod(2, 5)).toBe(0);
  });

  it('V3 bands follow the projected-length table: <4 dot, 4–16 icon, 16–55 low-poly, 55–160 detailed, >160 inspection', () => {
    expect(BAND_THRESHOLDS_PX).toEqual([4, 16, 55, 160]);
    expect([2, 3.9, 4, 15.9, 16, 54, 55, 159, 160, 400].map(bandFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(BAND_HYSTERESIS).toBeGreaterThanOrEqual(0.1);
    expect(BAND_HYSTERESIS).toBeLessThanOrEqual(0.2);
  });

  it('V3 bands hold inside the hysteresis gap and step several bands on a big zoom', () => {
    // Entering detailed needs > 55 × 1.15; leaving needs < 55 × 0.85.
    expect(nextBand(2, 60)).toBe(2);
    expect(nextBand(2, 64)).toBe(3);
    expect(nextBand(3, 50)).toBe(3);
    expect(nextBand(3, 46)).toBe(2);
    // A ship oscillating ±8 % around a threshold never flickers.
    let b = nextBand(undefined, 16);
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) seen.add((b = nextBand(b, 16 * (i % 2 ? 1.08 : 0.92))));
    expect(seen.size).toBe(1);
    expect(nextBand(0, 500)).toBe(4);
    expect(nextBand(4, 1)).toBe(0);
    expect(nextBand(undefined, 30)).toBe(2);
  });

  it('V3 selection sits one band up (at least low-poly); close-model caps keep the selection and the largest', () => {
    expect([0, 1, 2, 3, 4].map((b) => selectedBand(b as 0))).toEqual([2, 2, 3, 4, 4]);
    const cands = Array.from({ length: 30 }, (_, i) => ({ id: `V${String(i).padStart(2, '0')}`, band: 4 as const, px: 200 + i, pinned: false }));
    cands.push({ id: 'SEL', band: 4, px: 161, pinned: true });
    const out = allocateBands(cands);
    expect(out.get('SEL')).toBe(4);
    const inspect = [...out].filter(([, b]) => b === 4).map(([id]) => id);
    expect(inspect.length).toBe(BAND_CAPS.inspection);
    expect(inspect).toContain('V29');
    expect([...out.values()].filter((b) => b === 3).length).toBe(BAND_CAPS.detailed);
    expect([...out.values()].filter((b) => b === 2).length).toBe(31 - BAND_CAPS.inspection - BAND_CAPS.detailed);
    expect(allocateBands([{ id: 'A', band: 1, px: 10, pinned: false }]).get('A')).toBe(1);
  });

  it('Earth cluster bands hold inside their hysteresis gap', () => {
    expect(nextClusterCell(0, 6.0)).toBe(3);
    expect(nextClusterCell(0, 6.3)).toBe(6);
    expect(nextClusterCell(6, 6.0)).toBe(6);
    expect(nextClusterCell(6, 5.7)).toBe(3);
    expect(nextClusterCell(3, 4.4)).toBe(3);
    expect(nextClusterCell(3, 4.2)).toBe(0);
    expect(nextClusterCell(0, 4.5)).toBe(0);
  });

  it('stack cells snap to powers of two and hold across small zoom changes', () => {
    expect(nextStackCell(0, 0.3)).toBe(0.4);
    expect(nextStackCell(0.4, 0.45)).toBe(0.4);
    expect(nextStackCell(0.4, 0.17)).toBe(0.4);
    expect(nextStackCell(0.4, 0.15)).toBe(0.2);
    expect(nextStackCell(0.4, 0.5)).toBe(0.8);
    expect(nextStackCell(0, 99)).toBe(STACK_CELLS[0]);
    expect(nextStackCell(0, 0)).toBe(STACK_CELLS.at(-1));
  });

  it('ground degrees per pixel grow with altitude', () => {
    const k = 8.7e-4;
    expect(degreesPerPx(3.95, 2, k)).toBeGreaterThan(degreesPerPx(2.7, 2, k));
    expect(degreesPerPx(2, 2, k)).toBeGreaterThan(0);
  });
});

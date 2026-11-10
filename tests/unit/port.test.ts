import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@/core/geo';
import { defaultViewMode, supportsViewMode, type Scope } from '@/core/scope';
import { getSnapshotAt } from '@/engines/snapshot';
import { EARTH_RADIUS } from '@/map/earth/camera';
import { degreesPerPx } from '@/map/earth/lod';
import { basemapConfig, OPENFREEMAP_ATTRIBUTION, portosBasemapStyle } from '@/map/port2d/basemapStyle';
import { anchorageFeatures, berthFeatures, unwrapLine, vesselFeatures } from '@/map/port2d/features';
import { clampZoom, degPerPxForZoom, distanceForDegPerPx, ZOOM_RANGE, zoomForDegPerPx } from '@/map/viewport';
import { decodeScope, routeForScopeKeepingSelection, viewModeQuery } from '@/router/navigation';
import { buildVesselMarkers } from '@/selectors/mapLayers';
import { buildPortViewModel, filterQueue } from '@/selectors/port';
import { catalog } from './fixtures';

const c = catalog();
const snap = getSnapshotAt(c, c.anchorMs);
const markers = buildVesselMarkers(c, snap);
const vm = buildPortViewModel(c, snap, 'PRT-SIN', markers)!;

const EARTH: Scope = { level: 'earth' };
const SEA: Scope = { level: 'region', regionId: 'REG-SEA' };
const SIN: Scope = { level: 'port', regionId: 'REG-SEA', portId: 'PRT-SIN' };

describe('port view model (Singapore at the anchor time)', () => {
  it('reconciles KPIs with the queue rows', () => {
    expect(vm.kpis.awaitingBerth).toBe(vm.queue.length);
    expect(vm.kpis.atAnchor).toBe(vm.queue.filter((q) => q.status === 'at_anchor').length);
    expect(vm.kpis.waitSampleSize).toBe(vm.queue.filter((q) => q.elapsedWaitHours !== null).length);
    expect(filterQueue(vm.queue, 'at_anchor').length + filterQueue(vm.queue, 'awaiting_berth').length).toBe(vm.queue.length);
  });

  it('takes the median over known waits only; unknown starts are not zero', () => {
    const known = vm.queue
      .map((q) => q.elapsedWaitHours)
      .filter((w): w is number => w !== null)
      .sort((a, b) => a - b);
    expect(known.length).toBeLessThan(vm.queue.length);
    const mid = known.length / 2;
    const median = known.length % 2 ? known[Math.floor(mid)]! : (known[mid - 1]! + known[mid]!) / 2;
    expect(vm.kpis.medianKnownWaitHours).toBeCloseTo(median, 6);
    expect(vm.queue.filter((q) => q.elapsedWaitHours === null).every((q) => q.queueEvidence === 'waiting start unknown')).toBe(true);
  });

  it('sorts by elapsed wait with unknown starts last and never claims a rank', () => {
    const waits = vm.queue.map((q) => q.elapsedWaitHours ?? -1);
    expect(waits).toEqual([...waits].sort((a, b) => b - a));
    expect(vm.queue.some((q) => 'rank' in q)).toBe(false);
  });

  it('marks a berth confirmed only with both a berth and a berth time', () => {
    for (const q of vm.queue) expect(q.berthConfirmed).toBe(q.berthId !== null && q.estimatedBerthUtc !== null);
    const horizon = vm.queue.find((q) => q.vesselId === 'VSL-0001')!;
    expect(horizon.berthConfirmed).toBe(false);
    expect(horizon.berthId).toBeNull();
    expect(horizon.estimatedBerthUtc).not.toBeNull();
    expect(horizon.status).toBe('at_anchor');
  });

  it('keeps unknown and unavailable berths out of the free count', () => {
    const e3 = vm.berths.find((b) => b.name === 'East Berth 3')!;
    expect(e3.status).toBe('unknown');
    const east = vm.terminals.find((t) => t.terminalId === 'TRM-SIN-E')!;
    expect(east.unknown).toBe(1);
    expect(vm.berths.filter((b) => b.status === 'free').some((b) => b.berthId === e3.berthId)).toBe(false);
    expect(vm.terminals.reduce((s, t) => s + t.berths.length, 0)).toBe(vm.berths.length);
    expect(vm.berthFeed).toBe('available');
  });

  it('never links Pacific Horizon to a berth while its slot is only an estimate', () => {
    expect(vm.berths.some((b) => b.scheduledVesselId === 'VSL-0001')).toBe(false);
    expect(vm.berths.some((b) => b.linkedCalls.some((l) => l.vesselId === 'VSL-0001'))).toBe(false);
  });

  it('summarises the demo anchorage from positions inside its polygon', () => {
    const a = vm.anchorages[0]!;
    expect(a.anchorageId).toBe('ANC-SIN');
    expect(a.vesselIds.length).toBe(markers.filter((m) => pointInPolygon(m.point, a.polygon)).length);
    expect(a.occupancy).toBeCloseTo(a.vesselIds.length / a.capacityEstimate!, 9);
    expect(a.crowded).toBe(a.occupancy! >= 0.8);
    expect(a.queueCount + a.unknownWaitCount).toBeGreaterThanOrEqual(a.unknownWaitCount);
    if (a.queueCount - a.unknownWaitCount < 5) expect(a.p90WaitHours).toBeNull();
    else expect(a.p90WaitHours!).toBeGreaterThanOrEqual(a.medianWaitHours!);
  });

  it('frames the port features (terminals, berths, anchorage) in its bounds', () => {
    const { west, east, south, north } = vm.bounds;
    for (const p of [...vm.terminals.map((t) => t.location), ...vm.anchorages.flatMap((a) => a.polygon)]) {
      expect(p.lon).toBeGreaterThanOrEqual(west);
      expect(p.lon).toBeLessThanOrEqual(east);
      expect(p.lat).toBeGreaterThanOrEqual(south);
      expect(p.lat).toBeLessThanOrEqual(north);
    }
  });

  it('returns null for an unknown port', () => {
    expect(buildPortViewModel(c, snap, 'PRT-NOPE', markers)).toBeNull();
  });
});

describe('3D ↔ 2D viewport hand-off', () => {
  it('round-trips zoom and degrees per pixel', () => {
    for (const z of [3, 9.5, 12.25, 16]) expect(zoomForDegPerPx(degPerPxForZoom(z, 1.27), 1.27)).toBeCloseTo(z, 9);
  });

  it('inverts the globe scale so the same ground resolution survives a switch', () => {
    const pxToWorld = (2 * Math.tan((45 * Math.PI) / 360)) / 900;
    for (const d of [2.05, 2.6, 4]) {
      const dpp = degreesPerPx(d, EARTH_RADIUS, pxToWorld);
      expect(distanceForDegPerPx(dpp, EARTH_RADIUS, pxToWorld)).toBeCloseTo(d, 9);
    }
  });

  it('clamps 2D zoom into the scope range', () => {
    expect(clampZoom(SIN, 4)).toBe(ZOOM_RANGE.port[0]);
    expect(clampZoom(SIN, 22)).toBe(ZOOM_RANGE.port[1]);
    expect(clampZoom(SEA, 7)).toBe(7);
  });
});

describe('view mode routing', () => {
  it('defaults port to 2D, region to 3D, and offers no 2D at Earth', () => {
    expect(defaultViewMode(SIN)).toBe('2d');
    expect(defaultViewMode(SEA)).toBe('3d');
    expect(defaultViewMode(EARTH)).toBe('3d');
    expect(supportsViewMode(EARTH, '2d')).toBe(false);
    expect(supportsViewMode(SEA, '2d')).toBe(true);
  });

  it('writes `view` only when it differs from the scope default', () => {
    expect(viewModeQuery(SIN, '2d')).toBeNull();
    expect(viewModeQuery(SIN, '3d')).toBe('3d');
    expect(viewModeQuery(SEA, '2d')).toBe('2d');
    expect(viewModeQuery(EARTH, '2d')).toBeNull();
  });

  it('keeps the selection when the scope changes, with an explicit Earth scope', () => {
    const sel = { kind: 'vessel' as const, id: 'VSL-0001' };
    expect(routeForScopeKeepingSelection(sel, SEA)).toMatchObject({ name: 'ops-region', params: { regionId: 'REG-SEA' }, query: { vessel: 'VSL-0001' } });
    expect(routeForScopeKeepingSelection(sel, EARTH)).toMatchObject({ name: 'ops-earth', query: { vessel: 'VSL-0001' } });
    expect(routeForScopeKeepingSelection(null, SEA)).toEqual({ name: 'ops-region', params: { regionId: 'REG-SEA' }, query: {} });
    expect(decodeScope(c, 'earth')).toEqual({ level: 'earth' });
  });
});

describe('2D map features', () => {
  it('unwraps antimeridian crossings into a continuous line', () => {
    const line = unwrapLine([
      { lon: 170, lat: 0 },
      { lon: -175, lat: 1 },
      { lon: -160, lat: 2 },
    ]);
    expect(line.map((p) => p[0])).toEqual([170, 185, 200]);
  });

  it('keeps pinned vessels out of the clustered source even when their layer is off', () => {
    const pinned = new Set(['VSL-0001']);
    const { clustered, pinned: pin } = vesselFeatures(markers, () => false, pinned);
    expect(clustered.features).toHaveLength(0);
    expect(pin.features.map((f) => f.properties.id)).toEqual(['VSL-0001']);
    const all = vesselFeatures(markers, () => true, pinned);
    expect(all.clustered.features.length + all.pinned.features.length).toBe(markers.length);
    expect(all.pinned.features[0]!.properties.rank).toBeGreaterThanOrEqual(10);
  });

  it('uses heading-free glyphs for anchored vessels and stale glyphs for stale reports', () => {
    const { clustered } = vesselFeatures(markers, () => true, new Set());
    for (const f of clustered.features) {
      const m = markers.find((x) => x.vesselId === f.properties.id)!;
      if (m.stale) expect(f.properties.icon.endsWith('-stale')).toBe(true);
      if (m.navStatus === 'at_anchor') expect(f.properties.icon.startsWith('vessel-moored')).toBe(true);
    }
  });

  it('closes anchorage rings and flags highlights', () => {
    const fc = anchorageFeatures(vm.anchorages, 'ANC-SIN');
    const ring = fc.features[0]!.geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(fc.features[0]!.properties!.highlight).toBe(true);
    const berths = berthFeatures(vm.berths, 'BRH-SIN-W-1');
    expect(berths.features.find((f) => f.properties!.highlight)!.id).toBe('BRH-SIN-W-1');
    expect(berths.features.every((f) => f.properties!.icon === `berth-${f.properties!.status}`)).toBe(true);
  });
});

describe('basemap configuration', () => {
  it('defaults to OpenFreeMap with attribution', () => {
    const cfg = basemapConfig({ tilesUrl: 'https://tiles.openfreemap.org/planet' });
    expect(cfg.kind).toBe('portos');
    expect(cfg.attribution).toBe(OPENFREEMAP_ATTRIBUTION);
    const style = portosBasemapStyle(cfg);
    expect(Object.keys(style.sources)).toEqual(['basemap']);
    expect(style.layers.some((l) => l.id === 'bm-water')).toBe(true);
  });

  it('honours a custom style and an explicit "none"', () => {
    expect(basemapConfig({ styleUrl: 'https://example.test/style.json' }).kind).toBe('custom');
    const none = basemapConfig({ tilesUrl: 'none' });
    expect(none.kind).toBe('none');
    const style = portosBasemapStyle(none);
    expect(style.sources).toEqual({});
    expect(style.layers).toHaveLength(1);
    expect('glyphs' in style).toBe(false);
  });
});

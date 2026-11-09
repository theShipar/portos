import { describe, expect, it } from 'vitest';
import { parseUtc } from '@/core/time';
import { computePortCongestion } from '@/engines/congestion';
import { computeEta } from '@/engines/eta';
import { computeExposure } from '@/engines/exposure';
import { cohortSets, dedupedExposureUsd, selectKpis } from '@/engines/kpis';
import { buildSearchIndex, search } from '@/engines/search';
import { getSnapshotAt, voyageEvents } from '@/engines/snapshot';
import { getVesselAtTime, vesselAtTime } from '@/engines/tracks';
import { computeRouteHazards } from '@/engines/weatherRisk';
import { catalog } from './fixtures';

const c = catalog();
const NOW = c.anchorMs;

describe('fixture contract', () => {
  it('has the required volumes and scenario IDs', () => {
    expect(c.vessels).toHaveLength(500);
    expect(c.ports).toHaveLength(100);
    expect(c.voyages).toHaveLength(200);
    expect(c.incidents.length).toBeGreaterThanOrEqual(50);
    for (const [kind, id] of [
      ['vessel', 'VSL-0001'],
      ['voyage', 'VYG-0001'],
      ['incident', 'INC-0001'],
      ['port', 'PRT-SIN'],
    ] as const) {
      expect(c.byId[kind].has(id)).toBe(true);
    }
    expect(c.manifest.fixedScenarioTimeUtc).toBe('2026-11-09T12:00:00Z');
  });
});

describe('tracks', () => {
  it('never extrapolates and marks stale positions', () => {
    const track = [
      { t: 0, lon: 0, lat: 0, sogKn: 10, cogDeg: 90, navStatus: 'underway' as const, positionId: 'a' },
      { t: 30 * 60_000, lon: 1, lat: 0, sogKn: 10, cogDeg: 90, navStatus: 'underway' as const, positionId: 'b' },
    ];
    expect(vesselAtTime(track, 'X', -1).state).toBe('unavailable');
    const mid = vesselAtTime(track, 'X', 15 * 60_000);
    expect(mid.state).toBe('interpolated');
    expect(mid.point!.lon).toBeCloseTo(0.5, 6);
    const after = vesselAtTime(track, 'X', 30 * 60_000 + 31 * 60_000);
    expect(after.state).toBe('stale');
    expect(after.point!.lon).toBe(1);
  });

  it('places Pacific Horizon underway before 09:15 and at anchor after', () => {
    expect(getVesselAtTime(c, 'VSL-0001', parseUtc('2026-11-09T06:00:00Z')!).navStatus).toBe('underway');
    const now = getVesselAtTime(c, 'VSL-0001', NOW);
    expect(now.navStatus).toBe('at_anchor');
    expect(now.state).toBe('exact');
  });
});

describe('ETA and exposure — Singapore scenario', () => {
  const voyage = c.byId.voyage.get('VYG-0001')!;
  it('shows +18 h forecast shift at the anchor time', () => {
    const eta = computeEta(voyage, getVesselAtTime(c, 'VSL-0001', NOW), voyageEvents(c, 'VYG-0001'), NOW);
    expect(eta.etaShiftMinutes).toBe(18 * 60);
    expect(eta.status).toBe('ok');
    expect(eta.drivers[0].label).toBe('Port waiting forecast');
  });

  it('shows the pre-revision +8 h estimate before 09:00 UTC', () => {
    const t = parseUtc('2026-11-09T08:30:00Z')!;
    const eta = computeEta(voyage, getVesselAtTime(c, 'VSL-0001', t), voyageEvents(c, 'VYG-0001'), t);
    expect(eta.etaShiftMinutes).toBe(8 * 60);
    expect(eta.sourceType).toBe('pre-revision-baseline');
  });

  it('computes $24,000 from 18 h at $32,000/day', () => {
    const ex = computeExposure({ voyageId: 'VYG-0001', incrementalHours: 18, dailyDelayCostUsd: 32000, asOfUtc: null, confidence: 'medium' });
    expect(ex.estimatedUsd).toBe(24000);
    expect(ex.formulaText).toBe('18 h ÷ 24 × $32,000/day = $24,000');
  });

  it('never creates negative exposure for early arrivals and reports missing inputs', () => {
    expect(computeExposure({ voyageId: 'X', incrementalHours: -3, dailyDelayCostUsd: 10000, asOfUtc: null, confidence: 'high' }).estimatedUsd).toBe(0);
    expect(computeExposure({ voyageId: 'X', incrementalHours: 5, dailyDelayCostUsd: null, asOfUtc: null, confidence: 'high' }).estimatedUsd).toBeNull();
  });

  it('handles month boundaries in UTC', () => {
    const v = { ...voyage, plannedArrivalUtc: '2026-11-30T20:00:00Z' };
    const ev = [{ ...voyageEvents(c, 'VYG-0001').find((e) => e.type === 'ETA_REVISED')!, payload: { voyageId: 'VYG-0001', newEstimatedArrivalUtc: '2026-12-01T14:00:00Z' } }];
    expect(computeEta(v, null, ev, NOW).etaShiftMinutes).toBe(18 * 60);
  });
});

describe('snapshot', () => {
  it('is deterministic for the same timestamp', () => {
    const t = parseUtc('2026-11-09T07:12:00Z')!;
    const a = getSnapshotAt(c, t);
    const b = getSnapshotAt(c, t);
    expect(a.vessels.get('VSL-0001')).toEqual(b.vessels.get('VSL-0001'));
    expect(a.etas.get('VYG-0001')).toEqual(b.etas.get('VYG-0001'));
    expect([...a.incidents.values()]).toEqual([...b.incidents.values()]);
  });

  it('hides incidents before they were opened and applies local overlay only at Now', () => {
    const before = getSnapshotAt(c, parseUtc('2026-11-09T10:00:00Z')!, { incidents: { 'INC-0001': { status: 'investigating', ownerUserId: 'USR-005' } } });
    expect(before.incidents.get('INC-0001')!.visible).toBe(false);
    expect(before.incidents.get('INC-0001')!.locallyModified).toBe(false);
    const now = getSnapshotAt(c, NOW, { incidents: { 'INC-0001': { status: 'investigating', ownerUserId: 'USR-005' } } });
    expect(now.incidents.get('INC-0001')!.status).toBe('investigating');
  });
});

describe('KPIs', () => {
  const snap = getSnapshotAt(c, NOW);
  it('deduplicates exposure per voyage (INC-0001 and INC-0050 share VYG-0001)', () => {
    const sets = cohortSets(c, snap);
    const ex = dedupedExposureUsd(c, snap, sets);
    expect(ex.voyageIds.filter((v) => v === 'VYG-0001')).toHaveLength(1);
    const naive = c.incidents
      .filter((i) => snap.incidents.get(i.incidentId)!.status !== 'resolved')
      .reduce((s, i) => s + (snap.exposures.get(i.voyageId)!.estimatedUsd ?? 0), 0);
    expect(ex.usd).toBeLessThan(naive);
  });

  it('returns typed KPI objects derived from one snapshot', () => {
    const kpis = selectKpis(c, snap);
    const tracked = kpis.find((k) => k.key === 'trackedVessels')!;
    expect(tracked.value).toBeGreaterThan(300);
    expect(tracked.denominator).toBe(500);
    expect(kpis.find((k) => k.key === 'exposureUsd')!.value).toBeGreaterThanOrEqual(24000);
  });
});

describe('port congestion', () => {
  it('reconciles Singapore queue counts with the queue list', () => {
    const r = computePortCongestion(c, 'PRT-SIN', NOW);
    expect(r.awaitingBerthCount).toBe(r.queue.length);
    expect(r.queue.some((q) => q.vesselId === 'VSL-0001')).toBe(true);
    expect(r.arrivalsNext24h).toBe(12);
    expect(r.waitSampleSize).toBeLessThan(r.queue.length);
    expect(r.berths.find((b) => b.status === 'unknown')).toBeTruthy();
    expect(r.berthUtilization).not.toBeNull();
  });

  it('excludes Pacific Horizon from the queue before it anchored', () => {
    const r = computePortCongestion(c, 'PRT-SIN', parseUtc('2026-11-09T08:00:00Z')!);
    expect(r.queue.some((q) => q.vesselId === 'VSL-0001')).toBe(false);
  });
});

describe('weather route risk', () => {
  it('reproduces the fixture affected-voyage list for WX-0001 from geometry and time', () => {
    const wx = c.byId.weather.get('WX-0001')!;
    const snap = getSnapshotAt(c, NOW);
    const computed = c.voyages
      .filter((v) => v.departedAtUtc && wx.affectedRouteIds.includes(v.routeId))
      .filter((v) => computeRouteHazards(v, c.byId.route.get(v.routeId)!, c.byId.vessel.get(v.vesselId)!, snap.vessels.get(v.vesselId)!, [wx], NOW).hazardIds.includes('WX-0001'))
      .map((v) => v.voyageId);
    const expected = new Set(wx.affectedVoyageIds);
    const overlap = computed.filter((v) => expected.has(v)).length;
    expect(overlap / Math.max(1, expected.size)).toBeGreaterThan(0.85);
    expect(computed.length).toBeLessThanOrEqual(expected.size + 2);
  });

  it('flags WX-0001 on the Pacific Horizon corridor but outside its traversal window', () => {
    const v = c.byId.voyage.get('VYG-0001')!;
    const r = computeRouteHazards(v, c.byId.route.get(v.routeId)!, c.byId.vessel.get(v.vesselId)!, getVesselAtTime(c, 'VSL-0001', NOW), c.weatherHazards, NOW);
    expect(r.nearbyHazardIds).toContain('WX-0001');
    expect(r.limitations.join(' ')).toMatch(/Not yet departed/);
  });
});

describe('search', () => {
  const index = buildSearchIndex(c);
  it('resolves VSL-0001 and distinguishes the port and the strait for "Singapore"', () => {
    expect(search(index, 'VSL-0001')[0].id).toBe('VSL-0001');
    expect(search(index, 'pacific horizon')[0].id).toBe('VSL-0001');
    const s = search(index, 'Singapore');
    expect(s.find((r) => r.kind === 'port')?.id).toBe('PRT-SIN');
    expect(s.find((r) => r.kind === 'place')?.title).toBe('Singapore Strait');
    expect(s.length).toBeLessThanOrEqual(10);
  });

  it('is diacritic and punctuation insensitive', () => {
    expect(search(index, 'INC 0001')[0].id).toBe('INC-0001');
    expect(search(index, 'Ságna Nothing Zzz')).toHaveLength(0);
  });
});

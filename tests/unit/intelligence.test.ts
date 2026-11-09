import { describe, expect, it } from 'vitest';
import { parseUtc } from '@/core/time';
import type { Catalog } from '@/data/catalog';
import { cohortSets, dedupedExposureUsd, selectKpis, type Kpi, type KpiKey } from '@/engines/kpis';
import { freshnessOf, SOURCE_CLASS_LABEL } from '@/engines/provenance';
import { getSnapshotAt, type Snapshot, type WorkflowOverlay } from '@/engines/snapshot';
import { computeRouteHazards } from '@/engines/weatherRisk';
import { selectVoyageImpact } from '@/selectors/impact';
import { buildDrillRows, drillVesselIds } from '@/selectors/kpiDrill';
import { buildHazards } from '@/selectors/mapLayers';
import { buildPortViewModel } from '@/selectors/port';
import { buildVesselInspector } from '@/selectors/vessel';
import { validateDailyRate } from '@/stores/assumptions';
import { catalog } from './fixtures';

const c = catalog();
const NOW = c.anchorMs;
const kpi = (list: Kpi[], key: KpiKey) => list.find((k) => k.key === key)!;
const override = (usdPerDay: number): WorkflowOverlay => ({ dailyRates: { 'VYG-0001': { usdPerDay, setByUserId: 'USR-005', setAtUtc: '2026-11-09T12:00:00Z' } } });

/** Every surface that shows VYG-0001 exposure, read back as text or number. */
function surfaces(snap: Snapshot) {
  const inc = c.byId.incident.get('INC-0001')!;
  const kpis = selectKpis(c, snap);
  const ex = kpi(kpis, 'exposureUsd');
  const others = dedupedExposureUsd(c, snap, cohortSets(c, snap)).voyageIds.filter((v) => v !== 'VYG-0001');
  const othersUsd = others.reduce((s, v) => s + (snap.exposures.get(v)?.estimatedUsd ?? 0), 0);
  const regional = selectKpis(c, snap, { regionId: 'REG-SEA' });
  const drill = buildDrillRows(c, snap, ex, 500).rows.find((r) => r.ref.id === 'VYG-0001');
  return {
    engine: snap.exposures.get('VYG-0001')!.estimatedUsd,
    vesselInspector: buildVesselInspector(c, snap, 'VSL-0001')!.exposureText,
    voyageSummary: selectVoyageImpact(snap, 'VYG-0001').exposureText,
    incidentSummary: selectVoyageImpact(snap, inc.voyageId).exposureText,
    kpiContribution: (ex.value ?? 0) - othersUsd,
    regionalKpiMember: kpi(regional, 'exposureUsd').members.some((m) => m.id === 'VYG-0001'),
    kpiDrillRow: drill?.value,
  };
}

describe('Phase 5 gate — +18 h gives $24,000 everywhere', () => {
  const snap = getSnapshotAt(c, NOW);

  it('reads $24,000 on the engine, every inspector, the KPI and the KPI drill', () => {
    const s = surfaces(snap);
    expect(snap.etas.get('VYG-0001')!.etaShiftMinutes).toBe(18 * 60);
    expect(s).toEqual({
      engine: 24000,
      vesselInspector: '$24,000',
      voyageSummary: '$24,000',
      incidentSummary: '$24,000',
      kpiContribution: 24000,
      regionalKpiMember: true,
      kpiDrillRow: '$24,000',
    });
    expect(c.byId.incident.get('INC-0001')!.voyageId).toBe('VYG-0001');
  });

  it('shows the same formula wherever the exposure is explained', () => {
    const impact = selectVoyageImpact(snap, 'VYG-0001');
    expect(impact.exposure!.formulaText).toBe('18 h ÷ 24 × $32,000/day = $24,000');
    expect(impact.exposure!.provenance.formula).toBe(impact.exposure!.formulaText);
    expect(impact.rateText).toBe('$32,000/day');
    expect(impact.shiftText).toBe('+18.0 h');
  });

  it('propagates a user-scenario rate to every surface and labels it', () => {
    const o = getSnapshotAt(c, NOW, override(40000));
    const s = surfaces(o);
    expect(s).toMatchObject({ engine: 30000, vesselInspector: '$30,000', voyageSummary: '$30,000', incidentSummary: '$30,000', kpiContribution: 30000, kpiDrillRow: '$30,000' });
    const ex = o.exposures.get('VYG-0001')!;
    expect(ex.formulaText).toBe('18 h ÷ 24 × $40,000/day = $30,000');
    expect(ex.provenance.sourceClass).toBe('user-scenario');
    expect(ex.provenance.evidence).toBe('scenario');
    expect(ex.provenance.sources.find((x) => x.kind === 'assumption')?.label).toMatch(/set by USR-005 \(fixture \$32,000\)/);
    const k = kpi(selectKpis(c, o), 'exposureUsd');
    expect(k.provenance.sourceClass).toBe('user-scenario');
    expect(k.provenance.warnings.join(' ')).toMatch(/VYG-0001/);
    expect((k.value ?? 0) - (kpi(selectKpis(c, snap), 'exposureUsd').value ?? 0)).toBe(6000);
    expect(selectVoyageImpact(o, 'VYG-0001').rateIsUserScenario).toBe(true);
    expect(snap.exposures.get('VYG-0001')!.provenance.sourceClass).toBe('derived-model');
  });

  it('applies the scenario rate in replay too, with the shift in force then', () => {
    const t = parseUtc('2026-11-09T08:30:00Z')!;
    expect(getSnapshotAt(c, t).exposures.get('VYG-0001')!.estimatedUsd).toBe(10667);
    expect(getSnapshotAt(c, t, override(40000)).exposures.get('VYG-0001')!.estimatedUsd).toBe(13333);
  });

  it('shows "Financial exposure unavailable" when the rate is missing and excludes it from the KPI', () => {
    const c2: Catalog = { ...c, voyages: c.voyages.map((v) => (v.voyageId === 'VYG-0001' ? { ...v, dailyDelayCostUsd: null } : v)) };
    const s2 = getSnapshotAt(c2, NOW);
    const impact = selectVoyageImpact(s2, 'VYG-0001');
    expect(impact.exposureText).toBe('Unavailable');
    expect(impact.exposure!.formulaText).toBe('Financial exposure unavailable');
    expect(impact.rateText).toBe('No rate');
    const k = kpi(selectKpis(c2, s2), 'exposureUsd');
    expect(k.provenance.warnings.join(' ')).toMatch(/no exposure/);
    expect(k.value).toBe((kpi(selectKpis(c, snap), 'exposureUsd').value ?? 0) - 24000);
  });
});

describe('provenance on every metric', () => {
  const snap = getSnapshotAt(c, NOW);
  const labels = Object.keys(SOURCE_CLASS_LABEL);

  it('attaches a source class, evidence kind and freshness to every ETA, exposure, risk and KPI', () => {
    const all = [
      ...[...snap.etas.values()].map((e) => e.provenance),
      ...[...snap.exposures.values()].map((e) => e.provenance),
      ...[...snap.risks.values()].map((r) => r.provenance),
      ...selectKpis(c, snap).map((k) => k.provenance),
    ];
    expect(all.length).toBeGreaterThan(400);
    for (const p of all) {
      expect(labels).toContain(p.sourceClass);
      expect(['observed', 'estimated', 'scenario', 'unknown']).toContain(p.evidence);
      expect(['fresh', 'aging', 'stale', 'unknown']).toContain(p.freshness);
      expect(p.method.length).toBeGreaterThan(10);
    }
  });

  it('traces the Pacific Horizon ETA to its recorded revision event', () => {
    const p = snap.etas.get('VYG-0001')!.provenance;
    expect(p.sourceClass).toBe('simulated-fixture');
    expect(p.sources.some((s) => s.kind === 'event' && s.label.startsWith('ETA_REVISED'))).toBe(true);
    expect(p.formula).toMatch(/\+18\.0 h$/);
    expect(p.asOfUtc).not.toBeNull();
    expect(p.freshness).toBe('fresh');
  });

  it('classifies age against per-feed limits', () => {
    expect(freshnessOf('position', NOW - 10 * 60_000, NOW).freshness).toBe('fresh');
    expect(freshnessOf('position', NOW - 20 * 60_000, NOW).freshness).toBe('aging');
    expect(freshnessOf('position', NOW - 31 * 60_000, NOW)).toEqual({ ageMinutes: 31, freshness: 'stale' });
    expect(freshnessOf('eta', null, NOW).freshness).toBe('unknown');
  });

  it('marks interpolated positions as estimated and reports congestion inputs', () => {
    const t = parseUtc('2026-11-09T07:12:00Z')!;
    const m = buildVesselInspector(c, getSnapshotAt(c, t), 'VSL-0001')!;
    const pos = m.position.find((f) => f.label === 'Position')!.provenance!;
    expect(pos.evidence).toBe(m.positionState === 'interpolated' ? 'estimated' : 'observed');
    const vm = buildPortViewModel(c, snap, 'PRT-SIN', [])!;
    expect(vm.congestion.provenance.formula).toMatch(/wait 0\.45, arrivals 0\.25, utilization 0\.3/);
    expect(vm.kpis.waitProvenance.formula).toBe(`median of ${vm.kpis.waitSampleSize} known waits (coverage ${vm.kpis.waitSampleSize}/${vm.kpis.awaitingBerth})`);
  });
});

describe('route risk drives at-risk counts, hazard overlays and inspectors consistently', () => {
  const snap = getSnapshotAt(c, NOW);

  it('counts at-risk voyages as incidents ∪ computed hazard intersections', () => {
    const k = kpi(selectKpis(c, snap), 'atRiskVoyages');
    const crossing = [...snap.risks.values()].filter((r) => r.hazardIds.length).map((r) => r.voyageId);
    expect(crossing.length).toBeGreaterThan(0);
    for (const v of crossing) expect(k.members.some((m) => m.id === v)).toBe(true);
    expect(k.value).toBe(k.members.length);
  });

  it('labels hazard overlays with the same computed voyage count as the inspector', () => {
    for (const h of buildHazards(c, snap)) {
      const n = [...snap.risks.values()].filter((r) => r.hazardIds.includes(h.hazardId)).length;
      expect(h.affectedVoyageCount).toBe(n);
    }
  });

  it('never reports a clear route without a weather feed', () => {
    const v = c.byId.voyage.get('VYG-0002') ?? c.voyages[1];
    const r = computeRouteHazards(v, c.byId.route.get(v.routeId)!, c.byId.vessel.get(v.vesselId)!, snap.vessels.get(v.vesselId) ?? null, [], NOW);
    expect(r.band).toBe('unknown');
    expect(selectVoyageImpact({ ...snap, weatherFeedLoaded: false }, 'VYG-0001').riskStyle.label).toBe('Route risk unknown');
  });

  it('explains Pacific Horizon as on-corridor but outside the traversal window', () => {
    const impact = selectVoyageImpact(snap, 'VYG-0001');
    expect(impact.risk?.hazardIds).toEqual([]);
    expect(impact.riskStyle.label).toBe('Hazard on corridor · not crossed');
    expect(impact.riskProvenance.sources.some((s) => s.id === 'WX-0001')).toBe(true);
  });
});

describe('KPI members and drill', () => {
  const snap = getSnapshotAt(c, NOW);
  const kpis = selectKpis(c, snap);

  it('lists exactly the members behind each count', () => {
    for (const key of ['trackedVessels', 'delayedVoyages', 'atRiskVoyages', 'underwayVessels', 'unresolvedIncidents'] as KpiKey[]) {
      const k = kpi(kpis, key);
      expect(k.members.length).toBe(k.value);
      expect(new Set(k.members.map((m) => m.id)).size).toBe(k.members.length);
    }
  });

  it('maps drill members to vessels for the map filter', () => {
    const ids = drillVesselIds(c, kpi(kpis, 'delayedVoyages'));
    expect(ids.has('VSL-0001')).toBe(true);
    expect(ids.size).toBeLessThanOrEqual(kpi(kpis, 'delayedVoyages').members.length);
  });

  it('is deterministic for the same time and overlay', () => {
    const a = getSnapshotAt(c, NOW, override(41000));
    const b = getSnapshotAt(c, NOW, override(41000));
    expect(selectKpis(c, a)).toEqual(selectKpis(c, b));
    expect([...a.risks.values()]).toEqual([...b.risks.values()]);
  });
});

describe('daily rate input validation', () => {
  it('accepts formatted numbers and rejects bad input', () => {
    expect(validateDailyRate('$40,000')).toEqual({ ok: true, usd: 40000 });
    expect(validateDailyRate('0')).toEqual({ ok: true, usd: 0 });
    expect(validateDailyRate('').ok).toBe(false);
    expect(validateDailyRate('abc').ok).toBe(false);
    expect(validateDailyRate('-5').ok).toBe(false);
    expect(validateDailyRate('99999999').ok).toBe(false);
  });
});

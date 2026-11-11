import { isClosedStage } from '@/core/caseStage';
import { boundsContain } from '@/core/geo';
import { toIsoUtc } from '@/core/time';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { makeProvenance, type Provenance } from './provenance';
import type { Snapshot } from './snapshot';

export type KpiKey = 'trackedVessels' | 'underwayVessels' | 'delayedVoyages' | 'atRiskVoyages' | 'unresolvedIncidents' | 'exposureUsd' | 'onTimeForecastRate';
export const KPI_KEYS: KpiKey[] = ['trackedVessels', 'delayedVoyages', 'atRiskVoyages', 'exposureUsd', 'underwayVessels', 'unresolvedIncidents', 'onTimeForecastRate'];

export interface Kpi {
  key: KpiKey;
  label: string;
  value: number | null;
  unit: 'count' | 'usd' | 'fraction';
  asOfUtc: string;
  cohort: string;
  denominator?: number;
  source: string;
  quality: 'simulated' | 'derived';
  drillFilter?: KpiKey;
  definition: string;
  provenance: Provenance;
  /** Entities that make up the value, worst first (drill-down list and map filter). */
  members: EntityRef[];
}

export interface KpiCohort {
  regionId?: string | null;
}

/** Forecast lateness threshold for "delayed" (declared tolerance). */
export const LATE_THRESHOLD_MINUTES = 60;

export interface CohortSets {
  vesselIds: Set<string>;
  voyageIds: Set<string>;
  incidentIds: Set<string>;
}

export function cohortSets(c: Catalog, snap: Snapshot, cohort: KpiCohort = {}): CohortSets {
  const region = cohort.regionId ? c.byId.region.get(cohort.regionId) : null;
  const vesselIds = new Set<string>();
  for (const v of c.vessels) {
    if (!region) vesselIds.add(v.vesselId);
    else {
      const p = snap.vessels.get(v.vesselId)?.point;
      if (p && boundsContain(region.bounds, p)) vesselIds.add(v.vesselId);
    }
  }
  const voyageIds = new Set<string>();
  for (const vo of c.voyages) {
    if (!region) voyageIds.add(vo.voyageId);
    else {
      const o = c.byId.port.get(vo.originPortId)?.regionId;
      const d = c.byId.port.get(vo.destinationPortId)?.regionId;
      if (vesselIds.has(vo.vesselId) || o === region.regionId || d === region.regionId) voyageIds.add(vo.voyageId);
    }
  }
  const incidentIds = new Set<string>();
  for (const i of c.incidents) {
    const st = snap.incidents.get(i.incidentId);
    if (!st?.visible) continue;
    if (!region || c.byId.port.get(i.portId)?.regionId === region.regionId || voyageIds.has(i.voyageId)) incidentIds.add(i.incidentId);
  }
  return { vesselIds, voyageIds, incidentIds };
}

function voyagesWithOpenIncident(c: Catalog, snap: Snapshot, sets: CohortSets): Set<string> {
  const out = new Set<string>();
  for (const id of sets.incidentIds) {
    const st = snap.incidents.get(id);
    const inc = c.byId.incident.get(id);
    if (st && inc && !isClosedStage(st.status)) out.add(inc.voyageId);
  }
  return out;
}

/** Voyages whose expected traversal intersects a time-valid hazard polygon (geometry × time, not the fixture list). */
export function voyagesCrossingHazards(snap: Snapshot, sets: CohortSets): Set<string> {
  const out = new Set<string>();
  for (const [id, r] of snap.risks) if (r.hazardIds.length && sets.voyageIds.has(id)) out.add(id);
  return out;
}

/** Unique voyages with an unresolved, visible incident or a computed hazard intersection in the cohort. */
export function voyagesAtRisk(c: Catalog, snap: Snapshot, sets: CohortSets): Set<string> {
  return new Set([...voyagesWithOpenIncident(c, snap, sets), ...voyagesCrossingHazards(snap, sets)]);
}

/** Exposure summed once per voyage (never once per incident on the same voyage). */
export function dedupedExposureUsd(c: Catalog, snap: Snapshot, sets: CohortSets): { usd: number; voyageIds: string[]; unavailable: string[]; userScenario: string[] } {
  const voyages = [...voyagesWithOpenIncident(c, snap, sets)].sort();
  let usd = 0;
  const unavailable: string[] = [];
  const userScenario: string[] = [];
  for (const v of voyages) {
    const ex = snap.exposures.get(v);
    if (ex?.estimatedUsd === null || ex?.estimatedUsd === undefined) unavailable.push(v);
    else usd += ex.estimatedUsd;
    if (ex?.rate.kind === 'user') userScenario.push(v);
  }
  return { usd, voyageIds: voyages, unavailable, userScenario };
}

const ref = (kind: EntityRef['kind']) => (id: string): EntityRef => ({ kind, id });

export function selectKpis(c: Catalog, snap: Snapshot, cohort: KpiCohort = {}): Kpi[] {
  const sets = cohortSets(c, snap, cohort);
  const asOfUtc = toIsoUtc(snap.timeMs);
  const cohortLabel = cohort.regionId ? (c.byId.region.get(cohort.regionId)?.name ?? cohort.regionId) : 'All simulated fleet';
  const tracked: string[] = [];
  const underway: string[] = [];
  let staleCount = 0;
  for (const id of sets.vesselIds) {
    const s = snap.vessels.get(id);
    if (!s || s.state === 'unavailable' || s.state === 'stale') {
      if (s?.state === 'stale') staleCount++;
      continue;
    }
    tracked.push(id);
    if (s.navStatus === 'underway') underway.push(id);
  }
  const delayed: { id: string; shift: number }[] = [];
  let eligible = 0;
  let onTime = 0;
  for (const id of sets.voyageIds) {
    const eta = snap.etas.get(id);
    if (!eta || eta.etaShiftMinutes === null) continue;
    eligible++;
    if (eta.etaShiftMinutes > LATE_THRESHOLD_MINUTES) delayed.push({ id, shift: eta.etaShiftMinutes });
    else onTime++;
  }
  delayed.sort((a, b) => b.shift - a.shift || a.id.localeCompare(b.id));
  const withIncident = voyagesWithOpenIncident(c, snap, sets);
  const crossing = voyagesCrossingHazards(snap, sets);
  const atRisk = [...new Set([...withIncident, ...crossing])].sort((a, b) => (snap.risks.get(b)?.score ?? 0) - (snap.risks.get(a)?.score ?? 0) || a.localeCompare(b));
  const unresolved = [...sets.incidentIds].filter((id) => { const st = snap.incidents.get(id); return !st || !isClosedStage(st.status); }).sort();
  const exposure = dedupedExposureUsd(c, snap, sets);
  const exposureOrder = [...exposure.voyageIds].sort((a, b) => (snap.exposures.get(b)?.estimatedUsd ?? -1) - (snap.exposures.get(a)?.estimatedUsd ?? -1) || a.localeCompare(b));
  const base = { asOfUtc, cohort: cohortLabel, quality: 'derived' as const };
  const prov = (p: Omit<Parameters<typeof makeProvenance>[0], 'feed' | 'asOf' | 'nowMs' | 'confidence'> & { confidence?: Provenance['confidence'] }) =>
    makeProvenance({ feed: 'snapshot', asOf: snap.timeMs, nowMs: snap.timeMs, confidence: 'medium', ...p });
  const cohortNote = `Cohort: ${cohortLabel}.`;

  return [
    {
      ...base,
      key: 'trackedVessels',
      label: 'Tracked',
      value: tracked.length,
      unit: 'count',
      denominator: sets.vesselIds.size,
      source: 'positions.json',
      quality: 'simulated',
      drillFilter: 'trackedVessels',
      definition: `Vessels with a position sample no older than 30 min at the simulation time, of ${sets.vesselIds.size} in cohort.`,
      members: tracked.sort().map(ref('vessel')),
      provenance: prov({
        sourceClass: 'simulated-fixture',
        evidence: 'observed',
        method: 'Count of vessels whose latest position sample is ≤ 30 min old',
        formula: `${tracked.length} fresh of ${sets.vesselIds.size} vessels`,
        sources: [{ kind: 'record', id: 'positions', label: 'Synthetic AIS-style samples · positions.json' }],
        assumptions: [cohortNote, 'Stale and missing positions are excluded, not counted as tracked.'],
        warnings: staleCount ? [`${staleCount} vessels have stale positions (> 30 min).`] : [],
      }),
    },
    {
      ...base,
      key: 'delayedVoyages',
      label: 'Delayed',
      value: delayed.length,
      unit: 'count',
      denominator: eligible,
      source: 'ETA engine',
      drillFilter: 'delayedVoyages',
      definition: `Active voyages whose forecast ETA exceeds the planned ETA by more than ${LATE_THRESHOLD_MINUTES} min (forecast, not actual arrivals).`,
      members: delayed.map((d) => ref('voyage')(d.id)),
      provenance: prov({
        sourceClass: 'derived-model',
        evidence: 'estimated',
        method: 'Count of voyages with forecast ETA shift above the lateness threshold',
        formula: `count(shift > ${LATE_THRESHOLD_MINUTES} min) = ${delayed.length} of ${eligible} with a computable ETA`,
        sources: [{ kind: 'engine', id: 'computeEta', label: 'ETA engine (latest recorded revision per voyage)' }],
        assumptions: [cohortNote, 'Forecast lateness, not actual arrival performance.'],
        warnings: sets.voyageIds.size - eligible ? [`${sets.voyageIds.size - eligible} voyages without a computable ETA are excluded.`] : [],
      }),
    },
    {
      ...base,
      key: 'atRiskVoyages',
      label: 'At risk',
      value: atRisk.length,
      unit: 'count',
      denominator: sets.voyageIds.size,
      source: 'Incidents + route risk engine',
      drillFilter: 'atRiskVoyages',
      definition: 'Unique voyages with an unresolved incident, or whose expected track crosses an issued hazard forecast while it is valid.',
      members: atRisk.map(ref('voyage')),
      provenance: prov({
        sourceClass: 'derived-model',
        evidence: snap.weatherFeedLoaded ? 'estimated' : 'unknown',
        method: 'Union of voyages with an unresolved incident and voyages whose computed route risk intersects a hazard',
        formula: `|incident voyages (${withIncident.size}) ∪ hazard-crossing voyages (${crossing.size})| = ${atRisk.length}`,
        sources: [
          { kind: 'engine', id: 'computeRouteHazards', label: 'Route risk engine (geometry × time)' },
          { kind: 'record', id: 'incidents', label: 'incidents.json + local workflow' },
        ],
        assumptions: [cohortNote, 'A hazard near a corridor without intersection is not counted.'],
        warnings: snap.weatherFeedLoaded ? [] : ['No weather feed loaded; hazard exposure unknown.'],
      }),
    },
    {
      ...base,
      key: 'exposureUsd',
      label: 'Exposure',
      value: exposure.voyageIds.length && exposure.unavailable.length === exposure.voyageIds.length ? null : exposure.usd,
      unit: 'usd',
      source: 'Exposure engine',
      drillFilter: 'exposureUsd',
      definition: 'Estimated delay exposure of voyages with unresolved incidents, counted once per voyage. Estimate, not invoice or demurrage.',
      members: exposureOrder.map(ref('voyage')),
      provenance: prov({
        sourceClass: exposure.userScenario.length ? 'user-scenario' : 'derived-model',
        evidence: exposure.userScenario.length ? 'scenario' : 'estimated',
        method: 'Σ voyage exposure over unique voyages with an unresolved incident',
        formula: `Σ over ${exposure.voyageIds.length - exposure.unavailable.length} voyages = $${exposure.usd.toLocaleString('en-US')}`,
        sources: [{ kind: 'engine', id: 'computeExposure', label: 'Exposure engine (hours ÷ 24 × daily rate)' }],
        assumptions: [cohortNote, 'Counted once per voyage even when several incidents share it.'],
        warnings: [
          ...(exposure.unavailable.length ? [`${exposure.unavailable.length} voyages have no exposure (missing rate or ETA) and are excluded.`] : []),
          ...(exposure.userScenario.length ? [`Includes user-scenario rates for ${exposure.userScenario.join(', ')}.`] : []),
        ],
      }),
    },
    {
      ...base,
      key: 'underwayVessels',
      label: 'Underway',
      value: underway.length,
      unit: 'count',
      denominator: tracked.length,
      source: 'positions.json',
      quality: 'simulated',
      drillFilter: 'underwayVessels',
      definition: 'Tracked vessels with navigational status underway.',
      members: underway.sort().map(ref('vessel')),
      provenance: prov({
        sourceClass: 'simulated-fixture',
        evidence: 'observed',
        method: 'Tracked vessels reporting navigational status underway',
        formula: `${underway.length} of ${tracked.length} tracked`,
        sources: [{ kind: 'record', id: 'positions', label: 'navStatus · positions.json' }],
        assumptions: [cohortNote],
      }),
    },
    {
      ...base,
      key: 'unresolvedIncidents',
      label: 'Open cases',
      value: unresolved.length,
      unit: 'count',
      source: 'incidents.json + local workflow',
      drillFilter: 'unresolvedIncidents',
      definition: 'Visible incidents not yet resolved, de-duplicated by incident ID.',
      members: unresolved.map(ref('incident')),
      provenance: prov({
        sourceClass: 'simulated-fixture',
        evidence: 'observed',
        method: 'Visible incidents whose status is not resolved, unique by incident ID',
        formula: `${unresolved.length} unresolved of ${sets.incidentIds.size} visible`,
        sources: [{ kind: 'record', id: 'incidents', label: 'incidents.json + local workflow decisions' }],
        assumptions: [cohortNote],
      }),
    },
    {
      ...base,
      key: 'onTimeForecastRate',
      label: 'On-time forecast',
      value: eligible ? onTime / eligible : null,
      unit: 'fraction',
      denominator: eligible,
      source: 'ETA engine',
      definition: `Share of eligible voyages (n=${eligible}) forecast within ${LATE_THRESHOLD_MINUTES} min of plan. Not historical on-time performance.`,
      members: [],
      provenance: prov({
        sourceClass: 'derived-model',
        evidence: eligible ? 'estimated' : 'unknown',
        method: 'Share of voyages with a computable ETA forecast within the lateness threshold',
        formula: eligible ? `${onTime} ÷ ${eligible}` : 'No eligible voyages',
        sources: [{ kind: 'engine', id: 'computeEta', label: 'ETA engine' }],
        assumptions: [cohortNote, 'Not historical on-time performance.'],
      }),
    },
  ];
}

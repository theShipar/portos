import { boundsContain } from '@/core/geo';
import { toIsoUtc } from '@/core/time';
import type { Catalog } from '@/data/catalog';
import type { Snapshot } from './snapshot';

export type KpiKey = 'trackedVessels' | 'underwayVessels' | 'delayedVoyages' | 'atRiskVoyages' | 'unresolvedIncidents' | 'exposureUsd' | 'onTimeForecastRate';

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

/** Unique voyages with an unresolved, visible incident in the cohort. */
export function voyagesAtRisk(c: Catalog, snap: Snapshot, sets: CohortSets): Set<string> {
  const out = new Set<string>();
  for (const id of sets.incidentIds) {
    const st = snap.incidents.get(id);
    const inc = c.byId.incident.get(id);
    if (st && inc && st.status !== 'resolved') out.add(inc.voyageId);
  }
  for (const h of c.weatherHazards) {
    if (snap.hazards.get(h.hazardId) !== 'active') continue;
    for (const v of h.affectedVoyageIds) if (sets.voyageIds.has(v)) out.add(v);
  }
  return out;
}

/** Exposure summed once per voyage (never once per incident on the same voyage). */
export function dedupedExposureUsd(c: Catalog, snap: Snapshot, sets: CohortSets): { usd: number; voyageIds: string[] } {
  const voyages = new Set<string>();
  for (const id of sets.incidentIds) {
    const st = snap.incidents.get(id);
    const inc = c.byId.incident.get(id);
    if (st && inc && st.status !== 'resolved') voyages.add(inc.voyageId);
  }
  let usd = 0;
  for (const v of voyages) usd += snap.exposures.get(v)?.estimatedUsd ?? 0;
  return { usd, voyageIds: [...voyages].sort() };
}

export function selectKpis(c: Catalog, snap: Snapshot, cohort: KpiCohort = {}): Kpi[] {
  const sets = cohortSets(c, snap, cohort);
  const asOfUtc = toIsoUtc(snap.timeMs);
  const cohortLabel = cohort.regionId ? (c.byId.region.get(cohort.regionId)?.name ?? cohort.regionId) : 'All simulated fleet';
  let tracked = 0;
  let underway = 0;
  for (const id of sets.vesselIds) {
    const s = snap.vessels.get(id);
    if (!s || s.state === 'unavailable' || s.state === 'stale') continue;
    tracked++;
    if (s.navStatus === 'underway') underway++;
  }
  let delayed = 0;
  let eligible = 0;
  let onTime = 0;
  for (const id of sets.voyageIds) {
    const eta = snap.etas.get(id);
    if (!eta || eta.etaShiftMinutes === null) continue;
    eligible++;
    if (eta.etaShiftMinutes > LATE_THRESHOLD_MINUTES) delayed++;
    else onTime++;
  }
  const atRisk = voyagesAtRisk(c, snap, sets).size;
  const unresolved = [...sets.incidentIds].filter((id) => snap.incidents.get(id)?.status !== 'resolved').length;
  const exposure = dedupedExposureUsd(c, snap, sets);
  const base = { asOfUtc, cohort: cohortLabel, quality: 'derived' as const };
  return [
    { ...base, key: 'trackedVessels', label: 'Tracked', value: tracked, unit: 'count', denominator: sets.vesselIds.size, source: 'positions.json', quality: 'simulated', drillFilter: 'trackedVessels', definition: `Vessels with a position sample no older than 30 min at the simulation time, of ${sets.vesselIds.size} in cohort.` },
    { ...base, key: 'delayedVoyages', label: 'Delayed', value: delayed, unit: 'count', denominator: eligible, source: 'ETA engine', drillFilter: 'delayedVoyages', definition: `Active voyages whose forecast ETA exceeds the planned ETA by more than ${LATE_THRESHOLD_MINUTES} min (forecast, not actual arrivals).` },
    { ...base, key: 'atRiskVoyages', label: 'At risk', value: atRisk, unit: 'count', source: 'Incidents + weather engine', drillFilter: 'atRiskVoyages', definition: 'Unique voyages with an unresolved incident or crossing an active hazard forecast.' },
    { ...base, key: 'exposureUsd', label: 'Exposure', value: exposure.usd, unit: 'usd', source: 'Exposure engine', drillFilter: 'atRiskVoyages', definition: 'Estimated delay exposure of voyages with unresolved incidents, counted once per voyage. Estimate, not invoice or demurrage.' },
    { ...base, key: 'underwayVessels', label: 'Underway', value: underway, unit: 'count', denominator: tracked, source: 'positions.json', quality: 'simulated', definition: 'Tracked vessels with navigational status underway.' },
    { ...base, key: 'unresolvedIncidents', label: 'Open cases', value: unresolved, unit: 'count', source: 'incidents.json + local workflow', drillFilter: 'atRiskVoyages', definition: 'Visible incidents not yet resolved, de-duplicated by incident ID.' },
    { ...base, key: 'onTimeForecastRate', label: 'On-time forecast', value: eligible ? onTime / eligible : null, unit: 'fraction', denominator: eligible, source: 'ETA engine', definition: `Share of eligible voyages (n=${eligible}) forecast within ${LATE_THRESHOLD_MINUTES} min of plan. Not historical on-time performance.` },
  ];
}

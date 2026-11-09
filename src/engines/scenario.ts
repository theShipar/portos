import { formatUsd } from '@/core/format';
import { toIsoUtc } from '@/core/time';
import type { Confidence, Route } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { ScenarioInputs } from '@/workflows/types';
import type { Snapshot } from './snapshot';

export const SCENARIO_LIMITS = { maxExtraWaitHours: 240, minSpeedKn: 6, maxSpeedKn: 24 } as const;
export const DEFAULT_SPEED_KN = 14;

export type OptionId = 'baseline' | 'agent_confirmation' | 'alternative_corridor';

export interface ScenarioOption {
  optionId: OptionId;
  name: string;
  summary: string;
  feasible: boolean;
  notApplicableReason: string | null;
  etaDeltaHours: number | null;
  extraDistanceNm: number;
  exposureUsd: number | null;
  formula: string;
  diffVsBaseline: { hours: number | null; usd: number | null };
  assumptions: string[];
  confidence: Confidence;
  requiredApproval: 'none' | 'manager';
  stakeholders: string[];
  coordinationSteps: string[];
  risks: string[];
  /** Map geometry style for the option; `none` keeps the option textual. */
  geometry: { routeId: string; style: 'planned' | 'proposed' } | null;
}

export interface ScenarioComparison {
  baselineVoyageId: string;
  asOfUtc: string;
  inputs: ScenarioInputs;
  options: ScenarioOption[];
  disclaimer: string;
  sources: string[];
}

export const SCENARIO_DISCLAIMER =
  'Synthetic prototype. Client-side what-if estimates from simulated data; not navigation, routing or commercial advice. Choosing a plan records a proposal only and never changes a vessel route or ETA.';

const CONF_UP: Record<Confidence, Confidence> = { unknown: 'low', low: 'medium', medium: 'high', high: 'high' };

/** Alternative corridors in the dataset for the same origin and destination. */
export function alternativeRoutes(c: Catalog, base: Route): Route[] {
  return c.routes.filter((r) => r.isScenarioAlternative && r.routeId !== base.routeId && r.originPortId === base.originPortId && r.destinationPortId === base.destinationPortId);
}

export function defaultScenarioInputs(c: Catalog, snap: Snapshot, voyageId: string): ScenarioInputs | null {
  const vo = c.byId.voyage.get(voyageId);
  if (!vo) return null;
  return { extraWaitHours: 0, dailyCostUsd: snap.exposures.get(voyageId)?.dailyDelayCostUsd ?? null, speedAssumptionKn: DEFAULT_SPEED_KN };
}

export function validateScenarioInputs(i: ScenarioInputs): string | null {
  if (!Number.isFinite(i.extraWaitHours) || i.extraWaitHours < 0 || i.extraWaitHours > SCENARIO_LIMITS.maxExtraWaitHours) return `Extra wait must be between 0 and ${SCENARIO_LIMITS.maxExtraWaitHours} h.`;
  if (i.dailyCostUsd !== null && (!Number.isFinite(i.dailyCostUsd) || i.dailyCostUsd < 0)) return 'Daily cost must be a positive amount, or left empty.';
  if (!Number.isFinite(i.speedAssumptionKn) || i.speedAssumptionKn < SCENARIO_LIMITS.minSpeedKn || i.speedAssumptionKn > SCENARIO_LIMITS.maxSpeedKn) return `Speed must be between ${SCENARIO_LIMITS.minSpeedKn} and ${SCENARIO_LIMITS.maxSpeedKn} kn.`;
  return null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const cost = (hours: number, rate: number | null) => (rate === null ? null : Math.round((hours / 24) * rate));
const costText = (hours: number, rate: number | null) => (rate === null ? 'Daily cost missing → exposure unavailable' : `${round1(hours)} h ÷ 24 × ${formatUsd(rate)}/day = ${formatUsd(cost(hours, rate))}`);

/**
 * One comparison from shared read models: the ETA engine's shift and the exposure formula. Options never invent
 * savings: confirming with the port agent narrows uncertainty but does not shorten the queue, and an alternative
 * corridor adds sailing time on top of the wait it cannot avoid.
 */
export function compareScenarios(c: Catalog, snap: Snapshot, voyageId: string, inputs: ScenarioInputs): ScenarioComparison | null {
  const vo = c.byId.voyage.get(voyageId);
  const route = vo ? c.byId.route.get(vo.routeId) : undefined;
  const eta = snap.etas.get(voyageId);
  if (!vo || !route || !eta) return null;
  const rate = inputs.dailyCostUsd;
  const shiftH = eta.etaShiftMinutes === null ? null : eta.etaShiftMinutes / 60;
  const conf = eta.confidence;
  const baseHours = shiftH === null ? null : round1(shiftH + inputs.extraWaitHours);
  const baseUsd = baseHours === null ? null : cost(baseHours, rate);
  const portName = (id: string) => c.byId.port.get(id)?.name ?? id;
  const waitAssumption = inputs.extraWaitHours ? `Adds ${inputs.extraWaitHours} h of further waiting (user assumption).` : 'No further waiting beyond the current forecast.';

  const diff = (h: number | null, usd: number | null) => ({
    hours: h === null || baseHours === null ? null : round1(h - baseHours),
    usd: usd === null || baseUsd === null ? null : usd - baseUsd,
  });

  const baseline: ScenarioOption = {
    optionId: 'baseline',
    name: 'Maintain plan · wait for berth',
    summary: `Keep the planned ${route.corridorName} corridor and the current berth request at ${portName(vo.originPortId)}.`,
    feasible: baseHours !== null,
    notApplicableReason: baseHours === null ? 'No computable ETA shift for this voyage.' : null,
    etaDeltaHours: baseHours,
    extraDistanceNm: 0,
    exposureUsd: baseUsd,
    formula: baseHours === null ? 'ETA shift unknown' : `${round1(shiftH!)} h forecast shift + ${inputs.extraWaitHours} h extra wait = ${baseHours} h · ${costText(baseHours, rate)}`,
    diffVsBaseline: { hours: 0, usd: baseUsd === null ? null : 0 },
    assumptions: [waitAssumption, `ETA shift from the ETA engine: ${eta.provenance.method.toLowerCase()}.`],
    confidence: conf,
    requiredApproval: 'none',
    stakeholders: ['Fleet ops dispatcher'],
    coordinationSteps: ['Keep the berth request active', 'Monitor ETA revisions at each port-wait update'],
    risks: ['Queue may lengthen further; forecast, not a confirmed berth time.'],
    geometry: { routeId: route.routeId, style: 'planned' },
  };

  const agent: ScenarioOption = {
    ...baseline,
    optionId: 'agent_confirmation',
    name: 'Request port-agent ETA confirmation',
    summary: 'Ask the (fictional) port agent to confirm the berth window. Narrows planning uncertainty; does not shorten the queue.',
    formula: baseHours === null ? 'ETA shift unknown' : `Same delay as baseline: ${baseHours} h · ${costText(baseHours, rate)}`,
    diffVsBaseline: diff(baseHours, baseUsd),
    assumptions: [waitAssumption, 'Confirmation raises confidence one level once received; the delay itself is unchanged.'],
    confidence: CONF_UP[conf],
    stakeholders: ['Port-agent coordinator', 'Fleet ops dispatcher'],
    coordinationSteps: ['Draft the port-agent ETA request', 'Create a follow-up task with a due time', 'Update the case when the agent replies'],
    risks: ['Agent reply may be late or unconfirmed; keep monitoring.'],
    geometry: { routeId: route.routeId, style: 'planned' },
  };

  const alt = alternativeRoutes(c, route)[0];
  let alternative: ScenarioOption;
  if (!alt) {
    alternative = {
      ...baseline,
      optionId: 'alternative_corridor',
      name: 'Alternative corridor',
      summary: 'No verified alternative corridor for this origin and destination in the dataset.',
      feasible: false,
      notApplicableReason: 'No verified alternative geometry; only "Monitor & coordinate" options are available.',
      etaDeltaHours: null,
      exposureUsd: null,
      formula: '—',
      diffVsBaseline: { hours: null, usd: null },
      assumptions: [],
      confidence: 'unknown',
      requiredApproval: 'manager',
      stakeholders: [],
      coordinationSteps: [],
      risks: [],
      geometry: null,
    };
  } else {
    const extraNm = Math.round(alt.distanceNmEstimate - route.distanceNmEstimate);
    const sailH = round1(extraNm / inputs.speedAssumptionKn);
    const altHours = baseHours === null ? null : round1(baseHours + sailH);
    const altUsd = altHours === null ? null : cost(altHours, rate);
    alternative = {
      optionId: 'alternative_corridor',
      name: `Flag ${alt.corridorName} for feasibility`,
      summary: `Candidate corridor ${alt.routeId}. The berth wait at ${portName(vo.originPortId)} still applies; the longer passage adds sailing time.`,
      feasible: altHours !== null,
      notApplicableReason: altHours === null ? 'No computable ETA shift for this voyage.' : null,
      etaDeltaHours: altHours,
      extraDistanceNm: extraNm,
      exposureUsd: altUsd,
      formula: altHours === null ? 'ETA shift unknown' : `${baseHours} h + ${extraNm.toLocaleString('en-US')} nm ÷ ${inputs.speedAssumptionKn} kn (${sailH} h) = ${altHours} h · ${costText(altHours, rate)}`,
      diffVsBaseline: diff(altHours, altUsd),
      assumptions: [waitAssumption, `Constant ${inputs.speedAssumptionKn} kn over the extra distance (user assumption).`, 'Fuel, canal dues and charter terms are not modelled.'],
      confidence: 'low',
      requiredApproval: 'manager',
      stakeholders: ['Fleet operations manager', 'Vessel owner (fictional)', 'Customer service'],
      coordinationSteps: ['Feasibility review by the manager', 'Owner and charterer consultation', 'Customer schedule update if accepted'],
      risks: ['Longer open-ocean exposure; not a passage plan.', 'Synthetic corridor geometry, not a nautical chart.'],
      geometry: { routeId: alt.routeId, style: 'proposed' },
    };
  }

  return {
    baselineVoyageId: voyageId,
    asOfUtc: toIsoUtc(snap.timeMs),
    inputs: { ...inputs },
    options: [baseline, agent, alternative],
    disclaimer: SCENARIO_DISCLAIMER,
    sources: [`ETA engine · ${eta.provenance.method}`, `Exposure formula: hours ÷ 24 × daily rate`, `Routes: ${route.routeId}${alt ? `, ${alt.routeId}` : ''} (synthetic)`],
  };
}

/** Static export for the case study: inputs, outputs, timestamps, sources and the disclaimer. */
export function exportComparison(cmp: ScenarioComparison, exportedAtUtc: string) {
  return {
    title: 'Scenario Comparison',
    caveat: 'Synthetic prototype — simulated data, no external confirmation.',
    exportedAtUtc,
    ...cmp,
  };
}

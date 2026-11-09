import type { Confidence } from '@/core/types';
import { makeProvenance, type Provenance, type SourceRef } from './provenance';

export interface ExposureComponent {
  key: 'operating_delay';
  label: string;
  usd: number;
}

/** Where the daily delay rate comes from: the voyage fixture, or a local user scenario override. */
export type RateAssumption =
  | { kind: 'fixture'; usdPerDay: number | null }
  | { kind: 'user'; usdPerDay: number; fixtureUsdPerDay: number | null; setByUserId: string; setAtUtc: string };

export interface ExposureEstimate {
  voyageId: string;
  hours: number | null;
  dailyDelayCostUsd: number | null;
  estimatedUsd: number | null;
  totalUsd: number | null;
  components: ExposureComponent[];
  asOfUtc: string | null;
  confidence: Confidence;
  formulaText: string;
  explanation: string;
  rate: RateAssumption;
  provenance: Provenance;
}

export interface DelayCostInput {
  voyageId: string;
  incrementalHours: number | null;
  rate: RateAssumption;
  asOfUtc: string | null;
  confidence: Confidence;
  nowMs: number;
  /** ETA evidence the hours come from (event or record IDs). */
  etaSources?: SourceRef[];
}

export const UNAVAILABLE_TEXT = 'Financial exposure unavailable';
const DISCLAIMER = 'Decision-support estimate; not demurrage, an invoice or a guaranteed loss.';

const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

function rateSource(rate: RateAssumption, voyageId: string): SourceRef {
  return rate.kind === 'user'
    ? { kind: 'assumption', id: `rate:${voyageId}`, label: `Daily delay rate ${usd(rate.usdPerDay)}/day · set by ${rate.setByUserId} (fixture ${rate.fixtureUsdPerDay === null ? 'none' : usd(rate.fixtureUsdPerDay)})`, atUtc: rate.setAtUtc }
    : { kind: 'record', id: voyageId, label: rate.usdPerDay === null ? 'Daily delay rate · not in voyages.json' : `Daily delay rate ${usd(rate.usdPerDay)}/day · voyages.json` };
}

/**
 * Simple demo model: estimatedExposureUsd = max(0, hours / 24) × dailyDelayCostUsd.
 * Decision-support estimate only — not demurrage, an invoice or a guaranteed loss.
 */
export function computeExposure(input: DelayCostInput): ExposureEstimate {
  const { voyageId, incrementalHours, rate, asOfUtc, nowMs } = input;
  const daily = rate.usdPerDay;
  const user = rate.kind === 'user';
  const sources = [{ kind: 'engine' as const, id: `eta:${voyageId}`, label: 'Forecast ETA shift · ETA engine' }, ...(input.etaSources ?? []), rateSource(rate, voyageId)];
  const base = {
    sourceClass: user ? ('user-scenario' as const) : ('derived-model' as const),
    method: 'Forecast ETA shift (hours) ÷ 24 × daily delay rate; early arrival never offsets lateness',
    feed: 'eta' as const,
    asOf: asOfUtc,
    nowMs,
    sources,
  };

  if (incrementalHours === null || daily === null) {
    const explanation = daily === null ? 'No daily delay cost assumption for this voyage.' : 'No ETA shift could be computed.';
    return {
      voyageId,
      hours: incrementalHours,
      dailyDelayCostUsd: daily,
      estimatedUsd: null,
      totalUsd: null,
      components: [],
      asOfUtc,
      confidence: 'unknown',
      formulaText: UNAVAILABLE_TEXT,
      explanation,
      rate,
      provenance: makeProvenance({ ...base, evidence: 'unknown', confidence: 'unknown', assumptions: [DISCLAIMER], warnings: [explanation] }),
    };
  }
  const hours = Math.max(0, incrementalHours);
  const est = Math.round((hours / 24) * daily);
  const formulaText = `${formatH(hours)} h ÷ 24 × ${usd(daily)}/day = ${usd(est)}`;
  const assumptions = [DISCLAIMER];
  if (incrementalHours < 0) assumptions.push('Forecast is early; counted as 0 h.');
  if (user) assumptions.push(`Rate is a local what-if set by ${rate.setByUserId}; reset to restore the fixture rate.`);
  return {
    voyageId,
    hours,
    dailyDelayCostUsd: daily,
    estimatedUsd: est,
    totalUsd: est,
    components: [{ key: 'operating_delay', label: 'Operating delay (per-voyage daily rate)', usd: est }],
    asOfUtc,
    confidence: input.confidence,
    formulaText,
    explanation:
      incrementalHours < 0
        ? 'Forecast is early; early arrival does not create negative exposure.'
        : `Forecast ETA shift of ${formatH(hours)} h at ${user ? 'a user-scenario' : "the voyage's assumed"} ${usd(daily)}/day operating delay rate.`,
    rate,
    provenance: makeProvenance({ ...base, evidence: user ? 'scenario' : 'estimated', confidence: input.confidence, formula: formulaText, assumptions }),
  };
}

function formatH(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

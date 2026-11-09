import type { Confidence } from '@/core/types';

export interface ExposureComponent {
  key: 'operating_delay';
  label: string;
  usd: number;
}

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
}

export interface DelayCostInput {
  voyageId: string;
  incrementalHours: number | null;
  dailyDelayCostUsd: number | null;
  asOfUtc: string | null;
  confidence: Confidence;
  assumptionSource?: string;
}

/**
 * Simple demo model: estimatedExposureUsd = max(0, hours / 24) × dailyDelayCostUsd.
 * Decision-support estimate only — not demurrage, an invoice or a guaranteed loss.
 */
export function computeExposure(input: DelayCostInput): ExposureEstimate {
  const { voyageId, incrementalHours, dailyDelayCostUsd, asOfUtc, confidence } = input;
  if (incrementalHours === null || dailyDelayCostUsd === null) {
    return {
      voyageId,
      hours: incrementalHours,
      dailyDelayCostUsd,
      estimatedUsd: null,
      totalUsd: null,
      components: [],
      asOfUtc,
      confidence: 'unknown',
      formulaText: 'Financial exposure unavailable',
      explanation: dailyDelayCostUsd === null ? 'No daily delay cost assumption for this voyage.' : 'No ETA shift could be computed.',
    };
  }
  const hours = Math.max(0, incrementalHours);
  const usd = Math.round((hours / 24) * dailyDelayCostUsd);
  const fmtRate = dailyDelayCostUsd.toLocaleString('en-US');
  return {
    voyageId,
    hours,
    dailyDelayCostUsd,
    estimatedUsd: usd,
    totalUsd: usd,
    components: [{ key: 'operating_delay', label: 'Operating delay (per-voyage daily rate)', usd }],
    asOfUtc,
    confidence,
    formulaText: `${formatH(hours)} h ÷ 24 × $${fmtRate}/day = $${usd.toLocaleString('en-US')}`,
    explanation:
      incrementalHours < 0
        ? 'Forecast is early; early arrival does not create negative exposure.'
        : `Forecast ETA shift of ${formatH(hours)} h at the voyage's assumed $${fmtRate}/day operating delay rate (${input.assumptionSource ?? 'scenario fixture'}).`,
  };
}

function formatH(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

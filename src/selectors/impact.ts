import { formatDuration, formatUsd } from '@/core/format';
import type { EtaResult } from '@/engines/eta';
import { UNAVAILABLE_TEXT, type ExposureEstimate } from '@/engines/exposure';
import { LATE_THRESHOLD_MINUTES } from '@/engines/kpis';
import { makeProvenance, type Provenance } from '@/engines/provenance';
import type { Snapshot } from '@/engines/snapshot';
import type { RouteRiskResult } from '@/engines/weatherRisk';
import type { StatusStyle, StatusTone } from '@/styles/tokens';

export interface VoyageImpact {
  voyageId: string;
  eta: EtaResult | null;
  exposure: ExposureEstimate | null;
  risk: RouteRiskResult | null;
  shiftText: string;
  shiftTone: 'critical' | 'warning' | 'healthy' | 'unknown';
  exposureText: string;
  exposureUnavailable: boolean;
  rateText: string;
  rateIsUserScenario: boolean;
  riskStyle: StatusStyle;
  riskSummary: string;
  riskProvenance: Provenance;
}

const RISK_TONE: Record<RouteRiskResult['band'], StatusTone> = { severe: 'critical', high: 'critical', moderate: 'warning', low: 'healthy', unknown: 'unknown' };
const RISK_LABEL: Record<RouteRiskResult['band'], string> = { severe: 'Severe', high: 'High', moderate: 'Moderate', low: 'Low', unknown: 'Unknown' };

/**
 * The single read model for a voyage's ETA shift, delay exposure and route risk.
 * Vessel, voyage and incident surfaces all render from this, so one rate change updates every place at once.
 */
export function selectVoyageImpact(snap: Snapshot, voyageId: string): VoyageImpact {
  const eta = snap.etas.get(voyageId) ?? null;
  const exposure = snap.exposures.get(voyageId) ?? null;
  const risk = snap.risks.get(voyageId) ?? null;
  const shift = eta?.etaShiftMinutes ?? null;
  const unavailable = !exposure || exposure.estimatedUsd === null;

  let riskStyle: StatusStyle;
  let riskSummary: string;
  let riskProvenance: Provenance;
  if (!snap.weatherFeedLoaded) {
    riskStyle = { tone: 'unknown', label: 'Route risk unknown', icon: 'question' };
    riskSummary = 'No weather feed loaded.';
    riskProvenance = makeProvenance({ sourceClass: 'derived-model', evidence: 'unknown', method: 'Route risk needs a weather feed', feed: 'weather', asOf: null, nowMs: snap.timeMs, confidence: 'unknown', warnings: ['No weather feed loaded; risk is unknown, not clear.'] });
  } else if (!risk) {
    riskStyle = { tone: 'neutral', label: 'No hazard on corridor', icon: 'dot' };
    riskSummary = 'No issued, unexpired hazard forecast lists this corridor.';
    riskProvenance = makeProvenance({
      sourceClass: 'derived-model',
      evidence: 'estimated',
      method: 'No time-valid hazard forecast covers this corridor at the simulation time',
      feed: 'snapshot',
      asOf: snap.timeMs,
      nowMs: snap.timeMs,
      confidence: 'medium',
      sources: [{ kind: 'record', id: 'weatherHazards', label: 'weatherHazards.json (synthetic forecasts)' }],
      assumptions: ['Absence of a forecast is not a statement of navigational safety.'],
    });
  } else {
    const crossing = risk.hazardIds.length > 0;
    riskStyle = {
      tone: crossing ? RISK_TONE[risk.band] : 'info',
      label: crossing ? `${RISK_LABEL[risk.band]} route risk · ${risk.score}` : 'Hazard on corridor · not crossed',
      icon: crossing ? 'alert' : 'info',
    };
    riskSummary = risk.rationale[0] ?? '';
    riskProvenance = risk.provenance;
  }

  return {
    voyageId,
    eta,
    exposure,
    risk,
    shiftText: formatDuration(shift, { signed: true }),
    shiftTone: shift === null ? 'unknown' : shift > 12 * 60 ? 'critical' : shift > LATE_THRESHOLD_MINUTES ? 'warning' : 'healthy',
    exposureText: unavailable ? (exposure?.formulaText === UNAVAILABLE_TEXT ? 'Unavailable' : '—') : formatUsd(exposure!.estimatedUsd),
    exposureUnavailable: unavailable,
    rateText: exposure?.dailyDelayCostUsd === null || exposure?.dailyDelayCostUsd === undefined ? 'No rate' : `${formatUsd(exposure.dailyDelayCostUsd)}/day`,
    rateIsUserScenario: exposure?.rate.kind === 'user',
    riskStyle,
    riskSummary,
    riskProvenance,
  };
}

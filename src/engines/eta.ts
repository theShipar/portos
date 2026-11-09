import { parseUtc, toIsoUtc } from '@/core/time';
import type { Confidence, TimelineEvent, Voyage } from '@/core/types';
import type { VesselAtTime } from './tracks';

export type EtaStatus = 'ok' | 'missing-baseline' | 'missing-estimate';

export interface EtaDriver {
  key: string;
  label: string;
  eventId: string;
  atUtc: string;
  deltaHours: number | null;
}

export interface EtaResult {
  voyageId: string;
  plannedArrivalUtc: string | null;
  estimatedArrivalUtc: string | null;
  etaShiftMinutes: number | null;
  /** Arriving early is tracked separately and never offsets lateness. */
  early: boolean;
  confidence: Confidence;
  asOfUtc: string | null;
  sourceType: 'scenario-event' | 'scenario-baseline' | 'pre-revision-baseline';
  status: EtaStatus;
  drivers: EtaDriver[];
  assumptions: string[];
}

const DRIVER_LABEL: Record<string, string> = {
  port_waiting_forecast: 'Port waiting forecast',
  scheduled_speed_change: 'Scheduled speed change',
  weather_corridor_exposure: 'Weather corridor exposure',
  voyage_schedule_adjustment: 'Voyage schedule adjustment',
  source_correction: 'Source correction',
};

const DOWNGRADE: Record<Confidence, Confidence> = { high: 'medium', medium: 'low', low: 'low', unknown: 'unknown' };

/**
 * ETA from recorded scenario estimates (source precedence: trusted external > scenario event > baseline).
 * Pure and deterministic: the result depends only on the inputs and `nowMs`.
 */
export function computeEta(
  voyage: Voyage,
  vessel: VesselAtTime | null,
  voyageEvents: TimelineEvent[],
  nowMs: number,
): EtaResult {
  const revisions = voyageEvents
    .filter((e) => e.type === 'ETA_REVISED' && e.payload.voyageId === voyage.voyageId)
    .map((e) => ({ e, t: parseUtc(e.occurredAtUtc) ?? 0 }))
    .sort((a, b) => a.t - b.t || a.e.eventId.localeCompare(b.e.eventId));
  const applied = revisions.filter((r) => r.t <= nowMs);
  const upcoming = revisions.find((r) => r.t > nowMs);

  let estimated: string | null;
  let asOf: string | null;
  let sourceType: EtaResult['sourceType'];
  if (applied.length) {
    const last = applied[applied.length - 1];
    estimated = (last.e.payload.newEstimatedArrivalUtc as string) ?? null;
    asOf = last.e.occurredAtUtc;
    sourceType = 'scenario-event';
  } else if (upcoming) {
    estimated = (upcoming.e.payload.previousEstimatedArrivalUtc as string) ?? null;
    asOf = null;
    sourceType = 'pre-revision-baseline';
  } else {
    estimated = voyage.estimatedArrivalUtc;
    asOf = voyage.estimatedAsOfUtc && (parseUtc(voyage.estimatedAsOfUtc) ?? Infinity) <= nowMs ? voyage.estimatedAsOfUtc : null;
    sourceType = 'scenario-baseline';
  }

  const assumptions = ['Scenario source estimate, not a navigational arrival prediction.'];
  let confidence: Confidence = voyage.etaConfidence ?? 'unknown';
  if (vessel && (vessel.state === 'stale' || vessel.state === 'unavailable')) {
    confidence = DOWNGRADE[confidence];
    assumptions.push(
      vessel.state === 'stale'
        ? `Last position ${Math.round(vessel.freshnessMinutes ?? 0)} min old; ETA not re-derived from position.`
        : 'No position sample at this time; ETA not re-derived from position.',
    );
  }
  if (sourceType === 'pre-revision-baseline') assumptions.push('Shown as the estimate in force before the next recorded revision.');

  const drivers: EtaDriver[] = applied.map(({ e }) => {
    const key = (e.payload.driver as string) ?? 'source_correction';
    const prev = e.payload.previousEtaShiftHours as number | undefined;
    const next = e.payload.newEtaShiftHours as number | undefined;
    return {
      key,
      label: DRIVER_LABEL[key] ?? key,
      eventId: e.eventId,
      atUtc: e.occurredAtUtc,
      deltaHours: typeof prev === 'number' && typeof next === 'number' ? next - prev : null,
    };
  });

  const plannedMs = parseUtc(voyage.plannedArrivalUtc);
  const estMs = parseUtc(estimated);
  if (plannedMs === null) {
    return { voyageId: voyage.voyageId, plannedArrivalUtc: null, estimatedArrivalUtc: estimated, etaShiftMinutes: null, early: false, confidence, asOfUtc: asOf, sourceType, status: 'missing-baseline', drivers, assumptions: [...assumptions, 'Missing schedule baseline'] };
  }
  if (estMs === null) {
    return { voyageId: voyage.voyageId, plannedArrivalUtc: voyage.plannedArrivalUtc, estimatedArrivalUtc: null, etaShiftMinutes: null, early: false, confidence: 'unknown', asOfUtc: asOf, sourceType, status: 'missing-estimate', drivers, assumptions };
  }
  const shift = Math.round((estMs - plannedMs) / 60_000);
  return {
    voyageId: voyage.voyageId,
    plannedArrivalUtc: toIsoUtc(plannedMs),
    estimatedArrivalUtc: toIsoUtc(estMs),
    etaShiftMinutes: shift,
    early: shift < 0,
    confidence,
    asOfUtc: asOf,
    sourceType,
    status: 'ok',
    drivers,
    assumptions,
  };
}

import type { BerthBooking, Confidence } from '@/core/types';
import { milestoneMs } from './berthTimeline';

/** Indicative waiting at or above this many hours is flagged as a coordination opportunity. */
export const JIT_THRESHOLD_HOURS = 2;
/** Assumed time from pilot boarding to alongside when only a pilot-boarding estimate exists. */
export const PILOTAGE_ALLOWANCE_HOURS = 1;

export type JitStatus = 'opportunity' | 'withinThreshold' | 'unconfirmedSlot' | 'notApplicable';

export interface JitOption {
  id: 'coordinate_slot' | 'assess_speed';
  label: string;
  approval: string;
}

export interface JitResult {
  bookingId: string;
  status: JitStatus;
  /** Forecast arrival alongside: berth estimate, or pilot-boarding estimate + pilotage allowance. */
  forecastArrivalMs: number | null;
  forecastBasis: 'berth estimate' | 'pilot boarding estimate + allowance' | null;
  slotMs: number | null;
  slotBasis: 'planned' | 'requested' | null;
  indicativeWaitHours: number | null;
  thresholdHours: number;
  confidence: Confidence;
  explanation: string;
  assumptions: string[];
  options: JitOption[];
}

const OPTIONS: JitOption[] = [
  { id: 'coordinate_slot', label: 'Coordinate slot timing with the terminal', approval: 'Terminal and port agent confirmation' },
  { id: 'assess_speed', label: 'Assess a voyage speed change', approval: 'Subject to ship, charter, security and regulatory approval; never a speed order' },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Just-in-Time arrival opportunity for one port call at `t`: forecast arrival earlier than the planned (else
 * requested) berth time by at least the threshold. It suggests coordination; it never changes a vessel's speed, and
 * fuel or emission effects are not modelled. A call without a planned or requested slot is "Unconfirmed slot".
 */
export function jitOpportunity(b: BerthBooking, t: number, thresholdHours = JIT_THRESHOLD_HOURS): JitResult {
  const base = { bookingId: b.bookingId, thresholdHours, options: [] as JitOption[] };
  if (milestoneMs(b, 'ARRIVAL', 'ACT', t) !== null || b.status === 'at_berth') {
    return { ...base, status: 'notApplicable', forecastArrivalMs: null, forecastBasis: null, slotMs: null, slotBasis: null, indicativeWaitHours: null, confidence: 'high', explanation: 'Vessel is alongside; arrival timing can no longer be coordinated.', assumptions: [] };
  }
  if (b.status === 'awaiting_berth') {
    return { ...base, status: 'notApplicable', forecastArrivalMs: null, forecastBasis: null, slotMs: null, slotBasis: null, indicativeWaitHours: null, confidence: 'high', explanation: 'Vessel has already arrived and is waiting; the wait is incurred, not avoidable by arrival timing.', assumptions: [] };
  }
  const berthEst = milestoneMs(b, 'ARRIVAL', 'EST', t);
  const pbpEst = milestoneMs(b, 'ARRIVAL', 'EST', t, 'PBP');
  const forecastArrivalMs = berthEst ?? (pbpEst === null ? null : pbpEst + PILOTAGE_ALLOWANCE_HOURS * 3_600_000);
  const forecastBasis = berthEst !== null ? 'berth estimate' : pbpEst !== null ? 'pilot boarding estimate + allowance' : null;
  const assumptions = forecastBasis === 'pilot boarding estimate + allowance' ? [`${PILOTAGE_ALLOWANCE_HOURS} h from pilot boarding to alongside (assumption).`] : [];
  assumptions.push('Fuel, emissions and charter terms are not modelled; no saving is claimed.');
  const pln = milestoneMs(b, 'ARRIVAL', 'PLN', t);
  const req = milestoneMs(b, 'ARRIVAL', 'REQ', t);
  const slotMs = pln ?? req;
  const slotBasis = pln !== null ? 'planned' : req !== null ? 'requested' : null;
  if (forecastArrivalMs === null || slotMs === null) {
    return { ...base, status: 'unconfirmedSlot', forecastArrivalMs, forecastBasis, slotMs, slotBasis, indicativeWaitHours: null, confidence: 'unknown', explanation: slotMs === null ? 'No planned or requested berth time: unconfirmed slot, so no waiting can be computed.' : 'No arrival estimate recorded.', assumptions };
  }
  const wait = round1((slotMs - forecastArrivalMs) / 3_600_000);
  const confidence: Confidence = slotBasis === 'planned' && forecastBasis === 'berth estimate' ? 'medium' : 'low';
  if (wait < thresholdHours) {
    return { ...base, status: 'withinThreshold', forecastArrivalMs, forecastBasis, slotMs, slotBasis, indicativeWaitHours: wait, confidence, explanation: wait < 0 ? `Forecast arrival is ${Math.abs(wait)} h after the ${slotBasis} berth time.` : `Indicative wait ${wait} h is under the ${thresholdHours} h threshold.`, assumptions };
  }
  return {
    ...base,
    status: 'opportunity',
    forecastArrivalMs,
    forecastBasis,
    slotMs,
    slotBasis,
    indicativeWaitHours: wait,
    confidence,
    explanation: `Forecast arrival is ${wait} h before the ${slotBasis} berth time: indicative waiting at anchor.`,
    assumptions,
    options: OPTIONS,
  };
}

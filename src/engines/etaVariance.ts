import type { BerthBooking, BerthMilestone, DcsaClassifier } from '@/core/types';
import { milestoneMs } from './berthTimeline';

export type VarianceMilestone = 'pilotBoarding' | 'berthArrival' | 'berthDeparture';
export type VarianceDirection = 'late' | 'early' | 'onTime' | 'noBaseline' | 'noForecast';

export interface MilestoneVariance {
  milestone: VarianceMilestone;
  label: string;
  forecast: { classifier: Extract<DcsaClassifier, 'EST' | 'ACT'>; atMs: number } | null;
  baseline: { classifier: Extract<DcsaClassifier, 'PLN' | 'REQ'>; atMs: number } | null;
  /** forecast − baseline in hours; `+` late, `−` early. Null when either side is missing. */
  shiftHours: number | null;
  direction: VarianceDirection;
  note: string;
}

/** Within this many hours of the baseline the milestone counts as on time. */
export const ON_TIME_TOLERANCE_HOURS = 0.5;

const MILESTONES: { milestone: VarianceMilestone; label: string; event: BerthMilestone['eventType']; location: BerthMilestone['location'] }[] = [
  { milestone: 'pilotBoarding', label: 'Pilot boarding', event: 'ARRIVAL', location: 'PBP' },
  { milestone: 'berthArrival', label: 'Berth arrival', event: 'ARRIVAL', location: 'BERTH' },
  { milestone: 'berthDeparture', label: 'Berth departure', event: 'DEPARTURE', location: 'BERTH' },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * ETA variance per port-call milestone, comparing a milestone only with the same milestone: berth estimate with
 * planned (else requested) berth, pilot boarding with planned pilot boarding. A berth plan is never compared with a
 * pilot-boarding estimate. Records count only once recorded (`recordedAtUtc ≤ t`), actuals only once they happened.
 */
export function portCallVariance(b: BerthBooking, t: number, toleranceHours = ON_TIME_TOLERANCE_HOURS): MilestoneVariance[] {
  return MILESTONES.map(({ milestone, label, event, location }) => {
    const act = milestoneMs(b, event, 'ACT', t, location);
    const est = milestoneMs(b, event, 'EST', t, location);
    const pln = milestoneMs(b, event, 'PLN', t, location);
    const req = milestoneMs(b, event, 'REQ', t, location);
    const forecast = act !== null ? { classifier: 'ACT' as const, atMs: act } : est !== null ? { classifier: 'EST' as const, atMs: est } : null;
    const baseline = pln !== null ? { classifier: 'PLN' as const, atMs: pln } : req !== null ? { classifier: 'REQ' as const, atMs: req } : null;
    if (!forecast) return { milestone, label, forecast, baseline, shiftHours: null, direction: 'noForecast', note: `No ${label.toLowerCase()} estimate or actual recorded.` };
    if (!baseline) return { milestone, label, forecast, baseline, shiftHours: null, direction: 'noBaseline', note: `No planned or requested ${label.toLowerCase()} time: unconfirmed slot, not availability.` };
    const shiftHours = round1((forecast.atMs - baseline.atMs) / 3_600_000);
    const direction: VarianceDirection = Math.abs(shiftHours) <= toleranceHours ? 'onTime' : shiftHours > 0 ? 'late' : 'early';
    const basis = baseline.classifier === 'PLN' ? 'planned' : 'requested';
    const kind = forecast.classifier === 'ACT' ? 'Actual' : 'Estimate';
    return { milestone, label, forecast, baseline, shiftHours, direction, note: `${kind} vs ${basis} ${label.toLowerCase()}.` };
  });
}

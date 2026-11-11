import { describe, expect, it } from 'vitest';
import { HOUR, parseUtc } from '@/core/time';
import type { BerthBooking, BerthMilestone } from '@/core/types';
import { portCallVariance } from '@/engines/etaVariance';
import { jitOpportunity, JIT_THRESHOLD_HOURS, PILOTAGE_ALLOWANCE_HOURS } from '@/engines/jit';
import { compareRoutes, geodesicNm, ROUTE_CAVEAT } from '@/engines/routeFeasibility';
import { serviceChain } from '@/engines/serviceChain';
import { getSnapshotAt } from '@/engines/snapshot';
import { selectPortCallValue } from '@/selectors/portCall';
import { catalog } from './fixtures';

const c = catalog();
const T = c.anchorMs;
const ms = (iso: string) => parseUtc(iso)!;
const m = (eventType: BerthMilestone['eventType'], location: BerthMilestone['location'], classifier: BerthMilestone['classifier'], atUtc: string, recordedAtUtc = '2026-11-08T00:00:00Z'): BerthMilestone => ({ eventType, location, classifier, atUtc, recordedAtUtc });
const booking = (status: BerthBooking['status'], milestones: BerthMilestone[]): BerthBooking => ({ bookingId: 'BKG-T', portCallId: 'PCL-T', vesselId: 'VSL-T', berthId: null, terminalId: null, status, bufferMinutes: 60, milestones });

describe('Phase 7 gate · VSL-0001 / PCL-0001 at the anchor', () => {
  const snap = getSnapshotAt(c, T);
  const v = selectPortCallValue(c, snap, 'VSL-0001')!;

  it('derives the wait forecast from recorded events', () => {
    expect(v.portCallId).toBe('PCL-0001');
    expect(v.queueSinceUtc).toBe('2026-11-09T04:00:00Z');
    expect(v.anchorageSinceUtc).toBe('2026-11-09T09:15:00Z');
    expect(v.estimatedBerthUtc).toBe('2026-11-10T14:00:00Z');
    expect(v.slotConfirmed).toBe(false);
    expect(v.totalWaitHours).toBe(34);
    expect(v.elapsedHours).toBe(8);
    expect(v.remainingHours).toBe(26);
    expect(v.rows.find((r) => r.key === 'berth')!.value).toMatch(/unconfirmed/);
  });

  it('carries the destination ETA +18 h and $32k/day × 18/24 = $24k exposure with source IDs', () => {
    expect(snap.etas.get('VYG-0001')!.etaShiftMinutes).toBe(18 * 60);
    expect(snap.exposures.get('VYG-0001')!.estimatedUsd).toBe(24_000);
    expect(v.downstream.find((r) => r.key === 'eta')!.value).toBe('+18.0 h');
    expect(v.downstream.find((r) => r.key === 'exposure')!.value).toBe('$24,000');
    expect(v.sourceIds).toEqual(expect.arrayContaining(['PCL-0001', 'EVT-0004', 'EVT-0002', 'EVT-0008']));
    expect(v.asOfText).toBe('Simulated · as of 2026-11-09 12:00 UTC');
  });

  it('never presents the estimate as a slot: unconfirmed berth, no baseline, JIT not applicable while waiting', () => {
    const berth = v.chain.find((s) => s.key === 'berthArrival')!;
    expect(berth.status).toBe('unconfirmed');
    expect(v.variance.find((r) => r.milestone === 'berthArrival')!.value).toBe('No baseline');
    expect(v.jit!.status).toBe('notApplicable');
    expect(v.chain.filter((s) => s.status === 'notInDataset').map((s) => s.key)).toEqual(['towage', 'mooring']);
  });

  it('is time-aware: before the queue event there is no queue, after it the remaining wait shrinks', () => {
    const early = selectPortCallValue(c, getSnapshotAt(c, ms('2026-11-09T03:00:00Z')), 'VSL-0001')!;
    expect(early.queueSinceUtc).toBeNull();
    expect(early.anchorageSinceUtc).toBeNull();
    const later = selectPortCallValue(c, getSnapshotAt(c, T + 6 * HOUR), 'VSL-0001')!;
    expect(later.remainingHours).toBe(20);
    expect(later.elapsedHours).toBe(14);
  });
});

describe('ETA variance compares like with like', () => {
  it('compares berth estimate with planned berth, never with the pilot boarding estimate', () => {
    const b = booking('awaiting_berth', [m('ARRIVAL', 'PBP', 'EST', '2026-11-09T00:00:00Z'), m('ARRIVAL', 'BERTH', 'EST', '2026-11-09T20:00:00Z'), m('ARRIVAL', 'BERTH', 'PLN', '2026-11-09T14:00:00Z')]);
    const [pbp, berth] = portCallVariance(b, T);
    expect(pbp.direction).toBe('noBaseline');
    expect(berth.shiftHours).toBe(6);
    expect(berth.direction).toBe('late');
    expect(berth.baseline!.classifier).toBe('PLN');
  });

  it('falls back to the requested time, respects the on-time tolerance and recordedAt', () => {
    const b = booking('awaiting_berth', [m('ARRIVAL', 'BERTH', 'EST', '2026-11-09T14:20:00Z'), m('ARRIVAL', 'BERTH', 'REQ', '2026-11-09T14:00:00Z'), m('ARRIVAL', 'BERTH', 'PLN', '2026-11-09T10:00:00Z', '2026-11-10T00:00:00Z')]);
    const berth = portCallVariance(b, T)[1];
    expect(berth.baseline!.classifier).toBe('REQ');
    expect(berth.direction).toBe('onTime');
  });
});

describe('JIT opportunity', () => {
  const sched = (plnHoursAfterPbp: number | null) =>
    booking('scheduled', [m('ARRIVAL', 'PBP', 'EST', '2026-11-10T00:00:00Z'), ...(plnHoursAfterPbp === null ? [] : [m('ARRIVAL', 'BERTH', 'PLN', new Date(ms('2026-11-10T00:00:00Z') + plnHoursAfterPbp * HOUR).toISOString())])]);

  it('flags indicative waiting above the threshold, using the pilotage allowance assumption', () => {
    const r = jitOpportunity(sched(9), T);
    expect(r.status).toBe('opportunity');
    expect(r.indicativeWaitHours).toBe(9 - PILOTAGE_ALLOWANCE_HOURS);
    expect(r.forecastBasis).toBe('pilot boarding estimate + allowance');
    expect(r.options.map((o) => o.id)).toEqual(['coordinate_slot', 'assess_speed']);
    expect(r.options[1].approval).toMatch(/never a speed order/);
    expect(r.assumptions.join(' ')).toMatch(/no saving is claimed/);
  });

  it('stays quiet under the threshold and says "Unconfirmed slot" without a plan', () => {
    expect(jitOpportunity(sched(PILOTAGE_ALLOWANCE_HOURS + JIT_THRESHOLD_HOURS - 0.5), T).status).toBe('withinThreshold');
    const u = jitOpportunity(sched(null), T);
    expect(u.status).toBe('unconfirmedSlot');
    expect(u.indicativeWaitHours).toBeNull();
    expect(u.options).toEqual([]);
  });

  it('finds the fixture JIT demo call', () => {
    const demo = c.v2!.scenario.jitDemo!;
    const b = c.v2!.bookingsByVessel.get(demo.vesselId)!.find((x) => x.portCallId === demo.portCallId)!;
    const r = jitOpportunity(b, T);
    expect(r.status).toBe('opportunity');
    expect(r.slotMs).toBe(ms(demo.plannedBerthUtc));
    const v = selectPortCallValue(c, getSnapshotAt(c, T), demo.vesselId)!;
    expect(v.jitText).toMatch(/^Indicative 8.0 h wait/);
  });
});

describe('service chain', () => {
  it('flags a planned berth time that passed without an actual', () => {
    const b = booking('awaiting_berth', [m('ARRIVAL', 'BERTH', 'PLN', '2026-11-09T08:00:00Z'), m('DEPARTURE', 'BERTH', 'PLN', '2026-11-10T08:00:00Z')]);
    const chain = serviceChain(b, T);
    expect(chain.find((s) => s.key === 'berthArrival')!.status).toBe('missed');
    expect(chain.find((s) => s.key === 'berthDeparture')!.status).toBe('planned');
  });

  it('shows cargo in progress once alongside and ignores actuals recorded in the future', () => {
    const b = booking('at_berth', [m('ARRIVAL', 'BERTH', 'ACT', '2026-11-09T06:00:00Z', '2026-11-09T06:05:00Z'), m('DEPARTURE', 'BERTH', 'ACT', '2026-11-09T11:00:00Z', '2026-11-09T13:00:00Z')]);
    const chain = serviceChain(b, T);
    expect(chain.find((s) => s.key === 'cargoOperations')!.status).toBe('inProgress');
    expect(chain.find((s) => s.key === 'berthDeparture')!.status).toBe('unconfirmed');
  });
});

describe('route and weather feasibility', () => {
  const snap = getSnapshotAt(c, T);
  const r = compareRoutes(c, snap, 'VYG-0001')!;

  it('lists the baseline first with geodesic distance, sailing time and the planning caveat', () => {
    expect(r.caveat).toBe(ROUTE_CAVEAT);
    expect(r.candidates[0].isBaseline).toBe(true);
    expect(r.candidates[0].detourNm).toBe(0);
    const base = c.byId.route.get(c.byId.voyage.get('VYG-0001')!.routeId)!;
    expect(r.candidates[0].geodesicNm).toBe(Math.round(geodesicNm(base)));
    expect(r.candidates[0].sailingHours).toBeCloseTo(geodesicNm(base) / r.nominalKn, 0);
  });

  it('marks hazard exposure and never calls a corridor clear without a weather feed', () => {
    for (const cand of r.candidates) expect(['clear', 'caution', 'avoid']).toContain(cand.feasibility);
    const noWx = compareRoutes({ ...c, weatherHazards: [] }, snap, 'VYG-0001')!;
    expect(noWx.candidates.every((x) => x.feasibility === 'unknown' && x.warnings.includes('No weather feed loaded.'))).toBe(true);
  });

  it('is deterministic', () => {
    expect(compareRoutes(c, getSnapshotAt(c, T), 'VYG-0001')).toEqual(r);
  });
});

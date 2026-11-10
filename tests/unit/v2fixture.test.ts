import { describe, expect, it } from 'vitest';
import { parseUtc } from '@/core/time';
import { getSnapshotAt } from '@/engines/snapshot';
import { getVesselAtTime } from '@/engines/tracks';
import { catalog } from './fixtures';

const c = catalog();
const v2 = c.v2!;

describe('fixture v2.0 module', () => {
  it('loads the V2 module and widens the scenario window to 7 days', () => {
    expect(v2).not.toBeNull();
    expect(c.manifest.scenarioVersion).toBe('2.0');
    expect(v2.scenario.window).toEqual({ minUtc: '2026-11-05T12:00:00Z', maxUtc: '2026-11-12T12:00:00Z' });
    expect(c.windowMaxMs - c.windowMinMs).toBe(7 * 24 * 3_600_000);
    expect(c.windowMinMs).toBeLessThanOrEqual(c.replayStartMs);
  });

  it('keeps the flagship set bounded, includes the follow demo and excludes the anchored case vessel', () => {
    expect(v2.flagship.size).toBeGreaterThanOrEqual(10);
    expect(v2.flagship.size).toBeLessThanOrEqual(30);
    expect(v2.flagship.has('VSL-0047')).toBe(true);
    expect(v2.flagship.has('VSL-0001')).toBe(false);
  });

  it('restores the kit VSL-0047 fix and continues it as modelled forecast', () => {
    const fix = getVesselAtTime(c, 'VSL-0047', parseUtc('2026-11-09T11:15:00Z')!);
    expect(fix.state).toBe('exact');
    expect(fix.point!.lon).toBeCloseTo(108.056644, 5);
    expect(fix.point!.lat).toBeCloseTo(3.501864, 5);
    const later = getVesselAtTime(c, 'VSL-0047', parseUtc('2026-11-10T06:00:00Z')!);
    expect(later.state).toBe('modelled');
    expect(later.navStatus).toBe('underway');
    expect(later.point!.lon).toBeGreaterThan(108.06);
  });

  it('reconstructs flagship history before the 12 h base window without calling it observed', () => {
    const early = getVesselAtTime(c, 'VSL-0047', parseUtc('2026-11-07T00:00:00Z')!);
    expect(early.state).toBe('modelled');
    expect(early.freshnessMinutes).toBeNull();
  });

  it('leaves non-flagship vessels unavailable outside the base samples', () => {
    const other = c.vessels.find((v) => !v2.flagship.has(v.vesselId) && v.vesselId !== 'VSL-0001')!;
    expect(getVesselAtTime(c, other.vesselId, parseUtc('2026-11-07T00:00:00Z')!).state).toBe('unavailable');
  });

  it('models the Singapore case as a queued vessel with an unconfirmed berth estimate', () => {
    const snap = getSnapshotAt(c, c.anchorMs);
    expect(snap.fold.queued.get('VSL-0001')).toMatchObject({ portId: 'PRT-SIN', sinceUtc: '2026-11-09T04:00:00Z' });
    expect(snap.fold.berthEstimates.get('VSL-0001')?.confirmed).toBe(false);
    const booking = v2.bookingsByVessel.get('VSL-0001')!;
    expect(booking).toHaveLength(1);
    expect(booking[0].berthId).toBeNull();
    expect(booking[0].milestones.every((m) => m.classifier === 'EST')).toBe(true);
  });

  it('ships a Singapore flagship layout and procedural Rotterdam and Genoa layouts', () => {
    const sin = v2.layoutByPort.get('PRT-SIN')!;
    expect(sin.detail).toBe('flagship');
    expect(sin.terminals.length).toBeGreaterThanOrEqual(3);
    expect(sin.terminals.flatMap((t) => t.berths).every((b) => b.constraintsValidated === false)).toBe(true);
    expect(v2.layoutByPort.get('PRT-RTM')?.detail).toBe('procedural');
    expect(v2.layoutByPort.get('PRT-GOA')?.detail).toBe('procedural');
  });
});

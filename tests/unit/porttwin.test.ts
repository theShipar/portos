import { describe, expect, it } from 'vitest';
import { bearingDeg, haversineDistanceNm } from '@/core/geo';
import { HOUR, parseUtc } from '@/core/time';
import type { BerthBooking, BerthMilestone } from '@/core/types';
import { berthTimeline, bookingWindow, milestoneMs } from '@/engines/berthTimeline';
import { getSnapshotAt } from '@/engines/snapshot';
import { buildVesselMarkers } from '@/selectors/mapLayers';
import { buildPortTwin, landwardBearing, mooredPose } from '@/selectors/portTwin';
import { berthCardView, berthGanttView, ganttWindow } from '@/selectors/berthGantt';
import { defaultViewMode } from '@/core/scope';
import { twinPredicate, viewModeQuery } from '@/router/navigation';
import { catalog } from './fixtures';

const T0 = parseUtc('2026-11-09T12:00:00Z')!;
const iso = (h: number) => new Date(T0 + h * HOUR).toISOString().replace('.000Z', 'Z');
const m = (eventType: BerthMilestone['eventType'], classifier: BerthMilestone['classifier'], atH: number, recH = -1): BerthMilestone => ({
  eventType,
  location: 'BERTH',
  classifier,
  atUtc: iso(atH),
  recordedAtUtc: iso(recH),
});
const booking = (id: string, milestones: BerthMilestone[], status: BerthBooking['status'] = 'scheduled'): BerthBooking => ({
  bookingId: id,
  portCallId: `PCL-${id}`,
  vesselId: `VSL-${id}`,
  berthId: 'B1',
  terminalId: 'T1',
  status,
  bufferMinutes: 60,
  milestones,
});

describe('berth timeline engine (DCSA classifiers kept apart)', () => {
  const alongside = booking('A', [m('ARRIVAL', 'ACT', -20, -20), m('DEPARTURE', 'PLN', 4), m('DEPARTURE', 'EST', 5)], 'at_berth');
  const nextPlanned = booking('B', [m('ARRIVAL', 'REQ', 3), m('ARRIVAL', 'PLN', 5.5), m('DEPARTURE', 'PLN', 20), m('ARRIVAL', 'EST', 6), m('DEPARTURE', 'EST', 21)]);

  it('draws actual to now, then planned and forecast tails, and marks the berth occupied', () => {
    const row = berthTimeline('B1', [alongside, nextPlanned], T0);
    const a = row.bars.filter((b) => b.bookingId === 'A');
    expect(a.map((b) => b.kind).sort()).toEqual(['actual', 'forecast', 'planned']);
    const act = a.find((b) => b.kind === 'actual')!;
    expect(act).toMatchObject({ startMs: T0 - 20 * HOUR, endMs: T0, open: true });
    expect(a.find((b) => b.kind === 'planned')).toMatchObject({ startMs: T0, endMs: T0 + 4 * HOUR });
    expect(a.find((b) => b.kind === 'forecast')).toMatchObject({ startMs: T0, endMs: T0 + 5 * HOUR });
    expect(row.occupancy).toBe('occupied');
    expect(row.occupantVesselId).toBe('VSL-A');
    expect(row.requested).toEqual([{ bookingId: 'B', vesselId: 'VSL-B', atMs: T0 + 3 * HOUR }]);
    expect(row.next).toMatchObject({ bookingId: 'B', startMs: T0 + 5.5 * HOUR, basis: 'planned' });
  });

  it('flags a planned overlap including the turnaround buffer, and a forecast overrun, never as validated', () => {
    const row = berthTimeline('B1', [alongside, nextPlanned], T0);
    // Planned: A leaves 4 h + 60 min buffer = 5 h < B planned 5.5 h → no planned conflict. Forecast: A 5 h + 1 h > B 6 h? No (equal).
    expect(row.conflicts).toEqual([]);
    const tight = booking('C', [m('ARRIVAL', 'PLN', 4.5), m('DEPARTURE', 'PLN', 10), m('ARRIVAL', 'EST', 4.5), m('DEPARTURE', 'EST', 10)]);
    const r2 = berthTimeline('B1', [alongside, tight], T0);
    expect(r2.conflicts.map((c) => c.basis)).toEqual(['planned']);
    expect(r2.conflicts[0]).toMatchObject({ bookingIds: ['A', 'C'], startMs: T0 + 4.5 * HOUR, endMs: T0 + 5 * HOUR, validated: false });
    const late = booking('D', [m('ARRIVAL', 'PLN', 5.2), m('DEPARTURE', 'PLN', 10), m('ARRIVAL', 'EST', 5.2), m('DEPARTURE', 'EST', 10)]);
    const r3 = berthTimeline('B1', [alongside, late], T0);
    expect(r3.conflicts.map((c) => c.basis)).toEqual(['forecast']);
  });

  it('only knows milestones recorded by t, and actuals that already happened', () => {
    const b = booking('E', [m('ARRIVAL', 'PLN', 2, 1), m('DEPARTURE', 'PLN', 8, 1), m('ARRIVAL', 'ACT', 3, 3)]);
    expect(milestoneMs(b, 'ARRIVAL', 'PLN', T0)).toBeNull();
    expect(milestoneMs(b, 'ARRIVAL', 'PLN', T0 + 1 * HOUR)).toBe(T0 + 2 * HOUR);
    expect(milestoneMs(b, 'ARRIVAL', 'ACT', T0 + 2 * HOUR)).toBeNull();
    expect(berthTimeline('B1', [b], T0).bars).toEqual([]);
    expect(berthTimeline('B1', [b], T0 + 4 * HOUR).occupancy).toBe('occupied');
  });

  it('keeps an overstaying ship on the berth until now and reports it overdue', () => {
    const over = booking('F', [m('ARRIVAL', 'ACT', -30, -30), m('DEPARTURE', 'PLN', -6), m('DEPARTURE', 'EST', -2)], 'at_berth');
    const row = berthTimeline('B1', [over], T0);
    expect(row.overdue).toBe(true);
    expect(bookingWindow(over, 'planned', T0)).toEqual({ startMs: T0 - 30 * HOUR, endMs: T0 });
  });
});

describe('Singapore port twin (fixture)', () => {
  const c = catalog();
  const twin = buildPortTwin(c, 'PRT-SIN', c.anchorMs)!;

  it('meets the spec 07 floor: 2+ terminals, 6+ berths, 2 anchorages, declared yard counts', () => {
    expect(twin.detail).toBe('flagship');
    expect(twin.terminals.length).toBeGreaterThanOrEqual(2);
    expect(twin.berths.length).toBeGreaterThanOrEqual(6);
    expect(twin.anchorages.length).toBeGreaterThanOrEqual(2);
    for (const t of twin.terminals) expect(t.yardContainers).toBeGreaterThan(0);
    expect(twin.caption).toMatch(/Illustrative terminal configuration/);
  });

  it('puts terminal yards on the land side of each quay', () => {
    for (const t of twin.terminals) {
      expect(t.landwardDeg).toBe(landwardBearing({ quayBearingDeg: t.quayBearingDeg, landSide: 'north' }));
      const back = t.footprint[t.quayLine.length]!;
      const quayEnd = t.quayLine[t.quayLine.length - 1]!;
      expect(back.lat).toBeGreaterThan(quayEnd.lat);
      expect(haversineDistanceNm(back, quayEnd) * 1852).toBeCloseTo(t.yardDepthM, -1);
    }
  });

  it('shows a visible berth conflict ahead of now and reports berth states from the timeline', () => {
    const ahead = twin.conflicts.filter((x) => x.endMs > c.anchorMs);
    expect(ahead.length).toBeGreaterThan(0);
    expect(ahead.every((x) => x.validated === false)).toBe(true);
    expect(twin.berths.find((b) => b.berthId === 'BRH-SIN-C-3')!.status).toBe('unavailable');
    expect(twin.berths.filter((b) => b.status === 'occupied').length).toBeGreaterThanOrEqual(6);
  });

  it('moors each alongside ship off the quay edge, parallel to the quay, and the markers use that pose', () => {
    expect(twin.moored.length).toBeGreaterThanOrEqual(6);
    const markers = new Map(buildVesselMarkers(c, getSnapshotAt(c, c.anchorMs)).map((mk) => [mk.vesselId, mk]));
    for (const p of twin.moored) {
      const b = twin.berths.find((x) => x.berthId === p.berthId)!;
      const off = bearingDeg(b.center, p.point);
      expect(Math.abs(((off - b.seawardDeg + 540) % 360) - 180)).toBeLessThan(1);
      const along = Math.abs(((p.headingDeg - b.quayBearingDeg + 540) % 360) - 180);
      expect(along < 1 || along > 179).toBe(true);
      const mk = markers.get(p.vesselId)!;
      expect(mk.berthHeadingDeg).toBe(p.headingDeg);
      expect(mk.point).toEqual(p.point);
    }
  });

  it('is deterministic per vessel and stays clear of the berth line by half a beam plus fenders', () => {
    const b = twin.berths[0]!;
    const a = mooredPose(b, 'VSL-0253', 48);
    expect(mooredPose(b, 'VSL-0253', 48)).toEqual(a);
    expect(haversineDistanceNm(b.center, a.point) * 1852).toBeCloseTo(28, 0);
  });

  it('builds procedural twins for Rotterdam and Genoa only; other ports have none', () => {
    expect(buildPortTwin(c, 'PRT-RTM', c.anchorMs)?.detail).toBe('procedural');
    expect(buildPortTwin(c, 'PRT-GOA', c.anchorMs)?.detail).toBe('procedural');
    expect(buildPortTwin(c, 'PRT-SHA', c.anchorMs)).toBeNull();
  });
});

describe('berth schedule and card read models', () => {
  const c = catalog();
  const twin = buildPortTwin(c, 'PRT-SIN', c.anchorMs)!;

  it('opens a window with a quarter of it before the instant, on the hour', () => {
    const w = ganttWindow(c.anchorMs, 48);
    expect(w.endMs - w.startMs).toBe(48 * HOUR);
    expect(w.startMs % HOUR).toBe(0);
    expect(c.anchorMs - w.startMs).toBe(12 * HOUR);
    expect(berthGanttView(c, twin, c.anchorMs, 48).nowPct).toBeCloseTo(25, 6);
  });

  it('keeps actual, planned and forecast bars apart and inside the window', () => {
    const g = berthGanttView(c, twin, c.anchorMs, 48);
    expect(g.rows).toHaveLength(10);
    const kinds = new Set(g.rows.flatMap((r) => r.bars.map((b) => b.kind)));
    expect([...kinds].sort()).toEqual(['actual', 'forecast', 'planned']);
    for (const b of g.rows.flatMap((r) => r.bars)) {
      expect(b.leftPct).toBeGreaterThanOrEqual(0);
      expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100.0001);
    }
    const open = g.rows.flatMap((r) => r.bars).filter((b) => b.open);
    expect(open.length).toBeGreaterThanOrEqual(6);
    for (const b of open) expect(b.leftPct + b.widthPct).toBeCloseTo(g.nowPct, 4);
  });

  it('shows the planned and forecast overlaps, labelled not yet validated', () => {
    const g = berthGanttView(c, twin, c.anchorMs, 48);
    expect(g.conflictCount).toBe(2);
    const w4 = g.rows.find((r) => r.berthId === 'BRH-SIN-W-4')!;
    expect(w4.conflicts[0].basis).toBe('planned');
    expect(w4.conflicts[0].title).toMatch(/not yet validated$/);
    expect(g.note).toMatch(/^Not yet validated/);
    expect(berthGanttView(c, twin, c.anchorMs, 24).ticks.length).toBeGreaterThan(berthGanttView(c, twin, c.anchorMs, 72).ticks.length);
  });

  it('builds the berth card from the same timeline', () => {
    const card = berthCardView(c, twin, 'BRH-SIN-W-4')!;
    expect(card.status).toBe('occupied');
    expect(card.occupant?.vesselId).toBe(twin.berths.find((b) => b.berthId === 'BRH-SIN-W-4')!.occupantVesselId);
    expect(card.next?.basisLabel).toBe('planned');
    expect(card.conflicts).toHaveLength(1);
    expect(card.facts.map((f) => f.label)).toEqual(['Quay length', 'Depth (illustrative)', 'STS cranes']);
    expect(berthCardView(c, twin, 'BRH-SIN-C-3')!.facts[2].value).toBe('None');
    expect(berthCardView(c, twin, 'BRH-NOPE')).toBeNull();
  });

  it('opens twin ports in 3D and others in 2D', () => {
    const hasTwin = twinPredicate(c);
    const sin = { level: 'port', regionId: 'REG-SEA', portId: 'PRT-SIN' } as const;
    const sha = { level: 'port', regionId: 'REG-EAS', portId: 'PRT-SHA' } as const;
    expect(defaultViewMode(sin, hasTwin)).toBe('3d');
    expect(defaultViewMode(sha, hasTwin)).toBe('2d');
    expect(viewModeQuery(sin, '3d', hasTwin)).toBeNull();
    expect(viewModeQuery(sin, '2d', hasTwin)).toBe('2d');
    expect(viewModeQuery(sha, '3d', hasTwin)).toBe('3d');
  });
});

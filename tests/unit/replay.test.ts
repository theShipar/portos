import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { formatLocal, formatUtc } from '@/core/format';
import { parseUtc, toIsoUtc } from '@/core/time';
import { STAGE_FROM_FIXTURE } from '@/core/caseStage';
import type { CaseStage, Incident, IncidentStatus } from '@/core/types';
import { emptyFold, foldEvents } from '@/engines/fold';
import { getSnapshotAt, incidentStatusAt, type Snapshot } from '@/engines/snapshot';
import { buildVesselInspector } from '@/selectors/vessel';
import { compareWithNow, currentMarker, densityBins, railMarkers, stepMarker } from '@/selectors/replay';
import { useClockStore } from '@/stores/clock';
import { reduceWorkflow, type WorkflowContext } from '@/workflows/reducer';
import { emptyWorkflow } from '@/workflows/types';
import { catalog } from './fixtures';

const c = catalog();
const START = c.replayStartMs;
const NOW = c.anchorMs;
const at = (hhmm: string) => Date.parse(`2026-11-09T${hhmm}:00Z`);
const record = (id: string) => c.byId.incident.get(id);

/** The pre-fold timestamp rule from the incident record fields (fixture vocabulary, mapped to V2 stages). */
function recordStatusAt(i: Incident, t: number): { visible: boolean; status: CaseStage; ownerUserId: string | null } {
  const r = recordFixtureStatusAt(i, t);
  return { ...r, status: r.visible ? STAGE_FROM_FIXTURE[r.status] : 'detected' };
}

function recordFixtureStatusAt(i: Incident, t: number): { visible: boolean; status: IncidentStatus; ownerUserId: string | null } {
  const opened = parseUtc(i.openedAtUtc) ?? 0;
  const ack = parseUtc(i.acknowledgedAtUtc);
  const res = parseUtc(i.resolvedAtUtc);
  if (t < opened) return { visible: false, status: 'open', ownerUserId: null };
  if (res !== null && t >= res) return { visible: true, status: 'resolved', ownerUserId: i.ownerUserId };
  if (ack !== null && t >= ack) {
    const progressed = ['investigating', 'mitigation_planned', 'monitoring'].includes(i.status) && t >= ack + 60_000;
    return { visible: true, status: progressed ? i.status : 'acknowledged', ownerUserId: i.ownerUserId };
  }
  return { visible: true, status: 'open', ownerUserId: null };
}

/** Everything the replay pass condition names: position, ETA, queue, weather and incidents. */
function fingerprint(s: Snapshot) {
  return JSON.stringify({
    vessels: [...s.vessels].map(([id, v]) => [id, v.state, v.point, v.sourceTimeMs]),
    etas: [...s.etas].map(([id, e]) => [id, e.estimatedArrivalUtc, e.etaShiftMinutes, e.confidence]),
    exposures: [...s.exposures].map(([id, e]) => [id, e.estimatedUsd]),
    incidents: [...s.incidents].map(([id, i]) => [id, i.visible, i.status, i.ownerUserId]),
    hazards: [...s.hazards],
    risks: [...s.risks].map(([id, r]) => [id, r.score]),
    portWait: [...s.portWait],
    anchored: [...s.fold.anchored].map(([p, set]) => [p, [...set].sort()]),
    berths: [...s.fold.berths],
  });
}

const sampleTimes = (() => {
  const set = new Set<number>([START, NOW]);
  for (const ms of c.eventMs.values()) for (const d of [-1, 0, 1]) if (ms + d >= START && ms + d <= NOW) set.add(ms + d);
  return [...set].sort((a, b) => a - b);
})();

describe('event fold', () => {
  it('matches the incident record timestamps at every event boundary', () => {
    for (const t of sampleTimes) {
      for (const inc of c.incidents) {
        const { visible, status, ownerUserId } = incidentStatusAt(c, inc, t);
        expect({ visible, status, ownerUserId }, `${inc.incidentId} @ ${toIsoUtc(t)}`).toEqual(recordStatusAt(inc, t));
      }
    }
  });

  it('matches the previous port-wait scan at every event boundary', () => {
    for (const t of sampleTimes) {
      const expected = new Map<string, number>();
      for (const e of c.events) if (e.type === 'PORT_WAIT_UPDATED' && (c.eventMs.get(e.eventId) ?? Infinity) <= t) expected.set(e.payload.portId as string, e.payload.waitingEstimateHours as number);
      const got = foldEvents(emptyFold(), c.events, t, record).portWait;
      expect(new Map([...got].map(([k, v]) => [k, v.hours]))).toEqual(expected);
    }
  });

  it('is pure and independent of input order', () => {
    const before = JSON.stringify(c.events);
    const sorted = foldEvents(emptyFold(), c.events, at('10:00'), record);
    const shuffled = [...c.events].reverse();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (i * 7919) % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const fromShuffle = foldEvents(emptyFold(), shuffled, at('10:00'), record);
    expect(JSON.stringify(c.events)).toBe(before);
    expect(fromShuffle.applied).toBe(sorted.applied);
    expect(fromShuffle.lastEventId).toBe(sorted.lastEventId);
    expect([...fromShuffle.incidents]).toEqual([...sorted.incidents]);
    expect([...fromShuffle.portWait]).toEqual([...sorted.portWait]);
    expect([...fromShuffle.etaShift]).toEqual([...sorted.etaShift]);
  });

  it('applies events with the same timestamp in event-id order', () => {
    const fold = foldEvents(emptyFold(), c.events, NOW, record);
    expect(fold.applied).toBe(c.events.length);
    const last = [...c.events].sort((a, b) => (a.occurredAtUtc === b.occurredAtUtc ? (a.eventId < b.eventId ? -1 : 1) : a.occurredAtUtc < b.occurredAtUtc ? -1 : 1)).at(-1);
    expect(fold.lastEventId).toBe(last?.eventId);
  });

  it('never folds a base state backwards: an empty base before replay start applies nothing', () => {
    const fold = foldEvents(emptyFold(), c.events, START - 1, record);
    expect(fold.applied).toBe(0);
    expect(fold.incidents.size).toBe(0);
  });
});

describe('deterministic snapshots', () => {
  it('returns identical values for the same instant, run twice', () => {
    for (const t of [START, at('06:00'), at('09:00'), at('10:59'), at('11:22'), NOW]) {
      expect(fingerprint(getSnapshotAt(c, t))).toBe(fingerprint(getSnapshotAt(c, t)));
    }
  });

  it('scrubbing back and forward restores the same values', () => {
    const at1059 = fingerprint(getSnapshotAt(c, at('10:59')));
    getSnapshotAt(c, START);
    getSnapshotAt(c, NOW);
    getSnapshotAt(c, at('03:17'));
    expect(fingerprint(getSnapshotAt(c, at('10:59')))).toBe(at1059);
  });

  it('VYG-0001 reaches +18 h at the 09:00 revision and is +8 h just before', () => {
    expect(getSnapshotAt(c, at('09:00')).etas.get('VYG-0001')?.etaShiftMinutes).toBe(18 * 60);
    expect(getSnapshotAt(c, at('09:00') - 60_000).etas.get('VYG-0001')?.etaShiftMinutes).toBe(8 * 60);
  });

  it('INC-0001 appears at 10:59 and not before; the Singapore wait moves 14 h → 26 h at 11:22', () => {
    expect(getSnapshotAt(c, at('10:58')).incidents.get('INC-0001')?.visible).toBe(false);
    expect(getSnapshotAt(c, at('10:59')).incidents.get('INC-0001')?.visible).toBe(true);
    expect(getSnapshotAt(c, at('11:21')).portWait.get('PRT-SIN')?.hours).toBe(14);
    expect(getSnapshotAt(c, at('11:22')).portWait.get('PRT-SIN')?.hours).toBe(26);
  });

  it('jumping to the INC-0001 marker shows a consistent vessel, ETA and port picture', () => {
    const s = getSnapshotAt(c, at('10:59'));
    expect(s.incidents.get('INC-0001')?.status).toBe('untriaged');
    expect(s.etas.get('VYG-0001')?.etaShiftMinutes).toBe(18 * 60);
    expect(s.fold.anchored.get('PRT-SIN')?.has('VSL-0001')).toBe(true);
    expect(s.vessels.get('VSL-0001')?.point).not.toBeNull();
    expect(s.portWait.get('PRT-SIN')?.hours).toBe(14);
  });

  it('never shows a resolved case before its first detection', () => {
    const caseTimes = c.events.filter((e) => e.type.startsWith('INCIDENT_')).flatMap((e) => [c.eventMs.get(e.eventId)! - 1, c.eventMs.get(e.eventId)!]);
    for (const t of [START, ...caseTimes, NOW]) {
      const s = getSnapshotAt(c, t);
      for (const inc of c.incidents) {
        const st = s.incidents.get(inc.incidentId)!;
        const opened = parseUtc(inc.openedAtUtc)!;
        if (t < opened) expect(st.visible, `${inc.incidentId} @ ${toIsoUtc(t)}`).toBe(false);
        if (st.status === 'resolved') expect(t).toBeGreaterThanOrEqual(opened);
      }
    }
  });

  it('labels a vessel "Not yet tracked" before its first report', () => {
    const v = [...c.tracks].find(([, pts]) => pts[0].t > START);
    expect(v).toBeDefined();
    const [vesselId, pts] = v!;
    const before = buildVesselInspector(c, getSnapshotAt(c, pts[0].t - 60_000), vesselId)!;
    expect(before.positionLabel).toMatch(/^Not yet tracked · first report \d\d:\d\d UTC$/);
    const after = buildVesselInspector(c, getSnapshotAt(c, pts[0].t), vesselId)!;
    expect(after.positionLabel).not.toMatch(/Not yet tracked/);
  });

  it('getSnapshotAt stays within a frame budget for scrubbing', () => {
    const N = 60;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) getSnapshotAt(c, START + ((NOW - START) * i) / N);
    const per = (performance.now() - t0) / N;
    console.info(`getSnapshotAt: ${per.toFixed(2)} ms per call over ${N} scrub positions`);
    expect(per).toBeLessThan(50);
  });
});

describe('replay rail', () => {
  it('builds the same markers in the same order on repeated runs', () => {
    const a = railMarkers(c, { kind: 'vessel', id: 'VSL-0001' }, null, START, NOW);
    const b = railMarkers(c, { kind: 'vessel', id: 'VSL-0001' }, null, START, NOW);
    expect(a).toEqual(b);
    expect(a.map((m) => m.eventId)).toEqual(expect.arrayContaining(['EVT-0001', 'EVT-0002', 'EVT-0003', 'EVT-0004', 'EVT-0007', 'EVT-0008', 'EVT-0009']));
    for (let i = 1; i < a.length; i++) expect(a[i].ms).toBeGreaterThanOrEqual(a[i - 1].ms);
  });

  it('shows case openings and storm warnings with nothing selected', () => {
    const m = railMarkers(c, null, null, START, NOW);
    expect(m.length).toBe(c.events.filter((e) => e.type === 'INCIDENT_OPENED' || e.type === 'WEATHER_WARNING_ISSUED').length);
    expect(m.every((x) => x.category === 'case' || x.category === 'weather')).toBe(true);
  });

  it('steps between markers and finds the marker in force', () => {
    const m = railMarkers(c, { kind: 'incident', id: 'INC-0001' }, null, START, NOW);
    const inc = m.find((x) => x.eventId === 'EVT-0003')!;
    expect(currentMarker(m, at('11:00'))?.eventId).toBe('EVT-0003');
    expect(stepMarker(m, inc.ms, 1)!.ms).toBeGreaterThan(inc.ms);
    expect(stepMarker(m, inc.ms, -1)!.ms).toBeLessThan(inc.ms);
    expect(stepMarker(m, NOW, 1)).toBeNull();
  });

  it('density bins cover the window and count every event once', () => {
    const bins = densityBins(c, START, NOW);
    expect(bins.length).toBe(24);
    expect(bins.reduce((n, b) => n + b.count, 0)).toBe(c.events.filter((e) => (c.eventMs.get(e.eventId) ?? 0) >= START && (c.eventMs.get(e.eventId) ?? 0) <= NOW).length);
    expect(Math.max(...bins.map((b) => b.level))).toBe(1);
  });

  it('compares the replay moment with Now from the same snapshot function', () => {
    const rows = compareWithNow(c, getSnapshotAt(c, at('08:00')), getSnapshotAt(c, NOW), { kind: 'incident', id: 'INC-0001' });
    const caseRow = rows.find((r) => r.label.includes('INC-0001'));
    expect(caseRow?.then).toBe('Not yet detected');
    expect(caseRow?.changed).toBe(true);
    const eta = rows.find((r) => r.label === 'ETA shift');
    expect(eta?.then).not.toBe(eta?.now);
    const same = compareWithNow(c, getSnapshotAt(c, NOW), getSnapshotAt(c, NOW), null);
    expect(same.length).toBeGreaterThan(0);
    expect(same.every((r) => !r.changed)).toBe(true);
  });
});

describe('historical notes', () => {
  const ctx = (userId: string, simNowMs: number): WorkflowContext => ({
    actor: c.byId.user.get(userId) ?? null,
    users: c.byId.user,
    simNowMs,
    simNowIso: toIsoUtc(simNowMs),
    wallNowIso: '2026-11-09T20:00:00Z',
    baseIncident: (id) => {
      const inc = c.byId.incident.get(id);
      return inc ? { ...incidentStatusAt(c, inc, NOW), severity: inc.severity } : null;
    },
    incidentRefs: (id) => [{ kind: 'incident', id }],
    needsVerification: () => false,
  });

  it('records a note against a historical instant without touching any case', () => {
    const r = reduceWorkflow(emptyWorkflow(), { type: 'history.note', text: 'Wait jumped here', entityRefs: [{ kind: 'incident', id: 'INC-0001' }] }, ctx('USR-005', at('11:22')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.incidents).toEqual({});
    expect(r.audit.actionType).toBe('history.note');
    expect(r.audit.summary).toContain('11:22 UTC');
    expect(r.undoable).toBe(false);
  });

  it('rejects empty notes and viewers', () => {
    expect(reduceWorkflow(emptyWorkflow(), { type: 'history.note', text: '  ', entityRefs: [] }, ctx('USR-005', at('11:22'))).ok).toBe(false);
    expect(reduceWorkflow(emptyWorkflow(), { type: 'history.note', text: 'x', entityRefs: [] }, ctx('USR-004', at('11:22'))).ok).toBe(false);
  });
});

describe('replay clock and time display', () => {
  it('clamps out-of-range seeks to the scenario window', () => {
    setActivePinia(createPinia());
    const clock = useClockStore();
    clock.configure({ anchorMs: NOW, minMs: START, maxMs: NOW + 6 * 3_600_000, dataVersion: 'test' });
    expect(clock.seek('2026-11-08T12:00:00Z')).toBe(true);
    expect(clock.timeMs).toBe(START);
    expect(clock.phase).toBe('history');
    clock.seek('2026-11-10T00:00:00Z');
    expect(clock.timeMs).toBe(NOW + 6 * 3_600_000);
    expect(clock.phase).toBe('simulation');
    clock.reset();
    expect(clock.phase).toBe('now');
    expect(clock.seek('not a time')).toBe(false);
    expect(clock.timeMs).toBe(NOW);
  });

  it('keeps UTC explicit across a DST change and a local day boundary', () => {
    expect(formatLocal('2026-10-25T00:30:00Z', 'Europe/Amsterdam')).toBe('2026-10-25 02:30 local');
    expect(formatLocal('2026-10-25T01:30:00Z', 'Europe/Amsterdam')).toBe('2026-10-25 02:30 local');
    expect(formatUtc('2026-10-25T00:30:00Z')).not.toBe(formatUtc('2026-10-25T01:30:00Z'));
    expect(formatLocal('2026-11-09T16:30:00Z', 'Asia/Singapore')).toBe('2026-11-10 00:30 local');
    expect(formatUtc('2026-11-09T16:30:00Z')).toBe('2026-11-09 16:30 UTC');
  });
});

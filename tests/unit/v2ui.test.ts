import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYERS, groupState, LAYER_GROUPS, LAYERS } from '@/core/layers';
import { selectKpis } from '@/engines/kpis';
import { compareScenarios, defaultScenarioInputs } from '@/engines/scenario';
import { getSnapshotAt } from '@/engines/snapshot';
import { berthMiniGantt } from '@/selectors/berthGantt';
import { DECISION_COLUMNS_MAX, decisionCompareView, NOT_CONFIRMED_TEXT } from '@/selectors/decisionCompare';
import { KPI_RAIL_MAX, kpiRailCells } from '@/selectors/kpiRail';
import { buildPortTwin } from '@/selectors/portTwin';
import { NO_CASES_TEXT, QUEUE_TOP_N, queueHeadline } from '@/selectors/queue';
import { selectPortCallValue } from '@/selectors/portCall';
import { railBookmarks } from '@/selectors/replay';
import { buildVesselInspector } from '@/selectors/vessel';
import { actionableEvents, peekDeltas, PRIORITY_MAX, routeProgress, vesselPriorities } from '@/selectors/vesselBrief';
import { catalog } from './fixtures';

const c = catalog();
const T = c.anchorMs;
const snap = getSnapshotAt(c, T);

describe('Phase 8 · layer palette groups', () => {
  it('puts every layer in exactly one of Traffic / Ports / Weather / Risk / Plans', () => {
    expect(LAYER_GROUPS.map((g) => g.label)).toEqual(['Traffic', 'Ports', 'Weather', 'Risk', 'Plans']);
    const ids = LAYER_GROUPS.flatMap((g) => g.layers);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(LAYERS.map((l) => l.id).sort());
  });

  it('reports scope availability: port-only layers are not offered at Earth', () => {
    const ports = LAYER_GROUPS.find((g) => g.id === 'ports')!;
    expect(groupState(ports, 'earth', DEFAULT_LAYERS).available).toEqual(['ports']);
    expect(groupState(ports, 'port', DEFAULT_LAYERS).available).toEqual(['ports', 'anchorage', 'berths']);
    const off = { ...DEFAULT_LAYERS, weather: false };
    expect(groupState(LAYER_GROUPS.find((g) => g.id === 'weather')!, 'region', off).on).toBe(false);
  });
});

describe('Phase 8 · density caps and copy', () => {
  it('KPI rail shows at most four values with tracked · in scope context', () => {
    const cells = kpiRailCells(selectKpis(c, snap));
    expect(cells.length).toBeLessThanOrEqual(KPI_RAIL_MAX);
    expect(KPI_RAIL_MAX).toBe(4);
    expect(cells[0].contextText).toMatch(/^tracked · \d+ in scope$/);
  });

  it('incident ribbon shows three cases and the empty copy', () => {
    expect(QUEUE_TOP_N).toBe(3);
    expect(queueHeadline(0)).toBe(NO_CASES_TEXT);
    expect(NO_CASES_TEXT).toBe('No actionable cases in this scope');
    expect(queueHeadline(1)).toBe('1 actionable case');
  });
});

describe('Phase 8 · vessel inspector brief (VSL-0001)', () => {
  const model = buildVesselInspector(c, snap, 'VSL-0001')!;
  const pc = selectPortCallValue(c, snap, 'VSL-0001');

  it('caps priorities at three, case first', () => {
    const p = vesselPriorities(model, pc);
    expect(p.length).toBeGreaterThan(0);
    expect(p.length).toBeLessThanOrEqual(PRIORITY_MAX);
    expect(p[0].key).toBe('incident');
    expect(p[0].label).toContain('INC-0001');
  });

  it('route progress stays within 0–1 and names the basis', () => {
    const rp = routeProgress(c, snap, 'VSL-0001')!;
    expect(rp.progress).toBeGreaterThanOrEqual(0);
    expect(rp.progress).toBeLessThanOrEqual(1);
    expect(rp.progressPct).toBe(Math.round(rp.progress * 100));
    expect(['position', 'fixture', 'notDeparted']).toContain(rp.basis);
  });

  it('actionable events carry a seekable time; the peek has one or two deltas', () => {
    for (const e of actionableEvents(c, model)) expect(Number.isFinite(e.ms) && e.ms <= T).toBe(true);
    const d = peekDeltas(model);
    expect(d.length).toBeGreaterThanOrEqual(1);
    expect(d.length).toBeLessThanOrEqual(2);
    expect(d[0].label).toBe('ETA +18.0 h');
  });
});

describe('Phase 8 · decision compare', () => {
  const inputs = defaultScenarioInputs(c, snap, 'VYG-0001')!;
  const cmp = compareScenarios(c, snap, 'VYG-0001', inputs)!;
  const v = decisionCompareView(cmp)!;

  it('shows the original plan plus up to two proposals, never a confirmed outcome', () => {
    expect(v.columns.length).toBeGreaterThanOrEqual(2);
    expect(v.columns.length).toBeLessThanOrEqual(DECISION_COLUMNS_MAX);
    expect(v.columns[0].role).toBe('original');
    expect(v.columns.slice(1).every((col) => col.role === 'proposed' && /simulated/.test(col.roleLabel))).toBe(true);
    expect(v.footnote).toBe(NOT_CONFIRMED_TEXT);
    expect(JSON.stringify(v)).not.toMatch(/confirmed outcome|guaranteed/i);
  });

  it('delta bars are signed against the baseline and bounded to half the chart', () => {
    for (const col of v.columns.slice(1)) {
      for (const b of [col.delayBar, col.exposureBar]) {
        expect(b.widthPct).toBeGreaterThanOrEqual(0);
        expect(b.widthPct).toBeLessThanOrEqual(50);
        if (b.delta !== null && b.delta < 0) expect(b.direction).toBe('better');
        if (b.delta !== null && b.delta > 0) expect(b.direction).toBe('worse');
      }
    }
  });
});

describe('Phase 8 · port inspector mini-Gantt and replay bookmarks', () => {
  it('splits one berth into actual / planned / forecast lanes', () => {
    const twin = buildPortTwin(c, 'PRT-SIN', T)!;
    const mini = berthMiniGantt(c, twin, T, 'BRH-SIN-W-4')!;
    expect(mini.lanes.map((l) => l.kind)).toEqual(['actual', 'planned', 'forecast']);
    expect(mini.lanes.every((l) => l.bars.every((b) => b.kind === l.kind))).toBe(true);
    expect(mini.nowPct).toBeGreaterThanOrEqual(0);
    expect(berthMiniGantt(c, twin, T, 'BRH-NOPE')).toBeNull();
  });

  it('bookmarks only notes and decisions inside the range, in time order', () => {
    const audit = [
      { auditId: 'A2', actionType: 'history.note', simulatedContextTimeUtc: '2026-11-09T10:00:00Z', summary: 'note' },
      { auditId: 'A1', actionType: 'branch.propose', simulatedContextTimeUtc: '2026-11-09T08:00:00Z', summary: 'branch' },
      { auditId: 'A3', actionType: 'task.create', simulatedContextTimeUtc: '2026-11-09T09:00:00Z', summary: 'task' },
      { auditId: 'A4', actionType: 'history.note', simulatedContextTimeUtc: '2026-11-01T00:00:00Z', summary: 'outside' },
    ];
    const b = railBookmarks(audit, Date.parse('2026-11-09T00:00:00Z'), Date.parse('2026-11-10T00:00:00Z'));
    expect(b.map((x) => x.auditId)).toEqual(['A1', 'A2']);
    expect(b[0].at).toBeCloseTo(8 / 24, 5);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { offsetMeters } from '@/core/geo';
import type { GeoPoint } from '@/core/types';
import { buildCargoIndex } from '@/engines/cargo';
import { craneStateAt, CRANE_PHASES, equipmentStatusAt, operationAt, shoreLevelAt, storeLevelsAt, type CraneTimeline } from '@/engines/terminalOps';
import { buildPortTwin, mooredPosesAt } from '@/selectors/portTwin';
import { craneTimelinesOf, equipmentCardView, terminalOpsView, twinOpsFrame, yardOccupancyAt } from '@/selectors/terminalOps';
import { buildSpatialRegistry } from '@/spatial/registry';
import { cargoModule, catalog } from './fixtures';

const ms = (iso: string) => Date.parse(iso);
const c = catalog();
const ops = c.terminalOps!;

type Ring = [number, number][];
function pip(p: GeoPoint, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi || 1e-15) + xi) inside = !inside;
  }
  return inside;
}
function landTest(cityId: string) {
  const doc = JSON.parse(readFileSync(resolve(__dirname, `../../public/geo/city/${cityId}.json`), 'utf-8')) as { features: { polygons: Ring[][] }[] };
  return (p: GeoPoint) => doc.features.some((f) => f.polygons.some((poly) => pip(p, poly[0]) && !poly.slice(1).some((h) => pip(p, h))));
}

describe('V3 typed terminals (Gate 7)', () => {
  it('loads three typed ports next to the V2 container twins and opens each as a port3d scene', () => {
    expect(ops.module.version).toBe('3.2');
    expect([...ops.typeByTerminal.entries()].filter(([, t]) => t !== 'container').sort()).toEqual([
      ['TRM-DLC', 'lng'],
      ['TRM-SOU', 'roro'],
      ['TRM-SSZ', 'dry_bulk'],
    ]);
    const reg = buildSpatialRegistry(c);
    for (const pid of ['PRT-SIN', 'PRT-SSZ', 'PRT-DLC', 'PRT-SOU']) {
      expect(reg.get(pid)?.availableViews[0]).toBe('port3d');
      expect(reg.cityOfPort(pid)?.geometryPath).toBeTruthy();
    }
  });

  it('puts every typed berth on the shoreline: water in front, land behind, ships moored in water', () => {
    const t = ms('2026-11-09T12:00:00Z');
    const poses = mooredPosesAt(c, t);
    for (const [pid, city] of [
      ['PRT-SSZ', 'CTY-SSZ'],
      ['PRT-DLC', 'CTY-DLC'],
      ['PRT-SOU', 'CTY-SOU'],
    ] as const) {
      const land = landTest(city);
      const twin = buildPortTwin(c, pid, t)!;
      const tm = twin.terminals[0];
      for (const b of twin.berths) {
        for (const m of [10, 40, 80]) expect(land(offsetMeters(b.center, b.seawardDeg, m)), `${b.berthId} +${m} m seaward`).toBe(false);
        const shore = tm.jettyOffsetM + 60;
        expect(land(offsetMeters(b.center, tm.landwardDeg, shore)), `${b.berthId} deck`).toBe(true);
        expect(land(offsetMeters(b.center, tm.landwardDeg, tm.jettyOffsetM + tm.yardDepthM * 0.8)), `${b.berthId} back of terminal`).toBe(true);
      }
      const moored = twin.moored[0];
      expect(moored, pid).toBeTruthy();
      expect(land(moored.point), `${moored.vesselId} hull centre`).toBe(false);
      expect(poses.get(moored.vesselId)?.berthId).toBe(moored.berthId);
      // The base fixes sit at the alongside pose, so the inspector and the map agree.
      const last = c.tracks.get(moored.vesselId)!.at(-1)!;
      expect(Math.abs(last.lon - moored.point.lon)).toBeLessThan(2e-5);
      expect(Math.abs(last.lat - moored.point.lat)).toBeLessThan(2e-5);
      expect(land(twin.pilotBoardingPlace), `${pid} pilot boarding place`).toBe(false);
    }
  });

  it('matches ship type to terminal type and keeps units apart (t, m³, vehicles)', () => {
    const want = { dry_bulk: ['Bulk carrier', 't', 't/h'], lng: ['LNG carrier', 'm3', 'm3/h'], roro: ['RoRo', 'vehicles', 'vehicles/h'] } as const;
    for (const o of ops.module.operations) {
      const [type, unit, rate] = want[o.terminalType];
      expect(c.byId.vessel.get(o.vesselId)?.vesselType).toBe(type);
      expect([o.unit, o.rateUnit]).toEqual([unit, rate]);
    }
  });

  it('conserves ship + shore quantity at every instant and stays within capacity', () => {
    for (const list of ops.opsByBerth.values())
      for (const op of list) {
        const total = (t: number) => {
          const l = storeLevelsAt(op, t, ops.equipment);
          return [...l.ship, ...l.shore].reduce((n, x) => n + x.quantity, 0);
        };
        const start = total(op.startMs - 1);
        for (let t = op.startMs; t <= op.endMs; t += 17 * 60_000) {
          expect(total(t)).toBeCloseTo(start, 6);
          const l = storeLevelsAt(op, t, ops.equipment);
          for (const s of [...l.ship, ...l.shore]) {
            expect(s.quantity).toBeGreaterThanOrEqual(-1e-6);
            expect(s.quantity).toBeLessThanOrEqual(s.capacity + 1e-6);
          }
        }
      }
  });

  it('drives the Santos loading chain from rate segments: rain pause freezes the stockpile, then reclaim switches to B', () => {
    const op = ops.opsByBerth.get('BRH-SSZ-1')![0];
    const at = (iso: string) => operationAt(op, ms(iso));
    expect(at('2026-11-09T07:00:00Z').phase).toBe('transferring');
    expect(at('2026-11-09T07:00:00Z').ratePerHour).toBe(1800);
    const p1 = at('2026-11-09T08:10:00Z');
    const p2 = at('2026-11-09T09:20:00Z');
    expect(p1.phase).toBe('paused');
    expect(p2.doneQty).toBeCloseTo(p1.doneQty, 6);
    expect(at('2026-11-09T12:00:00Z').doneQty).toBeCloseTo(15_300 + 2.5 * 1800, 6);
    expect(shoreLevelAt(ops, 'SP-SSZ-A', ms('2026-11-09T21:00:00Z'))!.quantity).toBeCloseTo(0, 6);
    expect(equipmentStatusAt(ops, 'SP-SSZ-A', ms('2026-11-09T22:00:00Z')).status).toBe('idle');
    expect(equipmentStatusAt(ops, 'SP-SSZ-B', ms('2026-11-09T22:00:00Z')).status).toBe('transferring');
    expect(at('2026-11-10T12:00:00Z').phase).toBe('moored');
    expect(at('2026-11-10T12:00:00Z').doneQty).toBeCloseTo(55_800, 6);
    expect(equipmentStatusAt(ops, 'SL-SSZ-2', ms('2026-11-09T12:00:00Z')).status).toBe('idle');
  });

  it('runs the Dalian LNG discharge through hazard, pause and tank switchover, with arms on berth 2 in maintenance', () => {
    const op = ops.opsByBerth.get('BRH-DLC-1')![0];
    expect(operationAt(op, ms('2026-11-09T13:40:00Z')).phase).toBe('hazard');
    expect(operationAt(op, ms('2026-11-09T14:00:00Z')).phase).toBe('paused');
    expect(shoreLevelAt(ops, 'TK-DLC-1', ms('2026-11-09T13:30:00Z'))!.quantity).toBeCloseTo(179_000, 6);
    expect(shoreLevelAt(ops, 'TK-DLC-2', ms('2026-11-09T19:00:00Z'))!.quantity).toBeCloseTo(78_500, 6);
    expect(equipmentStatusAt(ops, 'LA-DLC-2A', ms('2026-11-09T12:00:00Z')).status).toBe('maintenance');
    expect(equipmentStatusAt(ops, 'LA-DLC-1A', ms('2026-11-09T13:40:00Z')).status).toBe('hazard');
    const twin = buildPortTwin(c, 'PRT-DLC', ms('2026-11-09T13:40:00Z'))!;
    const frame = twinOpsFrame(c, twin, null, ms('2026-11-09T13:40:00Z'));
    expect([...frame.hazard]).toEqual(['BRH-DLC-1']);
    const view = terminalOpsView(c, twin, 'TRM-DLC', null, null, frame, ms('2026-11-09T12:00:00Z'))!;
    expect(view.kpis.find((k) => k.key === 'rate')!.value).toBe('11,000 m³/h');
    expect(view.hazard?.label).toContain('Simulated');
  });

  it('turns the Southampton Ro-Ro call round: discharge to import lanes, then load from export lanes', () => {
    const [d, l] = ops.opsByBerth.get('BRH-SOU-1')!;
    expect(operationAt(d, ms('2026-11-09T05:30:00Z')).doneQty).toBeCloseTo(1050, 6);
    expect(shoreLevelAt(ops, 'LN-SOU-IMP', ms('2026-11-09T06:00:00Z'))!.quantity).toBeCloseTo(1190, 6);
    expect(operationAt(l, ms('2026-11-09T12:00:00Z')).doneQty).toBeCloseTo(5 * 110, 6);
    expect(shoreLevelAt(ops, 'LN-SOU-EXP', ms('2026-11-09T15:00:00Z'))!.quantity).toBeCloseTo(0, 6);
    const twin = buildPortTwin(c, 'PRT-SOU', ms('2026-11-09T12:00:00Z'))!;
    const card = equipmentCardView(c, 'RP-SOU-1', null, null, ms('2026-11-09T12:00:00Z'))!;
    expect(card.status).toBe('transferring');
    expect(card.facts.find((f) => f.label === 'Flow now')?.value).toBe('110 vehicles/h');
    expect(terminalOpsView(c, twin, 'TRM-SOU', 'BRH-SOU-1', null, null, ms('2026-11-09T12:00:00Z'))!.shipLabel).toBe('Vehicle decks');
  });

  it('animates Singapore W3 cranes only from transfer events, through the kit phase order', () => {
    const cargo = buildCargoIndex(cargoModule());
    const tl = craneTimelinesOf(cargo).get('QC-SIN-W3-2')!;
    const ev = tl.events[0];
    expect(craneStateAt(tl, 'QC-SIN-W3-2', ev.startMs - 3 * 3_600_000).phase).toBe('idle');
    const seen = [] as string[];
    for (let k = 0; k < 100; k++) {
      const s = craneStateAt(tl, 'QC-SIN-W3-2', ev.startMs + ((ev.endMs - ev.startMs) * k) / 100);
      if (seen.at(-1) !== s.phase) seen.push(s.phase);
      expect(s.transferEventId).toBe(ev.id);
      if (s.phase === 'hoist' || s.phase === 'travel') expect(s.carrying).toBe(true);
    }
    expect(seen).toEqual(CRANE_PHASES.map((p) => p.phase));
    // Discharge: picks over the ship (trolley 1), drops on the landside (trolley 0).
    expect(craneStateAt(tl, 'QC-SIN-W3-2', ev.startMs + (ev.endMs - ev.startMs) * 0.3).trolley).toBe(1);
    expect(craneStateAt(tl, 'QC-SIN-W3-2', ev.startMs + (ev.endMs - ev.startMs) * 0.9).trolley).toBe(0);
    const none: CraneTimeline = { craneId: 'X', events: [] };
    expect(craneStateAt(none, 'X', ev.startMs).phase).toBe('idle');
    // Every crane event belongs to an STS crane declared at the event's berth.
    for (const e of cargo.events.filter((x) => x.craneId)) expect(ops.equipment.get(e.craneId!)?.berthId).toBe(e.berthId);
  });

  it('keeps container counts consistent: ship discharges appear in the V3 yard blocks', () => {
    const cargo = buildCargoIndex(cargoModule());
    const twin = buildPortTwin(c, 'PRT-SIN', ms('2026-11-09T12:00:00Z'))!;
    const yardAt = (iso: string) => yardOccupancyAt(cargo, 'TRM-SIN-W', ms(iso)).size;
    const discharged = (iso: string) => cargo.events.filter((e) => e.kind === 'discharge' && cargo.eventMs.get(e.transferEventId)!.end <= ms(iso)).length;
    const loaded = (iso: string) => cargo.events.filter((e) => e.kind === 'load' && cargo.eventMs.get(e.transferEventId)!.start <= ms(iso)).length;
    const start = yardAt('2026-11-09T11:40:00Z');
    expect(start).toBe(140);
    for (const iso of ['2026-11-09T12:30:00Z', '2026-11-09T13:45:00Z']) expect(yardAt(iso)).toBe(start + discharged(iso) - loaded(iso));
    const frame = twinOpsFrame(c, twin, cargo, ms('2026-11-09T12:05:00Z'));
    expect([...frame.cranes.values()].filter((s) => s.phase !== 'idle' && s.phase !== 'ready').length).toBeGreaterThan(0);
    const view = terminalOpsView(c, twin, 'TRM-SIN-W', null, cargo, frame, ms('2026-11-09T12:05:00Z'))!;
    expect(view.type).toBe('container');
    expect(view.operation?.vesselId).toBe('VSL-0255');
    expect(view.equipment.map((e) => e.equipmentId)).toEqual(['QC-SIN-W3-1', 'QC-SIN-W3-2', 'QC-SIN-W3-3', 'QC-SIN-W3-4']);
    expect(terminalOpsView(c, twin, 'TRM-SIN-C', null, cargo, frame, ms('2026-11-09T12:05:00Z'))!.empty).toContain('No equipment events');
  });
});

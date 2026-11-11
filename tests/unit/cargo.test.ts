import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  archetypeOf,
  buildCargoIndex,
  containerLocationAt,
  delayExposureUsd,
  holdOfBay,
  slotIdOf,
  slotOccupancyAt,
  stowageLookup,
  upcomingTransfers,
} from '@/engines/cargo';
import { getSnapshotAt } from '@/engines/snapshot';
import { shipHullProfile } from '@/map/vessels3d/library';
import {
  selectBaySection,
  selectCargoSummary,
  selectCompartmentDetail,
  selectCruiseProgress,
  selectSlotDetail,
  selectWorkshopCargo,
  validCargoFocus,
} from '@/selectors/vesselCargo';
import { CHASE_DISTANCE_L, compartmentLayout, containerLayout, workshopCameraPose } from '@/spatial/scenes/VesselWorkshopScene';
import { adaptKitFlow, adaptKitStowedContainer, LOCODE_BY_PORT, toCanonicalPortId, type KitFlow, type KitStowedContainer } from '@/v3/idAdapter';
import { cargoModule, catalog } from './fixtures';

const c = catalog();
const mod = cargoModule();
const idx = buildCargoIndex(mod);
const T0 = Date.parse('2026-11-05T12:00:00Z');
/** VSL-0255 works at BRH-SIN-W-3 from 11:50Z on 9 Nov (after its BERTH_OCCUPIED event); the last crane move ends before 17:00Z. */
const BEFORE_CRANES = Date.parse('2026-11-09T11:40:00Z');
const AFTER_CRANES = Date.parse('2026-11-09T17:00:00Z');
const kit = (name: string) => JSON.parse(readFileSync(resolve(__dirname, `../../PORTOS_V3_Design_Engineering_Upgrade/examples/${name}`), 'utf-8'));

describe('V3 Gate 5 · cargo fixtures', () => {
  it('holds ~1,000 containers and two 800-slot stows: VSL-0255 (crane unload) and VSL-0001 (at anchor)', () => {
    expect(mod.cargoUnits.filter((u) => u.kind === 'container')).toHaveLength(1000);
    for (const vid of ['VSL-0255', 'VSL-0001']) {
      const plan = idx.plans.get(vid)!;
      expect(plan.archetype).toBe('container');
      expect(plan.slots).toHaveLength(800);
      expect(plan.grid).toMatchObject({ slotCount: 800, tiersBelow: [2, 4, 6], tiersAbove: [82, 84] });
    }
    expect(idx.plans.get('VSL-0255')!.voyageId).toBeNull();
  });

  it('every crane move is at BRH-SIN-W-3 while VSL-0255 is alongside; nothing is lifted on or off VSL-0001', () => {
    const cranes = mod.transferEvents.filter((e) => e.craneId);
    expect(cranes.length).toBe(380);
    expect(new Set(cranes.map((e) => e.berthId))).toEqual(new Set(['BRH-SIN-W-3']));
    expect(cranes.every((e) => Date.parse(e.startUtc) >= Date.parse('2026-11-09T11:50:00Z') && Date.parse(e.endUtc) <= Date.parse('2026-11-09T17:00:00Z'))).toBe(true);
    const touches = (vid: string) => mod.transferEvents.filter((e) => [e.from, e.to].some((l) => 'vesselId' in l && l.vesselId === vid));
    expect(touches('VSL-0001')).toHaveLength(0);
    expect(touches('VSL-0255')).toHaveLength(380);
  });

  it('keeps archetypes type-correct: VSL-0047 carries LNG tanks, never container slots', () => {
    const p47 = idx.plans.get('VSL-0047')!;
    expect(p47.archetype).toBe('lng');
    expect(p47.slots).toHaveLength(0);
    expect(p47.compartments.map((x) => x.kind)).toEqual(['tank', 'tank', 'tank', 'tank']);
    for (const p of idx.plans.values()) expect(p.archetype).toBe(archetypeOf(c.byId.vessel.get(p.vesselId)!.vesselType));
    expect(validCargoFocus(idx, 'VSL-0047', '180182')).toBeNull();
    expect(validCargoFocus(idx, 'VSL-0047', 'CMP-0047-T1')).toBe('CMP-0047-T1');
    expect(validCargoFocus(idx, 'VSL-0001', 'CMP-0047-T1')).toBeNull();
  });
});

describe('V3 Gate 5 · cargo engine', () => {
  it('containerLocationAt resolves exactly one location for every unit at every probe time', () => {
    const probes = [T0, BEFORE_CRANES, ...mod.transferEvents.slice(0, 80).flatMap((e) => [Date.parse(e.startUtc), (Date.parse(e.startUtc) + Date.parse(e.endUtc)) / 2, Date.parse(e.endUtc)]), AFTER_CRANES];
    for (const t of probes) for (const u of mod.cargoUnits) expect(containerLocationAt(idx, u.cargoUnitId, t)?.type).toBeTruthy();
  });

  it('walks a discharged box from its vessel slot to the crane to the yard', () => {
    const ev = mod.transferEvents.find((e) => e.kind === 'discharge')!;
    const s = Date.parse(ev.startUtc);
    const e = Date.parse(ev.endUtc);
    expect(containerLocationAt(idx, ev.cargoUnitId, s - 1)).toMatchObject({ type: 'vessel_slot', vesselId: 'VSL-0255' });
    const mid = containerLocationAt(idx, ev.cargoUnitId, (s + e) / 2)!;
    expect(mid.type).toBe('crane');
    expect(mid.type === 'crane' && mid.progress).toBeCloseTo(0.5, 5);
    expect(containerLocationAt(idx, ev.cargoUnitId, e)).toMatchObject({ type: 'yard_slot', since: e });
  });

  it('sends gate-out boxes through a truck to the gate', () => {
    const ev = mod.transferEvents.find((e) => e.kind === 'gate_out')!;
    expect(containerLocationAt(idx, ev.cargoUnitId, Date.parse(ev.startUtc) + 1000)?.type).toBe('truck');
    expect(containerLocationAt(idx, ev.cargoUnitId, Date.parse(ev.endUtc))).toMatchObject({ type: 'gate', portId: 'PRT-SIN' });
  });

  it('VSL-0255 holds 520 boxes on arrival and 420 after discharge (240 off) and loading (140 on), with no floating boxes', () => {
    expect(slotOccupancyAt(idx, 'VSL-0255', T0).size).toBe(520);
    expect(slotOccupancyAt(idx, 'VSL-0255', BEFORE_CRANES).size).toBe(520);
    expect(slotOccupancyAt(idx, 'VSL-0255', AFTER_CRANES).size).toBe(420);
    for (const t of [T0, c.anchorMs, c.windowMaxMs - 1]) expect(slotOccupancyAt(idx, 'VSL-0001', t).size).toBe(200);
    const slots = idx.slots.get('VSL-0255')!;
    for (const t of [T0, Date.parse('2026-11-09T13:30:00Z'), AFTER_CRANES]) {
      const occ = slotOccupancyAt(idx, 'VSL-0255', t);
      for (const id of occ.keys()) {
        const s = slots.get(id)!;
        const under = slots.get(slotIdOf(s.bay, s.row, s.tier - 2));
        if (under) expect(occ.has(under.slotId), `${id} floats at ${new Date(t).toISOString()}`).toBe(true);
      }
    }
  });

  it('looks up stowage by slot ID or by bay/row/tier, and numbers holds from the bow', () => {
    const plan = idx.plans.get('VSL-0001')!;
    const occ = slotOccupancyAt(idx, 'VSL-0001', T0);
    const [slotId, unitId] = [...occ.entries()][0]!;
    const s = idx.slots.get('VSL-0001')!.get(slotId)!;
    const byId = stowageLookup(idx, 'VSL-0001', slotId, T0, occ)!;
    expect(stowageLookup(idx, 'VSL-0001', { bay: s.bay, row: s.row, tier: s.tier }, T0, occ)).toEqual(byId);
    expect(byId.cargoUnitId).toBe(unitId);
    expect(stowageLookup(idx, 'VSL-0001', '990199', T0)).toBeNull();
    expect(holdOfBay(plan, 2)).toBe(1);
    expect(holdOfBay(plan, 6)).toBe(1);
    expect(holdOfBay(plan, 62)).toBe(8);
  });

  it('delayExposureUsd = max(0, h)/24 × rate, and the voyage exposure engine agrees (VYG-0001: +18 h at $32k = $24k)', () => {
    expect(delayExposureUsd(18, 32000)).toBe(24000);
    expect(delayExposureUsd(-5, 32000)).toBe(0);
    expect(delayExposureUsd(0, 32000)).toBe(0);
    const snap = getSnapshotAt(c, c.anchorMs);
    expect(snap.exposures.get('VYG-0001')?.estimatedUsd).toBe(24000);
  });

  it('lists the next crane moves of a vessel in time order', () => {
    const next = upcomingTransfers(idx, 'VSL-0255', BEFORE_CRANES, 3);
    expect(next).toHaveLength(3);
    expect(next.map((e) => e.startUtc)).toEqual([...next.map((e) => e.startUtc)].sort());
    expect(upcomingTransfers(idx, 'VSL-0047', BEFORE_CRANES)).toHaveLength(0);
    expect(upcomingTransfers(idx, 'VSL-0001', T0)).toHaveLength(0);
  });
});

describe('V3 Gate 5 · vessel cargo selectors', () => {
  const snap = getSnapshotAt(c, c.anchorMs);

  it('cruise progress: VSL-0001 not departed with ETD; VSL-0047 under way with ATD', () => {
    const p1 = selectCruiseProgress(c, snap, 'VSL-0001')!;
    expect(p1).toMatchObject({ origin: 'Singapore', destination: 'Rotterdam', basis: 'notDeparted', progress: 0, tone: 'critical' });
    expect(p1.originCaption).toMatch(/^ETD /);
    const p47 = selectCruiseProgress(c, snap, 'VSL-0047')!;
    expect(p47.origin).toBe('Singapore');
    expect(p47.destination).toBe('Manila');
    expect(p47.progress).toBeGreaterThan(0);
    expect(p47.originCaption).toMatch(/^ATD /);
  });

  it('container summary: VSL-0255 520 boxes before the cranes, Singapore discharge first; VSL-0001 static with no crane plan', () => {
    const s = selectCargoSummary(c, idx, 'VSL-0255', BEFORE_CRANES)!;
    expect(s.kind).toBe('slots');
    expect(s.headline.find((h) => h.label === 'On board')?.value).toBe('520 boxes');
    expect(s.headline.find((h) => h.label === 'TEU')?.value).toBe('1,040');
    expect(s.destinations[0]).toMatchObject({ name: 'Singapore', count: 240 });
    expect(s.destinations.reduce((n, d) => n + d.count, 0)).toBe(520);
    expect(s.craneText).toMatch(/380 crane moves planned/);
    expect(s.nextMoves).toHaveLength(3);
    const s1 = selectCargoSummary(c, idx, 'VSL-0001', c.anchorMs)!;
    expect(s1.headline.find((h) => h.label === 'On board')?.value).toBe('200 boxes');
    expect(s1.destinations.map((d) => [d.name, d.count])).toEqual([
      ['Singapore', 80],
      ['Rotterdam', 120],
    ]);
    expect(s1.nextMoves).toHaveLength(0);
    expect(s1.craneText).toMatch(/no berth confirmed/);
  });

  it('LNG summary lists four tanks with fill and volume, no slots', () => {
    const s = selectCargoSummary(c, idx, 'VSL-0047', c.anchorMs)!;
    expect(s.kind).toBe('compartments');
    expect(s.title).toBe('LNG cargo tanks');
    expect(s.compartments).toHaveLength(4);
    expect(s.compartments[0]!.quantityText).toMatch(/m³$/);
    const d = selectCompartmentDetail(c, idx, 'VSL-0047', 'CMP-0047-T1', c.anchorMs)!;
    expect(d.manifest?.chips.map((x) => x.label)).toContain('IMO class 2.1');
  });

  it('bay section: deck tiers over the hatch, then hold tiers; port rows left of starboard', () => {
    const b = selectBaySection(c, idx, 'VSL-0001', 18, c.anchorMs)!;
    expect(b.tiers).toEqual([84, 82, 6, 4, 2]);
    expect(b.lines.map((l) => l.hatchBefore)).toEqual([false, false, true, false, false]);
    expect(b.rows).toEqual([10, 8, 6, 4, 2, 1, 3, 5, 7, 9]);
    expect(b.lines.every((l) => l.cells.length === 10)).toBe(true);
    expect(b.filled).toBe([...b.cells.values()].filter((x) => x.filled).length);
  });

  it('manifest card: hides restricted commodity and parties, and follows the box through its discharge', () => {
    const restricted = mod.cargoUnits.find((u) => u.kind === 'container' && u.cargo.detailsVisibility === 'restricted' && u.initialLocation.type === 'vessel_slot')!;
    const slot = (restricted.initialLocation as { slotId: string }).slotId;
    const d = selectSlotDetail(c, idx, restricted.vesselId, slot, T0)!;
    expect(d.manifest?.restricted).toBe(true);
    expect(d.manifest?.fields.find((f) => f.label === 'Commodity')?.value).toMatch(/^Restricted/);
    expect(d.manifest?.fields.find((f) => f.label === 'Shipper')?.value).toMatch(/^Restricted/);

    const ev = mod.transferEvents.find((e) => e.kind === 'discharge')!;
    const from = (ev.from as { slotId: string }).slotId;
    const before = selectSlotDetail(c, idx, 'VSL-0255', from, Date.parse(ev.startUtc) - 60_000)!;
    expect(before.manifest?.cargoUnitId).toBe(ev.cargoUnitId);
    expect(before.manifest?.nextText).toMatch(/^Discharge .*QC-SIN-W3-\d \(EST\)$/);
    expect(selectSlotDetail(c, idx, 'VSL-0255', from, Date.parse(ev.endUtc) + 1)!.manifest).toBeNull();
  });

  it('workshop cargo marks filled slots with discharge-port swatches and maps slots to holds', () => {
    const w = selectWorkshopCargo(c, idx, 'VSL-0255', BEFORE_CRANES)!;
    expect(w.filled.size).toBe(520);
    expect(new Set([...w.filled.values()].map((x) => x.swatch))).toEqual(new Set([0, 1, 2, 3]));
    expect(w.holdOfSlot('020182')).toBe(1);
  });
});

describe('V3 Gate 5 · kit ID adapter', () => {
  it('maps every canonical port to a unique UN/LOCODE-style code and back', () => {
    const ports = c.ports.map((p) => p.portId);
    expect(ports.every((p) => LOCODE_BY_PORT[p])).toBe(true);
    expect(new Set(Object.values(LOCODE_BY_PORT)).size).toBe(Object.keys(LOCODE_BY_PORT).length);
    expect(toCanonicalPortId('SGSIN')).toBe('PRT-SIN');
    expect(toCanonicalPortId('nlrtm')).toBe('PRT-RTM');
    expect(toCanonicalPortId('PRT-SIN')).toBe('PRT-SIN');
    expect(toCanonicalPortId('XXXXX')).toBeNull();
  });

  it('refuses the kit stowed-container example on VSL-0047 (an LNG carrier here) and adapts it onto a container ship', () => {
    const rec = kit('stowed-container-example.json') as KitStowedContainer;
    const typeOf = (id: string) => c.byId.vessel.get(id)?.vesselType ?? null;
    const refused = adaptKitStowedContainer(rec, typeOf);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/LNG carrier/);
    const ok = adaptKitStowedContainer({ ...rec, vesselId: 'VSL-0001' }, typeOf);
    expect(ok.ok && ok.value).toMatchObject({ vesselId: 'VSL-0001', slotId: '120482', originPortId: 'PRT-SIN', destinationPortId: 'PRT-RTM' });
  });

  it('adapts the kit operational flow to canonical port IDs', () => {
    const r = adaptKitFlow(kit('operational-flow-example.json') as KitFlow);
    expect(r.ok && [r.value.sourcePortId, r.value.targetPortId]).toEqual(['PRT-SIN', 'PRT-RTM']);
  });
});

describe('V3 Gate 5 · vessel workshop geometry and cameras', () => {
  it('chase sits 1.3 ship lengths astern (model +Z), above looks down with the bow to the right', () => {
    const chase = workshopCameraPose('chase', 'container', 1.7);
    expect(CHASE_DISTANCE_L).toBe(1.3);
    expect(chase.position.z).toBeCloseTo(1.3, 6);
    expect(chase.position.x).toBe(0);
    const above = workshopCameraPose('above', 'container', 1.7);
    expect(above.position.y).toBeGreaterThan(0.8);
    expect(above.position.x).toBeGreaterThan(0);
    const deck = workshopCameraPose('deck', 'container', 1.7);
    expect(deck.position.z).toBeGreaterThan(deck.target.z);
    for (const m of ['orbit', 'free'] as const) expect(workshopCameraPose(m, 'gas', 1.7).position.length()).toBeGreaterThan(0.9);
  });

  it('lays the 800 slots inside the hull: holds below the deck line, deck tiers above, bay 02 forward', () => {
    const plan = idx.plans.get('VSL-0001')!;
    const prof = shipHullProfile('container');
    const boxes = containerLayout(plan, prof);
    expect(boxes).toHaveLength(800);
    for (const b of boxes) {
      const s = 0.5 - b.center.z;
      expect(Math.abs(b.center.x) + b.size.x / 2).toBeLessThanOrEqual(prof.halfBreadth(s) + 1e-9);
      if (b.above) expect(b.center.y - b.size.y / 2).toBeGreaterThanOrEqual(prof.deckY(s));
      else expect(b.center.y + b.size.y / 2).toBeLessThanOrEqual(prof.freeboard + 1e-9);
    }
    const z = (bay: number) => boxes.find((b) => b.bay === bay)!.center.z;
    expect(z(2)).toBeLessThan(z(62));
  });

  it('places compartments by archetype with tank 1 forward', () => {
    const p47 = idx.plans.get('VSL-0047')!;
    const tanks = compartmentLayout(p47, shipHullProfile('gas'), 'lng');
    expect(tanks.map((t) => t.shape)).toEqual(['sphere', 'sphere', 'sphere', 'sphere']);
    expect(tanks[0]!.center.z).toBeLessThan(tanks[3]!.center.z);
    const decks = compartmentLayout(idx.plans.get('VSL-0002')!, shipHullProfile('roro'), 'roro');
    expect(decks[1]!.center.y).toBeGreaterThan(decks[0]!.center.y);
  });
});

import type { CargoArchetype, CargoModule, CargoUnit, Compartment, Shipment, StoredLocation, StowagePlan, StowageSlot, TransferEvent, YardSlot } from '@/core/cargoTypes';

/**
 * Cargo engine (V3 spec 05/13): event-sourced container locations, stowage lookup and delay exposure.
 * Pure: no Vue, Three or map imports. Times are epoch milliseconds.
 */

/** Where a unit is at one instant. Exactly one of these, by construction of `containerLocationAt`. */
export type CargoLocation =
  | (StoredLocation & { since: number | null })
  | { type: 'crane'; craneId: string; event: TransferEvent; progress: number; since: number }
  | { type: 'truck'; event: TransferEvent; progress: number; since: number };

export interface CargoIndex {
  units: Map<string, CargoUnit>;
  /** Transfer events per unit, sorted by start. */
  eventsByUnit: Map<string, TransferEvent[]>;
  plans: Map<string, StowagePlan>;
  slots: Map<string, Map<string, StowageSlot>>;
  /** Every unit that is ever associated with the vessel (initially on board or loaded onto it). */
  unitsByVessel: Map<string, CargoUnit[]>;
  shipments: Map<string, Shipment>;
  yard: Map<string, YardSlot>;
  eventMs: Map<string, { start: number; end: number }>;
  events: TransferEvent[];
}

const ms = (iso: string) => Date.parse(iso);

export function buildCargoIndex(mod: CargoModule): CargoIndex {
  const eventMs = new Map<string, { start: number; end: number }>();
  const eventsByUnit = new Map<string, TransferEvent[]>();
  for (const e of mod.transferEvents) {
    eventMs.set(e.transferEventId, { start: ms(e.startUtc), end: ms(e.endUtc) });
    const list = eventsByUnit.get(e.cargoUnitId);
    if (list) list.push(e);
    else eventsByUnit.set(e.cargoUnitId, [e]);
  }
  for (const list of eventsByUnit.values()) list.sort((a, b) => eventMs.get(a.transferEventId)!.start - eventMs.get(b.transferEventId)!.start);
  const unitsByVessel = new Map<string, CargoUnit[]>();
  for (const u of mod.cargoUnits) {
    const list = unitsByVessel.get(u.vesselId);
    if (list) list.push(u);
    else unitsByVessel.set(u.vesselId, [u]);
  }
  return {
    units: new Map(mod.cargoUnits.map((u) => [u.cargoUnitId, u])),
    eventsByUnit,
    plans: new Map(mod.stowagePlans.map((p) => [p.vesselId, p])),
    slots: new Map(mod.stowagePlans.map((p) => [p.vesselId, new Map(p.slots.map((s) => [s.slotId, s]))])),
    unitsByVessel,
    shipments: new Map(mod.shipments.map((s) => [s.shipmentId, s])),
    yard: new Map(mod.yardSlots.map((y) => [y.yardSlotId, y])),
    eventMs,
    events: mod.transferEvents,
  };
}

/**
 * Resolves the unit's single location at `t`: its initial location before the first move, the crane (or truck)
 * during a move, and the move's destination until the next one starts.
 */
export function containerLocationAt(idx: CargoIndex, cargoUnitId: string, t: number): CargoLocation | null {
  const unit = idx.units.get(cargoUnitId);
  if (!unit) return null;
  const evs = idx.eventsByUnit.get(cargoUnitId) ?? [];
  let loc: CargoLocation = { ...unit.initialLocation, since: null };
  for (const e of evs) {
    const { start, end } = idx.eventMs.get(e.transferEventId)!;
    if (t < start) break;
    if (t < end) {
      const progress = (t - start) / (end - start);
      return e.via === 'truck' ? { type: 'truck', event: e, progress, since: start } : { type: 'crane', craneId: e.craneId ?? 'crane', event: e, progress, since: start };
    }
    loc = { ...e.to, since: end };
  }
  return loc;
}

/** Slot → unit occupancy of a vessel's stowage at `t` (containers only). */
export function slotOccupancyAt(idx: CargoIndex, vesselId: string, t: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const u of idx.unitsByVessel.get(vesselId) ?? []) {
    if (u.kind !== 'container') continue;
    const loc = containerLocationAt(idx, u.cargoUnitId, t);
    if (loc?.type === 'vessel_slot' && loc.vesselId === vesselId) out.set(loc.slotId, u.cargoUnitId);
  }
  return out;
}

export const slotIdOf = (bay: number, row: number, tier: number) => `${String(bay).padStart(2, '0')}${String(row).padStart(2, '0')}${String(tier).padStart(2, '0')}`;

export interface SlotLookup {
  slot: StowageSlot;
  hold: number;
  cargoUnitId: string | null;
}

/** Stowage lookup by slot ID or bay/row/tier; null when the slot is not in the vessel's plan. */
export function stowageLookup(idx: CargoIndex, vesselId: string, at: string | { bay: number; row: number; tier: number }, t: number, occupancy?: Map<string, string>): SlotLookup | null {
  const plan = idx.plans.get(vesselId);
  const slotId = typeof at === 'string' ? at : slotIdOf(at.bay, at.row, at.tier);
  const slot = idx.slots.get(vesselId)?.get(slotId);
  if (!plan || !slot) return null;
  const occ = occupancy ?? slotOccupancyAt(idx, vesselId, t);
  return { slot, hold: holdOfBay(plan, slot.bay), cargoUnitId: occ.get(slotId) ?? null };
}

/** Container holds pair consecutive forty-foot bays; bays and holds count from the bow (hold 1 = bays 02 and 06). */
export const BAYS_PER_HOLD = 2;
export function holdOfBay(plan: StowagePlan, bay: number): number {
  const i = plan.grid?.bays.indexOf(bay) ?? -1;
  return i < 0 ? 0 : Math.floor(i / BAYS_PER_HOLD) + 1;
}
export function holdCount(plan: StowagePlan): number {
  return plan.grid ? Math.ceil(plan.grid.bays.length / BAYS_PER_HOLD) : plan.compartments.length;
}

export function compartmentOf(plan: StowagePlan, compartmentId: string): Compartment | null {
  return plan.compartments.find((c) => c.compartmentId === compartmentId) ?? null;
}

/**
 * Spec formula: delayExposureUsd = max(0, etaShiftHours) / 24 × dailyDelayRateUsd. Early arrival never offsets
 * lateness. Unrounded; callers round for display. Shared with `computeExposure`.
 */
export function delayExposureUsd(etaShiftHours: number, dailyDelayRateUsd: number): number {
  return (Math.max(0, etaShiftHours) / 24) * dailyDelayRateUsd;
}

const ARCHETYPE_BY_TYPE: Record<string, CargoArchetype> = {
  'Container ship': 'container',
  'LNG carrier': 'lng',
  'LPG carrier': 'lng',
  'Oil tanker': 'tanker',
  'Product tanker': 'tanker',
  'Chemical tanker': 'tanker',
  'Bulk carrier': 'bulk',
  RoRo: 'roro',
  'Car carrier': 'roro',
  'General cargo': 'general',
  'Multi-purpose': 'general',
};

/** Cargo archetype of a fixture vessel type; null for types that carry no modelled cargo (tugs, pilots). */
export function archetypeOf(vesselType: string): CargoArchetype | null {
  return ARCHETYPE_BY_TYPE[vesselType] ?? null;
}

export interface CargoTotals {
  units: number;
  teu: number;
  netMassKg: number;
  reefers: number;
  hazardous: number;
  restricted: number;
  byDestination: Map<string, number>;
}

/** Totals over the containers on board at `t`. */
export function containerTotals(idx: CargoIndex, occupancy: Map<string, string>): CargoTotals {
  const out: CargoTotals = { units: 0, teu: 0, netMassKg: 0, reefers: 0, hazardous: 0, restricted: 0, byDestination: new Map() };
  for (const id of occupancy.values()) {
    const u = idx.units.get(id);
    if (!u) continue;
    out.units++;
    out.teu += (u.sizeFt ?? 20) === 40 ? 2 : 1;
    out.netMassKg += u.cargo.netMassKg ?? 0;
    if (u.cargo.reefer) out.reefers++;
    if (u.cargo.hazardClass) out.hazardous++;
    if (u.cargo.detailsVisibility === 'restricted') out.restricted++;
    out.byDestination.set(u.destinationPortId, (out.byDestination.get(u.destinationPortId) ?? 0) + 1);
  }
  return out;
}

/** Moves of a vessel's cargo that are under way or still ahead at `t`, earliest first. */
export function upcomingTransfers(idx: CargoIndex, vesselId: string, t: number, limit = 3): TransferEvent[] {
  const ids = new Set((idx.unitsByVessel.get(vesselId) ?? []).map((u) => u.cargoUnitId));
  return idx.events
    .filter((e) => ids.has(e.cargoUnitId) && e.via === 'quay_crane' && idx.eventMs.get(e.transferEventId)!.end > t)
    .sort((a, b) => idx.eventMs.get(a.transferEventId)!.start - idx.eventMs.get(b.transferEventId)!.start)
    .slice(0, limit);
}

/** Crane-move window for a vessel (first start, last end), or null when no moves are planned. */
export function craneWindow(idx: CargoIndex, vesselId: string): { start: number; end: number; moves: number } | null {
  const ids = new Set((idx.unitsByVessel.get(vesselId) ?? []).map((u) => u.cargoUnitId));
  let start = Infinity;
  let end = -Infinity;
  let moves = 0;
  for (const e of idx.events) {
    if (!ids.has(e.cargoUnitId) || e.via !== 'quay_crane') continue;
    const w = idx.eventMs.get(e.transferEventId)!;
    start = Math.min(start, w.start);
    end = Math.max(end, w.end);
    moves++;
  }
  return moves ? { start, end, moves } : null;
}

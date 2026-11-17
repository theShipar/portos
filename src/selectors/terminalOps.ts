import { formatUtc } from '@/core/format';
import {
  EQUIPMENT_KIND_LABEL,
  EQUIPMENT_STATUS_LABEL,
  TERMINAL_TYPE_LABEL,
  UNIT_LABEL,
  type EquipmentStatus,
  type TerminalEquipment,
  type TerminalType,
} from '@/core/terminalTypes';
import type { Catalog } from '@/data/catalog';
import { containerLocationAt, containerTotals, slotOccupancyAt, type CargoIndex } from '@/engines/cargo';
import {
  berthOperationAt,
  craneStateAt,
  craneTimelines,
  equipmentStatusAt,
  operationAt,
  shoreLevelAt,
  storeLevelsAt,
  type CranePhase,
  type CraneState,
  type CraneTimeline,
  type OperationPhase,
  type OpsIndex,
} from '@/engines/terminalOps';
import type { PortTwinModel } from './portTwin';

/**
 * Typed terminal read models (spec 05/02–05/09): the per-frame state the port twin draws and the cards the inspector
 * shows, both from the same engine at the same scenario instant. Every figure carries its unit and the Simulated basis.
 */

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const formatQty = (n: number, unit: string) => `${nf.format(Math.round(n))} ${UNIT_LABEL[unit] ?? unit}`;

export const CRANE_PHASE_LABEL: Record<CranePhase, string> = {
  idle: 'Idle',
  ready: 'Ready',
  trolley_align: 'Trolley align',
  descend: 'Spreader descend',
  attach: 'Attach',
  hoist: 'Hoist',
  travel: 'Trolley travel',
  release: 'Release',
};

export const OPERATION_PHASE_LABEL: Record<OperationPhase, string> = {
  scheduled: 'Scheduled',
  moored: 'Moored · no transfer',
  transferring: 'Transferring',
  paused: 'Paused',
  hazard: 'Hazard check (simulated)',
  complete: 'Cargo work complete',
};

const timelines = new WeakMap<CargoIndex, Map<string, CraneTimeline>>();
export function craneTimelinesOf(idx: CargoIndex): Map<string, CraneTimeline> {
  let tl = timelines.get(idx);
  if (!tl) timelines.set(idx, (tl = craneTimelines(idx.events)));
  return tl;
}

const yardUnits = new WeakMap<CargoIndex, Map<string, string[]>>();
/** Units that touch a yard slot at some point, per terminal (initially stacked or discharged into the yard). */
function yardUnitsOf(idx: CargoIndex): Map<string, string[]> {
  let m = yardUnits.get(idx);
  if (m) return m;
  m = new Map();
  for (const u of idx.units.values()) {
    const slots = [u.initialLocation, ...(idx.eventsByUnit.get(u.cargoUnitId) ?? []).map((e) => e.to)].filter((l) => l.type === 'yard_slot');
    for (const l of slots) {
      const y = l.type === 'yard_slot' && l.yardSlotId ? idx.yard.get(l.yardSlotId) : undefined;
      if (!y) continue;
      const list = m.get(y.terminalId) ?? [];
      if (!list.includes(u.cargoUnitId)) list.push(u.cargoUnitId);
      m.set(y.terminalId, list);
    }
  }
  yardUnits.set(idx, m);
  return m;
}

/** Yard slots holding a box at `t` (slot → unit), from the event-sourced cargo locations. */
export function yardOccupancyAt(idx: CargoIndex, terminalId: string, t: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const uid of yardUnitsOf(idx).get(terminalId) ?? []) {
    const loc = containerLocationAt(idx, uid, t);
    if (loc?.type === 'yard_slot' && loc.yardSlotId) out.set(loc.yardSlotId, uid);
  }
  return out;
}

const isCrane = (e: TerminalEquipment) => e.kind === 'sts_crane';
const BELT_SPEED_MS = 2.5;
const STORE_KINDS = new Set(['stockpile', 'lng_tank', 'staging_lanes']);

function craneStatus(s: CraneState): EquipmentStatus {
  return s.phase === 'idle' ? 'idle' : s.phase === 'ready' ? 'moored' : 'transferring';
}

// ---- scene frame -------------------------------------------------------------------------------------------------

export interface TwinBerthOps {
  phase: OperationPhase;
  /** Fraction of the berth operation's rated flow (0 when nothing moves). */
  flow: number;
  direction: 'load' | 'discharge';
  /** Ship fill fraction across compartments. */
  shipFill: number;
  /** Belt travel in metres implied by the quantity moved so far (2.5 m/s at the peak rate); freezes when paused. */
  beltM: number;
}

export interface TwinOpsFrame {
  atMs: number;
  cranes: Map<string, CraneState>;
  equipment: Map<string, EquipmentStatus>;
  /** Fill fraction of stockpiles, tanks and staging lanes. */
  levels: Map<string, number>;
  berths: Map<string, TwinBerthOps>;
  /** LNG berths whose operation is in a simulated hazard check. */
  hazard: Set<string>;
}

/** Everything the twin animates at one instant; cranes come from transfer events once the cargo module is loaded. */
export function twinOpsFrame(c: Catalog, model: PortTwinModel, cargo: CargoIndex | null, t: number): TwinOpsFrame {
  const ops = c.terminalOps;
  const frame: TwinOpsFrame = { atMs: t, cranes: new Map(), equipment: new Map(), levels: new Map(), berths: new Map(), hazard: new Set() };
  if (!ops) return frame;
  const tl = cargo ? craneTimelinesOf(cargo) : null;
  for (const tm of model.terminals)
    for (const e of ops.equipmentByTerminal.get(tm.terminalId) ?? []) {
      if (isCrane(e)) {
        const s = craneStateAt(tl?.get(e.equipmentId), e.equipmentId, t);
        frame.cranes.set(e.equipmentId, s);
        frame.equipment.set(e.equipmentId, craneStatus(s));
        continue;
      }
      frame.equipment.set(e.equipmentId, equipmentStatusAt(ops, e.equipmentId, t).status);
      if (STORE_KINDS.has(e.kind)) {
        const l = shoreLevelAt(ops, e.equipmentId, t);
        if (l && l.capacity > 0) frame.levels.set(e.equipmentId, l.quantity / l.capacity);
      }
    }
  for (const b of model.berths) {
    const op = berthOperationAt(ops, b.berthId, t);
    if (!op || t < op.startMs) continue;
    const s = operationAt(op, t);
    const peak = Math.max(...op.segments.map((x) => x.ratePerHour), 1);
    const levels = storeLevelsAt(op, t, ops.equipment);
    const cap = levels.ship.reduce((n, x) => n + x.capacity, 0) || 1;
    frame.berths.set(b.berthId, {
      phase: s.phase,
      flow: s.ratePerHour / peak,
      direction: op.op.direction,
      shipFill: levels.ship.reduce((n, x) => n + x.quantity, 0) / cap,
      beltM: (s.doneQty / peak) * 3600 * BELT_SPEED_MS,
    });
    if (s.phase === 'hazard' && ops.zonesByBerth.has(b.berthId)) frame.hazard.add(b.berthId);
  }
  return frame;
}

// ---- inspector ---------------------------------------------------------------------------------------------------

export interface OpsKpi {
  key: string;
  label: string;
  value: string;
  detail?: string;
}

export interface StoreBar {
  id: string;
  label: string;
  text: string;
  pct: number;
}

export interface EquipmentRow {
  equipmentId: string;
  label: string;
  kindLabel: string;
  status: EquipmentStatus;
  statusLabel: string;
  berthId: string | null;
}

export interface TerminalOpsView {
  terminalId: string;
  name: string;
  type: TerminalType;
  typeLabel: string;
  operation: {
    operationId: string;
    vesselId: string;
    vesselName: string;
    berthId: string;
    berthName: string;
    direction: string;
    commodity: string;
    phase: OperationPhase;
    phaseLabel: string;
    note: string | null;
    progressPct: number;
  } | null;
  kpis: OpsKpi[];
  shipLabel: string;
  ship: StoreBar[];
  shore: StoreBar[];
  equipment: EquipmentRow[];
  hazard: { zoneId: string; label: string; radiusM: number; active: boolean } | null;
  empty: string | null;
  basis: string;
}

const pct = (q: number, cap: number) => (cap > 0 ? Math.max(0, Math.min(100, (q / cap) * 100)) : 0);
const bar = (id: string, label: string, q: number, cap: number, unit: string): StoreBar => ({ id, label, text: `${formatQty(q, unit)} of ${formatQty(cap, unit)}`, pct: pct(q, cap) });

function equipmentRows(ops: OpsIndex, list: TerminalEquipment[], frame: TwinOpsFrame | null, t: number): EquipmentRow[] {
  return list.map((e) => {
    const status = frame?.equipment.get(e.equipmentId) ?? equipmentStatusAt(ops, e.equipmentId, t).status;
    const crane = frame?.cranes.get(e.equipmentId);
    return {
      equipmentId: e.equipmentId,
      label: e.label,
      kindLabel: EQUIPMENT_KIND_LABEL[e.kind],
      status,
      statusLabel: crane && crane.phase !== 'idle' ? CRANE_PHASE_LABEL[crane.phase] : EQUIPMENT_STATUS_LABEL[status],
      berthId: e.berthId,
    };
  });
}

function containerView(c: Catalog, cargo: CargoIndex | null, terminalId: string, cranes: TerminalEquipment[], frame: TwinOpsFrame | null, t: number) {
  if (!cargo) return { kpis: [], operation: null, empty: 'Loading the simulated cargo module…', ship: [] as StoreBar[] };
  const ids = new Set(cranes.map((e) => e.equipmentId));
  const moves = cargo.events.filter((e) => e.craneId && ids.has(e.craneId));
  if (!moves.length) return { kpis: [], operation: null, empty: 'No crane moves in the simulated window', ship: [] as StoreBar[] };
  const vesselId = cargo.units.get(moves[0].cargoUnitId)?.vesselId ?? '';
  const berthId = moves[0].berthId ?? '';
  const done = moves.filter((e) => cargo.eventMs.get(e.transferEventId)!.end <= t).length;
  const lastHour = moves.filter((e) => {
    const end = cargo.eventMs.get(e.transferEventId)!.end;
    return end <= t && end > t - 3_600_000;
  }).length;
  const working = [...ids].filter((id) => frame?.equipment.get(id) === 'transferring').length;
  const occ = slotOccupancyAt(cargo, vesselId, t);
  const totals = containerTotals(cargo, occ);
  const capacity = cargo.plans.get(vesselId)?.grid?.slotCount ?? 0;
  const yard = yardOccupancyAt(cargo, terminalId, t);
  const firstMs = cargo.eventMs.get(moves[0].transferEventId)!.start;
  const lastMs = Math.max(...moves.map((e) => cargo.eventMs.get(e.transferEventId)!.end));
  const phase: OperationPhase = t < firstMs ? 'scheduled' : t >= lastMs ? 'complete' : working ? 'transferring' : 'moored';
  return {
    empty: null,
    operation: {
      operationId: `CRN-${berthId}`,
      vesselId,
      vesselName: c.byId.vessel.get(vesselId)?.name ?? vesselId,
      berthId,
      berthName: c.byId.berth.get(berthId)?.name ?? berthId,
      direction: 'Discharge and load',
      commodity: 'Containers (40 ft)',
      phase,
      phaseLabel: OPERATION_PHASE_LABEL[phase],
      note: null,
      progressPct: (done / moves.length) * 100,
    },
    kpis: [
      { key: 'moves', label: 'Crane moves done', value: `${nf.format(done)} of ${nf.format(moves.length)}` },
      { key: 'rate', label: 'Moves, last hour', value: `${nf.format(lastHour)} moves/h` },
      { key: 'cranes', label: 'Cranes working', value: `${working} of ${ids.size}` },
      { key: 'yard', label: 'Boxes in yard blocks', value: `${nf.format(yard.size)} boxes`, detail: 'From transfer events' },
      { key: 'end', label: 'Crane work ends (EST)', value: formatUtc(lastMs) },
    ],
    ship: [bar('onboard', 'Boxes on board', totals.units, capacity, 'boxes')],
  };
}

/** Terminal card: the berth's (or the terminal's current) operation, its stores and the equipment list. */
export function terminalOpsView(c: Catalog, model: PortTwinModel, terminalId: string, berthId: string | null, cargo: CargoIndex | null, frame: TwinOpsFrame | null, t: number): TerminalOpsView | null {
  const ops = c.terminalOps;
  const tm = model.terminals.find((x) => x.terminalId === terminalId);
  if (!ops || !tm) return null;
  const all = ops.equipmentByTerminal.get(terminalId) ?? [];
  const list = berthId ? all.filter((e) => e.berthId === berthId || e.berthId === null) : all;
  const base = {
    terminalId,
    name: tm.name,
    type: tm.terminalType,
    typeLabel: TERMINAL_TYPE_LABEL[tm.terminalType],
    equipment: equipmentRows(ops, list, frame, t),
    basis: `Simulated · EST · ${formatUtc(t)}`,
    shore: [] as StoreBar[],
    hazard: null as TerminalOpsView['hazard'],
  };
  if (tm.terminalType === 'container') {
    const cranes = list.filter(isCrane);
    if (!cranes.length) return { ...base, operation: null, kpis: [], shipLabel: '', ship: [], empty: 'No equipment events in the simulated window for this terminal' };
    const v = containerView(c, cargo, terminalId, cranes, frame, t);
    return { ...base, ...v, shipLabel: 'Vessel' };
  }
  const berths = berthId ? [berthId] : tm.berthIds;
  const op = berths.map((b) => berthOperationAt(ops, b, t)).find((x) => !!x) ?? null;
  const zoneBerth = berths.find((b) => ops.zonesByBerth.has(b));
  const zone = zoneBerth ? ops.zonesByBerth.get(zoneBerth)! : null;
  if (!op) return { ...base, operation: null, kpis: [], shipLabel: '', ship: [], empty: 'No vessel operation at this berth in the simulated window' };
  const s = operationAt(op, t);
  const levels = storeLevelsAt(op, t, ops.equipment);
  const o = op.op;
  const call = c.v2?.bookingsByVessel.get(o.vesselId)?.find((b) => b.bookingId === o.bookingId);
  const dep = call?.milestones.find((m) => m.eventType === 'DEPARTURE' && m.classifier === 'PLN')?.atUtc ?? null;
  const verb = o.direction === 'load' ? 'Loaded' : 'Discharged';
  return {
    ...base,
    operation: {
      operationId: o.operationId,
      vesselId: o.vesselId,
      vesselName: c.byId.vessel.get(o.vesselId)?.name ?? o.vesselId,
      berthId: o.berthId,
      berthName: c.byId.berth.get(o.berthId)?.name ?? o.berthId,
      direction: o.direction === 'load' ? 'Loading' : 'Discharging',
      commodity: o.commodity,
      phase: s.phase,
      phaseLabel: OPERATION_PHASE_LABEL[s.phase],
      note: s.note,
      progressPct: s.progress * 100,
    },
    kpis: [
      { key: 'rate', label: 'Throughput now', value: `${nf.format(s.ratePerHour)} ${UNIT_LABEL[o.rateUnit]}` },
      { key: 'done', label: verb, value: `${formatQty(s.doneQty, o.unit)} of ${formatQty(s.totalQty, o.unit)}` },
      { key: 'remaining', label: 'Remaining', value: formatQty(s.remainingQty, o.unit) },
      { key: 'end', label: 'Cargo work ends (EST)', value: formatUtc(s.workEndMs) },
      ...(dep ? [{ key: 'dep', label: 'Departure (PLN)', value: formatUtc(dep) }] : []),
    ],
    shipLabel: o.terminalType === 'lng' ? 'Cargo tanks' : o.terminalType === 'roro' ? 'Vehicle decks' : 'Holds',
    ship: levels.ship.map((x) => bar(x.id, x.label, x.quantity, x.capacity, o.unit)),
    shore: levels.shore.map((x) => bar(x.id, x.label, x.quantity, x.capacity, o.unit)),
    hazard: zone ? { zoneId: zone.zoneId, label: zone.label, radiusM: zone.radiusMeters, active: s.phase === 'hazard' } : null,
    empty: null,
  };
}

export interface EquipmentCardView {
  equipmentId: string;
  label: string;
  kindLabel: string;
  terminalName: string;
  berthId: string | null;
  berthName: string | null;
  status: EquipmentStatus;
  statusLabel: string;
  note: string | null;
  facts: { label: string; value: string }[];
  vessel: { vesselId: string; name: string } | null;
  source: string;
}

/** Technical card for one piece of equipment (spec 05/09 B.02): name, status, one live figure and its links. */
export function equipmentCardView(c: Catalog, equipmentId: string, cargo: CargoIndex | null, frame: TwinOpsFrame | null, t: number): EquipmentCardView | null {
  const ops = c.terminalOps;
  const e = ops?.equipment.get(equipmentId);
  if (!ops || !e) return null;
  const st = equipmentStatusAt(ops, equipmentId, t);
  const facts: { label: string; value: string }[] = [];
  let status = st.status;
  let statusLabel = EQUIPMENT_STATUS_LABEL[status];
  let vessel: EquipmentCardView['vessel'] = null;
  if (e.ratedCapacity !== null && e.capacityUnit) facts.push({ label: STORE_KINDS.has(e.kind) ? 'Capacity' : 'Rated', value: formatQty(e.ratedCapacity, e.capacityUnit) });
  if (isCrane(e)) {
    const s = frame?.cranes.get(equipmentId) ?? (cargo ? craneStateAt(craneTimelinesOf(cargo).get(equipmentId), equipmentId, t) : null);
    if (s) {
      status = craneStatus(s);
      statusLabel = CRANE_PHASE_LABEL[s.phase];
      if (s.transferEventId && cargo) {
        const unit = cargo.units.get(s.cargoUnitId ?? '');
        facts.push({ label: 'Event', value: s.transferEventId }, { label: 'Container', value: unit?.containerNo ?? s.cargoUnitId ?? '' }, { label: 'Move', value: s.kind === 'discharge' ? 'Discharge to yard' : 'Load to ship' });
        if (unit) vessel = { vesselId: unit.vesselId, name: c.byId.vessel.get(unit.vesselId)?.name ?? unit.vesselId };
      }
      const moves = cargo?.events.filter((x) => x.craneId === equipmentId) ?? [];
      if (moves.length) facts.push({ label: 'Moves done', value: `${moves.filter((x) => cargo!.eventMs.get(x.transferEventId)!.end <= t).length} of ${moves.length}` });
    } else facts.push({ label: 'Moves', value: 'Loading the simulated cargo module…' });
  } else {
    const level = STORE_KINDS.has(e.kind) ? shoreLevelAt(ops, equipmentId, t) : null;
    if (level && e.capacityUnit) facts.push({ label: 'Level', value: `${formatQty(level.quantity, e.capacityUnit)} (${Math.round(pct(level.quantity, level.capacity))} %)` });
    if (e.kind === 'silo') facts.push({ label: 'Level', value: 'Not modelled in the simulation' });
    const op = st.operationId ? ops.opsByTerminal.get(e.terminalId)?.find((x) => x.op.operationId === st.operationId) : null;
    if (op) {
      const s = operationAt(op, t);
      facts.push({ label: 'Operation', value: op.op.operationId });
      if (status === 'transferring' && !STORE_KINDS.has(e.kind)) facts.push({ label: 'Flow now', value: `${nf.format(s.ratePerHour)} ${UNIT_LABEL[op.op.rateUnit]}` });
      vessel = { vesselId: op.op.vesselId, name: c.byId.vessel.get(op.op.vesselId)?.name ?? op.op.vesselId };
    }
  }
  return {
    equipmentId,
    label: e.label,
    kindLabel: EQUIPMENT_KIND_LABEL[e.kind],
    terminalName: c.byId.terminal.get(e.terminalId)?.name ?? e.terminalId,
    berthId: e.berthId,
    berthName: e.berthId ? (c.byId.berth.get(e.berthId)?.name ?? e.berthId) : null,
    status,
    statusLabel,
    note: st.note,
    facts,
    vessel,
    source: `Simulated · ${e.sourceType} · ${formatUtc(t)}`,
  };
}

/** Terminal the port panel opens on: the selected equipment's or berth's, else the first terminal with equipment. */
export function defaultTerminal(c: Catalog, model: PortTwinModel, berthId: string | null, equipmentId: string | null): string | null {
  const e = equipmentId ? c.terminalOps?.equipment.get(equipmentId) : null;
  if (e && model.terminals.some((t) => t.terminalId === e.terminalId)) return e.terminalId;
  const b = berthId ? model.berths.find((x) => x.berthId === berthId) : null;
  if (b) return b.terminalId;
  return model.terminals.find((t) => c.terminalOps?.equipmentByTerminal.has(t.terminalId))?.terminalId ?? model.terminals[0]?.terminalId ?? null;
}

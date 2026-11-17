import type { TransferEvent } from '@/core/cargoTypes';
import type { EquipmentStatus, HazardZone, OperationStatus, TerminalEquipment, TerminalOperation, TerminalOpsModule, TerminalType } from '@/core/terminalTypes';
import { parseUtc } from '@/core/time';

/**
 * Typed terminal operations (spec 05/03–05/06) as pure functions of scenario time. A store's level at `t` is its start
 * level plus rate × elapsed time of every transfer segment routed to it, so seeking backwards reproduces the same
 * state and ship + shore totals are conserved at every instant.
 */

interface CompiledSegment {
  startMs: number;
  endMs: number;
  status: OperationStatus;
  ratePerHour: number;
  storeId: string | null;
  note: string | null;
}

export interface CompiledOperation {
  op: TerminalOperation;
  segments: CompiledSegment[];
  startMs: number;
  endMs: number;
  /** +1 when cargo moves shore → ship (load), −1 for discharge. */
  sign: 1 | -1;
  totalQty: number;
  /** End of the last transfer segment: the estimated completion of cargo work. */
  workEndMs: number;
}

export interface OpsIndex {
  module: TerminalOpsModule;
  typeByTerminal: Map<string, TerminalType>;
  equipment: Map<string, TerminalEquipment>;
  equipmentByTerminal: Map<string, TerminalEquipment[]>;
  opsByBerth: Map<string, CompiledOperation[]>;
  opsByVessel: Map<string, CompiledOperation[]>;
  opsByTerminal: Map<string, CompiledOperation[]>;
  zonesByBerth: Map<string, HazardZone>;
  maintenance: Map<string, { startMs: number; endMs: number; reason: string }[]>;
}

const H = 3_600_000;

function push<V>(m: Map<string, V[]>, k: string, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export function compileOperation(op: TerminalOperation): CompiledOperation {
  const segments = op.segments.map((s) => ({
    startMs: parseUtc(s.startUtc) ?? 0,
    endMs: parseUtc(s.endUtc) ?? 0,
    status: s.status,
    ratePerHour: s.ratePerHour,
    storeId: s.shoreStoreId,
    note: s.note,
  }));
  const moving = segments.filter((s) => s.status === 'transferring');
  return {
    op,
    segments,
    startMs: segments[0]?.startMs ?? 0,
    endMs: segments[segments.length - 1]?.endMs ?? 0,
    sign: op.direction === 'load' ? 1 : -1,
    totalQty: moving.reduce((n, s) => n + (s.ratePerHour * (s.endMs - s.startMs)) / H, 0),
    workEndMs: moving.length ? moving[moving.length - 1].endMs : (segments[0]?.startMs ?? 0),
  };
}

export function buildOpsIndex(m: TerminalOpsModule): OpsIndex {
  const equipment = new Map(m.equipment.map((e) => [e.equipmentId, e] as const));
  const equipmentByTerminal = new Map<string, TerminalEquipment[]>();
  const maintenance = new Map<string, { startMs: number; endMs: number; reason: string }[]>();
  for (const e of m.equipment) {
    push(equipmentByTerminal, e.terminalId, e);
    if (e.maintenance.length) maintenance.set(e.equipmentId, e.maintenance.map((w) => ({ startMs: parseUtc(w.startUtc) ?? 0, endMs: parseUtc(w.endUtc) ?? 0, reason: w.reason })));
  }
  const opsByBerth = new Map<string, CompiledOperation[]>();
  const opsByVessel = new Map<string, CompiledOperation[]>();
  const opsByTerminal = new Map<string, CompiledOperation[]>();
  for (const op of m.operations) {
    const c = compileOperation(op);
    push(opsByBerth, op.berthId, c);
    push(opsByVessel, op.vesselId, c);
    push(opsByTerminal, op.terminalId, c);
  }
  for (const list of [opsByBerth, opsByVessel, opsByTerminal]) for (const ops of list.values()) ops.sort((a, b) => a.startMs - b.startMs);
  return {
    module: m,
    typeByTerminal: new Map(Object.entries(m.terminalTypes)),
    equipment,
    equipmentByTerminal,
    opsByBerth,
    opsByVessel,
    opsByTerminal,
    zonesByBerth: new Map(m.hazardZones.map((z) => [z.berthId, z] as const)),
    maintenance,
  };
}

export type OperationPhase = 'scheduled' | OperationStatus | 'complete';

export interface OperationState {
  operationId: string;
  phase: OperationPhase;
  note: string | null;
  doneQty: number;
  totalQty: number;
  remainingQty: number;
  /** Current transfer rate (0 unless transferring). */
  ratePerHour: number;
  progress: number;
  workEndMs: number;
  endMs: number;
  /** Next segment boundary after `t` (null once complete). */
  nextChangeMs: number | null;
}

function segmentAt(c: CompiledOperation, t: number): CompiledSegment | null {
  for (const s of c.segments) if (t >= s.startMs && t < s.endMs) return s;
  return null;
}

/** Quantity moved by `t`, per shore store. */
function movedByStore(c: CompiledOperation, t: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of c.segments) {
    if (s.status !== 'transferring' || !s.storeId || t <= s.startMs) continue;
    const q = (s.ratePerHour * (Math.min(t, s.endMs) - s.startMs)) / H;
    out.set(s.storeId, (out.get(s.storeId) ?? 0) + q);
  }
  return out;
}

export function operationAt(c: CompiledOperation, t: number): OperationState {
  let done = 0;
  for (const q of movedByStore(c, t).values()) done += q;
  const seg = segmentAt(c, t);
  const phase: OperationPhase = t < c.startMs ? 'scheduled' : t >= c.endMs ? 'complete' : (seg?.status ?? 'moored');
  const next = c.segments.find((s) => s.startMs > t)?.startMs ?? (t < c.endMs ? c.endMs : null);
  return {
    operationId: c.op.operationId,
    phase,
    note: seg?.note ?? null,
    doneQty: done,
    totalQty: c.totalQty,
    remainingQty: Math.max(0, c.totalQty - done),
    ratePerHour: seg?.status === 'transferring' ? seg.ratePerHour : 0,
    progress: c.totalQty > 0 ? Math.min(1, done / c.totalQty) : 0,
    workEndMs: c.workEndMs,
    endMs: c.endMs,
    nextChangeMs: next,
  };
}

export interface StoreLevel {
  id: string;
  label: string;
  quantity: number;
  capacity: number;
}

/** Ship compartments (filled or emptied in proportion to capacity) and shore stores at `t`. */
export function storeLevelsAt(c: CompiledOperation, t: number, equipment: Map<string, TerminalEquipment>): { ship: StoreLevel[]; shore: StoreLevel[] } {
  const moved = movedByStore(c, t);
  let total = 0;
  for (const q of moved.values()) total += q;
  const cap = c.op.shipCompartments.reduce((n, x) => n + x.capacity, 0) || 1;
  return {
    ship: c.op.shipCompartments.map((x) => ({ id: x.compartmentId, label: x.label, capacity: x.capacity, quantity: x.startQuantity + (c.sign * total * x.capacity) / cap })),
    shore: c.op.shoreStores.map((s) => ({
      id: s.equipmentId,
      label: equipment.get(s.equipmentId)?.label ?? s.equipmentId,
      capacity: equipment.get(s.equipmentId)?.ratedCapacity ?? 0,
      quantity: s.startQuantity - c.sign * (moved.get(s.equipmentId) ?? 0),
    })),
  };
}

/** Level of a shore store at `t` across every operation that touches it (its start level when none does). */
export function shoreLevelAt(idx: OpsIndex, equipmentId: string, t: number): StoreLevel | null {
  const e = idx.equipment.get(equipmentId);
  if (!e || e.ratedCapacity === null) return null;
  const ops = (idx.opsByTerminal.get(e.terminalId) ?? []).filter((c) => c.op.shoreStores.some((s) => s.equipmentId === equipmentId));
  if (!ops.length) return null;
  const first = ops[0].op.shoreStores.find((s) => s.equipmentId === equipmentId)!.startQuantity;
  let q = first;
  for (const c of ops) q -= c.sign * (movedByStore(c, t).get(equipmentId) ?? 0);
  return { id: equipmentId, label: e.label, capacity: e.ratedCapacity, quantity: q };
}

export interface EquipmentState {
  equipmentId: string;
  status: EquipmentStatus;
  operationId: string | null;
  note: string | null;
}

/** Maintenance windows win; otherwise the status of the operation segment the equipment serves, else idle. */
export function equipmentStatusAt(idx: OpsIndex, equipmentId: string, t: number): EquipmentState {
  const e = idx.equipment.get(equipmentId);
  const win = idx.maintenance.get(equipmentId)?.find((w) => t >= w.startMs && t < w.endMs);
  if (win) return { equipmentId, status: 'maintenance', operationId: null, note: win.reason };
  if (e) {
    for (const c of idx.opsByTerminal.get(e.terminalId) ?? []) {
      if (!c.op.equipmentIds.includes(equipmentId) || t < c.startMs || t >= c.endMs) continue;
      const seg = segmentAt(c, t);
      if (!seg) continue;
      // A store or conveyor only works while cargo moves through it; when the transfer routes elsewhere it idles.
      const routed = seg.status !== 'transferring' || !c.op.shoreStores.some((s) => s.equipmentId === equipmentId) || seg.storeId === equipmentId;
      return { equipmentId, status: routed ? seg.status : 'idle', operationId: c.op.operationId, note: seg.note };
    }
  }
  return { equipmentId, status: 'idle', operationId: null, note: null };
}

/** The operation in progress (or the next one) at a berth. */
export function berthOperationAt(idx: OpsIndex, berthId: string, t: number): CompiledOperation | null {
  const ops = idx.opsByBerth.get(berthId) ?? [];
  return ops.find((c) => t >= c.startMs && t < c.endMs) ?? ops.find((c) => c.startMs > t) ?? null;
}

// ---- container cranes ------------------------------------------------------------------------------------------

export type CranePhase = 'idle' | 'ready' | 'trolley_align' | 'descend' | 'attach' | 'hoist' | 'travel' | 'release';

export interface CraneState {
  craneId: string;
  phase: CranePhase;
  transferEventId: string | null;
  cargoUnitId: string | null;
  kind: 'load' | 'discharge' | null;
  /** 0 = over the landside lane, 1 = over the ship at outreach. */
  trolley: number;
  /** 1 = spreader at the top, 0 = lowered onto the box. */
  hoist: number;
  carrying: boolean;
  progress: number;
}

/** Fractions of one lift (spec 05/02 B.03): ready → trolley align → descend → attach → hoist → travel → release → idle. */
export const CRANE_PHASES: { phase: Exclude<CranePhase, 'idle' | 'ready'>; until: number }[] = [
  { phase: 'trolley_align', until: 0.14 },
  { phase: 'descend', until: 0.28 },
  { phase: 'attach', until: 0.34 },
  { phase: 'hoist', until: 0.5 },
  { phase: 'travel', until: 0.78 },
  { phase: 'release', until: 1 },
];
const READY_GAP_MS = 90_000;
const PARK = 0.35;

const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * ease(Math.min(1, Math.max(0, k)));

export interface CraneTimeline {
  craneId: string;
  events: { id: string; unit: string; kind: 'load' | 'discharge'; startMs: number; endMs: number }[];
}

export function craneTimelines(events: TransferEvent[]): Map<string, CraneTimeline> {
  const out = new Map<string, CraneTimeline>();
  for (const e of events) {
    if (!e.craneId || e.kind === 'gate_out') continue;
    let tl = out.get(e.craneId);
    if (!tl) out.set(e.craneId, (tl = { craneId: e.craneId, events: [] }));
    tl.events.push({ id: e.transferEventId, unit: e.cargoUnitId, kind: e.kind, startMs: parseUtc(e.startUtc) ?? 0, endMs: parseUtc(e.endUtc) ?? 0 });
  }
  for (const tl of out.values()) tl.events.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/** Crane pose and phase at `t`, from its transfer events only (no event → idle, parked; never animates without cause). */
export function craneStateAt(tl: CraneTimeline | undefined, craneId: string, t: number): CraneState {
  const idle: CraneState = { craneId, phase: 'idle', transferEventId: null, cargoUnitId: null, kind: null, trolley: PARK, hoist: 1, carrying: false, progress: 0 };
  if (!tl || !tl.events.length) return idle;
  const ev = tl.events;
  let lo = 0;
  let hi = ev.length - 1;
  let k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ev[mid].startMs <= t) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const cur = k >= 0 && t < ev[k].endMs ? ev[k] : null;
  if (!cur) {
    const prev = k >= 0 ? ev[k] : null;
    const next = ev[k + 1] ?? null;
    const rest = prev ? (prev.kind === 'discharge' ? 0 : 1) : PARK;
    const near = (prev && t - prev.endMs < READY_GAP_MS) || (next && next.startMs - t < READY_GAP_MS);
    return { ...idle, phase: near ? 'ready' : 'idle', trolley: near ? rest : PARK };
  }
  const prev = k > 0 ? ev[k - 1] : null;
  const from = prev && cur.startMs - prev.endMs < READY_GAP_MS ? (prev.kind === 'discharge' ? 0 : 1) : PARK;
  const pick = cur.kind === 'discharge' ? 1 : 0;
  const drop = 1 - pick;
  const p = (t - cur.startMs) / Math.max(1, cur.endMs - cur.startMs);
  const at = (i: number) => (i === 0 ? 0 : CRANE_PHASES[i - 1].until);
  const i = CRANE_PHASES.findIndex((x) => p < x.until);
  const phaseIdx = i < 0 ? CRANE_PHASES.length - 1 : i;
  const local = (p - at(phaseIdx)) / (CRANE_PHASES[phaseIdx].until - at(phaseIdx));
  const phase = CRANE_PHASES[phaseIdx].phase;
  let trolley = pick;
  let hoist = 1;
  let carrying = false;
  switch (phase) {
    case 'trolley_align':
      trolley = lerp(from, pick, local);
      break;
    case 'descend':
      hoist = lerp(1, 0, local);
      break;
    case 'attach':
      hoist = 0;
      carrying = local > 0.5;
      break;
    case 'hoist':
      hoist = lerp(0, 1, local);
      carrying = true;
      break;
    case 'travel':
      trolley = lerp(pick, drop, local);
      carrying = true;
      break;
    case 'release':
      trolley = drop;
      hoist = local < 0.6 ? lerp(1, 0, local / 0.6) : local < 0.75 ? 0 : lerp(0, 1, (local - 0.75) / 0.25);
      carrying = local < 0.68;
      break;
  }
  return { craneId, phase, transferEventId: cur.id, cargoUnitId: cur.unit, kind: cur.kind, trolley, hoist, carrying, progress: p };
}

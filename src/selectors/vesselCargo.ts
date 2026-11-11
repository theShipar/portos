import type { CargoArchetype, CargoUnit, Compartment, StowagePlan } from '@/core/cargoTypes';
import { formatCount, formatPercent, formatUtc, sentenceCase } from '@/core/format';
import type { Catalog } from '@/data/catalog';
import {
  archetypeOf,
  compartmentOf,
  containerLocationAt,
  containerTotals,
  craneWindow,
  holdCount,
  holdOfBay,
  slotIdOf,
  slotOccupancyAt,
  stowageLookup,
  upcomingTransfers,
  type CargoIndex,
  type CargoLocation,
} from '@/engines/cargo';
import { LATE_THRESHOLD_MINUTES } from '@/engines/kpis';
import type { Snapshot } from '@/engines/snapshot';
import type { StatusStyle, StatusTone } from '@/styles/tokens';
import type { InspectorField } from './vessel';
import { routeProgress, type RouteProgress } from './vesselBrief';

export const CARGO_DISCLOSURE = 'Simulated stowage and manifest (sample-data/v3). Not a real booking, manifest or terminal record.';

const ARCHETYPE_LABEL: Record<CargoArchetype, string> = {
  container: 'Container stowage',
  bulk: 'Dry bulk holds',
  tanker: 'Liquid cargo tanks',
  lng: 'LNG cargo tanks',
  roro: 'Vehicle decks',
  general: 'General cargo holds',
};

const portName = (c: Catalog, id: string) => c.byId.port.get(id)?.name ?? id;

// ---------------- cruise progress ----------------

export interface CruiseProgressModel {
  origin: string;
  destination: string;
  originCaption: string;
  destinationCaption: string;
  progress: number;
  label: string;
  valueText: string;
  tone: StatusTone;
  basis: RouteProgress['basis'];
  basisText: string;
  remainingText: string;
  progressText: string;
}

/** Origin → destination cruise progress for the V3 sidebar; wraps `routeProgress` and adds departure and ETA captions. */
export function selectCruiseProgress(c: Catalog, snap: Snapshot, vesselId: string): CruiseProgressModel | null {
  const p = routeProgress(c, snap, vesselId);
  const v = c.byId.vessel.get(vesselId);
  const voyage = v?.currentVoyageId ? c.byId.voyage.get(v.currentVoyageId) : null;
  if (!p || !voyage) return null;
  const eta = snap.etas.get(voyage.voyageId) ?? null;
  const shift = eta?.etaShiftMinutes ?? null;
  const tone: StatusTone = shift === null ? 'info' : shift > 12 * 60 ? 'critical' : shift > LATE_THRESHOLD_MINUTES ? 'warning' : 'info';
  const departed = voyage.departedAtUtc;
  return {
    origin: p.originName,
    destination: p.destinationName,
    originCaption: departed ? `ATD ${formatUtc(departed)}` : voyage.estimatedDepartureUtc ? `ETD ${formatUtc(voyage.estimatedDepartureUtc)}` : 'Not departed',
    destinationCaption: p.etaText,
    progress: p.progress,
    label: `Cruise progress ${p.originName} to ${p.destinationName}`,
    valueText: `${p.progressText} of ${p.originName} to ${p.destinationName}; ${p.remainingText}; ${p.etaText}`,
    tone,
    basis: p.basis,
    basisText: p.basisText,
    remainingText: p.remainingText,
    progressText: p.progressText,
  };
}

// ---------------- cargo summary ----------------

export interface DestinationShare {
  portId: string;
  name: string;
  count: number;
  share: number;
  /** CSS width of the share bar, e.g. `42.5%`. */
  shareWidth: string;
  countText: string;
  /** Palette index; the 3D preview and the bay grid use the same order. */
  swatch: number;
}

export interface CompartmentRow {
  compartmentId: string;
  label: string;
  fill: number;
  fillText: string;
  fillWidth: string;
  quantityText: string;
  commodity: string;
}

export interface CargoSummaryModel {
  archetype: CargoArchetype;
  title: string;
  kind: 'slots' | 'compartments';
  headline: { label: string; value: string }[];
  destinations: DestinationShare[];
  notes: string[];
  compartments: CompartmentRow[];
  nextMoves: { id: string; text: string; timeText: string; ms: number }[];
  craneText: string | null;
  holdCount: number;
  asOfText: string;
}

/** Discharge-port palette order: earliest call first (the next port of the voyage), then by count. */
export function destinationOrder(c: Catalog, idx: CargoIndex, vesselId: string): string[] {
  const v = c.byId.vessel.get(vesselId);
  const voyage = v?.currentVoyageId ? c.byId.voyage.get(v.currentVoyageId) : null;
  const counts = new Map<string, number>();
  for (const u of idx.unitsByVessel.get(vesselId) ?? []) counts.set(u.destinationPortId, (counts.get(u.destinationPortId) ?? 0) + 1);
  const first = voyage?.originPortId;
  return [...counts.keys()].sort((a, b) => (a === first ? -1 : b === first ? 1 : (counts.get(b)! - counts.get(a)!) || a.localeCompare(b)));
}

function quantityText(n: number, unit: Compartment['unit']): string {
  return unit === 'units' ? `${formatCount(n)} vehicles` : unit === 'm3' ? `${formatCount(n)} m³` : `${formatCount(n)} t`;
}

export function selectCargoSummary(c: Catalog, idx: CargoIndex, vesselId: string, t: number): CargoSummaryModel | null {
  const plan = idx.plans.get(vesselId);
  if (!plan) return null;
  const asOfText = `Simulated · as of ${formatUtc(t)}`;
  if (plan.archetype !== 'container') {
    const rows: CompartmentRow[] = plan.compartments.map((cmp) => {
      const lot = idx.units.get(cmp.cargoUnitIds[0] ?? '');
      return {
        compartmentId: cmp.compartmentId,
        label: cmp.label,
        fill: cmp.fillFraction,
        fillText: formatPercent(cmp.fillFraction, 0),
        fillWidth: `${(cmp.fillFraction * 100).toFixed(1)}%`,
        quantityText: quantityText(lot?.quantity ?? 0, cmp.unit),
        commodity: lot ? sentenceCase(lot.cargo.category) : 'Empty',
      };
    });
    const total = plan.compartments.reduce((s, cmp) => s + (idx.units.get(cmp.cargoUnitIds[0] ?? '')?.quantity ?? 0), 0);
    const capacity = plan.compartments.reduce((s, cmp) => s + cmp.capacity, 0);
    const unit = plan.compartments[0]?.unit ?? 't';
    const lot = idx.units.get(plan.compartments[0]?.cargoUnitIds[0] ?? '');
    return {
      archetype: plan.archetype,
      title: ARCHETYPE_LABEL[plan.archetype],
      kind: 'compartments',
      headline: [
        { label: 'Cargo', value: lot ? sentenceCase(lot.cargo.category) : 'None' },
        { label: 'Loaded', value: quantityText(total, unit) },
        { label: 'Fill', value: formatPercent(capacity ? total / capacity : 0, 0) },
      ],
      destinations: lot
        ? [{ portId: lot.destinationPortId, name: portName(c, lot.destinationPortId), count: plan.compartments.length, share: 1, shareWidth: '100%', countText: `${plan.compartments.length} ${plan.compartments[0]?.kind ?? 'hold'}s`, swatch: 0 }]
        : [],
      notes: lot?.cargo.hazardClass ? [`IMO class ${lot.cargo.hazardClass} cargo`] : [],
      compartments: rows,
      nextMoves: [],
      craneText: null,
      holdCount: holdCount(plan),
      asOfText,
    };
  }
  const occ = slotOccupancyAt(idx, vesselId, t);
  const totals = containerTotals(idx, occ);
  const slots = plan.slots.length;
  const order = destinationOrder(c, idx, vesselId);
  const destinations = order
    .map((portId, i) => {
      const count = totals.byDestination.get(portId) ?? 0;
      const share = totals.units ? count / totals.units : 0;
      return { portId, name: portName(c, portId), count, share, shareWidth: `${(share * 100).toFixed(1)}%`, countText: `${formatCount(count)} · ${formatPercent(share, 0)}`, swatch: i };
    })
    .filter((d) => d.count > 0);
  const notes: string[] = [];
  if (totals.reefers) notes.push(`${totals.reefers} reefer${totals.reefers === 1 ? '' : 's'}`);
  if (totals.hazardous) notes.push(`${totals.hazardous} dangerous goods`);
  if (totals.restricted) notes.push(`${totals.restricted} restricted manifest${totals.restricted === 1 ? '' : 's'}`);
  const crane = craneWindow(idx, vesselId);
  const craneText = crane ? `${formatCount(crane.moves)} crane moves planned ${formatUtc(crane.start)} – ${formatUtc(crane.end)} (EST)` : 'No crane moves in the simulated window: no berth confirmed';
  return {
    archetype: 'container',
    title: ARCHETYPE_LABEL.container,
    kind: 'slots',
    headline: [
      { label: 'On board', value: `${formatCount(totals.units)} boxes` },
      { label: 'TEU', value: formatCount(totals.teu) },
      { label: 'Slots used', value: `${formatPercent(slots ? totals.units / slots : 0, 0)} of ${formatCount(slots)}` },
      { label: 'Net mass', value: `${formatCount(Math.round(totals.netMassKg / 1000))} t` },
    ],
    destinations,
    notes,
    compartments: [],
    nextMoves: upcomingTransfers(idx, vesselId, t).map((e) => {
      const u = idx.units.get(e.cargoUnitId);
      const w = idx.eventMs.get(e.transferEventId)!;
      const verb = e.kind === 'discharge' ? 'Discharge' : 'Load';
      return { id: e.transferEventId, text: `${verb} ${u?.containerNo ?? e.cargoUnitId} · ${e.craneId ?? ''}`, timeText: w.start <= t ? 'under way' : formatUtc(w.start), ms: w.start };
    }),
    craneText,
    holdCount: holdCount(plan),
    asOfText,
  };
}

// ---------------- bay section (bay / row / tier picking) ----------------

export interface BayCell {
  slotId: string;
  row: number;
  tier: number;
  filled: boolean;
  swatch: number | null;
  restricted: boolean;
  label: string;
}

export interface BaySection {
  bay: number;
  hold: number;
  /** Rows in display order: port side (even) on the left, starboard (odd) on the right, as seen from aft. */
  rows: number[];
  /** Tiers top to bottom: deck tiers, then hold tiers. */
  tiers: number[];
  hatchAfter: number;
  cells: Map<string, BayCell>;
  /** Display lines, top tier first; each holds the cells in `rows` order. */
  lines: { tier: number; tierText: string; hatchBefore: boolean; cells: BayCell[] }[];
  filled: number;
  ariaLabel: string;
}

export function rowDisplayOrder(rows: number[]): number[] {
  const even = rows.filter((r) => r % 2 === 0).sort((a, b) => b - a);
  const odd = rows.filter((r) => r % 2 === 1).sort((a, b) => a - b);
  return [...even, ...odd];
}

export function slotLabel(bay: number, row: number, tier: number): string {
  return `Bay ${String(bay).padStart(2, '0')} · Row ${String(row).padStart(2, '0')} · Tier ${String(tier).padStart(2, '0')} ${tier >= 80 ? '(deck)' : '(hold)'}`;
}

export function selectBaySection(c: Catalog, idx: CargoIndex, vesselId: string, bay: number, t: number, occupancy?: Map<string, string>): BaySection | null {
  const plan = idx.plans.get(vesselId);
  if (!plan?.grid || !plan.grid.bays.includes(bay)) return null;
  const occ = occupancy ?? slotOccupancyAt(idx, vesselId, t);
  const order = destinationOrder(c, idx, vesselId);
  const cells = new Map<string, BayCell>();
  let filled = 0;
  for (const s of plan.slots) {
    if (s.bay !== bay) continue;
    const uid = occ.get(s.slotId) ?? null;
    const u = uid ? idx.units.get(uid) : undefined;
    if (u) filled++;
    cells.set(s.slotId, {
      slotId: s.slotId,
      row: s.row,
      tier: s.tier,
      filled: !!u,
      swatch: u ? order.indexOf(u.destinationPortId) : null,
      restricted: u?.cargo.detailsVisibility === 'restricted',
      label: `${slotLabel(s.bay, s.row, s.tier)}: ${u ? `${u.containerNo} to ${portName(c, u.destinationPortId)}` : 'empty'}`,
    });
  }
  const above = [...plan.grid.tiersAbove].sort((a, b) => b - a);
  const below = [...plan.grid.tiersBelow].sort((a, b) => b - a);
  const rows = rowDisplayOrder(plan.grid.rows);
  const tiers = [...above, ...below];
  const pad = (n: number) => String(n).padStart(2, '0');
  const lines = tiers.map((tier, i) => ({
    tier,
    tierText: pad(tier),
    hatchBefore: i === above.length,
    cells: rows.map((r) => cells.get(slotIdOf(bay, r, tier))).filter((x): x is BayCell => !!x),
  }));
  const hold = holdOfBay(plan, bay);
  return {
    bay,
    hold,
    rows,
    tiers,
    hatchAfter: above.length,
    cells,
    lines,
    filled,
    ariaLabel: `Bay ${pad(bay)} cross-section seen from aft, hold ${hold}: ${filled} of ${cells.size} slots filled`,
  };
}

export function baysOfHold(plan: StowagePlan, hold: number): number[] {
  return (plan.grid?.bays ?? []).filter((b) => holdOfBay(plan, b) === hold);
}

// ---------------- slot detail and manifest ----------------

export interface ManifestModel {
  cargoUnitId: string;
  title: string;
  eyebrow: string;
  caption: string;
  restricted: boolean;
  chips: StatusStyle[];
  fields: InspectorField[];
  locationText: string;
  nextText: string | null;
}

export interface SlotDetailModel {
  kind: 'slot';
  slotId: string;
  label: string;
  hold: number;
  manifest: ManifestModel | null;
}

export interface CompartmentDetailModel {
  kind: 'compartment';
  compartmentId: string;
  label: string;
  fields: InspectorField[];
  manifest: ManifestModel | null;
}

const RESTRICTED = 'Restricted · cargo manager role';

export function formatContainerNo(no: string | undefined): string {
  return no && no.length === 11 ? `${no.slice(0, 4)} ${no.slice(4, 10)} ${no.slice(10)}` : (no ?? '—');
}

export function locationText(c: Catalog, idx: CargoIndex, loc: CargoLocation | null): string {
  if (!loc) return 'Unknown';
  switch (loc.type) {
    case 'vessel_slot': {
      const s = idx.slots.get(loc.vesselId)?.get(loc.slotId);
      const v = c.byId.vessel.get(loc.vesselId);
      return s ? `On board ${v?.name ?? loc.vesselId} · ${slotLabel(s.bay, s.row, s.tier)}` : `On board ${loc.vesselId}`;
    }
    case 'compartment':
      return `On board ${c.byId.vessel.get(loc.vesselId)?.name ?? loc.vesselId} · ${loc.compartmentId}`;
    case 'yard_slot': {
      const y = idx.yard.get(loc.yardSlotId);
      return y ? `Yard ${y.terminalId} · block ${y.block}, bay ${y.bay}, row ${y.row}, tier ${y.tier}` : `Yard ${loc.yardSlotId}`;
    }
    case 'crane':
      return `On ${loc.craneId} · ${formatPercent(loc.progress, 0)} of the ${loc.event.kind}`;
    case 'truck':
      return `On a terminal truck to the gate · ${formatPercent(loc.progress, 0)}`;
    case 'gate':
      return `Left ${portName(c, loc.portId)} through ${loc.gateId}`;
    case 'unknown':
      return 'Unknown';
  }
}

function manifestFor(c: Catalog, idx: CargoIndex, u: CargoUnit, t: number): ManifestModel {
  const sh = idx.shipments.get(u.shipmentId);
  const restricted = u.cargo.detailsVisibility === 'restricted';
  const loc = containerLocationAt(idx, u.cargoUnitId, t);
  const next = (idx.eventsByUnit.get(u.cargoUnitId) ?? []).find((e) => idx.eventMs.get(e.transferEventId)!.end > t) ?? null;
  const nextW = next ? idx.eventMs.get(next.transferEventId)! : null;
  const nextText = next && nextW ? `${sentenceCase(next.kind.replace('_', ' '))} ${nextW.start <= t ? 'under way' : formatUtc(nextW.start)} · ${next.craneId ?? 'terminal truck'} (${next.classifier})` : null;
  const commodity = restricted ? RESTRICTED : sentenceCase(u.cargo.category);
  const isContainer = u.kind === 'container';
  const mass = u.cargo.netMassKg ? `${(u.cargo.netMassKg / 1000).toFixed(1)} t net` : u.quantity !== undefined && u.unit ? quantityText(u.quantity, u.unit) : '—';
  const chips: StatusStyle[] = [];
  if (u.cargo.reefer) chips.push({ tone: 'info', label: 'Reefer', icon: 'info' });
  if (u.cargo.hazardClass) chips.push({ tone: 'warning', label: `IMO class ${u.cargo.hazardClass}`, icon: 'alert' });
  if (restricted) chips.push({ tone: 'neutral', label: 'Restricted', icon: 'user' });
  const fields: InspectorField[] = [
    ...(isContainer ? [{ label: 'ISO type', value: `${u.isoType ?? '—'} · ${u.sizeFt ?? 40} ft`, mono: true }] : []),
    { label: 'Commodity', value: commodity },
    { label: isContainer ? 'Net mass' : 'Quantity', value: mass },
    { label: 'Origin → destination', value: `${portName(c, u.originPortId)} → ${portName(c, u.destinationPortId)}` },
    { label: 'Shipment', value: sh ? `${sh.shipmentId} · ${sh.bookingRef}` : u.shipmentId, mono: true },
    { label: 'Shipper', value: restricted ? RESTRICTED : (sh?.shipper ?? '—') },
    { label: 'Consignee', value: restricted ? RESTRICTED : (sh?.consignee ?? '—') },
    { label: 'Units in shipment', value: sh ? formatCount(sh.cargoUnitIds.length) : '—' },
  ];
  return {
    cargoUnitId: u.cargoUnitId,
    title: isContainer ? formatContainerNo(u.containerNo) : `${sentenceCase(u.cargo.category)} lot`,
    eyebrow: 'Manifest · Simulated',
    caption: `${commodity} · ${mass}`,
    restricted,
    chips,
    fields,
    locationText: locationText(c, idx, loc),
    nextText,
  };
}

export function selectSlotDetail(c: Catalog, idx: CargoIndex, vesselId: string, slotId: string, t: number, occupancy?: Map<string, string>): SlotDetailModel | null {
  const hit = stowageLookup(idx, vesselId, slotId, t, occupancy);
  if (!hit) return null;
  const u = hit.cargoUnitId ? idx.units.get(hit.cargoUnitId) : undefined;
  return { kind: 'slot', slotId, label: slotLabel(hit.slot.bay, hit.slot.row, hit.slot.tier), hold: hit.hold, manifest: u ? manifestFor(c, idx, u, t) : null };
}

export function selectCompartmentDetail(c: Catalog, idx: CargoIndex, vesselId: string, compartmentId: string, t: number): CompartmentDetailModel | null {
  const plan = idx.plans.get(vesselId);
  const cmp = plan ? compartmentOf(plan, compartmentId) : null;
  if (!cmp) return null;
  const u = idx.units.get(cmp.cargoUnitIds[0] ?? '');
  return {
    kind: 'compartment',
    compartmentId,
    label: cmp.label,
    fields: [
      { label: 'Capacity', value: quantityText(cmp.capacity, cmp.unit) },
      { label: 'Fill', value: formatPercent(cmp.fillFraction, 0) },
      { label: 'Compartment', value: compartmentId, mono: true },
    ],
    manifest: u ? manifestFor(c, idx, u, t) : null,
  };
}

export interface WorkshopCargoModel {
  occupancy: Map<string, string>;
  filled: Map<string, { swatch: number; restricted: boolean }>;
  holdOfSlot: (slotId: string) => number;
}

/** Filled slots at `t` with their discharge-port swatch, for the 3D workshop and the bay grid. */
export function selectWorkshopCargo(c: Catalog, idx: CargoIndex, vesselId: string, t: number): WorkshopCargoModel | null {
  const plan = idx.plans.get(vesselId);
  if (!plan) return null;
  const occupancy = plan.archetype === 'container' ? slotOccupancyAt(idx, vesselId, t) : new Map<string, string>();
  const order = destinationOrder(c, idx, vesselId);
  const filled = new Map<string, { swatch: number; restricted: boolean }>();
  for (const [slotId, uid] of occupancy) {
    const u = idx.units.get(uid)!;
    filled.set(slotId, { swatch: Math.max(0, order.indexOf(u.destinationPortId)), restricted: u.cargo.detailsVisibility === 'restricted' });
  }
  const slots = idx.slots.get(vesselId);
  return { occupancy, filled, holdOfSlot: (slotId) => holdOfBay(plan, slots?.get(slotId)?.bay ?? -1) };
}

/** Cargo focus is valid only for the vessel's own archetype: container slots on container ships, compartments otherwise. */
export function validCargoFocus(idx: CargoIndex, vesselId: string, focus: string | null): string | null {
  if (!focus) return null;
  const plan = idx.plans.get(vesselId);
  if (!plan) return null;
  if (plan.archetype === 'container') return idx.slots.get(vesselId)?.has(focus) ? focus : null;
  return compartmentOf(plan, focus) ? focus : null;
}

export { archetypeOf };

import type { IsoUtc } from './types';

/** V3 cargo module (`sample-data/v3/`, spec 05/13). Simulated records; never a real manifest or TOS export. */
export type CargoArchetype = 'container' | 'bulk' | 'tanker' | 'lng' | 'roro' | 'general';
export type CargoUnitKind = 'container' | 'bulk_lot' | 'liquid_lot' | 'vehicle_lot';

export type StoredLocation =
  | { type: 'vessel_slot'; vesselId: string; slotId: string }
  | { type: 'compartment'; vesselId: string; compartmentId: string }
  | { type: 'yard_slot'; yardSlotId: string }
  | { type: 'gate'; portId: string; gateId: string }
  | { type: 'unknown' };

export interface CargoDetails {
  category: string;
  netMassKg?: number;
  reefer?: boolean;
  hazardClass: string | null;
  /** `restricted` hides commodity and parties outside the cargo-manager role (demo: always hidden). */
  detailsVisibility: 'summary' | 'restricted';
}

export interface CargoUnit {
  cargoUnitId: string;
  kind: CargoUnitKind;
  containerNo?: string;
  isoType?: string;
  sizeFt?: 20 | 40;
  quantity?: number;
  unit?: 't' | 'm3' | 'units';
  vesselId: string;
  shipmentId: string;
  originPortId: string;
  destinationPortId: string;
  cargo: CargoDetails;
  initialLocation: StoredLocation;
  sourceType: string;
}

export interface StowageSlot {
  slotId: string;
  bay: number;
  row: number;
  tier: number;
  deck: 'below' | 'above';
  sizeFt: 40 | 20;
}

export interface Compartment {
  compartmentId: string;
  kind: 'hold' | 'tank' | 'deck';
  index: number;
  label: string;
  capacity: number;
  unit: 't' | 'm3' | 'units';
  fillFraction: number;
  cargoUnitIds: string[];
}

export interface StowagePlan {
  stowagePlanId: string;
  vesselId: string;
  voyageId: string;
  archetype: CargoArchetype;
  asOfUtc: IsoUtc;
  grid: { bays: number[]; rows: number[]; tiersBelow: number[]; tiersAbove: number[]; slotCount: number } | null;
  slots: StowageSlot[];
  compartments: Compartment[];
  sourceType: string;
}

export interface Shipment {
  shipmentId: string;
  bookingRef: string;
  shipper: string;
  consignee: string;
  commodity: string;
  originPortId: string;
  destinationPortId: string;
  vesselId: string;
  voyageId: string;
  cargoUnitIds: string[];
  declaredValueUsd: number;
  status: 'booked' | 'in_transit' | 'discharged';
  sourceType: string;
}

export type TransferKind = 'load' | 'discharge' | 'gate_out';

export interface TransferEvent {
  transferEventId: string;
  cargoUnitId: string;
  kind: TransferKind;
  portId: string;
  terminalId: string;
  craneId: string | null;
  via: 'quay_crane' | 'truck';
  from: StoredLocation;
  to: StoredLocation;
  startUtc: IsoUtc;
  endUtc: IsoUtc;
  classifier: 'EST' | 'PLN' | 'ACT';
  sourceType: string;
}

export interface YardSlot {
  yardSlotId: string;
  portId: string;
  terminalId: string;
  block: string;
  bay: number;
  row: number;
  tier: number;
  use: 'import' | 'export';
  occupiedInWindow: boolean;
  sourceType: string;
}

export interface CargoModule {
  cargoUnits: CargoUnit[];
  stowagePlans: StowagePlan[];
  shipments: Shipment[];
  transferEvents: TransferEvent[];
  yardSlots: YardSlot[];
}

export const CARGO_KEYS = ['cargoUnits', 'stowagePlans', 'shipments', 'transferEvents', 'yardSlots'] as const;

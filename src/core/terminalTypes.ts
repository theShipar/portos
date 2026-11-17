import type { BerthBooking, PortLayout } from './types';

/**
 * V3 typed terminal module (`sample-data/v3/terminalOps.json`, spec 05/03–05/06): dry bulk, LNG and Ro-Ro layouts, their
 * berth calls, equipment and rate-segment operations. Everything is simulated; nothing here is a terminal operating,
 * safety or control record.
 */

export type TerminalType = 'container' | 'dry_bulk' | 'lng' | 'roro';
export type OperationStatus = 'moored' | 'transferring' | 'paused' | 'hazard';
export type EquipmentStatus = 'idle' | OperationStatus | 'maintenance';
export type EquipmentKind =
  | 'sts_crane'
  | 'ship_loader'
  | 'conveyor'
  | 'stockpile'
  | 'silo'
  | 'loading_arm'
  | 'vapour_arm'
  | 'pipeline'
  | 'lng_tank'
  | 'ramp'
  | 'staging_lanes';

export interface TerminalEquipment {
  equipmentId: string;
  terminalId: string;
  berthId: string | null;
  kind: EquipmentKind;
  label: string;
  ratedCapacity: number | null;
  capacityUnit: string | null;
  maintenance: { startUtc: string; endUtc: string; reason: string }[];
  sourceType: string;
}

export interface OperationSegment {
  startUtc: string;
  endUtc: string;
  status: OperationStatus;
  ratePerHour: number;
  /** Shore store the transfer draws from (load) or fills (discharge); null when nothing moves. */
  shoreStoreId: string | null;
  note: string | null;
}

export interface ShipCompartmentStart {
  compartmentId: string;
  kind: 'hold' | 'tank' | 'deck';
  label: string;
  capacity: number;
  startQuantity: number;
}

export interface TerminalOperation {
  operationId: string;
  bookingId: string;
  portCallId: string;
  vesselId: string;
  berthId: string;
  terminalId: string;
  portId: string;
  terminalType: Exclude<TerminalType, 'container'>;
  direction: 'load' | 'discharge';
  commodity: string;
  unit: 't' | 'm3' | 'vehicles';
  rateUnit: 't/h' | 'm3/h' | 'vehicles/h';
  segments: OperationSegment[];
  shipCompartments: ShipCompartmentStart[];
  shoreStores: { equipmentId: string; startQuantity: number }[];
  equipmentIds: string[];
  classifier: 'EST';
  sourceType: string;
}

export interface HazardZone {
  zoneId: string;
  terminalId: string;
  berthId: string;
  radiusMeters: number;
  label: string;
  sourceType: string;
}

export interface TerminalOpsModule {
  version: string;
  window: { minUtc: string; maxUtc: string };
  terminalTypes: Record<string, TerminalType>;
  layouts: PortLayout[];
  berthCalls: BerthBooking[];
  equipment: TerminalEquipment[];
  operations: TerminalOperation[];
  hazardZones: HazardZone[];
  disclosure: string;
}

export const TERMINAL_TYPE_LABEL: Record<TerminalType, string> = {
  container: 'Container terminal',
  dry_bulk: 'Dry bulk terminal',
  lng: 'LNG terminal',
  roro: 'Ro-Ro terminal',
};

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  idle: 'Idle',
  moored: 'Vessel moored · no transfer',
  transferring: 'Transferring',
  paused: 'Paused',
  maintenance: 'Maintenance',
  hazard: 'Hazard check (simulated)',
};

export const EQUIPMENT_KIND_LABEL: Record<EquipmentKind, string> = {
  sts_crane: 'Ship-to-shore crane',
  ship_loader: 'Ship loader',
  conveyor: 'Conveyor',
  stockpile: 'Stockpile',
  silo: 'Silos',
  loading_arm: 'Loading arm',
  vapour_arm: 'Vapour return arm',
  pipeline: 'Pipeline',
  lng_tank: 'LNG storage tank',
  ramp: 'Linkspan ramp',
  staging_lanes: 'Staging lanes',
};

/** Display units: m³ for LNG volume, never conflated with tonnes. */
export const UNIT_LABEL: Record<string, string> = { t: 't', m3: 'm³', vehicles: 'vehicles', 't/h': 't/h', 'm3/h': 'm³/h', 'vehicles/h': 'vehicles/h', 'moves/h': 'moves/h' };

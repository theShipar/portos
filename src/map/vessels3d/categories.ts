/** Ship categories of the V2 library (spec 08) and the geometry keys that implement them. */
export type ShipCategory = 'container' | 'tanker' | 'bulk' | 'roro' | 'tug' | 'other';
/** Geometry variants: the tanker category covers oil/product (`tanker`) and gas (`gas`, Moss domes). */
export type ShipModelKey = 'container' | 'tanker' | 'gas' | 'bulk' | 'roro' | 'tug' | 'other';

export const SHIP_MODEL_KEYS: readonly ShipModelKey[] = ['container', 'tanker', 'gas', 'bulk', 'roro', 'tug', 'other'];

const KEY_BY_TYPE: Record<string, ShipModelKey> = {
  'Container ship': 'container',
  'Oil tanker': 'tanker',
  'Product tanker': 'tanker',
  'Chemical tanker': 'tanker',
  'LNG carrier': 'gas',
  'LPG carrier': 'gas',
  'Bulk carrier': 'bulk',
  RoRo: 'roro',
  'Car carrier': 'roro',
  Tug: 'tug',
  'Pilot vessel': 'tug',
};

/** Fixture vessel type → geometry key. Unknown types (including general cargo) get the neutral hull, never borrowed features. */
export function modelKeyOf(vesselType: string): ShipModelKey {
  return KEY_BY_TYPE[vesselType] ?? 'other';
}

export function categoryOf(key: ShipModelKey): ShipCategory {
  return key === 'gas' ? 'tanker' : key;
}

export interface ShipPreset {
  label: string;
  /** Length over all / beam, illustrative (not design data). */
  lengthToBeam: number;
  /** Deck height above the waterline as a fraction of length. */
  freeboard: number;
  /** Fraction of length from the stern where the bow taper starts. */
  bowStart: number;
  /** Section fullness: 4 ≈ boxy with a tight bilge, 2 = elliptical. */
  fullness: number;
  paint: { hull: string; bootTop: string; deck: string };
}

/** Subdued operator-neutral paints; status colour never paints a whole hull at LOD1/LOD2 (orange is selection only). */
export const SHIP_PRESETS: Record<ShipModelKey, ShipPreset> = {
  container: { label: 'Container ship', lengthToBeam: 7.4, freeboard: 0.036, bowStart: 0.7, fullness: 3.6, paint: { hull: '#34495a', bootTop: '#5a3a36', deck: '#56646d' } },
  tanker: { label: 'Tanker', lengthToBeam: 5.6, freeboard: 0.026, bowStart: 0.76, fullness: 4.2, paint: { hull: '#3b4146', bootTop: '#5a3a36', deck: '#5f6c63' } },
  gas: { label: 'Gas carrier', lengthToBeam: 6.3, freeboard: 0.036, bowStart: 0.72, fullness: 3.8, paint: { hull: '#c3cacf', bootTop: '#5a3a36', deck: '#7a868d' } },
  bulk: { label: 'Bulk carrier', lengthToBeam: 6.0, freeboard: 0.03, bowStart: 0.76, fullness: 4.4, paint: { hull: '#47443f', bootTop: '#5a3a36', deck: '#66625a' } },
  roro: { label: 'RoRo / car carrier', lengthToBeam: 6.1, freeboard: 0.03, bowStart: 0.74, fullness: 3.6, paint: { hull: '#3b4752', bootTop: '#5a3a36', deck: '#5b6870' } },
  tug: { label: 'Tug / pilot', lengthToBeam: 2.9, freeboard: 0.075, bowStart: 0.5, fullness: 2.6, paint: { hull: '#2f3a40', bootTop: '#4d3431', deck: '#5c666c' } },
  other: { label: 'Other vessel', lengthToBeam: 6.4, freeboard: 0.032, bowStart: 0.72, fullness: 3.4, paint: { hull: '#55626b', bootTop: '#4d3a37', deck: '#66727a' } },
};

import type { GeoPoint } from './types';

/** Chokepoint reference markers (approximate centres, not navigational positions). */
export interface Place {
  placeId: string;
  name: string;
  kind: 'strait' | 'canal';
  location: GeoPoint;
  regionId: string;
}

export const PLACES: Place[] = [
  { placeId: 'PLC-SGSTRAIT', name: 'Singapore Strait', kind: 'strait', location: { lon: 104.0, lat: 1.22 }, regionId: 'REG-SEA' },
  { placeId: 'PLC-MALACCA', name: 'Strait of Malacca', kind: 'strait', location: { lon: 100.6, lat: 3.4 }, regionId: 'REG-SEA' },
  { placeId: 'PLC-SUEZ', name: 'Suez Canal', kind: 'canal', location: { lon: 32.35, lat: 30.6 }, regionId: 'REG-MED' },
  { placeId: 'PLC-BABMANDEB', name: 'Bab el-Mandeb', kind: 'strait', location: { lon: 43.4, lat: 12.6 }, regionId: 'REG-GULF' },
  { placeId: 'PLC-HORMUZ', name: 'Strait of Hormuz', kind: 'strait', location: { lon: 56.5, lat: 26.5 }, regionId: 'REG-GULF' },
  { placeId: 'PLC-GIBRALTAR', name: 'Strait of Gibraltar', kind: 'strait', location: { lon: -5.6, lat: 35.95 }, regionId: 'REG-MED' },
  { placeId: 'PLC-PANAMA', name: 'Panama Canal', kind: 'canal', location: { lon: -79.7, lat: 9.1 }, regionId: 'REG-LAT' },
  { placeId: 'PLC-DOVER', name: 'Strait of Dover', kind: 'strait', location: { lon: 1.5, lat: 51.0 }, regionId: 'REG-NEU' },
];

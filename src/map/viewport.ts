import type { Scope } from '@/core/scope';
import type { GeoPoint } from '@/core/types';

/** A 2D map view handed between the globe and MapLibre when the user switches modes. */
export interface MapView2D {
  center: GeoPoint;
  zoom: number;
}

/** MapLibre vector tile size in CSS px. */
export const TILE_SIZE = 512;
const DEG = Math.PI / 180;

/** 2D zoom limits per scope; switching modes clamps into these so the port map never opens at continental zoom. */
export const ZOOM_RANGE: Record<'region' | 'port', [number, number]> = { region: [3, 11], port: [9.5, 16] };

/** Web Mercator zoom whose ground resolution at `lat` equals `degPerPx` great-circle degrees per CSS pixel. */
export function zoomForDegPerPx(degPerPx: number, lat: number): number {
  return Math.log2((360 * Math.cos(lat * DEG)) / (TILE_SIZE * Math.max(degPerPx, 1e-9)));
}

export function degPerPxForZoom(zoom: number, lat: number): number {
  return (360 * Math.cos(lat * DEG)) / (TILE_SIZE * 2 ** zoom);
}

/** Globe camera distance (scene units from the centre) that shows `degPerPx` at the view centre. */
export function distanceForDegPerPx(degPerPx: number, radius: number, pxToWorld: number): number {
  return radius + (degPerPx * DEG * radius) / pxToWorld;
}

export function clampZoom(scope: Scope, zoom: number): number {
  if (scope.level === 'earth') return zoom;
  const [lo, hi] = ZOOM_RANGE[scope.level];
  return Math.min(hi, Math.max(lo, zoom));
}

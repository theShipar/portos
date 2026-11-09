import type { StyleSpecification } from 'maplibre-gl';
import { mapColors } from '@/styles/tokens';

/**
 * Port 2D basemap configuration (decision D-011).
 * - `VITE_PORT_BASEMAP_STYLE_URL`: a complete MapLibre style URL; used as-is when set.
 * - `VITE_PORT_BASEMAP_TILES_URL`: OpenMapTiles-schema TileJSON for the built-in PORTOS style
 *   (default: OpenFreeMap `planet`, free, no key, OSM data under ODbL).
 * - Either set to `none` disables tiles; the port view then shows its honest "basemap unavailable" state.
 */
export interface BasemapConfig {
  kind: 'portos' | 'custom' | 'none';
  styleUrl: string | null;
  tilesUrl: string | null;
  glyphsUrl: string | null;
  attribution: string;
  provider: string;
}

const env = import.meta.env as Record<string, string | undefined>;
const DEFAULT_TILES = 'https://tiles.openfreemap.org/planet';
const DEFAULT_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · Data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export function basemapConfig(overrides: { styleUrl?: string; tilesUrl?: string } = {}): BasemapConfig {
  const styleUrl = (overrides.styleUrl ?? env.VITE_PORT_BASEMAP_STYLE_URL ?? '').trim();
  const tilesUrl = (overrides.tilesUrl ?? env.VITE_PORT_BASEMAP_TILES_URL ?? DEFAULT_TILES).trim();
  if (styleUrl === 'none' || tilesUrl === 'none' || (!styleUrl && !tilesUrl)) {
    return { kind: 'none', styleUrl: null, tilesUrl: null, glyphsUrl: null, attribution: '', provider: 'None configured' };
  }
  if (styleUrl) return { kind: 'custom', styleUrl, tilesUrl: null, glyphsUrl: null, attribution: '', provider: 'Custom style' };
  return { kind: 'portos', styleUrl: null, tilesUrl, glyphsUrl: env.VITE_PORT_BASEMAP_GLYPHS_URL ?? DEFAULT_GLYPHS, attribution: OPENFREEMAP_ATTRIBUTION, provider: 'OpenFreeMap' };
}

/** Basemap colours: token map roles; port/industrial surfaces a lighter neutral so terminals read without towers. */
export const BASEMAP_COLORS = {
  water: mapColors.ocean,
  waterOutline: '#16384a',
  land: mapColors.land,
  landcover: '#21404d',
  portSurface: '#33505c',
  pier: '#3a5764',
  building: '#2b4855',
  roadMinor: '#2c4854',
  roadMajor: '#3a5966',
  boundary: mapColors.landOutline,
  label: '#9fb3bd',
  labelHalo: mapColors.ocean,
} as const;

const C = BASEMAP_COLORS;

/** PORTOS dark port chart on an OpenMapTiles vector source. Only reference layers; all operational data is overlaid. */
export function portosBasemapStyle(cfg: BasemapConfig): StyleSpecification {
  const layers: StyleSpecification['layers'] = [{ id: 'bm-background', type: 'background', paint: { 'background-color': cfg.tilesUrl ? C.land : C.water } }];
  if (cfg.tilesUrl) {
    layers.push(
      { id: 'bm-landcover', type: 'fill', source: 'basemap', 'source-layer': 'landcover', paint: { 'fill-color': C.landcover, 'fill-opacity': 0.6 } },
      {
        id: 'bm-landuse-port',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['industrial', 'commercial', 'railway', 'retail', 'quarry']]],
        paint: { 'fill-color': C.portSurface, 'fill-opacity': 0.85 },
      },
      { id: 'bm-aeroway', type: 'fill', source: 'basemap', 'source-layer': 'aeroway', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': C.portSurface, 'fill-opacity': 0.5 } },
      { id: 'bm-water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': C.water } },
      { id: 'bm-water-edge', type: 'line', source: 'basemap', 'source-layer': 'water', paint: { 'line-color': C.waterOutline, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 14, 1.2] } },
      { id: 'bm-waterway', type: 'line', source: 'basemap', 'source-layer': 'waterway', paint: { 'line-color': C.water, 'line-width': 1 } },
      {
        id: 'bm-pier',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['==', ['get', 'class'], 'pier']],
        paint: { 'fill-color': C.pier },
      },
      {
        id: 'bm-pier-line',
        type: 'line',
        source: 'basemap',
        'source-layer': 'transportation',
        filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'class'], 'pier']],
        paint: { 'line-color': C.pier, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 16, 6] },
      },
      { id: 'bm-building', type: 'fill', source: 'basemap', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': C.building, 'fill-opacity': 0.7 } },
      {
        id: 'bm-road-minor',
        type: 'line',
        source: 'basemap',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'track']]],
        paint: { 'line-color': C.roadMinor, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.3, 16, 2] },
      },
      {
        id: 'bm-road-major',
        type: 'line',
        source: 'basemap',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
        paint: { 'line-color': C.roadMajor, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.3, 16, 3] },
      },
      {
        id: 'bm-boundary',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundary',
        filter: ['all', ['<=', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': C.boundary, 'line-width': 0.8, 'line-dasharray': [3, 2] },
      },
      {
        id: 'bm-water-name',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'water_name',
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 11 },
        paint: { 'text-color': '#6f8a98', 'text-halo-color': C.labelHalo, 'text-halo-width': 1 },
      },
      {
        id: 'bm-place',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['country', 'city', 'town', 'suburb']]],
        layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'country', 13, 'city', 12, 11] },
        paint: { 'text-color': C.label, 'text-halo-color': C.labelHalo, 'text-halo-width': 1.2 },
      },
    );
  }
  return {
    version: 8,
    name: 'PORTOS port chart (reference only)',
    ...(cfg.glyphsUrl ? { glyphs: cfg.glyphsUrl } : {}),
    sources: cfg.tilesUrl ? { basemap: { type: 'vector', url: cfg.tilesUrl, attribution: cfg.attribution } } : {},
    layers,
  };
}

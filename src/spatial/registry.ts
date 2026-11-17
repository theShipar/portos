import type { Bounds, GeoPoint } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import countryTable from './data/countries.json';
import type { SceneKind } from './types';

export type RegistryType = 'earth' | 'region' | 'country' | 'city' | 'port';

export interface RegistryEntry {
  id: string;
  type: RegistryType;
  label: string;
  parentId: string | null;
  bbox: Bounds;
  center: GeoPoint;
  /** Extruded geometry for the 3D scene (built by `scripts/build_geo.py`); null when the level has none. */
  geometryPath: string | null;
  maritimePortIds: string[];
  cameraPresetId: string;
  childIds: string[];
  /** First entry is the default view for the level. */
  availableViews: SceneKind[];
  provenance: string;
  /** Country ISO3 codes highlighted on the globe for this entry. */
  iso3: string[];
  /** Operational bounds drawn as an illustrative frame, never a border (REG-MED, REG-WAF). */
  illustrativeBounds?: boolean;
}

interface CountryRow {
  countryId: string;
  iso2: string;
  iso3: string;
  name: string;
  bbox: Bounds;
  center: GeoPoint;
  portIds: string[];
  regionIds: string[];
  primaryRegionId: string;
  provenance: string;
}

interface CityRow {
  id: string;
  label: string;
  countryId: string;
  regionId: string;
  bbox: Bounds;
  portIds: string[];
}

/** Flagship coastal cities. Singapore is a city-state: its region drills straight to the city. */
export const CITIES: readonly CityRow[] = [
  { id: 'CTY-SIN', label: 'Singapore', countryId: 'CNT-SGP', regionId: 'REG-SEA', bbox: { west: 103.58, south: 1.1, east: 104.14, north: 1.48 }, portIds: ['PRT-SIN'] },
  { id: 'CTY-RTM', label: 'Rotterdam', countryId: 'CNT-NLD', regionId: 'REG-NEU', bbox: { west: 3.95, south: 51.74, east: 4.82, north: 52.04 }, portIds: ['PRT-RTM'] },
  { id: 'CTY-GOA', label: 'Genoa', countryId: 'CNT-ITA', regionId: 'REG-MED', bbox: { west: 8.62, south: 44.22, east: 9.28, north: 44.52 }, portIds: ['PRT-GOA'] },
  { id: 'CTY-SSZ', label: 'Santos', countryId: 'CNT-BRA', regionId: 'REG-LAT', bbox: { west: -46.62, south: -24.14, east: -46.06, north: -23.82 }, portIds: ['PRT-SSZ'] },
  { id: 'CTY-DLC', label: 'Dalian', countryId: 'CNT-CHN', regionId: 'REG-EAS', bbox: { west: 121.4, south: 38.72, east: 122.02, north: 39.06 }, portIds: ['PRT-DLC'] },
  { id: 'CTY-SOU', label: 'Southampton', countryId: 'CNT-GBR', regionId: 'REG-NEU', bbox: { west: -1.72, south: 50.7, east: -1.1, north: 51.0 }, portIds: ['PRT-SOU'] },
];

/** Countries represented by a single city entry (no separate country level). */
const CITY_STATES = new Set(['CNT-SGP']);
/** Operational regions whose bounds are illustrative only (the spec forbids presenting them as borders). */
const ILLUSTRATIVE_REGIONS = new Set(['REG-MED', 'REG-WAF']);

export interface SpatialRegistry {
  entries: ReadonlyMap<string, RegistryEntry>;
  get(id: string): RegistryEntry | undefined;
  /** Root-first chain of ancestors ending with the entry itself. */
  trail(id: string): RegistryEntry[];
  children(id: string): RegistryEntry[];
  /** City for a port, if the port belongs to a flagship city. */
  cityOfPort(portId: string): RegistryEntry | null;
  /** Country entry for a port (null for city-state ports). */
  countryOfPort(portId: string): RegistryEntry | null;
  /** All country rows, including city-states, keyed by country ID (for labels and ISO lookups). */
  countryRows: ReadonlyMap<string, CountryRow>;
}

const boundsCenter = (b: Bounds): GeoPoint => ({ lon: (b.west + b.east) / 2, lat: (b.south + b.north) / 2 });

export function buildSpatialRegistry(c: Pick<Catalog, 'regions' | 'ports' | 'byId' | 'v2'>): SpatialRegistry {
  const rows = (countryTable as { countries: CountryRow[] }).countries;
  const countryRows = new Map(rows.map((r) => [r.countryId, r]));
  const entries = new Map<string, RegistryEntry>();
  const cityOfPort = new Map<string, string>();
  for (const city of CITIES) for (const p of city.portIds) cityOfPort.set(p, city.id);
  const layoutPorts = new Set(c.v2 ? [...c.v2.layoutByPort.keys()] : []);

  entries.set('earth', {
    id: 'earth',
    type: 'earth',
    label: 'Earth',
    parentId: null,
    bbox: { west: -180, south: -85, east: 180, north: 85 },
    center: { lon: 30, lat: 15 },
    geometryPath: null,
    maritimePortIds: c.ports.map((p) => p.portId),
    cameraPresetId: 'earth',
    childIds: c.regions.map((r) => r.regionId),
    availableViews: ['earth'],
    provenance: 'Natural Earth (public domain) globe; operational data simulated',
    iso3: [],
  });

  for (const r of c.regions) {
    entries.set(r.regionId, {
      id: r.regionId,
      type: 'region',
      label: r.name,
      parentId: 'earth',
      bbox: r.bounds,
      center: r.center,
      geometryPath: `/geo/region/${r.regionId}.json`,
      maritimePortIds: [...r.portIds].sort(),
      cameraPresetId: `region:${r.regionId}`,
      childIds: [],
      availableViews: ['region3d', 'earth'],
      provenance: `Conceptual operational bounds (${r.sourceType}); countries from Natural Earth`,
      iso3: r.countryIso3,
      illustrativeBounds: ILLUSTRATIVE_REGIONS.has(r.regionId),
    });
  }

  for (const row of rows) {
    if (CITY_STATES.has(row.countryId)) continue;
    const parent = entries.has(row.primaryRegionId) ? row.primaryRegionId : 'earth';
    entries.set(row.countryId, {
      id: row.countryId,
      type: 'country',
      label: row.name,
      parentId: parent,
      bbox: row.bbox,
      center: row.center,
      geometryPath: `/geo/country/${row.countryId}.json`,
      maritimePortIds: [...row.portIds],
      cameraPresetId: `country:${row.countryId}`,
      childIds: [],
      availableViews: ['country3d'],
      provenance: row.provenance,
      iso3: [row.iso3],
    });
  }

  for (const city of CITIES) {
    const parent = CITY_STATES.has(city.countryId) || !entries.has(city.countryId) ? city.regionId : city.countryId;
    entries.set(city.id, {
      id: city.id,
      type: 'city',
      label: city.label,
      parentId: parent,
      bbox: city.bbox,
      center: boundsCenter(city.bbox),
      geometryPath: `/geo/city/${city.id}.json`,
      maritimePortIds: [...city.portIds],
      cameraPresetId: `city:${city.id}`,
      childIds: [],
      availableViews: ['city3d'],
      provenance: 'Illustrative city frame around the demo port; coastline from Natural Earth',
      iso3: [countryRows.get(city.countryId)?.iso3 ?? ''],
    });
  }

  const iso2ToCountry = new Map(rows.map((r) => [r.iso2, r.countryId]));
  for (const p of c.ports) {
    const cityId = cityOfPort.get(p.portId);
    const countryId = iso2ToCountry.get(p.countryIso2);
    const parent = cityId ?? (countryId && entries.has(countryId) ? countryId : p.regionId);
    const d = 0.08;
    entries.set(p.portId, {
      id: p.portId,
      type: 'port',
      label: p.name,
      parentId: parent,
      bbox: c.v2?.layoutByPort.get(p.portId)?.bounds ?? { west: p.location.lon - d, south: p.location.lat - d, east: p.location.lon + d, north: p.location.lat + d },
      center: p.location,
      geometryPath: null,
      maritimePortIds: [p.portId],
      cameraPresetId: `port:${p.portId}`,
      childIds: [],
      availableViews: layoutPorts.has(p.portId) ? ['port3d', 'port2d'] : ['port2d'],
      provenance: `${p.sourceType}; layout ${layoutPorts.has(p.portId) ? 'illustrative (sample-data/v2/portLayouts.json)' : 'not modelled'}`,
      iso3: [countryRows.get(countryId ?? '')?.iso3 ?? ''],
    });
  }

  for (const e of entries.values()) {
    if (e.type === 'earth' || e.type === 'region') continue;
    entries.get(e.parentId!)?.childIds.push(e.id);
  }
  /** Regions also list countries whose ports they hold but which are parented elsewhere (USA under NAP and NAA). */
  for (const row of rows) {
    if (CITY_STATES.has(row.countryId)) continue;
    for (const regionId of row.regionIds) {
      const r = entries.get(regionId);
      if (r && !r.childIds.includes(row.countryId)) r.childIds.push(row.countryId);
    }
  }
  for (const e of entries.values()) if (e.type !== 'earth') e.childIds.sort();

  const get = (id: string) => entries.get(id);
  return {
    entries,
    countryRows,
    get,
    trail(id) {
      const out: RegistryEntry[] = [];
      let cur = entries.get(id);
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        out.unshift(cur);
        cur = cur.parentId ? entries.get(cur.parentId) : undefined;
      }
      return out;
    },
    children(id) {
      return (entries.get(id)?.childIds ?? []).map((k) => entries.get(k)!).filter(Boolean);
    },
    cityOfPort(portId) {
      const id = cityOfPort.get(portId);
      return id ? entries.get(id) ?? null : null;
    },
    countryOfPort(portId) {
      const p = c.byId.port.get(portId);
      const id = p ? iso2ToCountry.get(p.countryIso2) : undefined;
      const e = id ? entries.get(id) : undefined;
      return e?.type === 'country' ? e : null;
    },
  };
}

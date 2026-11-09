import worldUrl from '@/assets/maps/world.earth-render.json?url';
import type { Bounds } from '@/core/types';

export type Ring = [number, number][];

export interface Country {
  iso3: string;
  name: string;
  /** Outer ring first per polygon; holes ignored for hit testing (country scale). */
  polygons: Ring[][];
  bbox: Bounds;
}

export interface WorldGeo {
  countries: Country[];
  byIso3: Map<string, Country>;
  countryAt(lon: number, lat: number): Country | null;
}

/**
 * Natural Earth assigns `-99` to a few sovereign states (France, Norway, Kosovo…). Stable IDs come from this table so
 * the region registry never matches on display names elsewhere.
 */
const ISO3_FALLBACK: Record<string, string> = {
  France: 'FRA',
  Norway: 'NOR',
  Kosovo: 'XKX',
  Somaliland: 'SOL',
  'Northern Cyprus': 'CYN',
};

interface RawFeature {
  properties: Record<string, unknown>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

function ringBounds(polys: Ring[][]): Bounds {
  let west = 180;
  let east = -180;
  let south = 90;
  let north = -90;
  for (const p of polys)
    for (const [lon, lat] of p[0]) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  return { west, south, east, north };
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function parseWorld(raw: { features: RawFeature[] }): WorldGeo {
  const countries: Country[] = [];
  for (const f of raw.features) {
    const name = String(f.properties.name ?? '');
    const isoRaw = String(f.properties['ISO3166-1-Alpha-3'] ?? '');
    const iso3 = /^[A-Z]{3}$/.test(isoRaw) ? isoRaw : (ISO3_FALLBACK[name] ?? `X-${name}`);
    const polygons = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][];
    countries.push({ iso3, name, polygons, bbox: ringBounds(polygons) });
  }
  const byIso3 = new Map<string, Country>();
  for (const c of countries) if (!byIso3.has(c.iso3)) byIso3.set(c.iso3, c);

  function countryAt(lon: number, lat: number): Country | null {
    for (const c of countries) {
      const b = c.bbox;
      if (lat < b.south || lat > b.north || lon < b.west || lon > b.east) continue;
      for (const p of c.polygons) if (inRing(lon, lat, p[0])) return c;
    }
    return null;
  }

  return { countries, byIso3, countryAt };
}

let pending: Promise<WorldGeo> | null = null;

export function loadWorld(): Promise<WorldGeo> {
  pending ??= fetch(worldUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`World geometry HTTP ${r.status}`);
      return r.json();
    })
    .then(parseWorld);
  return pending;
}

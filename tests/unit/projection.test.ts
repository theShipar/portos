import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { haversineDistanceNm } from '@/core/geo';
import { azimuthalProjection, enuProjection, gridConvergence, lonNear, normalizeLon, projectionForLevel } from '@/spatial/projection';
import { buildSpatialRegistry, CITIES } from '@/spatial/registry';
import { catalog } from './fixtures';

const c = catalog();
const haversineKm = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => haversineDistanceNm(a, b) * 1.852;
const reg = buildSpatialRegistry(c);

/** Deterministic sample grid over a bbox (handles east < west across the antimeridian). */
function grid(b: { west: number; south: number; east: number; north: number }, n = 9) {
  const east = b.east < b.west ? b.east + 360 : b.east;
  const out: { lon: number; lat: number }[] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) out.push({ lon: b.west + ((east - b.west) * i) / n, lat: b.south + ((b.north - b.south) * j) / n });
  return out;
}

describe('azimuthal equal-area projection (regions and countries)', () => {
  it('round-trips every point of every operational region to 1e-9 degrees', () => {
    for (const r of c.regions) {
      const east = r.bounds.east < r.bounds.west ? r.bounds.east + 360 : r.bounds.east;
      const p = azimuthalProjection({ lon: (r.bounds.west + east) / 2, lat: (r.bounds.south + r.bounds.north) / 2 });
      for (const g of grid(r.bounds)) {
        const w = p.lonLatToWorld(g.lon, g.lat);
        const back = p.worldToLonLat(w.x, w.z);
        expect(Math.abs(back.lat - g.lat), `${r.regionId} lat`).toBeLessThan(1e-9);
        expect(Math.abs(normalizeLon(back.lon - g.lon)), `${r.regionId} lon`).toBeLessThan(1e-9);
      }
    }
  });

  it('puts the origin at 0, east on +x and north on −z, in kilometres by default', () => {
    const p = azimuthalProjection({ lon: 110, lat: 5 });
    expect(p.lonLatToWorld(110, 5)).toEqual({ x: 0, y: 0, z: -0 });
    expect(p.lonLatToWorld(111, 5).x).toBeGreaterThan(110);
    expect(p.lonLatToWorld(110, 6).z).toBeLessThan(-110);
    expect(p.lonLatToWorld(110, 5, 2000).y).toBeCloseTo(2, 9);
    expect(p.worldToLonLat(0, 0)).toEqual({ lon: 110, lat: 5 });
  });

  it('keeps distances from the centre within 1 % of great-circle distance across a region', () => {
    const o = { lon: 110, lat: 5 };
    const p = azimuthalProjection(o);
    for (const g of grid({ west: 95, south: -8, east: 125, north: 20 }, 6)) {
      const w = p.lonLatToWorld(g.lon, g.lat);
      const km = Math.hypot(w.x, w.z);
      const gc = haversineKm(o, g);
      if (gc > 10) expect(Math.abs(km - gc) / gc).toBeLessThan(0.01);
    }
  });

  it('stays continuous across the antimeridian (REG-OCE)', () => {
    const p = azimuthalProjection({ lon: 146, lat: -28 });
    const a = p.lonLatToWorld(179.9, -18);
    const b = p.lonLatToWorld(-179.9, -18);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(25);
    expect(p.worldToLonLat(b.x, b.z).lon).toBeCloseTo(180.1, 6);
  });
});

describe('ENU projection (cities and ports)', () => {
  it('round-trips city frames to 1e-9 degrees (sub-millimetre)', () => {
    for (const city of CITIES) {
      const e = reg.get(city.id)!;
      const p = enuProjection(e.center);
      for (const g of grid({ west: city.bbox.west - 0.3, south: city.bbox.south - 0.3, east: city.bbox.east + 0.3, north: city.bbox.north + 0.3 })) {
        const w = p.lonLatToWorld(g.lon, g.lat);
        const back = p.worldToLonLat(w.x, w.z);
        expect(Math.abs(back.lat - g.lat), city.id).toBeLessThan(1e-9);
        expect(Math.abs(back.lon - g.lon), city.id).toBeLessThan(1e-9);
      }
    }
  });

  it('is true to scale: ground distances match the ellipsoid within 0.3 %', () => {
    const o = reg.get('CTY-SIN')!.center;
    const p = enuProjection(o, 1);
    const east = p.lonLatToWorld(o.lon + 0.1, o.lat);
    const north = p.lonLatToWorld(o.lon, o.lat + 0.1);
    expect(Math.abs(Math.hypot(east.x, east.z) / 1000 - haversineKm(o, { lon: o.lon + 0.1, lat: o.lat })) / 11.13).toBeLessThan(0.003);
    expect(Math.abs(-north.z - 11057.4)).toBeLessThan(5);
  });
});

describe('projection helpers', () => {
  it('normalises longitudes and keeps them near a reference', () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-180)).toBe(180);
    expect(lonNear(-178, 146)).toBe(182);
    expect(lonNear(10, -170)).toBe(10);
  });

  it('measures grid convergence: zero on the central meridian, signed off it', () => {
    const p = azimuthalProjection({ lon: 0, lat: 45 });
    expect(gridConvergence(p, 0, 50)).toBeCloseTo(0, 9);
    expect(gridConvergence(p, 15, 50)).toBeLessThan(0);
    expect(gridConvergence(p, -15, 50)).toBeGreaterThan(0);
  });

  it('chooses azimuthal for regions and countries, ENU for cities and ports', () => {
    expect(projectionForLevel('region', { lon: 0, lat: 0 }).kind).toBe('laea');
    expect(projectionForLevel('country', { lon: 0, lat: 0 }).kind).toBe('laea');
    expect(projectionForLevel('city', { lon: 0, lat: 0 }).kind).toBe('enu');
    expect(projectionForLevel('port', { lon: 0, lat: 0 }).kind).toBe('enu');
  });
});

describe('built geography (public/geo)', () => {
  const root = resolve(__dirname, '../../public/geo');
  const index = JSON.parse(readFileSync(resolve(root, 'index.json'), 'utf-8')) as { entries: { id: string; type: string; path: string; bytes: number }[] };
  const byId = new Map(index.entries.map((e) => [e.id, e]));

  it('has one file per region, country and city entry at the registry geometry path', () => {
    for (const e of reg.entries.values()) {
      if (e.type !== 'region' && e.type !== 'country' && e.type !== 'city') continue;
      expect(byId.get(e.id)?.path, e.id).toBe(e.geometryPath);
    }
    expect(index.entries.length).toBe([...reg.entries.values()].filter((e) => ['region', 'country', 'city'].includes(e.type)).length);
  });

  it('keeps the city frames in sync with the registry and the focus geometry present', () => {
    for (const city of CITIES) {
      const doc = JSON.parse(readFileSync(resolve(root, `city/${city.id}.json`), 'utf-8'));
      expect(doc.bbox).toEqual(city.bbox);
      expect(doc.features.some((f: { focus: boolean }) => f.focus), city.id).toBe(true);
    }
    const sea = JSON.parse(readFileSync(resolve(root, 'region/REG-SEA.json'), 'utf-8'));
    expect(sea.illustrativeBounds).toBe(false);
    for (const id of ['REG-MED', 'REG-WAF']) expect(JSON.parse(readFileSync(resolve(root, `region/${id}.json`), 'utf-8')).illustrativeBounds).toBe(true);
  });

  it('stays inside the lazy-load budget (≤ 160 KiB per file) and records provenance', () => {
    for (const e of index.entries) expect(e.bytes, e.id).toBeLessThan(160 * 1024);
    const prov = readFileSync(resolve(root, 'PROVENANCE.md'), 'utf-8');
    expect(prov).toContain('Public domain');
    expect(prov).toMatch(/ne_10m_admin_0_countries\.geojson \| `[0-9a-f]{64}`/);
  });
});

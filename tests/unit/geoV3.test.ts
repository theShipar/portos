import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGeoDoc, type GeoDoc, type GeoRing } from '@/spatial/geoData';
import { HANDOFF_MS, SETTLE_MS, V3_HANDOFF_TOTAL, BRIDGE_TIMINGS } from '@/spatial/EarthGeographyBridge';

interface IndexEntry {
  id: string;
  type: 'region' | 'country' | 'city';
  path: string;
}

const index = JSON.parse(readFileSync(resolve('public/geo/index.json'), 'utf8')) as { entries: IndexEntry[] };
const load = (path: string): GeoDoc => parseGeoDoc(JSON.parse(readFileSync(resolve('public', path.replace(/^\//, '')), 'utf8')), path);
const docs = index.entries.map((e) => ({ entry: e, doc: load(e.path) }));
const countries = (JSON.parse(readFileSync(resolve('src/spatial/data/countries.json'), 'utf8')) as { countries: { iso2: string; iso3: string; regionIds: string[] }[] }).countries;
const ports = JSON.parse(readFileSync(resolve('sample-data/ports.json'), 'utf8')) as { portId: string; countryIso2: string; regionId: string }[];

/** Consecutive vertices both lying exactly on the same frame edge: the straight cut a rectangle clip leaves behind. */
function frameCuts(ring: GeoRing, f: GeoDoc['frame']): number {
  const eps = 1e-6;
  const on = (p: [number, number]) => [Math.abs(p[0] - f.west) < eps, Math.abs(p[0] - f.east) < eps, Math.abs(p[1] - f.south) < eps, Math.abs(p[1] - f.north) < eps];
  let cuts = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = on(ring[i]);
    const b = on(ring[(i + 1) % ring.length]);
    if (a.some((v, k) => v && b[k])) cuts++;
  }
  return cuts;
}

describe('V3 whole-geometry extrusion (Gate 2)', () => {
  const planar = docs.filter((d) => d.entry.type !== 'city');

  it('never cuts region or country land along the frame rectangle', () => {
    expect(planar.length).toBeGreaterThan(20);
    for (const { doc } of planar) {
      expect(doc.clip, doc.id).toBe('none');
      let cuts = 0;
      for (const f of doc.features) for (const poly of f.polygons) for (const ring of poly) cuts += frameCuts(ring, doc.frame);
      for (const c of doc.context) for (const ring of c.rings) cuts += frameCuts(ring, doc.frame);
      expect(cuts, doc.id).toBe(0);
    }
  });

  it('keeps only focus land extruded; neighbours are ghost context', () => {
    for (const { doc } of planar) {
      expect(doc.features.every((f) => f.focus), doc.id).toBe(true);
      const focus = new Set(doc.features.map((f) => f.iso3));
      expect(doc.context.some((c) => focus.has(c.iso3)), doc.id).toBe(false);
    }
    const sea = docs.find((d) => d.doc.id === 'REG-SEA')!.doc;
    const ctx = sea.context.map((c) => c.iso3);
    expect(ctx).toEqual(expect.arrayContaining(['CHN', 'AUS']));
  });

  it('preserves holes and islands', () => {
    const waf = docs.find((d) => d.doc.id === 'REG-WAF')!.doc;
    const zaf = waf.features.find((f) => f.iso3 === 'ZAF')!;
    // Lesotho is a hole in South Africa.
    expect(zaf.polygons.some((p) => p.length > 1)).toBe(true);
    const sea = docs.find((d) => d.doc.id === 'REG-SEA')!.doc;
    const idn = sea.features.find((f) => f.iso3 === 'IDN')!;
    expect(idn.polygons.length).toBeGreaterThan(20);
  });

  it('extrudes every port country in its region, so no port stands on ghost land', () => {
    const iso3 = new Map(countries.map((c) => [c.iso2, c.iso3]));
    for (const p of ports) {
      const doc = docs.find((d) => d.doc.id === p.regionId)!.doc;
      const code = iso3.get(p.countryIso2)!;
      const hasLand = doc.features.some((f) => f.iso3 === code);
      const tiny = !doc.features.some((f) => f.iso3 === code) && !doc.context.some((c) => c.iso3 === code);
      // Territories absent from Natural Earth 50m (tiny islands) have no land to extrude either way.
      expect(hasLand || tiny, `${p.portId} ${code} in ${p.regionId}`).toBe(true);
    }
  });

  it('records the focus extent for the camera fit', () => {
    for (const { doc } of planar) {
      const b = doc.focusBounds;
      if (!b) continue;
      const east = doc.bbox.east < doc.bbox.west ? doc.bbox.east + 360 : doc.bbox.east;
      expect(b.west < east && b.east > doc.bbox.west && b.south < doc.bbox.north && b.north > doc.bbox.south, doc.id).toBe(true);
    }
  });

  it('clips city land only to a wide frame far beyond the camera clamp', () => {
    const cities = docs.filter((d) => d.entry.type === 'city');
    expect(cities.map((d) => d.doc.id).sort()).toEqual(['CTY-DLC', 'CTY-GOA', 'CTY-RTM', 'CTY-SIN', 'CTY-SOU', 'CTY-SSZ']);
    for (const { doc } of cities) {
      expect(doc.clip).toBe('wide-frame');
      let inFrameCuts = 0;
      for (const f of doc.features) for (const poly of f.polygons) for (const ring of poly) inFrameCuts += frameCuts(ring, doc.frame);
      expect(inFrameCuts, doc.id).toBe(0);
      const sx = doc.bbox.east - doc.bbox.west;
      const xs = doc.features.flatMap((f) => f.polygons.flatMap((p) => p.flatMap((r) => r.map((q) => q[0]))));
      // Land reaches well past the camera frame (bbox ± 35 %), out to the wide clip (bbox ± 200 %).
      expect(Math.min(...xs)).toBeLessThan(doc.frame.west - sx * 0.5);
    }
  });
});

describe('V3 handoff timing', () => {
  it('keeps reveal + settle within 850–1400 ms and each phase inside its V2 budget', () => {
    const total = HANDOFF_MS + SETTLE_MS;
    expect(total).toBeGreaterThanOrEqual(V3_HANDOFF_TOTAL.min);
    expect(total).toBeLessThanOrEqual(V3_HANDOFF_TOTAL.max);
    expect(HANDOFF_MS).toBeGreaterThanOrEqual(BRIDGE_TIMINGS.handoff.min);
    expect(HANDOFF_MS).toBeLessThanOrEqual(BRIDGE_TIMINGS.handoff.max);
    expect(SETTLE_MS).toBeGreaterThanOrEqual(BRIDGE_TIMINGS.settle.min);
    expect(SETTLE_MS).toBeLessThanOrEqual(BRIDGE_TIMINGS.settle.max);
  });
});

import { describe, expect, it } from 'vitest';
import {
  antimeridianSplit,
  boundsCenter,
  boundsContain,
  haversineDistanceNm,
  inverseSpherical,
  normalizeLon,
  pathAt,
  pointInPolygon,
  splitBounds,
  sphericalPosition,
} from '@/core/geo';

const SIN = { lon: 103.8198, lat: 1.3521 };
const RTM = { lon: 4.47917, lat: 51.9225 };

describe('geo utilities', () => {
  it('normalizes longitudes into [-180, 180]', () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(-181)).toBe(179);
    expect(normalizeLon(540)).toBe(180);
  });

  it('computes haversine distance in nautical miles', () => {
    expect(haversineDistanceNm(SIN, RTM)).toBeGreaterThan(5600);
    expect(haversineDistanceNm(SIN, RTM)).toBeLessThan(5700);
    expect(haversineDistanceNm({ lon: 179, lat: 0 }, { lon: -179, lat: 0 })).toBeCloseTo(120, 0);
  });

  it('splits paths crossing the antimeridian instead of spanning the globe', () => {
    const segs = antimeridianSplit([
      { lon: 179, lat: 0 },
      { lon: -179, lat: 0 },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0][1].lon).toBe(180);
    expect(segs[1][0].lon).toBe(-180);
  });

  it('handles antimeridian bounds', () => {
    const oce = { west: 110, south: -48, east: -178, north: -8 };
    expect(boundsContain(oce, { lon: 179, lat: -40 })).toBe(true);
    expect(boundsContain(oce, { lon: -179, lat: -40 })).toBe(true);
    expect(boundsContain(oce, { lon: 0, lat: -40 })).toBe(false);
    expect(splitBounds(oce)).toHaveLength(2);
    expect(boundsCenter(oce).lon).toBeCloseTo(146, 0);
  });

  it('round-trips the sphere convention shared with the skill template', () => {
    for (const p of [SIN, RTM, { lon: -179.5, lat: -45 }, { lon: 0, lat: 89 }]) {
      const [x, y, z] = sphericalPosition(p.lat, p.lon, 2);
      const back = inverseSpherical(x, y, z);
      expect(back.lat).toBeCloseTo(p.lat, 6);
      expect(back.lon).toBeCloseTo(p.lon, 6);
    }
  });

  it('interpolates along a path by distance and detects polygons', () => {
    const path = [
      { lon: 0, lat: 0 },
      { lon: 10, lat: 0 },
    ];
    expect(pathAt(path, 0.5).lon).toBeCloseTo(5, 6);
    const sq = [
      { lon: 0, lat: 0 },
      { lon: 1, lat: 0 },
      { lon: 1, lat: 1 },
      { lon: 0, lat: 1 },
    ];
    expect(pointInPolygon({ lon: 0.5, lat: 0.5 }, sq)).toBe(true);
    expect(pointInPolygon({ lon: 1.5, lat: 0.5 }, sq)).toBe(false);
  });
});

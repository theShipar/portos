import { boundsContain, boundsSpanDeg } from '@/core/geo';
import type { Region } from '@/core/types';

export interface RegionRegistry {
  regions: Region[];
  byIso3: Map<string, Region>;
  /** Region for a picked point: country membership first, then the smallest operational bounds containing it. */
  regionAt(lon: number, lat: number, countryIso3: string | null): Region | null;
}

export function buildRegionRegistry(regions: Region[]): RegionRegistry {
  const byIso3 = new Map<string, Region>();
  for (const r of regions) for (const iso of r.countryIso3) if (!byIso3.has(iso)) byIso3.set(iso, r);
  const bySize = [...regions].sort((a, b) => {
    const sa = boundsSpanDeg(a.bounds);
    const sb = boundsSpanDeg(b.bounds);
    return sa.lon * sa.lat - sb.lon * sb.lat;
  });
  return {
    regions,
    byIso3,
    regionAt(lon, lat, iso) {
      if (iso && byIso3.has(iso)) return byIso3.get(iso)!;
      return bySize.find((r) => boundsContain(r.bounds, { lon, lat })) ?? null;
    },
  };
}

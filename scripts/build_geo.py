#!/usr/bin/env python3
"""PORTOS V2 geography builder.

Step `registry` (Phase 1): derives the port-bearing country table used by the spatial registry
(`src/spatial/data/countries.json`) from the bundled world geometry (`src/assets/maps/world.earth-render.json`,
Natural Earth derived, public domain) and the port fixture. Bounding boxes cover the largest polygon of a country
plus every polygon within 2 degrees of one of its ports, so overseas islands (Alaska, Hawaii, Reunion) never stretch
a camera preset across the antimeridian.

Usage: python3 scripts/build_geo.py registry
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / 'src/assets/maps/world.earth-render.json'
PORTS = ROOT / 'sample-data/ports.json'
REGIONS = ROOT / 'sample-data/regions.json'
OUT_COUNTRIES = ROOT / 'src/spatial/data/countries.json'

# Natural Earth uses -99 for a few states; the app uses the same fallback (src/map/earth/worldGeo.ts).
ISO3_FALLBACK = {'France': 'FRA', 'Norway': 'NOR', 'Kosovo': 'XKX'}
ISO2_FALLBACK = {'France': 'FR', 'Norway': 'NO', 'Taiwan': 'TW'}
# Territories absent from the 110m world file: a port-centred box, flagged in provenance.
PORT_BOX_DEG = 0.6


def polygons(geom: dict) -> list[list[list[float]]]:
    if geom['type'] == 'Polygon':
        return [geom['coordinates'][0]]
    return [p[0] for p in geom['coordinates']]


def ring_bbox(ring: list[list[float]]) -> tuple[float, float, float, float]:
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


def ring_area(ring: list[list[float]]) -> float:
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) / 2


def near(b: tuple[float, float, float, float], lon: float, lat: float, deg: float) -> bool:
    return b[0] - deg <= lon <= b[2] + deg and b[1] - deg <= lat <= b[3] + deg


def build_registry() -> int:
    world = json.loads(WORLD.read_text())
    ports = json.loads(PORTS.read_text())
    regions = json.loads(REGIONS.read_text())
    by_iso2: dict[str, dict] = {}
    for f in world['features']:
        p = f['properties']
        iso2 = ISO2_FALLBACK.get(p.get('name', ''), p.get('ISO3166-1-Alpha-2'))
        iso3 = p.get('ISO3166-1-Alpha-3')
        if not iso3 or iso3 == '-99':
            iso3 = ISO3_FALLBACK.get(p.get('name', ''), iso3)
        if iso2 and iso2 != '-99':
            by_iso2[iso2] = {'iso3': iso3, 'name': p['name'], 'polys': polygons(f['geometry'])}

    ports_by_iso2: dict[str, list[dict]] = {}
    for port in ports:
        ports_by_iso2.setdefault(port['countryIso2'], []).append(port)
    region_rank = {r['regionId']: i for i, r in enumerate(regions)}

    out = []
    for iso2 in sorted(ports_by_iso2):
        cports = sorted(ports_by_iso2[iso2], key=lambda p: p['portId'])
        geo = by_iso2.get(iso2)
        if geo:
            polys = geo['polys']
            largest = max(polys, key=ring_area)
            keep = [largest] + [r for r in polys if r is not largest and any(near(ring_bbox(r), p['location']['lon'], p['location']['lat'], 2.0) for p in cports)]
            bxs = [ring_bbox(r) for r in keep]
            bbox = [min(b[0] for b in bxs), min(b[1] for b in bxs), max(b[2] for b in bxs), max(b[3] for b in bxs)]
            for p in cports:
                lon, lat = p['location']['lon'], p['location']['lat']
                bbox = [min(bbox[0], lon - 0.2), min(bbox[1], lat - 0.2), max(bbox[2], lon + 0.2), max(bbox[3], lat + 0.2)]
            iso3, name, prov = geo['iso3'], geo['name'], 'Natural Earth 110m admin-0 (public domain) via world.earth-render.json'
        else:
            lons = [p['location']['lon'] for p in cports]
            lats = [p['location']['lat'] for p in cports]
            bbox = [min(lons) - PORT_BOX_DEG, min(lats) - PORT_BOX_DEG, max(lons) + PORT_BOX_DEG, max(lats) + PORT_BOX_DEG]
            iso3 = {'HK': 'HKG', 'SG': 'SGP'}.get(iso2, iso2 + 'X')
            name = {'HK': 'Hong Kong', 'SG': 'Singapore'}.get(iso2, iso2)
            prov = 'Not in the 110m world file; illustrative box around the port centroids'
        counts: dict[str, int] = {}
        for p in cports:
            counts[p['regionId']] = counts.get(p['regionId'], 0) + 1
        primary = sorted(counts, key=lambda r: (-counts[r], region_rank.get(r, 99)))[0]
        out.append({
            'countryId': f'CNT-{iso3}',
            'iso2': iso2,
            'iso3': iso3,
            'name': name,
            'bbox': {'west': round(bbox[0], 3), 'south': round(bbox[1], 3), 'east': round(bbox[2], 3), 'north': round(bbox[3], 3)},
            'center': {'lon': round((bbox[0] + bbox[2]) / 2, 3), 'lat': round((bbox[1] + bbox[3]) / 2, 3)},
            'portIds': [p['portId'] for p in cports],
            'regionIds': sorted(counts, key=lambda r: region_rank.get(r, 99)),
            'primaryRegionId': primary,
            'provenance': prov,
        })
    for c in out:
        b = c['bbox']
        if not (b['west'] < b['east'] and b['south'] < b['north']) or b['east'] - b['west'] > 180:
            print(f"bad bbox for {c['countryId']}: {b}", file=sys.stderr)
            return 1
        if not math.isfinite(c['center']['lon']):
            return 1
    OUT_COUNTRIES.parent.mkdir(parents=True, exist_ok=True)
    OUT_COUNTRIES.write_text(json.dumps({'source': 'scripts/build_geo.py registry', 'countries': out}, indent=1) + '\n')
    print(f'{len(out)} port-bearing countries -> {OUT_COUNTRIES.relative_to(ROOT)}')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('step', choices=['registry'])
    args = ap.parse_args()
    if args.step == 'registry':
        return build_registry()
    return 1


if __name__ == '__main__':
    sys.exit(main())

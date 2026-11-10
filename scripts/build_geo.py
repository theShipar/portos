#!/usr/bin/env python3
"""PORTOS V2 geography builder.

Step `registry` (Phase 1): derives the port-bearing country table used by the spatial registry
(`src/spatial/data/countries.json`) from the bundled world geometry (`src/assets/maps/world.earth-render.json`,
Natural Earth derived, public domain) and the port fixture. Bounding boxes cover the largest polygon of a country
plus every polygon within 2 degrees of one of its ports, so overseas islands (Alaska, Hawaii, Reunion) never stretch
a camera preset across the antimeridian.

Step `geo` (Phase 2): clips and simplifies Natural Earth admin-0 polygons (public domain; 50m for regions and large
countries, 10m for small countries and cities, so Singapore keeps its real coastline) into one file per registry
entry under `public/geo/<type>/<id>.json`, plus `public/geo/index.json` and `public/geo/PROVENANCE.md`. Downloads are
cached in `.cache/natural-earth/` (git-ignored); the SHA-256 of every source file is recorded in the provenance.

Usage: python3 scripts/build_geo.py registry | geo | all
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import urllib.request
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


# ---------------------------------------------------------------------------------------------------------------
# Step `geo`: per-entry geometry for the extruded region / country / city scenes.

NE_BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
NE_FILES = {'50m': 'ne_50m_admin_0_countries.geojson', '10m': 'ne_10m_admin_0_countries.geojson'}
CACHE = ROOT / '.cache/natural-earth'
OUT_GEO = ROOT / 'public/geo'
# Mirror of CITIES in src/spatial/registry.ts (tests/unit/geo.test.ts checks they agree).
CITIES = [
    {'id': 'CTY-SIN', 'label': 'Singapore', 'iso3': 'SGP', 'bbox': (103.58, 1.1, 104.14, 1.48)},
    {'id': 'CTY-RTM', 'label': 'Rotterdam', 'iso3': 'NLD', 'bbox': (3.95, 51.74, 4.82, 52.04)},
    {'id': 'CTY-GOA', 'label': 'Genoa', 'iso3': 'ITA', 'bbox': (8.62, 44.22, 9.28, 44.52)},
]
ILLUSTRATIVE = {'REG-MED', 'REG-WAF'}
# Frame padding (fraction of the span on each side), Douglas-Peucker divisor and coordinate decimals per level.
LEVEL = {
    'region': {'pad': 0.08, 'detail': 900, 'decimals': 3},
    'country': {'pad': 0.3, 'detail': 1400, 'decimals': 4},
    'city': {'pad': 0.35, 'detail': 2600, 'decimals': 5},
}
SMALL_COUNTRY_DEG = 12.0


def ne_path(res: str) -> Path:
    path = CACHE / NE_FILES[res]
    if not path.exists() or path.stat().st_size == 0:
        CACHE.mkdir(parents=True, exist_ok=True)
        url = f'{NE_BASE}/{NE_FILES[res]}'
        print(f'downloading {url}')
        with urllib.request.urlopen(url, timeout=120) as r:
            path.write_bytes(r.read())
    return path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_ne(res: str) -> list[dict]:
    data = json.loads(ne_path(res).read_text())
    out = []
    for f in data['features']:
        g = f['geometry']
        if not g:
            continue
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        p = f['properties']
        rings_bbox = [ring_bbox(poly[0]) for poly in polys]
        out.append({'iso3': p['ADM0_A3'], 'name': p['NAME'], 'polys': polys, 'bboxes': rings_bbox})
    return out


def clip_ring(ring: list[list[float]], w: float, s: float, e: float, n: float) -> list[list[float]]:
    """Sutherland-Hodgman against the frame rectangle (convex), on an open ring."""
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring[:]
    for edge in range(4):
        if not pts:
            return []
        inside = [
            lambda p: p[0] >= w,
            lambda p: p[0] <= e,
            lambda p: p[1] >= s,
            lambda p: p[1] <= n,
        ][edge]

        def cut(a, b):
            if edge < 2:
                x = w if edge == 0 else e
                t = (x - a[0]) / (b[0] - a[0])
                return [x, a[1] + t * (b[1] - a[1])]
            y = s if edge == 2 else n
            t = (y - a[1]) / (b[1] - a[1])
            return [a[0] + t * (b[0] - a[0]), y]

        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cut(prev, cur))
        pts = out
    return pts


def simplify(pts: list[list[float]], tol: float) -> list[list[float]]:
    """Douglas-Peucker on an open ring (iterative)."""
    if len(pts) < 5:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    # Split the ring at its farthest point from the first vertex so both halves are open polylines.
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    keep[far] = True
    stack = [(0, far), (far, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        len2 = dx * dx + dy * dy
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if len2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / math.sqrt(len2)
            if d > best:
                best, idx = d, i
        if idx >= 0 and best > tol:
            keep[idx] = True
            stack.append((a, idx))
            stack.append((idx, b))
    return [p for p, k in zip(pts, keep) if k]


def open_area(pts: list[list[float]]) -> float:
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i - 1]
        x2, y2 = pts[i]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def shift_ring(ring: list[list[float]], shift: bool) -> list[list[float]]:
    if not shift or max(p[0] for p in ring) >= 0:
        return ring
    return [[p[0] + 360, p[1]] for p in ring]


def build_entry(entry: dict, features: list[dict]) -> dict:
    cfg = LEVEL[entry['type']]
    w, s, e, n = entry['bbox']
    if e < w:
        e += 360
    span_x, span_y = e - w, n - s
    pad = cfg['pad']
    fw, fe = w - span_x * pad, e + span_x * pad
    fs, fn = max(-85.0, s - span_y * pad), min(85.0, n + span_y * pad)
    shift = fe > 180
    tol = max(span_x, span_y) / cfg['detail']
    min_area = tol * tol * 6
    dec = cfg['decimals']
    out_features = []
    for f in features:
        polys_out = []
        for poly, bb in zip(f['polys'], f['bboxes']):
            bw, bs, be, bn = bb
            if shift and be < 0:
                bw, be = bw + 360, be + 360
            if be < fw or bw > fe or bn < fs or bs > fn:
                continue
            rings = []
            for k, ring in enumerate(poly):
                clipped = clip_ring(shift_ring(ring, shift), fw, fs, fe, fn)
                if len(clipped) < 3:
                    if k == 0:
                        break
                    continue
                simple = simplify(clipped, tol)
                if len(simple) < 3 or open_area(simple) < min_area:
                    if k == 0:
                        break
                    continue
                rings.append([[round(x, dec), round(y, dec)] for x, y in simple])
            if rings:
                polys_out.append(rings)
        if polys_out:
            out_features.append({'iso3': f['iso3'], 'name': f['name'], 'focus': f['iso3'] in entry['focus'], 'polygons': polys_out})
    out_features.sort(key=lambda f: (not f['focus'], f['iso3']))
    return {
        'id': entry['id'],
        'type': entry['type'],
        'label': entry['label'],
        'bbox': {'west': w, 'south': s, 'east': e, 'north': n},
        'frame': {'west': round(fw, 4), 'south': round(fs, 4), 'east': round(fe, 4), 'north': round(fn, 4)},
        'origin': {'lon': round((w + e) / 2, 5), 'lat': round((s + n) / 2, 5)},
        'illustrativeBounds': entry['id'] in ILLUSTRATIVE,
        'dataset': entry['dataset'],
        'features': out_features,
    }


def build_geo() -> int:
    regions = json.loads(REGIONS.read_text())
    countries = json.loads(OUT_COUNTRIES.read_text())['countries']
    entries = []
    for r in regions:
        b = r['bounds']
        entries.append({'id': r['regionId'], 'type': 'region', 'label': r['name'], 'bbox': (b['west'], b['south'], b['east'], b['north']), 'focus': set(r['countryIso3']), 'dataset': '50m'})
    for c in countries:
        if c['countryId'] == 'CNT-SGP':
            continue
        b = c['bbox']
        small = max(b['east'] - b['west'], b['north'] - b['south']) < SMALL_COUNTRY_DEG
        entries.append({'id': c['countryId'], 'type': 'country', 'label': c['name'], 'bbox': (b['west'], b['south'], b['east'], b['north']), 'focus': {c['iso3']}, 'dataset': '10m' if small else '50m'})
    for c in CITIES:
        entries.append({'id': c['id'], 'type': 'city', 'label': c['label'], 'bbox': c['bbox'], 'focus': {c['iso3']}, 'dataset': '10m'})

    sources = {res: load_ne(res) for res in ('50m', '10m')}
    index = []
    for entry in entries:
        doc = build_entry(entry, sources[entry['dataset']])
        if not any(f['focus'] for f in doc['features']) and entry['type'] != 'region':
            print(f"{entry['id']}: focus country {sorted(entry['focus'])} has no geometry in the frame", file=sys.stderr)
        path = OUT_GEO / entry['type'] / f"{entry['id']}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(doc, separators=(',', ':'))
        path.write_text(text + '\n')
        rings = sum(len(p) for f in doc['features'] for p in f['polygons'])
        verts = sum(len(r) for f in doc['features'] for p in f['polygons'] for r in p)
        index.append({'id': entry['id'], 'type': entry['type'], 'path': f"/geo/{entry['type']}/{entry['id']}.json", 'dataset': f"ne_{entry['dataset']}_admin_0_countries", 'features': len(doc['features']), 'rings': rings, 'vertices': verts, 'bytes': len(text) + 1, 'sha1': hashlib.sha1(text.encode()).hexdigest()[:12]})
    (OUT_GEO / 'index.json').write_text(json.dumps({'source': 'scripts/build_geo.py geo', 'entries': index}, indent=1) + '\n')
    hashes = {res: sha256(ne_path(res)) for res in ('50m', '10m')}
    total = sum(e['bytes'] for e in index)
    lines = [
        '# PORTOS geography provenance',
        '',
        'Generated by `python3 scripts/build_geo.py geo`. Do not edit by hand.',
        '',
        '## Sources',
        '',
        '| Dataset | URL | SHA-256 | Licence |',
        '| --- | --- | --- | --- |',
    ]
    for res in ('50m', '10m'):
        lines.append(f"| Natural Earth {res} admin-0 countries | {NE_BASE}/{NE_FILES[res]} | `{hashes[res]}` | Public domain (naturalearthdata.com/about/terms-of-use) |")
    lines += [
        '',
        '## Processing',
        '',
        '- One file per registry entry: 11 operational regions (50m), port-bearing countries (10m when the bbox span is',
        f'  under {SMALL_COUNTRY_DEG:.0f} degrees, else 50m) and the flagship cities CTY-SIN, CTY-RTM, CTY-GOA (10m).',
        '- Frame = entry bbox padded per level (region 8 %, country 30 %, city 35 % of the span on each side); polygons',
        '  are clipped to the frame (Sutherland-Hodgman) and simplified with Douglas-Peucker at span / 900 (region),',
        '  span / 1400 (country) and span / 2600 (city); rings smaller than 6 tolerance squared are dropped.',
        '- Frames crossing the antimeridian (REG-OCE) use longitudes in 0..360 for the whole file.',
        '- Country codes are Natural Earth `ADM0_A3` (France FRA and Norway NOR, whose ISO codes are -99 there).',
        '- REG-MED and REG-WAF are illustrative operational bounds, never borders (`illustrativeBounds: true`).',
        '- Borders are shown as Natural Earth draws them; PORTOS takes no position on disputed boundaries.',
        '',
        f"## Output ({len(index)} files, {total / 1024:.0f} KiB)",
        '',
        '| Entry | Type | Dataset | Features | Vertices | KiB |',
        '| --- | --- | --- | ---: | ---: | ---: |',
    ]
    for e in index:
        lines.append(f"| {e['id']} | {e['type']} | {e['dataset']} | {e['features']} | {e['vertices']} | {e['bytes'] / 1024:.1f} |")
    (OUT_GEO / 'PROVENANCE.md').write_text('\n'.join(lines) + '\n')
    print(f'{len(index)} geometry files -> {OUT_GEO.relative_to(ROOT)} ({total / 1024:.0f} KiB)')
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('step', choices=['registry', 'geo', 'all'])
    args = ap.parse_args()
    if args.step in ('registry', 'all'):
        rc = build_registry()
        if rc:
            return rc
    if args.step in ('geo', 'all'):
        return build_geo()
    return 0


if __name__ == '__main__':
    sys.exit(main())

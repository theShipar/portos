import type { Bounds, GeoPoint } from '@/core/types';

export type GeoRing = [number, number][];

export interface GeoFeatureDoc {
  /** Natural Earth ADM0_A3. */
  iso3: string;
  name: string;
  /** In scope for the entry (region member country, the country itself, the city's country). */
  focus: boolean;
  /** Polygons → rings (outer first, then holes) → [lon, lat]. */
  polygons: GeoRing[][];
}

/** Neighbouring land drawn as non-pickable ghost outlines (outer rings only, coarser than the focus land). */
export interface GeoContextDoc {
  iso3: string;
  name: string;
  rings: GeoRing[];
}

/** One `public/geo/<type>/<id>.json` file written by `scripts/build_geo.py geo`. */
export interface GeoDoc {
  id: string;
  type: 'region' | 'country' | 'city';
  label: string;
  bbox: Bounds;
  /** Camera frame (bbox plus padding). Longitudes may exceed 180 for frames that cross the antimeridian. */
  frame: Bounds;
  origin: GeoPoint;
  illustrativeBounds: boolean;
  dataset: string;
  /** `none`: focus polygons are whole; `wide-frame`: land is clipped far beyond camera reach (cities). */
  clip: 'none' | 'wide-frame';
  /** Lon/lat extent of the focus geometry, or null when the frame holds no focus land. */
  focusBounds: Bounds | null;
  features: GeoFeatureDoc[];
  context: GeoContextDoc[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBounds = (b: unknown): b is Bounds => !!b && typeof b === 'object' && ['west', 'south', 'east', 'north'].every((k) => isNum((b as Record<string, unknown>)[k]));
const isRing = (ring: unknown): boolean => Array.isArray(ring) && ring.length >= 3 && ring.every((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));

/** Validates the shape of a geometry file; throws with the entry and the first problem found. */
export function parseGeoDoc(raw: unknown, path = 'geometry'): GeoDoc {
  const d = raw as Partial<GeoDoc> | null;
  const fail = (why: string): never => {
    throw new Error(`${path}: ${why}`);
  };
  if (!d || typeof d !== 'object') return fail('not an object');
  if (typeof d.id !== 'string' || !d.id) fail('missing id');
  if (d.type !== 'region' && d.type !== 'country' && d.type !== 'city') fail(`unknown type ${String(d.type)}`);
  if (!isBounds(d.bbox) || !isBounds(d.frame)) fail('missing bbox/frame');
  if (!d.origin || !isNum(d.origin.lon) || !isNum(d.origin.lat)) fail('missing origin');
  if (!Array.isArray(d.features)) fail('missing features');
  for (const f of d.features!) {
    if (typeof f.iso3 !== 'string' || !Array.isArray(f.polygons)) fail(`bad feature ${String(f.iso3)}`);
    for (const poly of f.polygons) for (const ring of poly) if (!isRing(ring)) fail(`bad ring in ${f.iso3}`);
  }
  if (d.context !== undefined && !Array.isArray(d.context)) fail('bad context');
  for (const c of d.context ?? []) {
    if (typeof c.iso3 !== 'string' || !Array.isArray(c.rings)) fail(`bad context feature ${String(c.iso3)}`);
    for (const ring of c.rings) if (!isRing(ring)) fail(`bad context ring in ${c.iso3}`);
  }
  if (d.focusBounds != null && !isBounds(d.focusBounds)) fail('bad focusBounds');
  return {
    ...(d as GeoDoc),
    illustrativeBounds: !!d.illustrativeBounds,
    label: d.label ?? d.id!,
    clip: d.clip === 'wide-frame' ? 'wide-frame' : 'none',
    focusBounds: d.focusBounds ?? null,
    context: d.context ?? [],
  };
}

const cache = new Map<string, Promise<GeoDoc>>();

/** Fetches a geometry file once per session. Aborting only rejects the caller; the shared download keeps going. */
export function loadGeoDoc(path: string, signal?: AbortSignal): Promise<GeoDoc> {
  let p = cache.get(path);
  if (!p) {
    const url = `${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.json();
      })
      .then((raw) => parseGeoDoc(raw, path));
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<GeoDoc>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    p!.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Warms the cache in idle time (regions and flagship cities are small); failures surface on real navigation. */
export function prefetchGeoDocs(paths: readonly string[]) {
  const run = () => {
    for (const p of paths) loadGeoDoc(p).catch(() => {});
  };
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 3000 });
  else setTimeout(run, 500);
}

/** Test seam: forget cached downloads. */
export function clearGeoCache() {
  cache.clear();
}

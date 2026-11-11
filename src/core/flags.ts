/**
 * Feature flags read once at startup. Each flag defaults on; disable one with `VITE_<NAME>=0` at build time
 * (e.g. `VITE_SPATIAL_V2=0`, `VITE_V3_GLASS=0`) or `?<flag>=0` in the first URL (kept for the session).
 * `?v3=0` turns every V3 flag off at once and restores the V2 presentation.
 *
 * - `spatialV2`: region/country/city/port scopes use the V2 extruded scenes.
 * - `v3Glass`: V3 dark graphite/teal tokens, Urbanist and glass chrome.
 * - `v3RegionExtrusion`: whole-geometry region extrusion, ghost neighbours and country hover lift.
 * - `v3ShipPreview`: vessel 3D preview, camera modes and cargo slot inspection.
 * - `v3PortTwin`: port twins by terminal type driven by cargo transfer events.
 * - `v3TradeBI`: trade-flow network and map-linked visual reports.
 * - `v3Mobile`: phone layout with a 2D map and a snapping bottom sheet.
 */
export type FlagName = 'spatialV2' | 'v3Glass' | 'v3RegionExtrusion' | 'v3ShipPreview' | 'v3PortTwin' | 'v3TradeBI' | 'v3Mobile';

const ENV_KEY: Record<FlagName, string> = {
  spatialV2: 'VITE_SPATIAL_V2',
  v3Glass: 'VITE_V3_GLASS',
  v3RegionExtrusion: 'VITE_V3_REGION_EXTRUSION',
  v3ShipPreview: 'VITE_V3_SHIP_PREVIEW',
  v3PortTwin: 'VITE_V3_PORT_TWIN',
  v3TradeBI: 'VITE_V3_TRADE_BI',
  v3Mobile: 'VITE_V3_MOBILE',
};

const env = import.meta.env as unknown as Record<string, string | undefined>;

function sessionFlag(key: string, q: string | null): '0' | '1' | null {
  try {
    if (q === '0' || q === '1') sessionStorage.setItem(`portos:${key}`, q);
    const s = sessionStorage.getItem(`portos:${key}`);
    return s === '0' || s === '1' ? s : null;
  } catch {
    return null;
  }
}

function readFlag(name: FlagName): boolean {
  const envOff = env[ENV_KEY[name]] === '0' || (name !== 'spatialV2' && env.VITE_V3 === '0');
  if (typeof window === 'undefined') return !envOff;
  const params = new URLSearchParams(window.location.search);
  const own = sessionFlag(name, params.get(name));
  if (own) return own === '1';
  if (name !== 'spatialV2') {
    const all = sessionFlag('v3', params.get('v3'));
    if (all) return all === '1';
  }
  return !envOff;
}

export const flags: Readonly<Record<FlagName, boolean>> = Object.freeze(
  Object.fromEntries((Object.keys(ENV_KEY) as FlagName[]).map((n) => [n, readFlag(n)])) as Record<FlagName, boolean>,
);

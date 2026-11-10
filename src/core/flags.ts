/**
 * Feature flags read once at startup. `spatialV2` switches region/country/city/port scopes to the V2 extruded scenes;
 * disable with `VITE_SPATIAL_V2=0` at build time or `?spatialV2=0` in the first URL (kept for the session).
 */
const SESSION_KEY = 'portos:spatialV2';

function readSpatialV2(): boolean {
  const envOff = import.meta.env.VITE_SPATIAL_V2 === '0';
  if (typeof window === 'undefined') return !envOff;
  const q = new URLSearchParams(window.location.search).get('spatialV2');
  try {
    if (q === '0' || q === '1') sessionStorage.setItem(SESSION_KEY, q);
    const s = sessionStorage.getItem(SESSION_KEY);
    if (s === '0') return false;
    if (s === '1') return true;
  } catch {
    /* storage blocked: fall through to the build default */
  }
  return !envOff;
}

export const flags = Object.freeze({ spatialV2: readSpatialV2() });

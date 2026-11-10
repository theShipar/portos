import type { LocationQuery, LocationQueryRaw, RouteLocationRaw } from 'vue-router';
import { opsRoute, type Panel, type SceneRef } from './opsLocation';
import type { EntityRef } from '@/core/types';

/** Every v1 route name and its path pattern. Old links keep working by redirecting to `/ops/*` (M16). */
export const LEGACY_ROUTES = [
  { name: 'operations', path: '/operations' },
  { name: 'region', path: '/region/:regionId' },
  { name: 'port', path: '/port/:portId' },
  { name: 'vessel', path: '/vessel/:vesselId' },
  { name: 'voyage', path: '/voyage/:voyageId' },
  { name: 'incident', path: '/incidents/:incidentId' },
  { name: 'route', path: '/corridors/:routeId' },
  { name: 'weather', path: '/weather/:hazardId' },
  { name: 'compare', path: '/compare/:voyageId' },
  { name: 'replay', path: '/replay/:voyageId' },
] as const;

export type LegacyRouteName = (typeof LEGACY_ROUTES)[number]['name'];

const one = (v: unknown): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s !== '' ? s : null;
};

/** v1 `in=earth|region:ID|port:ID` scope context → scene reference (null = let the app pick). */
export function sceneFromLegacyIn(text: string | null): SceneRef | null {
  if (!text) return null;
  if (text === 'earth') return { level: 'earth' };
  const [kind, id] = text.split(':');
  if (!id) return null;
  if (kind === 'region' || kind === 'port' || kind === 'country' || kind === 'city') return { level: kind, id };
  return null;
}

/** Maps a v1 location to its canonical `/ops/*` equivalent. `t` becomes `time`; `in` becomes the scene path. */
export function legacyToOps(name: LegacyRouteName, params: Record<string, unknown>, query: LocationQuery | LocationQueryRaw): RouteLocationRaw {
  const q: LocationQueryRaw = {};
  for (const [k, v] of Object.entries(query)) {
    if (k === 't' || k === 'in' || v === undefined || v === null) continue;
    q[k] = v as LocationQueryRaw[string];
  }
  const t = one(query.t);
  if (t) q.time = t;
  const scene = sceneFromLegacyIn(one(query.in));
  const id = (k: string) => one(params[k]) ?? '';
  const sel = (kind: EntityRef['kind'], key: string, panel?: Panel) => {
    if (panel) q.panel = panel;
    return opsRoute(scene, { kind, id: id(key) }, q);
  };
  switch (name) {
    case 'operations':
      return opsRoute({ level: 'earth' }, null, q);
    case 'region':
      return opsRoute({ level: 'region', id: id('regionId') }, null, q);
    case 'port':
      return opsRoute({ level: 'port', id: id('portId') }, null, q);
    case 'vessel':
      return sel('vessel', 'vesselId');
    case 'voyage':
      return sel('voyage', 'voyageId');
    case 'compare':
      return sel('voyage', 'voyageId', 'compare');
    case 'replay':
      return sel('voyage', 'voyageId', 'replay');
    case 'incident':
      return sel('incident', 'incidentId');
    case 'route':
      return sel('route', 'routeId');
    case 'weather':
      return sel('weather', 'hazardId');
  }
}

import type { LocationQuery, LocationQueryRaw, RouteLocationRaw } from 'vue-router';
import type { Scope } from '@/core/scope';
import type { EntityKind, EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { SpatialRegistry } from '@/spatial/registry';

/** Scene part of a canonical URL (`/ops/<level>/<id>`). */
export type SceneRef = { level: 'earth' } | { level: 'region' | 'country' | 'city' | 'port'; id: string };

export type Panel = 'compare' | 'replay';

export type SelectableKind = Exclude<EntityKind, 'port' | 'region'>;

/** Query key per selectable entity kind (`?vessel=VSL-0001`, `?hazard=WX-0001`). */
export const SELECTION_QUERY: Record<SelectableKind, string> = {
  vessel: 'vessel',
  voyage: 'voyage',
  incident: 'incident',
  route: 'route',
  weather: 'hazard',
};

const SELECTION_ORDER: SelectableKind[] = ['vessel', 'voyage', 'incident', 'route', 'weather'];

/** Query keys owned by the ops location; everything else (e.g. `case`) passes through untouched. */
export const OPS_KEYS = new Set<string>([...Object.values(SELECTION_QUERY), 'panel', 'time', 'speed', 'mode', 'view', 'layers', 'kpi']);

export const OPS_ROUTE_NAMES = ['ops-earth', 'ops-region', 'ops-country', 'ops-city', 'ops-port', 'ops-auto'] as const;
export type OpsRouteName = (typeof OPS_ROUTE_NAMES)[number];

export interface OpsLocation {
  /** null on `/ops`: the scene is derived from the selection, then the URL is replaced with the canonical one. */
  scene: SceneRef | null;
  selection: EntityRef | null;
  panel: Panel | null;
  time: string | null;
  speed: string | null;
  mode: string | null;
  view: '2d' | '3d' | null;
  layers: string | null;
  kpi: string | null;
}

const str = (q: LocationQuery | LocationQueryRaw, k: string): string | null => {
  const v = q[k];
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s !== '' ? s : null;
};

export function isOpsRoute(name: unknown): name is OpsRouteName {
  return typeof name === 'string' && (OPS_ROUTE_NAMES as readonly string[]).includes(name);
}

export function parseOpsLocation(name: unknown, params: Record<string, unknown>, query: LocationQuery | LocationQueryRaw): OpsLocation {
  const id = (k: string) => {
    const v = params[k];
    return String(Array.isArray(v) ? v[0] : (v ?? ''));
  };
  let scene: SceneRef | null = null;
  switch (name) {
    case 'ops-earth':
      scene = { level: 'earth' };
      break;
    case 'ops-region':
      scene = { level: 'region', id: id('regionId') };
      break;
    case 'ops-country':
      scene = { level: 'country', id: id('countryId') };
      break;
    case 'ops-city':
      scene = { level: 'city', id: id('cityId') };
      break;
    case 'ops-port':
      scene = { level: 'port', id: id('portId') };
      break;
  }
  let selection: EntityRef | null = null;
  for (const kind of SELECTION_ORDER) {
    const v = str(query, SELECTION_QUERY[kind]);
    if (v) {
      selection = { kind, id: v };
      break;
    }
  }
  const panel = str(query, 'panel');
  const view = str(query, 'view');
  return {
    scene,
    selection,
    panel: panel === 'compare' || panel === 'replay' ? panel : null,
    time: str(query, 'time'),
    speed: str(query, 'speed'),
    mode: str(query, 'mode'),
    view: view === '2d' || view === '3d' ? view : null,
    layers: str(query, 'layers'),
    kpi: str(query, 'kpi'),
  };
}

export function sceneRefForScope(s: Scope): SceneRef {
  switch (s.level) {
    case 'earth':
      return { level: 'earth' };
    case 'region':
      return { level: 'region', id: s.regionId };
    case 'country':
      return { level: 'country', id: s.countryId };
    case 'city':
      return { level: 'city', id: s.cityId };
    case 'port':
      return { level: 'port', id: s.portId };
  }
}

/** Canonical route for a scene with an optional selection; `query` carries time, view, layers, kpi and pass-through keys. */
export function opsRoute(scene: SceneRef | null, selection: EntityRef | null, query: LocationQueryRaw = {}): RouteLocationRaw {
  const q: LocationQueryRaw = {};
  for (const [k, v] of Object.entries(query)) if (!(Object.values(SELECTION_QUERY) as string[]).includes(k) && v !== undefined && v !== null) q[k] = v;
  if (selection && selection.kind !== 'port' && selection.kind !== 'region') q[SELECTION_QUERY[selection.kind]] = selection.id;
  if (!scene) return { name: 'ops-auto', query: q };
  switch (scene.level) {
    case 'earth':
      return { name: 'ops-earth', query: q };
    case 'region':
      return { name: 'ops-region', params: { regionId: scene.id }, query: q };
    case 'country':
      return { name: 'ops-country', params: { countryId: scene.id }, query: q };
    case 'city':
      return { name: 'ops-city', params: { cityId: scene.id }, query: q };
    case 'port':
      return { name: 'ops-port', params: { portId: scene.id }, query: q };
  }
}

/** Resolves a scene reference against the dataset; null when the ID is unknown. */
export function scopeFromSceneRef(c: Pick<Catalog, 'byId'>, reg: SpatialRegistry, ref: SceneRef): Scope | null {
  if (ref.level === 'earth') return { level: 'earth' };
  const e = reg.get(ref.id);
  if (!e || e.type !== ref.level) return null;
  switch (ref.level) {
    case 'region':
      return { level: 'region', regionId: ref.id };
    case 'country': {
      const regionId = reg.countryRows.get(ref.id)?.primaryRegionId ?? e.parentId!;
      return { level: 'country', regionId, countryId: ref.id };
    }
    case 'city': {
      const parent = e.parentId ? reg.get(e.parentId) : undefined;
      const regionId = parent?.type === 'region' ? parent.id : (parent?.parentId ?? '');
      return { level: 'city', regionId, countryId: parent?.type === 'country' ? parent.id : null, cityId: ref.id };
    }
    case 'port': {
      const p = c.byId.port.get(ref.id);
      if (!p) return null;
      return { level: 'port', regionId: p.regionId, portId: ref.id, countryId: reg.countryOfPort(ref.id)?.id ?? null, cityId: reg.cityOfPort(ref.id)?.id ?? null };
    }
  }
}

/** Port scope with its country and city parents filled from the registry. */
export function portScope(c: Pick<Catalog, 'byId'>, reg: SpatialRegistry | null, portId: string): Scope {
  const p = c.byId.port.get(portId)!;
  return { level: 'port', regionId: p.regionId, portId, countryId: reg?.countryOfPort(portId)?.id ?? null, cityId: reg?.cityOfPort(portId)?.id ?? null };
}

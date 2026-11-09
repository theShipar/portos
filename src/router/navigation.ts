import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router';
import { defaultViewMode, supportsViewMode, type ViewMode } from '@/core/scope';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { Scope } from '@/stores/view';

export function encodeScope(s: Scope): string | undefined {
  if (s.level === 'region') return `region:${s.regionId}`;
  if (s.level === 'port') return `port:${s.portId}`;
  return undefined;
}

/** Decodes `in=earth` / `in=region:REG-SEA` / `in=port:PRT-SIN`; unknown IDs return null. */
export function decodeScope(c: Catalog, text: unknown): Scope | null {
  if (typeof text !== 'string') return null;
  if (text === 'earth') return { level: 'earth' };
  const [kind, id] = text.split(':');
  if (kind === 'region' && c.byId.region.has(id)) return { level: 'region', regionId: id };
  if (kind === 'port') {
    const p = c.byId.port.get(id);
    if (p) return { level: 'port', portId: id, regionId: p.regionId };
  }
  return null;
}

/** `view` query value for a mode, or null when the mode is the scope's default (keeps URLs short). */
export function viewModeQuery(s: Scope, mode: ViewMode): ViewMode | null {
  return supportsViewMode(s, mode) && mode !== defaultViewMode(s) ? mode : null;
}

export function routeForScope(s: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  if (s.level === 'region') return { name: 'region', params: { regionId: s.regionId }, query };
  if (s.level === 'port') return { name: 'port', params: { portId: s.portId }, query };
  return { name: 'operations', query };
}

/** Scope change that keeps the open selection: the entity route with the new scope in `in` (explicit `earth`). */
export function routeForScopeKeepingSelection(sel: EntityRef | null, s: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  if (!sel || sel.kind === 'port' || sel.kind === 'region') return routeForScope(s, query);
  return routeForEntity(sel, s, s.level === 'earth' ? { ...query, in: 'earth' } : query);
}

/** Entity routes keep the current geographic scope in `in` so navigating back restores it. */
export function routeForEntity(ref: EntityRef, scope: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  const q: LocationQueryRaw = { ...query };
  const scoped = encodeScope(scope);
  if (scoped) q.in = scoped;
  switch (ref.kind) {
    case 'vessel':
      return { name: 'vessel', params: { vesselId: ref.id }, query: q };
    case 'voyage':
      return { name: 'voyage', params: { voyageId: ref.id }, query: q };
    case 'incident':
      return { name: 'incident', params: { incidentId: ref.id }, query: q };
    case 'route':
      return { name: 'route', params: { routeId: ref.id }, query: q };
    case 'weather':
      return { name: 'weather', params: { hazardId: ref.id }, query: q };
    case 'port':
      return { name: 'port', params: { portId: ref.id }, query };
    case 'region':
      return { name: 'region', params: { regionId: ref.id }, query };
    default:
      return { name: 'operations', query: q };
  }
}

import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { Scope } from '@/stores/view';

export function encodeScope(s: Scope): string | undefined {
  if (s.level === 'region') return `region:${s.regionId}`;
  if (s.level === 'port') return `port:${s.portId}`;
  return undefined;
}

/** Decodes `in=region:REG-SEA` / `in=port:PRT-SIN`; unknown IDs return null. */
export function decodeScope(c: Catalog, text: unknown): Scope | null {
  if (typeof text !== 'string') return null;
  const [kind, id] = text.split(':');
  if (kind === 'region' && c.byId.region.has(id)) return { level: 'region', regionId: id };
  if (kind === 'port') {
    const p = c.byId.port.get(id);
    if (p) return { level: 'port', portId: id, regionId: p.regionId };
  }
  return null;
}

export function routeForScope(s: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  if (s.level === 'region') return { name: 'region', params: { regionId: s.regionId }, query };
  if (s.level === 'port') return { name: 'port', params: { portId: s.portId }, query };
  return { name: 'operations', query };
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
    case 'port':
      return { name: 'port', params: { portId: ref.id }, query };
    case 'region':
      return { name: 'region', params: { regionId: ref.id }, query };
    default:
      return { name: 'operations', query: q };
  }
}

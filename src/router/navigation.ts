import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router';
import { defaultViewMode, supportsViewMode, type Scope, type ViewMode } from '@/core/scope';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { SpatialRegistry } from '@/spatial/registry';
import { sceneFromLegacyIn } from './legacyRedirects';
import { opsRoute, portScope, sceneRefForScope, scopeFromSceneRef } from './opsLocation';

/** Decodes a v1 `in=` scope context (`earth`, `region:ID`, `port:ID`, also `country:ID` / `city:ID`); unknown IDs → null. */
export function decodeScope(c: Catalog, text: unknown, reg: SpatialRegistry | null = null): Scope | null {
  const ref = sceneFromLegacyIn(typeof text === 'string' ? text : null);
  if (!ref) return null;
  if (ref.level === 'earth') return { level: 'earth' };
  if (ref.level === 'region') return c.byId.region.has(ref.id) ? { level: 'region', regionId: ref.id } : null;
  if (ref.level === 'port') return c.byId.port.has(ref.id) ? portScope(c, reg, ref.id) : null;
  return reg ? scopeFromSceneRef(c, reg, ref) : null;
}

/** `view` query value for a mode, or null when the mode is the scope's default (keeps URLs short). */
export function viewModeQuery(s: Scope, mode: ViewMode, hasTwin?: (portId: string) => boolean): ViewMode | null {
  return supportsViewMode(s, mode) && mode !== defaultViewMode(s, hasTwin) ? mode : null;
}

/** Ports with a 3D twin layout in the V2 module. */
export function twinPredicate(c: Catalog | null): (portId: string) => boolean {
  return (portId) => !!c?.v2?.layoutByPort.has(portId);
}

export function routeForScope(s: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  return opsRoute(sceneRefForScope(s), null, query);
}

/** Scope change that keeps the open selection (spec: selection survives Earth ↔ region ↔ port and 3D ↔ 2D). */
export function routeForScopeKeepingSelection(sel: EntityRef | null, s: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  return opsRoute(sceneRefForScope(s), sel && sel.kind !== 'port' && sel.kind !== 'region' ? sel : null, query);
}

/** Selecting an entity keeps the current scene; ports and regions are scenes of their own. */
export function routeForEntity(ref: EntityRef, scope: Scope, query: LocationQueryRaw = {}): RouteLocationRaw {
  if (ref.kind === 'port') return opsRoute({ level: 'port', id: ref.id }, null, query);
  if (ref.kind === 'region') return opsRoute({ level: 'region', id: ref.id }, null, query);
  return opsRoute(sceneRefForScope(scope), ref, query);
}

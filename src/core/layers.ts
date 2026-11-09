export type ScopeLevel = 'earth' | 'region' | 'port';

export type LayerId = 'fleet' | 'ambient' | 'ports' | 'routes' | 'weather' | 'incidents' | 'traffic' | 'anchorage' | 'berths';

export interface LayerConfig {
  id: LayerId;
  label: string;
  scopes: ScopeLevel[];
  visibleByDefault: boolean;
  source: string;
  quality: 'Simulated' | 'Derived' | 'Imported';
  renderOrder: number;
  legend: string;
}

/** Render order follows the layer-management spec: density → weather → routes → symbols → selection → labels. */
export const LAYERS: LayerConfig[] = [
  { id: 'traffic', label: 'Traffic density', scopes: ['region'], visibleByDefault: false, source: 'positions.json', quality: 'Derived', renderOrder: 10, legend: 'Vessel count per cell at the simulation time' },
  { id: 'weather', label: 'Weather', scopes: ['earth', 'region', 'port'], visibleByDefault: true, source: 'weatherHazards.json', quality: 'Simulated', renderOrder: 20, legend: 'Hazard polygons by severity and validity window' },
  { id: 'anchorage', label: 'Anchorage', scopes: ['port'], visibleByDefault: true, source: 'anchorages.json', quality: 'Simulated', renderOrder: 25, legend: 'Demo anchorage zone with queue count' },
  { id: 'routes', label: 'Routes', scopes: ['earth', 'region', 'port'], visibleByDefault: true, source: 'routes.json', quality: 'Simulated', renderOrder: 30, legend: 'Synthetic voyage corridors (not navigational routes)' },
  { id: 'berths', label: 'Berths', scopes: ['port'], visibleByDefault: true, source: 'berths.json', quality: 'Simulated', renderOrder: 35, legend: 'Berth status: occupied, scheduled, unavailable, free, unknown' },
  { id: 'ports', label: 'Ports', scopes: ['earth', 'region', 'port'], visibleByDefault: true, source: 'ports.json', quality: 'Imported', renderOrder: 40, legend: 'Port locations; operational data is simulated' },
  { id: 'ambient', label: 'Other vessels', scopes: ['earth', 'region', 'port'], visibleByDefault: true, source: 'positions.json', quality: 'Simulated', renderOrder: 45, legend: 'Ambient simulated traffic outside the managed fleet' },
  { id: 'fleet', label: 'Managed fleet', scopes: ['earth', 'region', 'port'], visibleByDefault: true, source: 'positions.json', quality: 'Simulated', renderOrder: 50, legend: 'Managed fleet vessels coloured by exception state' },
  { id: 'incidents', label: 'Incidents', scopes: ['earth', 'region', 'port'], visibleByDefault: true, source: 'incidents.json', quality: 'Simulated', renderOrder: 60, legend: 'Unresolved incidents by severity' },
];

export const DEFAULT_LAYERS: Record<LayerId, boolean> = Object.fromEntries(LAYERS.map((l) => [l.id, l.visibleByDefault])) as Record<LayerId, boolean>;

export function layersForScope(level: ScopeLevel): LayerConfig[] {
  return LAYERS.filter((l) => l.scopes.includes(level));
}

export function encodeLayers(state: Record<LayerId, boolean>): string {
  return LAYERS.filter((l) => state[l.id]).map((l) => l.id).join(',');
}

/** Unknown IDs are dropped; an empty/invalid string returns null so callers keep their current state. */
export function decodeLayers(text: string | null | undefined): Record<LayerId, boolean> | null {
  if (text === null || text === undefined) return null;
  const ids = new Set(text.split(',').map((s) => s.trim()));
  const known = LAYERS.filter((l) => ids.has(l.id));
  if (!known.length && text.trim() !== '') return null;
  return Object.fromEntries(LAYERS.map((l) => [l.id, ids.has(l.id)])) as Record<LayerId, boolean>;
}

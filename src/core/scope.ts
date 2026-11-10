import type { EntityRef } from './types';

/**
 * Geographic scope. Every level below Earth keeps its operational `regionId` (KPI cohort, globe highlight); country
 * and city are optional parents of a port (Singapore drills region → city → port with no country level).
 */
export type Scope =
  | { level: 'earth' }
  | { level: 'region'; regionId: string }
  | { level: 'country'; regionId: string; countryId: string }
  | { level: 'city'; regionId: string; countryId: string | null; cityId: string }
  | { level: 'port'; regionId: string; portId: string; countryId?: string | null; cityId?: string | null };

export type ScopeLevelName = Scope['level'];

export const SCOPE_RANK: Record<Scope['level'], number> = { earth: 0, region: 1, country: 2, city: 3, port: 4 };

export type ViewMode = '3d' | '2d';

/** Port detail opens in 2D (precise positions); Earth, regions, countries and cities open in 3D. */
export function defaultViewMode(s: Scope): ViewMode {
  return s.level === 'port' ? '2d' : '3d';
}

/** 2D exists for regions and ports (MapLibre); Earth, country and city scenes are 3D only. */
export function supportsViewMode(s: Scope, mode: ViewMode): boolean {
  return mode === '3d' || s.level === 'region' || s.level === 'port';
}

/** The registry ID the scope is centred on (`earth` for Earth). */
export function scopeFocusId(s: Scope): string {
  switch (s.level) {
    case 'earth':
      return 'earth';
    case 'region':
      return s.regionId;
    case 'country':
      return s.countryId;
    case 'city':
      return s.cityId;
    case 'port':
      return s.portId;
  }
}

export function scopeKey(s: Scope): string {
  return s.level === 'earth' ? 'earth' : `${s.level}:${scopeFocusId(s)}`;
}

/** Parent chain from Earth down to the scope itself. */
export function scopeTrail(s: Scope): Scope[] {
  if (s.level === 'earth') return [s];
  const out: Scope[] = [{ level: 'earth' }, { level: 'region', regionId: s.regionId }];
  if (s.level === 'region') return out;
  const countryId = s.level === 'country' ? s.countryId : (s.countryId ?? null);
  if (countryId && s.level !== 'country') out.push({ level: 'country', regionId: s.regionId, countryId });
  if (s.level === 'port' && s.cityId) out.push({ level: 'city', regionId: s.regionId, countryId, cityId: s.cityId });
  out.push(s);
  return out;
}

export function parentScope(s: Scope): Scope | null {
  const t = scopeTrail(s);
  return t.length > 1 ? t[t.length - 2] : null;
}

export interface ScopeStackItem<Pose, Layers> {
  key: string;
  scope: Scope;
  cameraPose: Pose | null;
  layers: Layers;
  clockUtc: string;
  selection: EntityRef | null;
}

/**
 * GeoScopeStack: saves the view state of each scope when drilling down so going back restores camera, layers and
 * selection instead of resetting them.
 */
export class GeoScopeStack<Pose, Layers> {
  private items: ScopeStackItem<Pose, Layers>[] = [];

  get trail(): readonly ScopeStackItem<Pose, Layers>[] {
    return this.items;
  }

  /**
   * Record a transition. Drilling deeper pushes the state being left; moving up or sideways returns the saved state of
   * the destination (if any) and drops deeper entries.
   */
  transition(from: ScopeStackItem<Pose, Layers>, to: Scope): ScopeStackItem<Pose, Layers> | null {
    const toKey = scopeKey(to);
    if (from.key === toKey) return null;
    const fromRank = SCOPE_RANK[from.scope.level];
    const toRank = SCOPE_RANK[to.level];
    if (toRank > fromRank) {
      this.items = this.items.filter((i) => SCOPE_RANK[i.scope.level] < fromRank);
      this.items.push(from);
      return null;
    }
    const saved = this.items.find((i) => i.key === toKey) ?? null;
    this.items = this.items.filter((i) => SCOPE_RANK[i.scope.level] < toRank);
    if (toRank === fromRank) this.items.push(from);
    return saved;
  }

  clear() {
    this.items = [];
  }
}

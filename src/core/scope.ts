import type { EntityRef } from './types';

export type Scope = { level: 'earth' } | { level: 'region'; regionId: string } | { level: 'port'; regionId: string; portId: string };

export const SCOPE_RANK: Record<Scope['level'], number> = { earth: 0, region: 1, port: 2 };

export type ViewMode = '3d' | '2d';

/** Port detail opens in 2D (precise positions); Earth and regions open in 3D. Earth has no 2D mode. */
export function defaultViewMode(s: Scope): ViewMode {
  return s.level === 'port' ? '2d' : '3d';
}

export function supportsViewMode(s: Scope, mode: ViewMode): boolean {
  return mode === '3d' || s.level !== 'earth';
}

export function scopeKey(s: Scope): string {
  return s.level === 'earth' ? 'earth' : s.level === 'region' ? `region:${s.regionId}` : `port:${s.portId}`;
}

/** Parent chain from Earth down to the scope itself. */
export function scopeTrail(s: Scope): Scope[] {
  if (s.level === 'earth') return [s];
  if (s.level === 'region') return [{ level: 'earth' }, s];
  return [{ level: 'earth' }, { level: 'region', regionId: s.regionId }, s];
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

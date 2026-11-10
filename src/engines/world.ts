import type { TimelineEvent } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { berthTimeline } from './berthTimeline';
import { selectKpis, type Kpi } from './kpis';
import { getSnapshotAt, type Snapshot, type WorkflowOverlay } from './snapshot';

/**
 * Everything the UI shows for one scenario instant (spec 10): vessels, ETAs, incidents, weather validity, berth
 * occupancy, KPIs and event history, all folded at the same `t`. Pure and deterministic: same catalog, overlay and
 * `t` give the same result whatever was derived before, so forward and backward seeks reconstruct identical worlds.
 */

export interface BerthOccupancySummary {
  portId: string;
  occupied: number;
  reserved: number;
  free: number;
  conflicts: number;
}

export interface WorldSnapshot {
  timeMs: number;
  snapshot: Snapshot;
  /** Whole simulated fleet. Scoped cohorts come from `selectKpis` on `snapshot`. */
  kpis: Kpi[];
  /** Twin ports only (ports with a layout). */
  berths: BerthOccupancySummary[];
  weather: { active: string[]; upcoming: string[] };
  /** Recorded events with `occurredAt ≤ t`. */
  events: { count: number; lastEventId: string | null };
}

/** Number of catalog events at or before `t` (binary search over the sorted list). */
export function eventCountAt(c: Catalog, t: number): number {
  let lo = 0;
  let hi = c.events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((c.eventMs.get(c.events[mid]!.eventId) ?? 0) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Events with `fromMs < occurredAt ≤ toMs`, in order. Consecutive spans partition the timeline: none lost, none twice. */
export function eventsBetween(c: Catalog, fromMs: number, toMs: number): TimelineEvent[] {
  if (toMs <= fromMs) return [];
  return c.events.slice(eventCountAt(c, fromMs), eventCountAt(c, toMs));
}

export function berthOccupancyAt(c: Catalog, t: number): BerthOccupancySummary[] {
  const v2 = c.v2;
  if (!v2) return [];
  const out: BerthOccupancySummary[] = [];
  for (const [portId, layout] of v2.layoutByPort) {
    const s: BerthOccupancySummary = { portId, occupied: 0, reserved: 0, free: 0, conflicts: 0 };
    for (const term of layout.terminals) {
      for (const b of term.berths) {
        const row = berthTimeline(b.berthId, v2.bookingsByBerth.get(b.berthId) ?? [], t);
        s[row.occupancy]++;
        s.conflicts += row.conflicts.length;
      }
    }
    out.push(s);
  }
  return out.sort((a, b) => a.portId.localeCompare(b.portId));
}

export function deriveWorldSnapshot(c: Catalog, t: number, overlay?: WorkflowOverlay): WorldSnapshot {
  const snapshot = getSnapshotAt(c, t, overlay);
  const active: string[] = [];
  const upcoming: string[] = [];
  for (const [id, phase] of snapshot.hazards) {
    if (phase === 'active') active.push(id);
    else if (phase === 'upcoming') upcoming.push(id);
  }
  const count = eventCountAt(c, t);
  return {
    timeMs: t,
    snapshot,
    kpis: selectKpis(c, snapshot),
    berths: berthOccupancyAt(c, t),
    weather: { active: active.sort(), upcoming: upcoming.sort() },
    events: { count, lastEventId: count ? c.events[count - 1]!.eventId : null },
  };
}

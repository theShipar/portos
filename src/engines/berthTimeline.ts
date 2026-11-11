import { parseUtc, MINUTE } from '@/core/time';
import type { BerthBooking, BerthMilestone, DcsaClassifier } from '@/core/types';

/**
 * DCSA-style berth timeline (spec 07): actual, planned and forecast windows kept apart, never merged.
 * A milestone only counts once it was recorded (`recordedAtUtc ≤ t`), and an actual only once it happened, so
 * replaying the past never leaks later plans. Pure; no UI types.
 */

export type BarKind = 'actual' | 'planned' | 'forecast';

export interface BerthBar {
  bookingId: string;
  portCallId: string;
  vesselId: string;
  berthId: string;
  kind: BarKind;
  startMs: number;
  endMs: number;
  /** Actual stay still in progress at `t` (the bar ends at `t`). */
  open: boolean;
}

export interface RequestedMark {
  bookingId: string;
  vesselId: string;
  atMs: number;
}

export type ConflictBasis = 'planned' | 'forecast';

export interface BerthConflict {
  berthId: string;
  /** Earlier booking first. */
  bookingIds: [string, string];
  vesselIds: [string, string];
  startMs: number;
  endMs: number;
  /** `planned`: two planned windows (with buffer) overlap. `forecast`: an estimate runs into the next window. */
  basis: ConflictBasis;
  /** Length alone never proves fit: draft, tide, services and policy are not modelled. */
  validated: false;
}

export type BerthOccupancy = 'occupied' | 'reserved' | 'free';

export interface BerthTimelineRow {
  berthId: string;
  bars: BerthBar[];
  requested: RequestedMark[];
  conflicts: BerthConflict[];
  occupancy: BerthOccupancy;
  occupantBookingId: string | null;
  occupantVesselId: string | null;
  /** Departure of the current stay passed by both plan and estimate while still alongside. */
  overdue: boolean;
  next: { bookingId: string; vesselId: string; startMs: number; basis: ConflictBasis } | null;
}

export const CONSTRAINTS_NOTE = 'Not yet validated: draft, tide, services and berth policy are not modelled.';

function known(m: BerthMilestone, t: number): boolean {
  const rec = parseUtc(m.recordedAtUtc);
  if (rec === null || rec > t) return false;
  if (m.classifier === 'ACT') {
    const at = parseUtc(m.atUtc);
    return at !== null && at <= t;
  }
  return true;
}

/** Latest-recorded milestone of a kind known at `t` (berth by default, or the pilot boarding place). */
export function milestoneMs(b: BerthBooking, event: BerthMilestone['eventType'], classifier: DcsaClassifier, t: number, location: BerthMilestone['location'] = 'BERTH'): number | null {
  let best: { at: number; rec: number } | null = null;
  for (const m of b.milestones) {
    if (m.location !== location || m.eventType !== event || m.classifier !== classifier || !known(m, t)) continue;
    const at = parseUtc(m.atUtc);
    const rec = parseUtc(m.recordedAtUtc)!;
    if (at !== null && (!best || rec >= best.rec)) best = { at, rec };
  }
  return best?.at ?? null;
}

interface Window {
  booking: BerthBooking;
  startMs: number;
  endMs: number;
}

/** Occupancy window of a booking on a basis, as known at `t`; null when the record does not support one. */
export function bookingWindow(b: BerthBooking, basis: ConflictBasis, t: number): { startMs: number; endMs: number } | null {
  const actArr = milestoneMs(b, 'ARRIVAL', 'ACT', t);
  const actDep = milestoneMs(b, 'DEPARTURE', 'ACT', t);
  const plnArr = milestoneMs(b, 'ARRIVAL', 'PLN', t);
  const plnDep = milestoneMs(b, 'DEPARTURE', 'PLN', t);
  const estArr = milestoneMs(b, 'ARRIVAL', 'EST', t);
  const estDep = milestoneMs(b, 'DEPARTURE', 'EST', t);
  const start = actArr ?? (basis === 'planned' ? plnArr : (estArr ?? plnArr));
  let end = actDep ?? (basis === 'planned' ? plnDep : (estDep ?? plnDep));
  if (start === null || end === null) return null;
  // Still alongside past its departure time: occupied at least until now.
  if (actArr !== null && actDep === null) end = Math.max(end, t);
  return end > start ? { startMs: start, endMs: end } : null;
}

function overlap(a: Window, b: Window, bufferMs: number): { startMs: number; endMs: number } | null {
  const [first, second] = a.startMs <= b.startMs ? [a, b] : [b, a];
  const blockedUntil = first.endMs + bufferMs;
  if (second.startMs >= blockedUntil || second.endMs <= first.startMs) return null;
  return { startMs: second.startMs, endMs: Math.min(blockedUntil, second.endMs) };
}

function conflictsOn(berthId: string, bookings: BerthBooking[], t: number): BerthConflict[] {
  const out: BerthConflict[] = [];
  const seen = new Set<string>();
  for (const basis of ['planned', 'forecast'] as const) {
    const wins: Window[] = [];
    for (const b of bookings) {
      const w = bookingWindow(b, basis, t);
      if (w) wins.push({ booking: b, ...w });
    }
    wins.sort((x, y) => x.startMs - y.startMs || x.booking.bookingId.localeCompare(y.booking.bookingId));
    for (let i = 0; i < wins.length; i++) {
      for (let j = i + 1; j < wins.length; j++) {
        const a = wins[i]!;
        const b = wins[j]!;
        const key = [a.booking.bookingId, b.booking.bookingId].sort().join('|');
        if (seen.has(key)) continue;
        const bufferMs = Math.max(a.booking.bufferMinutes, b.booking.bufferMinutes) * MINUTE;
        const o = overlap(a, b, bufferMs);
        if (!o) continue;
        seen.add(key);
        out.push({
          berthId,
          bookingIds: [a.booking.bookingId, b.booking.bookingId],
          vesselIds: [a.booking.vesselId, b.booking.vesselId],
          ...o,
          basis,
          validated: false,
        });
      }
    }
  }
  return out.sort((x, y) => x.startMs - y.startMs);
}

/** Timeline of one berth at instant `t` from its bookings (any order). */
export function berthTimeline(berthId: string, bookings: BerthBooking[], t: number): BerthTimelineRow {
  const own = bookings.filter((b) => b.berthId === berthId).sort((a, b) => a.bookingId.localeCompare(b.bookingId));
  const bars: BerthBar[] = [];
  const requested: RequestedMark[] = [];
  let occupant: BerthBooking | null = null;
  let overdue = false;
  let reservedBy: BerthBooking | null = null;
  let next: BerthTimelineRow['next'] = null;
  for (const b of own) {
    const base = { bookingId: b.bookingId, portCallId: b.portCallId, vesselId: b.vesselId, berthId };
    const actArr = milestoneMs(b, 'ARRIVAL', 'ACT', t);
    const actDep = milestoneMs(b, 'DEPARTURE', 'ACT', t);
    const plnArr = milestoneMs(b, 'ARRIVAL', 'PLN', t);
    const plnDep = milestoneMs(b, 'DEPARTURE', 'PLN', t);
    const estArr = milestoneMs(b, 'ARRIVAL', 'EST', t);
    const estDep = milestoneMs(b, 'DEPARTURE', 'EST', t);
    const req = milestoneMs(b, 'ARRIVAL', 'REQ', t);
    if (req !== null) requested.push({ bookingId: b.bookingId, vesselId: b.vesselId, atMs: req });
    if (actArr !== null) {
      const open = actDep === null;
      bars.push({ ...base, kind: 'actual', startMs: actArr, endMs: open ? t : actDep, open });
      if (open) {
        occupant = b;
        if (plnDep !== null && plnDep > t) bars.push({ ...base, kind: 'planned', startMs: t, endMs: plnDep, open: false });
        if (estDep !== null && estDep > t) bars.push({ ...base, kind: 'forecast', startMs: t, endMs: estDep, open: false });
        overdue = (plnDep ?? Infinity) <= t && (estDep ?? Infinity) <= t && (plnDep !== null || estDep !== null);
      }
      continue;
    }
    if (plnArr !== null && plnDep !== null && plnDep > plnArr) {
      bars.push({ ...base, kind: 'planned', startMs: plnArr, endMs: plnDep, open: false });
      if (plnArr <= t && t < plnDep) reservedBy ??= b;
    }
    if (estArr !== null && estDep !== null && estDep > estArr) bars.push({ ...base, kind: 'forecast', startMs: estArr, endMs: estDep, open: false });
    const start = plnArr ?? estArr;
    if (start !== null && start > t && (!next || start < next.startMs)) next = { bookingId: b.bookingId, vesselId: b.vesselId, startMs: start, basis: plnArr !== null ? 'planned' : 'forecast' };
  }
  bars.sort((a, b) => a.startMs - b.startMs || a.kind.localeCompare(b.kind));
  return {
    berthId,
    bars,
    requested: requested.sort((a, b) => a.atMs - b.atMs),
    conflicts: conflictsOn(berthId, own, t),
    occupancy: occupant ? 'occupied' : reservedBy ? 'reserved' : 'free',
    occupantBookingId: occupant?.bookingId ?? null,
    occupantVesselId: occupant?.vesselId ?? null,
    overdue,
    next,
  };
}

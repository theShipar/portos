import { formatUtc } from '@/core/format';
import { HOUR } from '@/core/time';
import type { Catalog } from '@/data/catalog';
import { CONSTRAINTS_NOTE, type BarKind, type BerthConflict } from '@/engines/berthTimeline';
import { BERTH_STATUS_LABEL, type PortTwinModel, type TwinBerth, type TwinBerthStatus } from './portTwin';

/**
 * Berth schedule (Gantt) and berth card read models. All positions are window percentages computed here, so the
 * components only render. Actual, planned and forecast stay separate bars (spec 07: never merged).
 */

export const GANTT_WINDOWS = [24, 48, 72] as const;
export type GanttWindow = (typeof GANTT_WINDOWS)[number];

export const BAR_KIND_LABEL: Record<BarKind, string> = { actual: 'Actual', planned: 'Planned', forecast: 'Forecast' };

export interface GanttBarView {
  key: string;
  bookingId: string;
  vesselId: string;
  vesselName: string;
  kind: BarKind;
  leftPct: number;
  widthPct: number;
  /** Actual stay still in progress at the scenario instant. */
  open: boolean;
  /** Bar continues beyond the window edge. */
  clippedStart: boolean;
  clippedEnd: boolean;
  title: string;
}

export interface GanttMarkView {
  key: string;
  leftPct: number;
  title: string;
}

export interface GanttConflictView extends GanttMarkView {
  widthPct: number;
  basis: BerthConflict['basis'];
}

export interface GanttRowView {
  berthId: string;
  name: string;
  terminalName: string;
  status: TwinBerthStatus;
  statusLabel: string;
  bars: GanttBarView[];
  requested: GanttMarkView[];
  conflicts: GanttConflictView[];
}

export interface GanttView {
  startMs: number;
  endMs: number;
  nowPct: number;
  ticks: { key: string; leftPct: number; label: string; day: boolean }[];
  rows: GanttRowView[];
  conflictCount: number;
  note: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function hhmm(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function span(startMs: number, endMs: number) {
  return `${formatUtc(startMs)} – ${new Date(startMs).getUTCDate() === new Date(endMs).getUTCDate() ? hhmm(endMs) + ' UTC' : formatUtc(endMs)}`;
}

/** A quarter of the window lies before the instant, so the current stay and its actual bar stay readable. */
export function ganttWindow(nowMs: number, hours: GanttWindow): { startMs: number; endMs: number } {
  const startMs = Math.floor((nowMs - hours * 0.25 * HOUR) / HOUR) * HOUR;
  return { startMs, endMs: startMs + hours * HOUR };
}

export function berthGanttView(c: Catalog, twin: PortTwinModel, nowMs: number, hours: GanttWindow): GanttView {
  const { startMs, endMs } = ganttWindow(nowMs, hours);
  const len = endMs - startMs;
  const pct = (ms: number) => ((Math.min(endMs, Math.max(startMs, ms)) - startMs) / len) * 100;
  const name = (id: string) => c.byId.vessel.get(id)?.name ?? id;
  const step = hours <= 24 ? 3 : hours <= 48 ? 6 : 12;
  const ticks: GanttView['ticks'] = [];
  for (let t = Math.ceil(startMs / (step * HOUR)) * step * HOUR; t < endMs; t += step * HOUR) {
    const d = new Date(t);
    const day = d.getUTCHours() === 0;
    ticks.push({ key: String(t), leftPct: pct(t), label: day ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : hhmm(t), day });
  }
  const rows = twin.berths.map((b): GanttRowView => {
    const tl = b.timeline;
    const bars = tl.bars
      .filter((x) => x.endMs > startMs && x.startMs < endMs)
      .map((x, i) => ({
        key: `${x.bookingId}:${x.kind}:${i}`,
        bookingId: x.bookingId,
        vesselId: x.vesselId,
        vesselName: name(x.vesselId),
        kind: x.kind,
        leftPct: pct(x.startMs),
        widthPct: Math.max(0.4, pct(x.endMs) - pct(x.startMs)),
        open: x.open,
        clippedStart: x.startMs < startMs,
        clippedEnd: x.endMs > endMs,
        title: `${name(x.vesselId)} · ${BAR_KIND_LABEL[x.kind]}${x.open ? ' (alongside now)' : ''} · ${span(x.startMs, x.endMs)}`,
      }));
    const requested = tl.requested
      .filter((r) => r.atMs >= startMs && r.atMs <= endMs)
      .map((r) => ({ key: `${r.bookingId}:req`, leftPct: pct(r.atMs), title: `${name(r.vesselId)} · requested arrival ${formatUtc(r.atMs)}` }));
    const conflicts = tl.conflicts
      .filter((x) => x.endMs > startMs && x.startMs < endMs)
      .map((x) => ({
        key: `${x.bookingIds.join('-')}:${x.basis}`,
        leftPct: pct(x.startMs),
        widthPct: Math.max(0.6, pct(x.endMs) - pct(x.startMs)),
        basis: x.basis,
        title: `${x.basis === 'planned' ? 'Planned windows overlap' : 'Forecast runs into the next window'}: ${name(x.vesselIds[0])} / ${name(x.vesselIds[1])} · ${span(x.startMs, x.endMs)} · not yet validated`,
      }));
    return { berthId: b.berthId, name: b.name, terminalName: b.terminalName, status: b.status, statusLabel: BERTH_STATUS_LABEL[b.status], bars, requested, conflicts };
  });
  return {
    startMs,
    endMs,
    nowPct: pct(nowMs),
    ticks,
    rows,
    conflictCount: rows.reduce((n, r) => n + r.conflicts.length, 0),
    note: CONSTRAINTS_NOTE,
  };
}

export interface BerthCardView {
  berthId: string;
  name: string;
  terminalName: string;
  status: TwinBerthStatus;
  statusLabel: string;
  occupant: { vesselId: string; name: string; sinceUtc: string | null; overdue: boolean } | null;
  next: { vesselId: string; name: string; atUtc: string; basisLabel: string } | null;
  facts: { label: string; value: string }[];
  conflicts: { key: string; text: string }[];
  note: string;
}

export function berthCardView(c: Catalog, twin: PortTwinModel, berthId: string): BerthCardView | null {
  const b: TwinBerth | undefined = twin.berths.find((x) => x.berthId === berthId);
  if (!b) return null;
  const name = (id: string) => c.byId.vessel.get(id)?.name ?? id;
  const tl = b.timeline;
  const stay = tl.bars.find((x) => x.kind === 'actual' && x.open);
  return {
    berthId: b.berthId,
    name: b.name,
    terminalName: b.terminalName,
    status: b.status,
    statusLabel: BERTH_STATUS_LABEL[b.status],
    occupant: b.occupantVesselId ? { vesselId: b.occupantVesselId, name: name(b.occupantVesselId), sinceUtc: stay ? formatUtc(stay.startMs) : null, overdue: tl.overdue } : null,
    next: tl.next ? { vesselId: tl.next.vesselId, name: name(tl.next.vesselId), atUtc: formatUtc(tl.next.startMs), basisLabel: tl.next.basis === 'planned' ? 'planned' : 'estimated' } : null,
    facts: [
      { label: 'Quay length', value: `${Math.round(b.lengthM)} m` },
      { label: 'Depth (illustrative)', value: `${b.depthM.toFixed(1)} m` },
      { label: 'STS cranes', value: b.craneCount ? String(b.craneCount) : 'None' },
    ],
    conflicts: tl.conflicts.map((x) => ({
      key: `${x.bookingIds.join('-')}:${x.basis}`,
      text: `${x.basis === 'planned' ? 'Planned overlap' : 'Forecast overrun'} · ${name(x.vesselIds[0])} / ${name(x.vesselIds[1])} · ${span(x.startMs, x.endMs)}`,
    })),
    note: CONSTRAINTS_NOTE,
  };
}

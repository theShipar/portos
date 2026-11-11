import { isClosedStage } from '@/core/caseStage';
import { formatDuration, formatHours, formatUsd, formatUtc, sentenceCase } from '@/core/format';
import type { EntityRef, EventType, TimelineEvent } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { selectKpis } from '@/engines/kpis';
import type { Snapshot } from '@/engines/snapshot';
import type { StatusTone } from '@/styles/tokens';

export type EventCategory = 'eta' | 'anchorage' | 'berth' | 'portDelay' | 'weather' | 'case' | 'position';

export const CATEGORY: Record<EventType, EventCategory> = {
  ETA_REVISED: 'eta',
  ANCHORAGE_ENTER: 'anchorage',
  ANCHORAGE_EXIT: 'anchorage',
  BERTH_SCHEDULED: 'berth',
  BERTH_OCCUPIED: 'berth',
  PORT_WAIT_UPDATED: 'portDelay',
  WEATHER_WARNING_ISSUED: 'weather',
  INCIDENT_OPENED: 'case',
  INCIDENT_ACKNOWLEDGED: 'case',
  ACTION_ASSIGNED: 'case',
  INCIDENT_RESOLVED: 'case',
  AIS_REPORT: 'position',
  PORT_QUEUE_JOINED: 'portDelay',
  BERTH_ESTIMATE_UPDATED: 'berth',
};

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  eta: 'ETA shift',
  anchorage: 'Anchorage',
  berth: 'Berth',
  portDelay: 'Port delay',
  weather: 'Storm warning',
  case: 'Case',
  position: 'Position report',
};

export const CATEGORY_TONE: Record<EventCategory, StatusTone> = {
  eta: 'warning',
  anchorage: 'info',
  berth: 'healthy',
  portDelay: 'warning',
  weather: 'critical',
  case: 'critical',
  position: 'neutral',
};

/** Density histogram bin width for the rail (all fixture events, any entity). */
export const DENSITY_BIN_MINUTES = 30;

export interface RailMarker {
  eventId: string;
  ms: number;
  /** Position along the rail, 0–1. */
  at: number;
  category: EventCategory;
  label: string;
  timeText: string;
  /** Entity the marker opens when nothing is selected. */
  target: EntityRef | null;
}

export interface DensityBin {
  startMs: number;
  at: number;
  width: number;
  count: number;
  /** count / max count, 0–1. */
  level: number;
}

const name = (c: Catalog, ref: { kind: string; id: string } | null | undefined) => {
  if (!ref) return '';
  if (ref.kind === 'vessel') return c.byId.vessel.get(ref.id)?.name ?? ref.id;
  if (ref.kind === 'port') return c.byId.port.get(ref.id)?.name ?? ref.id;
  return ref.id;
};
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : null);

/** One-line, plain-language description of a recorded event. */
export function eventLabel(c: Catalog, e: TimelineEvent): string {
  const p = e.payload;
  const vessel = name(c, { kind: 'vessel', id: s(p.vesselId) });
  const port = name(c, { kind: 'port', id: s(p.portId) });
  switch (e.type) {
    case 'ETA_REVISED': {
      const prev = n(p.previousEtaShiftHours);
      const next = n(p.newEtaShiftHours);
      return `ETA revised ${prev === null ? '' : `${formatHours(prev, { signed: true })} → `}${formatHours(next, { signed: true })} · ${s(p.voyageId)}`;
    }
    case 'ANCHORAGE_ENTER':
      return `${vessel} entered ${port} anchorage`;
    case 'ANCHORAGE_EXIT':
      return `${vessel} left ${port} anchorage`;
    case 'BERTH_SCHEDULED':
      return `Berth ${s(p.berthId).replace(/^BRH-[A-Z]+-/, '')} window ${formatUtc(s(p.windowStartUtc))} for ${vessel}`;
    case 'BERTH_OCCUPIED':
      return `${vessel} at berth ${s(p.berthId).replace(/^BRH-[A-Z]+-/, '')}`;
    case 'PORT_WAIT_UPDATED': {
      const prev = n(p.previousWaitingEstimateHours);
      return `${port} wait estimate ${prev === null ? '' : `${prev} → `}${n(p.waitingEstimateHours)} h`;
    }
    case 'WEATHER_WARNING_ISSUED':
      return `Weather warning ${s(p.hazardId)} issued`;
    case 'INCIDENT_OPENED':
      return `${s(p.incidentId)} opened · ${c.byId.incident.get(s(p.incidentId))?.title ?? sentenceCase(s(p.ruleKey).replace(/_/g, ' '))}`;
    case 'INCIDENT_ACKNOWLEDGED':
      return `${s(p.incidentId)} acknowledged by ${c.byId.user.get(s(p.userId))?.displayName ?? s(p.userId)}`;
    case 'ACTION_ASSIGNED':
      return `${s(p.incidentId)} assigned to ${c.byId.user.get(s(p.assigneeUserId))?.displayName ?? s(p.assigneeUserId)}`;
    case 'INCIDENT_RESOLVED':
      return `${s(p.incidentId)} resolved`;
    case 'AIS_REPORT':
      return `Position report ${vessel}${n(p.sogKn) === null ? '' : ` · ${n(p.sogKn)} kn`}`;
    case 'PORT_QUEUE_JOINED':
      return `${vessel} joined ${port} berth queue`;
    case 'BERTH_ESTIMATE_UPDATED':
      return `Estimated berth ${formatUtc(s(p.estimatedBerthUtc))} for ${vessel}${p.confirmed ? '' : ' · not confirmed'}`;
  }
}

function eventTarget(e: TimelineEvent): EntityRef | null {
  const order: EntityRef['kind'][] = ['incident', 'vessel', 'weather', 'port', 'voyage'];
  for (const k of order) {
    const r = e.entityRefs.find((x) => x.kind === k);
    if (r) return r;
  }
  return e.entityRefs[0] ?? null;
}

/** Entity keys whose events belong on the rail for a selection (a vessel also shows its voyages and cases). */
export function contextKeys(c: Catalog, sel: EntityRef | null, portId: string | null): string[] {
  const keys = new Set<string>();
  const add = (kind: string, id: string) => keys.add(`${kind}:${id}`);
  const addVoyage = (voyageId: string) => {
    const vo = c.byId.voyage.get(voyageId);
    add('voyage', voyageId);
    if (vo) add('vessel', vo.vesselId);
    for (const i of c.incidentsByVoyage.get(voyageId) ?? []) add('incident', i.incidentId);
  };
  if (sel?.kind === 'vessel') {
    add('vessel', sel.id);
    for (const vo of c.voyages) if (vo.vesselId === sel.id) addVoyage(vo.voyageId);
  } else if (sel?.kind === 'voyage') addVoyage(sel.id);
  else if (sel?.kind === 'incident') {
    const inc = c.byId.incident.get(sel.id);
    add('incident', sel.id);
    if (inc) {
      addVoyage(inc.voyageId);
      add('port', inc.portId);
    }
  } else if (sel?.kind === 'weather') add('weather', sel.id);
  else if (sel?.kind === 'port') add('port', sel.id);
  else if (portId) add('port', portId);
  return [...keys];
}

/**
 * Markers for the rail: every event of the selection context, or — with nothing selected — case openings and
 * storm warnings across the dataset. Deterministic order (time, then event ID).
 */
export function railMarkers(c: Catalog, sel: EntityRef | null, portId: string | null, startMs: number, endMs: number): RailMarker[] {
  const keys = contextKeys(c, sel, portId);
  const pool = keys.length ? keys.flatMap((k) => c.eventsByEntity.get(k) ?? []) : c.events.filter((e) => e.type === 'INCIDENT_OPENED' || e.type === 'WEATHER_WARNING_ISSUED');
  const seen = new Set<string>();
  const span = Math.max(1, endMs - startMs);
  const out: RailMarker[] = [];
  for (const e of pool) {
    if (seen.has(e.eventId)) continue;
    seen.add(e.eventId);
    const ms = c.eventMs.get(e.eventId) ?? 0;
    if (ms < startMs || ms > endMs) continue;
    out.push({ eventId: e.eventId, ms, at: (ms - startMs) / span, category: CATEGORY[e.type], label: eventLabel(c, e), timeText: formatUtc(ms, { date: false }), target: eventTarget(e) });
  }
  return out.sort((a, b) => a.ms - b.ms || a.eventId.localeCompare(b.eventId));
}

export function densityBins(c: Catalog, startMs: number, endMs: number, binMinutes = DENSITY_BIN_MINUTES): DensityBin[] {
  const width = binMinutes * 60_000;
  const span = Math.max(1, endMs - startMs);
  const count = Math.max(1, Math.ceil(span / width));
  const counts = new Array<number>(count).fill(0);
  for (const e of c.events) {
    const ms = c.eventMs.get(e.eventId) ?? 0;
    if (ms < startMs || ms > endMs) continue;
    counts[Math.min(count - 1, Math.floor((ms - startMs) / width))] += 1;
  }
  const max = Math.max(1, ...counts);
  return counts.map((k, i) => ({ startMs: startMs + i * width, at: (i * width) / span, width: Math.min(width, span - i * width) / span, count: k, level: k / max }));
}

/** Nearest marker strictly after / before t (keyboard and button stepping). */
export function stepMarker(markers: readonly RailMarker[], t: number, dir: 1 | -1): RailMarker | null {
  if (dir === 1) return markers.find((m) => m.ms > t) ?? null;
  for (let i = markers.length - 1; i >= 0; i--) if (markers[i].ms < t) return markers[i];
  return null;
}

/** Latest marker at or before t: "what just happened". */
export function currentMarker(markers: readonly RailMarker[], t: number): RailMarker | null {
  for (let i = markers.length - 1; i >= 0; i--) if (markers[i].ms <= t) return markers[i];
  return null;
}

export interface CompareRow {
  label: string;
  then: string;
  now: string;
  changed: boolean;
}

const POSITION_TEXT: Record<string, string> = {
  exact: 'Reported',
  interpolated: 'Interpolated',
  modelled: 'Modelled',
  'last-known': 'Last known',
  stale: 'Stale',
  unavailable: 'Not yet tracked',
};

function positionText(snap: Snapshot, vesselId: string): string {
  const v = snap.vessels.get(vesselId);
  if (!v) return 'Unknown';
  const base = POSITION_TEXT[v.state] ?? v.state;
  return v.freshnessMinutes && v.state !== 'exact' ? `${base} (${formatDuration(Math.round(v.freshnessMinutes))})` : base;
}

const incidentText = (snap: Snapshot, id: string) => {
  const st = snap.incidents.get(id);
  return !st?.visible ? 'Not yet detected' : sentenceCase(st.status.replace(/_/g, ' '));
};

/**
 * Side-by-side values at the replay time and at Now (simulated) for the selection, or global KPIs with nothing
 * selected. Both columns come from the same pure snapshot function.
 */
export function compareWithNow(c: Catalog, then: Snapshot, now: Snapshot, sel: EntityRef | null): CompareRow[] {
  const rows: CompareRow[] = [];
  const row = (label: string, a: string, b: string) => rows.push({ label, then: a, now: b, changed: a !== b });

  let voyageId: string | null = null;
  let vesselId: string | null = null;
  if (sel?.kind === 'vessel') {
    vesselId = sel.id;
    voyageId = c.voyages.find((v) => v.vesselId === sel.id && v.currentStage !== 'arrived')?.voyageId ?? c.voyages.find((v) => v.vesselId === sel.id)?.voyageId ?? null;
  } else if (sel?.kind === 'voyage') {
    voyageId = sel.id;
    vesselId = c.byId.voyage.get(sel.id)?.vesselId ?? null;
  } else if (sel?.kind === 'incident') {
    const inc = c.byId.incident.get(sel.id);
    voyageId = inc?.voyageId ?? null;
    vesselId = inc?.vesselId ?? null;
  }

  if (vesselId) row('Position', positionText(then, vesselId), positionText(now, vesselId));
  if (voyageId) {
    const e1 = then.etas.get(voyageId);
    const e2 = now.etas.get(voyageId);
    row('ETA shift', formatDuration(e1?.etaShiftMinutes, { signed: true }), formatDuration(e2?.etaShiftMinutes, { signed: true }));
    row('ETA confidence', sentenceCase(e1?.confidence ?? 'unknown'), sentenceCase(e2?.confidence ?? 'unknown'));
    row('Est. exposure', formatUsd(then.exposures.get(voyageId)?.estimatedUsd), formatUsd(now.exposures.get(voyageId)?.estimatedUsd));
    for (const i of c.incidentsByVoyage.get(voyageId) ?? []) row(i.incidentId, incidentText(then, i.incidentId), incidentText(now, i.incidentId));
  }
  const anchoredAt = (snap: Snapshot) => (vesselId ? ([...snap.fold.anchored].find(([, set]) => set.has(vesselId!))?.[0] ?? null) : null);
  const portId = sel?.kind === 'port' ? sel.id : sel?.kind === 'incident' ? (c.byId.incident.get(sel.id)?.portId ?? null) : (anchoredAt(now) ?? anchoredAt(then));
  if (portId) {
    const w1 = then.portWait.get(portId);
    const w2 = now.portWait.get(portId);
    const portName = c.byId.port.get(portId)?.name ?? portId;
    row(`Wait at ${portName}`, w1 ? `${w1.hours} h` : 'No update yet', w2 ? `${w2.hours} h` : 'No update yet');
    if (vesselId) row('At anchorage', anchoredAt(then) === portId ? 'Yes' : 'No', anchoredAt(now) === portId ? 'Yes' : 'No');
    else {
      row('At anchorage', String(then.fold.anchored.get(portId)?.size ?? 0), String(now.fold.anchored.get(portId)?.size ?? 0));
      const openHere = (snap: Snapshot) => c.incidents.filter((i) => i.portId === portId && snap.incidents.get(i.incidentId)?.visible && !isClosedStage(snap.incidents.get(i.incidentId)!.status)).length;
      row('Open cases here', String(openHere(then)), String(openHere(now)));
    }
  }
  if (sel?.kind === 'weather') {
    row('Hazard phase', sentenceCase(then.hazards.get(sel.id) ?? 'unknown'), sentenceCase(now.hazards.get(sel.id) ?? 'unknown'));
  }
  if (!rows.length) {
    const k1 = selectKpis(c, then);
    const k2 = selectKpis(c, now);
    for (const key of ['unresolvedIncidents', 'delayedVoyages', 'atRiskVoyages', 'exposureUsd'] as const) {
      const a = k1.find((k) => k.key === key);
      const b = k2.find((k) => k.key === key);
      if (!a || !b) continue;
      const fmt = (v: number | null) => (a.unit === 'usd' ? formatUsd(v, { compact: true }) : String(v ?? '—'));
      row(a.label, fmt(a.value), fmt(b.value));
    }
  }
  return rows;
}

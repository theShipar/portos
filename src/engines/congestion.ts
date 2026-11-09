import { parseUtc, toIsoUtc } from '@/core/time';
import type { Berth, Confidence, PortCall, TimelineEvent } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { makeProvenance, type Provenance } from './provenance';
import { getVesselAtTime } from './tracks';

export interface QueueEntry {
  portCallId: string;
  vesselId: string;
  voyageId: string | null;
  arrivalAtUtc: string;
  waitingSinceUtc: string | null;
  estimatedBerthUtc: string | null;
  terminalId: string | null;
  elapsedWaitHours: number | null;
  /** Hours from now until the estimated berth window, null when unknown. */
  forecastWaitHours: number | null;
  atAnchor: boolean;
  queueEvidence: 'waiting-since recorded' | 'waiting start unknown';
}

export interface BerthState {
  berthId: string;
  terminalId: string;
  name: string;
  status: Berth['status'];
  occupantVesselId: string | null;
  scheduledVesselId: string | null;
  scheduledWindowStartUtc: string | null;
  scheduledWindowEndUtc: string | null;
  lastUpdatedUtc: string;
}

export interface PortCongestionResult {
  portId: string;
  asOfMs: number;
  atAnchorCount: number;
  awaitingBerthCount: number;
  arrivalsNext24h: number;
  arrivals: PortCall[];
  berthsOccupied: number;
  berthsKnown: number;
  berthsUnavailable: number;
  berthUtilization: number | null;
  medianWaitHours: number | null;
  p90WaitHours: number | null;
  waitSampleSize: number;
  coverage: number | null;
  forecastWaitHours: number | null;
  forecastAsOfUtc: string | null;
  score0to100: number | null;
  level: 'normal' | 'elevated' | 'critical' | 'unknown';
  confidence: Confidence;
  formula: { key: string; label: string; weight: number; value: number | null }[];
  qualityWarnings: string[];
  queue: QueueEntry[];
  berths: BerthState[];
  provenance: Provenance;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function firstEventTime(events: TimelineEvent[] | undefined, type: TimelineEvent['type'], match: (e: TimelineEvent) => boolean): number | null {
  const e = events?.find((x) => x.type === type && match(x));
  return e ? parseUtc(e.occurredAtUtc) : null;
}

export const CONGESTION_WEIGHTS = { wait: 0.45, arrivals: 0.25, utilization: 0.3 } as const;

/** Port congestion at a simulation instant, folded from port calls, berth records and port events. */
export function computePortCongestion(c: Catalog, portId: string, t: number): PortCongestionResult {
  const calls = c.portCallsByPort.get(portId) ?? [];
  const portEvents = c.eventsByEntity.get(`port:${portId}`) ?? [];
  const queue: QueueEntry[] = [];
  const arrivals: PortCall[] = [];
  const berthedAt = new Map<string, number>();

  for (const call of calls) {
    const arrival = parseUtc(call.arrivalAtUtc);
    if (arrival === null) continue;
    const vEvents = c.eventsByEntity.get(`vessel:${call.vesselId}`);
    if (call.status === 'scheduled') {
      if (arrival > t && arrival <= t + 24 * 3_600_000) arrivals.push(call);
      continue;
    }
    if (arrival > t) continue;
    let inQueue = call.status === 'awaiting_berth';
    if (call.status === 'at_berth') {
      const exit = firstEventTime(vEvents, 'ANCHORAGE_EXIT', (e) => e.payload.portId === portId);
      const occupied = firstEventTime(vEvents, 'BERTH_OCCUPIED', (e) => e.payload.portId === portId);
      inQueue = exit !== null && t < exit;
      if (occupied !== null) berthedAt.set(call.vesselId, occupied);
    }
    if (!inQueue) continue;
    const waitingSince = parseUtc(call.waitingSinceUtc);
    const berthEta = parseUtc(call.estimatedBerthUtc);
    const snap = getVesselAtTime(c, call.vesselId, t);
    queue.push({
      portCallId: call.portCallId,
      vesselId: call.vesselId,
      voyageId: call.voyageId,
      arrivalAtUtc: call.arrivalAtUtc,
      waitingSinceUtc: call.waitingSinceUtc,
      estimatedBerthUtc: call.estimatedBerthUtc,
      terminalId: call.terminalId,
      elapsedWaitHours: waitingSince !== null && waitingSince <= t ? (t - waitingSince) / 3_600_000 : null,
      forecastWaitHours: berthEta !== null ? Math.max(0, (berthEta - t) / 3_600_000) : null,
      atAnchor: snap.navStatus === 'at_anchor',
      queueEvidence: waitingSince !== null ? 'waiting-since recorded' : 'waiting start unknown',
    });
  }
  queue.sort((a, b) => (b.elapsedWaitHours ?? -1) - (a.elapsedWaitHours ?? -1) || a.vesselId.localeCompare(b.vesselId));

  const berths: BerthState[] = (c.berthsByPort.get(portId) ?? []).map((b) => {
    let status = b.status;
    let occupant = b.occupiedByVesselId;
    if (occupant) {
      const since = berthedAt.get(occupant);
      if (since !== undefined && t < since) {
        status = 'free';
        occupant = null;
      }
    }
    return {
      berthId: b.berthId,
      terminalId: b.terminalId,
      name: b.name,
      status,
      occupantVesselId: occupant,
      scheduledVesselId: b.scheduledVesselId,
      scheduledWindowStartUtc: b.scheduledWindowStartUtc,
      scheduledWindowEndUtc: b.scheduledWindowEndUtc,
      lastUpdatedUtc: b.lastUpdatedUtc,
    };
  });
  const berthsUnavailable = berths.filter((b) => b.status === 'unavailable').length;
  const known = berths.filter((b) => b.status !== 'unknown');
  const usable = known.length - berthsUnavailable;
  const occupied = berths.filter((b) => b.status === 'occupied').length;
  const utilization = usable > 0 ? occupied / usable : null;

  const waits = queue.map((q) => q.elapsedWaitHours).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const median = waits.length ? percentile(waits, 0.5) : null;
  const p90 = waits.length >= 5 ? percentile(waits, 0.9) : null;
  const coverage = queue.length ? waits.length / queue.length : null;

  const waitEvt = portEvents.filter((e) => e.type === 'PORT_WAIT_UPDATED' && (parseUtc(e.occurredAtUtc) ?? Infinity) <= t).pop();
  const forecastWait = waitEvt ? (waitEvt.payload.waitingEstimateHours as number) : null;

  const qualityWarnings: string[] = [];
  const formula = [
    { key: 'wait', label: 'Median known wait ÷ 48 h', weight: CONGESTION_WEIGHTS.wait, value: median === null ? null : Math.min(1, median / 48) },
    { key: 'arrivals', label: 'Arrivals next 24 h ÷ usable berths', weight: CONGESTION_WEIGHTS.arrivals, value: usable > 0 ? Math.min(1, arrivals.length / usable) : null },
    { key: 'utilization', label: 'Berth utilisation (known, usable)', weight: CONGESTION_WEIGHTS.utilization, value: utilization },
  ];
  const present = formula.filter((f) => f.value !== null);
  if (present.length < formula.length) qualityWarnings.push(`Missing inputs (${formula.filter((f) => f.value === null).map((f) => f.key).join(', ')}); weights renormalised.`);
  const unknownBerths = berths.length - known.length;
  if (unknownBerths) qualityWarnings.push(`${unknownBerths} berth status unknown (not counted as free).`);
  if (coverage !== null && coverage < 1) qualityWarnings.push(`${queue.length - waits.length} of ${queue.length} queue entries lack a waiting start; excluded from median.`);
  const wSum = present.reduce((s, f) => s + f.weight, 0);
  const score = present.length ? Math.round((100 * present.reduce((s, f) => s + f.weight * (f.value as number), 0)) / wSum) : null;
  const confidence: Confidence = !present.length ? 'unknown' : coverage !== null && coverage < 0.5 ? 'low' : present.length < formula.length ? 'low' : 'medium';
  const level = score === null ? 'unknown' : score >= 70 && confidence !== 'low' ? 'critical' : score >= 40 ? 'elevated' : 'normal';

  const latestBerthUpdate = berths.map((b) => parseUtc(b.lastUpdatedUtc)).filter((x): x is number => x !== null && x <= t).sort((a, b) => b - a)[0] ?? null;
  const provenance = makeProvenance({
    sourceClass: 'derived-model',
    evidence: score === null ? 'unknown' : 'estimated',
    method: 'Weighted score of median known wait, arrival pressure and berth utilisation; missing inputs renormalised, never zero',
    feed: 'berth',
    asOf: latestBerthUpdate ?? t,
    nowMs: t,
    confidence,
    formula: `score = 100 × Σ(weight × input) ÷ Σ(weights present) · ${formula.map((f) => `${f.key} ${f.weight}`).join(', ')}`,
    sources: [
      { kind: 'record', id: `portCalls:${portId}`, label: `${calls.length} port calls · portCalls.json` },
      { kind: 'record', id: `berths:${portId}`, label: `${berths.length} berths · berths.json`, atUtc: latestBerthUpdate === null ? null : toIsoUtc(latestBerthUpdate) },
      ...(waitEvt ? [{ kind: 'event' as const, id: waitEvt.eventId, label: `PORT_WAIT_UPDATED · ${forecastWait} h`, atUtc: waitEvt.occurredAtUtc }] : []),
    ],
    assumptions: ['Anchored vessels are not assumed to hold a commercial berth slot.', 'Unknown berth status is not counted as free.'],
    warnings: qualityWarnings,
  });

  return {
    provenance,
    portId,
    asOfMs: t,
    atAnchorCount: queue.filter((q) => q.atAnchor).length,
    awaitingBerthCount: queue.length,
    arrivalsNext24h: arrivals.length,
    arrivals: arrivals.sort((a, b) => a.arrivalAtUtc.localeCompare(b.arrivalAtUtc)),
    berthsOccupied: occupied,
    berthsKnown: known.length,
    berthsUnavailable,
    berthUtilization: utilization,
    medianWaitHours: median,
    p90WaitHours: p90,
    waitSampleSize: waits.length,
    coverage,
    forecastWaitHours: forecastWait,
    forecastAsOfUtc: waitEvt?.occurredAtUtc ?? null,
    score0to100: score,
    level,
    confidence,
    formula,
    qualityWarnings,
    queue,
    berths,
  };
}

import { formatHours, formatUsd, formatUtc } from '@/core/format';
import { parseUtc } from '@/core/time';
import type { BerthBooking, PortCall } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { jitOpportunity, type JitResult } from '@/engines/jit';
import { portCallVariance, type MilestoneVariance } from '@/engines/etaVariance';
import { serviceChain, type ServiceStep } from '@/engines/serviceChain';
import type { Snapshot } from '@/engines/snapshot';
import type { StatusTone } from '@/styles/tokens';

export interface PortCallValueRow {
  key: string;
  label: string;
  value: string;
  hint?: string;
  sourceIds: string[];
}

export interface VarianceRow {
  milestone: MilestoneVariance['milestone'];
  label: string;
  value: string;
  tone: StatusTone;
  note: string;
}

export interface ChainRow {
  key: ServiceStep['key'];
  label: string;
  status: ServiceStep['status'];
  statusLabel: string;
  tone: StatusTone;
  timeText: string;
  note: string;
}

export interface PortCallValue {
  portCallId: string;
  portName: string;
  bookingId: string | null;
  stageLabel: string;
  queueSinceUtc: string | null;
  anchorageSinceUtc: string | null;
  estimatedBerthUtc: string | null;
  slotConfirmed: boolean;
  totalWaitHours: number | null;
  elapsedHours: number | null;
  remainingHours: number | null;
  rows: PortCallValueRow[];
  /** Downstream effect on the voyage: destination ETA shift and delay exposure, from the shared impact model. */
  downstream: PortCallValueRow[];
  variance: VarianceRow[];
  jit: JitResult | null;
  jitText: string;
  chain: ChainRow[];
  sourceIds: string[];
  asOfText: string;
}

const CALL_STAGE: Record<PortCall['status'], string> = { awaiting_berth: 'Waiting for berth', scheduled: 'Scheduled call', at_berth: 'Alongside' };
const CALL_ORDER: Record<PortCall['status'], number> = { awaiting_berth: 0, at_berth: 1, scheduled: 2 };

const CHAIN_LABEL: Record<ServiceStep['status'], { label: string; tone: StatusTone }> = {
  actual: { label: 'Actual', tone: 'healthy' },
  inProgress: { label: 'In progress', tone: 'info' },
  planned: { label: 'Planned', tone: 'neutral' },
  requested: { label: 'Requested', tone: 'neutral' },
  forecast: { label: 'Estimate', tone: 'info' },
  missed: { label: 'Missed plan', tone: 'critical' },
  unconfirmed: { label: 'Unconfirmed slot', tone: 'warning' },
  notRecorded: { label: 'Not recorded', tone: 'unknown' },
  notInDataset: { label: 'Not in dataset', tone: 'unknown' },
};

const VARIANCE_TONE: Record<MilestoneVariance['direction'], StatusTone> = { late: 'warning', early: 'info', onTime: 'healthy', noBaseline: 'unknown', noForecast: 'unknown' };

const hoursBetween = (a: number, b: number) => Math.round(((b - a) / 3_600_000) * 10) / 10;

/** The call the vessel is working now: waiting first, then alongside, then the next scheduled arrival. */
export function activePortCall(c: Catalog, vesselId: string): PortCall | null {
  const calls = c.portCallsByVessel.get(vesselId) ?? [];
  return [...calls].sort((a, b) => CALL_ORDER[a.status] - CALL_ORDER[b.status] || a.arrivalAtUtc.localeCompare(b.arrivalAtUtc))[0] ?? null;
}

/**
 * Port-call value read model at the snapshot time: queue and anchorage entry from recorded events, the berth
 * estimate (never shown as a confirmed slot), total / elapsed / remaining waiting, same-milestone variance, JIT
 * opportunity and the service chain, each with the record or event IDs it came from.
 */
export function selectPortCallValue(c: Catalog, snap: Snapshot, vesselId: string): PortCallValue | null {
  const call = activePortCall(c, vesselId);
  if (!call) return null;
  const t = snap.timeMs;
  const booking: BerthBooking | null = c.v2?.bookingsByVessel.get(vesselId)?.find((b) => b.portCallId === call.portCallId) ?? null;
  const queued = snap.fold.queued.get(vesselId);
  const anchored = snap.fold.anchoredSince.get(vesselId);
  const estimate = snap.fold.berthEstimates.get(vesselId);

  const queueSinceUtc = queued && queued.portId === call.portId ? queued.sinceUtc : null;
  const anchorageSinceUtc = anchored && anchored.portId === call.portId ? anchored.sinceUtc : null;
  const estimatedBerthUtc = estimate?.estimatedBerthUtc ?? null;
  const slotConfirmed = estimate?.confirmed === true;
  const qMs = parseUtc(queueSinceUtc);
  const eMs = parseUtc(estimatedBerthUtc);
  const totalWaitHours = qMs !== null && eMs !== null ? hoursBetween(qMs, eMs) : null;
  const elapsedHours = qMs !== null ? Math.max(0, hoursBetween(qMs, t)) : null;
  const remainingHours = eMs !== null && call.status === 'awaiting_berth' ? Math.max(0, hoursBetween(t, eMs)) : null;

  const rows: PortCallValueRow[] = [
    { key: 'queue', label: 'In berth queue since', value: queueSinceUtc ? formatUtc(queueSinceUtc) : 'Not queued at this time', sourceIds: queued ? [queued.eventId] : [] },
    { key: 'anchorage', label: 'Anchorage since', value: anchorageSinceUtc ? formatUtc(anchorageSinceUtc) : '—', hint: anchored?.anchorageId ?? undefined, sourceIds: anchored ? [anchored.eventId] : [] },
    {
      key: 'berth',
      label: 'Estimated berth',
      value: estimatedBerthUtc ? `${formatUtc(estimatedBerthUtc)}${slotConfirmed ? '' : ' · unconfirmed'}` : 'No berth estimate',
      hint: slotConfirmed ? 'Confirmed slot' : 'Estimate only, not a confirmed slot',
      sourceIds: estimate ? [estimate.eventId] : [],
    },
    {
      key: 'wait',
      label: 'Waiting forecast',
      value: totalWaitHours !== null ? `${formatHours(totalWaitHours)} in queue · ${remainingHours !== null ? `${formatHours(remainingHours)} remaining` : 'remaining —'}` : '—',
      hint: totalWaitHours !== null ? `Queue entry to estimated berth; ${formatHours(elapsedHours)} elapsed` : undefined,
      sourceIds: [queued?.eventId, estimate?.eventId].filter((id): id is string => !!id),
    },
  ];

  const impact = call.voyageId ? { eta: snap.etas.get(call.voyageId) ?? null, exposure: snap.exposures.get(call.voyageId) ?? null } : null;
  const shiftH = impact?.eta?.etaShiftMinutes != null ? impact.eta.etaShiftMinutes / 60 : null;
  const etaIds = impact?.eta?.provenance.sources.map((s) => s.id) ?? [];
  const downstream: PortCallValueRow[] = impact
    ? [
        { key: 'eta', label: 'Destination ETA', value: shiftH !== null ? formatHours(shiftH, { signed: true }) : '—', hint: impact.eta?.estimatedArrivalUtc ? formatUtc(impact.eta.estimatedArrivalUtc) : undefined, sourceIds: etaIds },
        { key: 'exposure', label: 'Delay exposure', value: impact.exposure?.estimatedUsd != null ? formatUsd(impact.exposure.estimatedUsd) : 'Unavailable', hint: impact.exposure?.formulaText, sourceIds: [call.voyageId!] },
      ]
    : [];

  const variance: VarianceRow[] = booking
    ? portCallVariance(booking, t).map((v) => ({
        milestone: v.milestone,
        label: v.label,
        value: v.shiftHours !== null ? (v.direction === 'onTime' ? 'On time' : formatHours(v.shiftHours, { signed: true })) : v.direction === 'noBaseline' ? 'No baseline' : 'No estimate',
        tone: VARIANCE_TONE[v.direction],
        note: v.note,
      }))
    : [];
  const jit = booking ? jitOpportunity(booking, t) : null;
  const jitText = !jit
    ? 'No berth booking in the dataset.'
    : jit.status === 'opportunity'
      ? `Indicative ${formatHours(jit.indicativeWaitHours)} wait: coordinate arrival`
      : jit.status === 'unconfirmedSlot'
        ? 'Unconfirmed slot: no planned berth time to coordinate against'
        : jit.status === 'withinThreshold'
          ? 'Arrival fits the planned berth time'
          : `Not applicable: ${jit.explanation.charAt(0).toLowerCase()}${jit.explanation.slice(1)}`;
  const chain: ChainRow[] = booking
    ? serviceChain(booking, t).map((s) => ({ key: s.key, label: s.label, status: s.status, statusLabel: CHAIN_LABEL[s.status].label, tone: CHAIN_LABEL[s.status].tone, timeText: s.atMs !== null ? formatUtc(s.atMs) : '—', note: s.note }))
    : [];

  const sourceIds = [call.portCallId, ...(booking ? [booking.bookingId] : []), ...rows.flatMap((r) => r.sourceIds), ...downstream.flatMap((r) => r.sourceIds)];
  return {
    portCallId: call.portCallId,
    portName: c.byId.port.get(call.portId)?.name ?? call.portId,
    bookingId: booking?.bookingId ?? null,
    stageLabel: CALL_STAGE[call.status],
    queueSinceUtc,
    anchorageSinceUtc,
    estimatedBerthUtc,
    slotConfirmed,
    totalWaitHours,
    elapsedHours,
    remainingHours,
    rows,
    downstream,
    variance,
    jit,
    jitText,
    chain,
    sourceIds: [...new Set(sourceIds)],
    asOfText: `Simulated · as of ${formatUtc(t)}`,
  };
}

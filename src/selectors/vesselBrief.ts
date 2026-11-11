import { projectOntoPath } from '@/core/geo';
import { formatNm, formatPercent, formatUtc } from '@/core/format';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { Snapshot } from '@/engines/snapshot';
import type { StatusTone } from '@/styles/tokens';
import type { PortCallValue } from './portCall';
import type { VesselInspectorModel } from './vessel';

/** The inspector headline shows at most three priorities (V2 spec 13: "3 priorities"). */
export const PRIORITY_MAX = 3;
/** Overview lists the latest few events, each with a jump-to-time action. */
export const ACTIONABLE_EVENTS_MAX = 3;

export interface RouteProgress {
  originName: string;
  destinationName: string;
  /** 0–1 along the synthetic corridor. */
  progress: number;
  progressText: string;
  /** Whole percent for the progress bar's aria-valuenow. */
  progressPct: number;
  remainingText: string;
  etaText: string;
  basis: 'position' | 'fixture' | 'notDeparted';
  basisText: string;
}

const BASIS_TEXT: Record<RouteProgress['basis'], string> = {
  position: 'Projected from the simulated position onto the corridor',
  fixture: 'Fixture route progress (no position at this time)',
  notDeparted: 'Not yet departed',
};

export function routeProgress(c: Catalog, snap: Snapshot, vesselId: string): RouteProgress | null {
  const v = c.byId.vessel.get(vesselId);
  const voyage = v?.currentVoyageId ? c.byId.voyage.get(v.currentVoyageId) : null;
  const route = voyage ? c.byId.route.get(voyage.routeId) : null;
  if (!voyage || !route) return null;
  const point = snap.vessels.get(vesselId)?.point ?? null;
  const basis: RouteProgress['basis'] = !voyage.departedAtUtc ? 'notDeparted' : point ? 'position' : 'fixture';
  const raw = basis === 'notDeparted' ? 0 : basis === 'position' ? projectOntoPath(route.waypoints, point!).progress : voyage.routeProgressAsOf;
  const progress = Math.min(1, Math.max(0, raw));
  const eta = snap.etas.get(voyage.voyageId) ?? null;
  const portName = (id: string) => c.byId.port.get(id)?.name ?? id;
  return {
    originName: portName(voyage.originPortId),
    destinationName: portName(voyage.destinationPortId),
    progress,
    progressText: formatPercent(progress, 0),
    progressPct: Math.round(progress * 100),
    remainingText: `${formatNm(route.distanceNmEstimate * (1 - progress))} to go`,
    etaText: eta?.estimatedArrivalUtc ? `ETA ${formatUtc(eta.estimatedArrivalUtc)}` : 'ETA unknown',
    basis,
    basisText: BASIS_TEXT[basis],
  };
}

export interface Priority {
  key: string;
  tone: StatusTone;
  label: string;
  detail: string;
  action: { label: string; target: EntityRef } | { label: string; compareVoyageId: string } | null;
}

/** Ordered: open case, then ETA/exposure, then the port call, then route weather; capped at three. */
export function vesselPriorities(model: VesselInspectorModel, portCall: PortCallValue | null): Priority[] {
  const out: Priority[] = [];
  const inc = model.activeIncident;
  if (inc) out.push({ key: 'incident', tone: inc.severity === 'medium' ? 'warning' : 'critical', label: `${inc.incidentId} · ${inc.title}`, detail: `${inc.severityStyle.label} · ${inc.statusStyle.label}`, action: { label: 'Investigate', target: { kind: 'incident', id: inc.incidentId } } });
  const impact = model.impact;
  if (impact && (impact.shiftTone === 'critical' || impact.shiftTone === 'warning'))
    out.push({ key: 'eta', tone: impact.shiftTone, label: `ETA ${impact.shiftText} vs plan`, detail: `Delay exposure ${impact.exposureText} (modelled)`, action: { label: 'Compare responses', compareVoyageId: impact.voyageId } });
  if (portCall) {
    const jit = portCall.jit?.status === 'opportunity';
    if (jit || portCall.totalWaitHours !== null)
      out.push({ key: 'portCall', tone: jit ? 'info' : 'warning', label: jit ? `Just-in-time opportunity at ${portCall.portName}` : `${portCall.stageLabel} at ${portCall.portName}`, detail: portCall.jitText, action: null });
  }
  if (impact?.risk && (impact.risk.band === 'high' || impact.risk.band === 'severe' || impact.risk.band === 'moderate'))
    out.push({ key: 'weather', tone: impact.riskStyle.tone, label: `Route weather ${impact.riskStyle.label.toLowerCase()}`, detail: impact.riskSummary, action: null });
  return out.slice(0, PRIORITY_MAX);
}

export interface ActionableEvent {
  eventId: string;
  timeText: string;
  label: string;
  ms: number;
}

export function actionableEvents(c: Catalog, model: VesselInspectorModel): ActionableEvent[] {
  return model.events.slice(0, ACTIONABLE_EVENTS_MAX).map((e) => ({ eventId: e.eventId, timeText: e.timeUtc, label: e.label, ms: c.eventMs.get(e.eventId) ?? Number.NaN })).filter((e) => Number.isFinite(e.ms));
}

/** Two short deltas for the on-map peek: ETA shift and exposure, or position state when there is no voyage. */
export function peekDeltas(model: VesselInspectorModel): { label: string; tone: StatusTone }[] {
  if (model.impact) {
    const d: { label: string; tone: StatusTone }[] = [{ label: `ETA ${model.impact.shiftText}`, tone: model.impact.shiftTone }];
    if (!model.impact.exposureUnavailable) d.push({ label: `${model.impact.exposureText} exposure`, tone: 'neutral' });
    return d;
  }
  return [{ label: model.positionLabel, tone: model.positionStale ? 'unknown' : 'neutral' }];
}

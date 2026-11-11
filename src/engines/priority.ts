import { formatDuration, formatUsd } from '@/core/format';
import { parseUtc } from '@/core/time';
import { isClosedStage, STAGE_LABEL } from '@/core/caseStage';
import type { CaseStage, Confidence, Incident, Severity } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { Snapshot } from './snapshot';

/** Points per factor; the sum is the queue order and every term is shown in the rationale. */
export const PRIORITY_WEIGHTS = {
  severity: { critical: 45, high: 30, medium: 15 } as Record<Severity, number>,
  /** Exposure points scale linearly up to this cap. */
  exposureCapUsd: 40_000,
  exposureMax: 30,
  /** One point per hour open, capped. */
  ageMax: 15,
  /** An untriaged case has nobody on it yet. */
  status: { untriaged: 10 } as Partial<Record<CaseStage, number>>,
  lowConfidencePenalty: 5,
};

/** Forecast alerts on the same voyage and category inside one bucket are one case. */
export const DEDUPE_BUCKET_HOURS = 6;
const FORECAST_CATEGORIES = new Set(['schedule_variance', 'port_delay', 'port_congestion']);

export interface CasePriority {
  incidentId: string;
  severity: Severity;
  escalated: boolean;
  status: CaseStage;
  exposureUsd: number | null;
  ageMinutes: number;
  confidence: Confidence;
  needsVerification: boolean;
  score: number;
  rationale: string[];
}

export interface CaseGroup {
  /** Primary incident (highest priority in the group). */
  caseId: string;
  incidentIds: string[];
  voyageId: string;
  vesselId: string;
  portId: string;
  category: string;
  priority: CasePriority;
  /** Other unresolved cases on the same voyage (rollup; exposure counted once per voyage). */
  relatedOnVoyage: string[];
}

/** Stale or missing position, or a stale/unknown ETA input: the case shows "Needs verification". */
export function needsVerification(c: Catalog, snap: Snapshot, inc: Incident): boolean {
  const v = snap.vessels.get(inc.vesselId);
  if (!v || v.state === 'stale' || v.state === 'unavailable') return true;
  const eta = snap.etas.get(inc.voyageId);
  return !eta || eta.provenance.freshness === 'stale' || eta.confidence === 'unknown' || !c.byId.voyage.has(inc.voyageId);
}

export function incidentPriority(c: Catalog, snap: Snapshot, inc: Incident): CasePriority | null {
  const st = snap.incidents.get(inc.incidentId);
  if (!st?.visible) return null;
  const w = PRIORITY_WEIGHTS;
  const opened = parseUtc(inc.openedAtUtc) ?? snap.timeMs;
  const ageMinutes = Math.max(0, Math.round((snap.timeMs - opened) / 60_000));
  const exposureUsd = snap.exposures.get(inc.voyageId)?.estimatedUsd ?? null;
  const confidence = snap.etas.get(inc.voyageId)?.confidence ?? 'unknown';
  const verify = needsVerification(c, snap, inc);

  const sev = w.severity[st.severity];
  const exp = exposureUsd === null ? 0 : Math.round((Math.min(exposureUsd, w.exposureCapUsd) / w.exposureCapUsd) * w.exposureMax);
  const age = Math.min(w.ageMax, Math.floor(ageMinutes / 60));
  const stat = w.status[st.status] ?? 0;
  const conf = confidence === 'low' || confidence === 'unknown' ? -w.lowConfidencePenalty : 0;
  const statusLabel = st.status === 'untriaged' ? 'not yet triaged' : STAGE_LABEL[st.status].toLowerCase();

  const rationale = [
    `${st.severity[0].toUpperCase()}${st.severity.slice(1)} severity${st.escalated ? ' (escalated)' : ''} +${sev}`,
    exposureUsd === null ? 'Exposure unavailable +0' : `${formatUsd(exposureUsd)} exposure +${exp}`,
    `Open ${formatDuration(ageMinutes)} +${age}`,
    `${statusLabel[0].toUpperCase()}${statusLabel.slice(1)} +${stat}`,
    ...(conf ? [`${confidence === 'low' ? 'Low' : 'Unknown'} confidence −${w.lowConfidencePenalty}`] : []),
  ];
  return { incidentId: inc.incidentId, severity: st.severity, escalated: st.escalated, status: st.status, exposureUsd, ageMinutes, confidence, needsVerification: verify, score: sev + exp + age + stat + conf, rationale };
}

/**
 * Explainable exception queue: unresolved, visible incidents as cases, worst first. Related forecast alerts on the
 * same voyage and category within a 6 h bucket collapse into one case; other alerts on the voyage stay separate
 * cases and are cross-linked.
 */
export function buildCaseQueue(c: Catalog, snap: Snapshot, opts: { includeResolved?: boolean } = {}): CaseGroup[] {
  const groups = new Map<string, { inc: Incident; p: CasePriority }[]>();
  for (const inc of c.incidents) {
    const p = incidentPriority(c, snap, inc);
    if (!p || (!opts.includeResolved && isClosedStage(p.status))) continue;
    const opened = parseUtc(inc.openedAtUtc) ?? 0;
    const key = FORECAST_CATEGORIES.has(inc.category) ? `${inc.voyageId}|${inc.category}|${Math.floor(opened / (DEDUPE_BUCKET_HOURS * 3600_000))}` : inc.incidentId;
    groups.set(key, [...(groups.get(key) ?? []), { inc, p }]);
  }
  const cases: CaseGroup[] = [];
  for (const members of groups.values()) {
    members.sort((a, b) => b.p.score - a.p.score || a.inc.incidentId.localeCompare(b.inc.incidentId));
    const { inc, p } = members[0];
    cases.push({ caseId: inc.incidentId, incidentIds: members.map((m) => m.inc.incidentId), voyageId: inc.voyageId, vesselId: inc.vesselId, portId: inc.portId, category: inc.category, priority: p, relatedOnVoyage: [] });
  }
  const byVoyage = new Map<string, string[]>();
  for (const cs of cases) byVoyage.set(cs.voyageId, [...(byVoyage.get(cs.voyageId) ?? []), cs.caseId]);
  for (const cs of cases) cs.relatedOnVoyage = (byVoyage.get(cs.voyageId) ?? []).filter((id) => id !== cs.caseId).sort();
  return cases.sort((a, b) => b.priority.score - a.priority.score || a.caseId.localeCompare(b.caseId));
}

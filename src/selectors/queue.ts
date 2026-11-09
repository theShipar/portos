import { formatDuration, formatUsd, sentenceCase } from '@/core/format';
import type { Catalog } from '@/data/catalog';
import { buildCaseQueue, type CaseGroup } from '@/engines/priority';
import type { Snapshot } from '@/engines/snapshot';
import { statusStyle, type StatusStyle } from '@/styles/tokens';
import type { WorkflowState } from '@/workflows/types';

/** Rows shown before "Show all" (spec 07-screens/05: top five by explainable priority). */
export const QUEUE_TOP_N = 5;

export interface QueueRow {
  caseId: string;
  title: string;
  vesselName: string;
  portName: string;
  regionId: string;
  severityStyle: StatusStyle;
  statusStyle: StatusStyle;
  ageText: string;
  exposureText: string;
  ownerName: string | null;
  score: number;
  rationale: string[];
  needsVerification: boolean;
  /** Alerts folded into this case by the dedupe rule (excluding the primary). */
  dedupedIds: string[];
  relatedOnVoyage: string[];
  hasLocalDecision: boolean;
  searchText: string;
}

function row(c: Catalog, wf: WorkflowState, g: CaseGroup): QueueRow {
  const inc = c.byId.incident.get(g.caseId)!;
  const port = c.byId.port.get(g.portId);
  const vessel = c.byId.vessel.get(g.vesselId);
  const local = wf.incidents[g.caseId];
  const ownerId = local?.ownerUserId ?? inc.ownerUserId;
  const p = g.priority;
  return {
    caseId: g.caseId,
    title: inc.title,
    vesselName: vessel?.name ?? g.vesselId,
    portName: port?.name ?? g.portId,
    regionId: port?.regionId ?? '',
    severityStyle: statusStyle('severity', p.severity),
    statusStyle: statusStyle('incident', p.status),
    ageText: `Open ${formatDuration(p.ageMinutes)}`,
    exposureText: p.exposureUsd === null ? 'Exposure unavailable' : `${formatUsd(p.exposureUsd, { compact: true })} est.`,
    ownerName: ownerId ? (c.byId.user.get(ownerId)?.displayName ?? ownerId) : null,
    score: p.score,
    rationale: p.rationale,
    needsVerification: p.needsVerification,
    dedupedIds: g.incidentIds.filter((id) => id !== g.caseId),
    relatedOnVoyage: g.relatedOnVoyage,
    hasLocalDecision: !!local,
    searchText: [g.caseId, ...g.incidentIds, inc.title, vessel?.name, port?.name, sentenceCase(g.category), g.voyageId].join(' ').toLowerCase(),
  };
}

/** Explainable case queue for a scope (`regionId` null = all regions), worst first. */
export function buildQueueRows(c: Catalog, snap: Snapshot, wf: WorkflowState, regionId: string | null): QueueRow[] {
  return buildCaseQueue(c, snap)
    .map((g) => row(c, wf, g))
    .filter((r) => !regionId || r.regionId === regionId);
}

export function filterQueueRows(rows: QueueRow[], query: string): QueueRow[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return terms.length ? rows.filter((r) => terms.every((t) => r.searchText.includes(t))) : rows;
}

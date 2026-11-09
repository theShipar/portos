import { formatDuration, formatUsd, formatUtc } from '@/core/format';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import type { Snapshot } from '@/engines/snapshot';
import { RECIPIENT_LABEL, TASK_TYPE_LABEL, type AuditEvent, type NotificationDraft, type WorkflowState } from './types';

export const PROTOTYPE_CAVEAT = 'Synthetic prototype — local demo actions on simulated data. Not a tamper-proof audit record; no message was sent and no external system confirmed anything.';

const refersTo = (refs: EntityRef[], ref: EntityRef) => refs.some((r) => r.kind === ref.kind && r.id === ref.id);

/** Audit events touching an entity, newest first. A vessel also sees events on its incidents and voyages. */
export function auditFor(c: Catalog, wf: WorkflowState, ref: EntityRef): AuditEvent[] {
  const targets: EntityRef[] = [ref];
  if (ref.kind === 'vessel') {
    for (const vo of c.voyages) if (vo.vesselId === ref.id) targets.push({ kind: 'voyage', id: vo.voyageId });
    for (const i of c.incidents) if (i.vesselId === ref.id) targets.push({ kind: 'incident', id: i.incidentId });
  }
  if (ref.kind === 'voyage') for (const i of c.incidentsByVoyage.get(ref.id) ?? []) targets.push({ kind: 'incident', id: i.incidentId });
  return wf.audit.filter((a) => targets.some((t) => refersTo(a.entityRefs, t))).reverse();
}

export function handoffSummary(c: Catalog, snap: Snapshot, wf: WorkflowState, incidentId: string): string {
  const inc = c.byId.incident.get(incidentId);
  const st = snap.incidents.get(incidentId);
  if (!inc || !st) return '';
  const local = wf.incidents[incidentId];
  const user = (id: string | null) => (id ? (c.byId.user.get(id)?.displayName ?? id) : 'Unassigned');
  const eta = snap.etas.get(inc.voyageId);
  const ex = snap.exposures.get(inc.voyageId);
  const vessel = snap.vessels.get(inc.vesselId);
  const tasks = wf.tasks.filter((t) => t.relatedIncidentId === incidentId && (t.status === 'open' || t.status === 'in_progress'));
  const drafts = wf.drafts.filter((d) => refersTo(d.relatedEntityIds, { kind: 'incident', id: incidentId }));
  const questions: string[] = [];
  if (eta?.confidence !== 'high') questions.push(`ETA confidence is ${eta?.confidence ?? 'unknown'}; berth window not confirmed.`);
  if (!st.ownerUserId) questions.push('No owner assigned.');
  if (vessel && (vessel.state === 'stale' || vessel.state === 'unavailable')) questions.push(`Vessel position is ${vessel.state}.`);
  questions.push('Root cause not confirmed by an external source.');

  const lines = [
    `Handoff · ${inc.incidentId} · ${inc.title}`,
    `Vessel ${c.byId.vessel.get(inc.vesselId)?.name ?? inc.vesselId} · voyage ${inc.voyageId}`,
    `Status: ${st.status.replace(/_/g, ' ')} · owner: ${user(st.ownerUserId)}${local?.dueAtUtc ? ` · due ${formatUtc(local.dueAtUtc)}` : ''}`,
    `Latest ETA: ${formatUtc(eta?.estimatedArrivalUtc)} (${formatDuration(eta?.etaShiftMinutes, { signed: true })} vs plan, ${eta?.confidence ?? 'unknown'} confidence, as of ${formatUtc(eta?.asOfUtc)})`,
    `Estimated exposure: ${ex?.estimatedUsd === null || ex?.estimatedUsd === undefined ? 'unavailable' : formatUsd(ex.estimatedUsd)} (estimate, not invoice)`,
    `Evidence freshness: position ${vessel?.state ?? 'unknown'}; ETA ${eta?.provenance.freshness ?? 'unknown'}`,
    `Next step: ${tasks[0] ? `${tasks[0].title} → ${user(tasks[0].assigneeUserId)}${tasks[0].dueAtUtc ? ` by ${formatUtc(tasks[0].dueAtUtc)}` : ''}` : 'none recorded'}`,
    `Open tasks: ${tasks.length ? tasks.map((t) => `${t.taskId} ${TASK_TYPE_LABEL[t.type]}`).join('; ') : 'none'}`,
    `Draft communications: ${drafts.length ? drafts.map((d) => `${d.draftId} to ${RECIPIENT_LABEL[d.recipientRole]} (${d.status}, not sent)`).join('; ') : 'none'}`,
    `Unresolved questions: ${questions.join(' ')}`,
    `As of simulation time ${formatUtc(snap.timeMs)}.`,
    PROTOTYPE_CAVEAT,
  ];
  return lines.join('\n');
}

export function exportAudit(wf: WorkflowState, exportedAtUtc: string, filter?: (a: AuditEvent) => boolean) {
  return {
    title: 'PORTOS local demo audit trail',
    caveat: PROTOTYPE_CAVEAT,
    exportedAtUtc,
    count: (filter ? wf.audit.filter(filter) : wf.audit).length,
    events: filter ? wf.audit.filter(filter) : wf.audit,
  };
}

/** Prefilled draft text from the shared read models (same ETA and exposure as the inspector). */
export function draftTemplate(c: Catalog, snap: Snapshot, incidentId: string, kind: NotificationDraft['kind']): Pick<NotificationDraft, 'kind' | 'recipientRole' | 'subject' | 'body' | 'relatedEntityIds'> | null {
  const inc = c.byId.incident.get(incidentId);
  const vo = inc ? c.byId.voyage.get(inc.voyageId) : undefined;
  if (!inc || !vo) return null;
  const vessel = c.byId.vessel.get(inc.vesselId)?.name ?? inc.vesselId;
  const port = (id: string) => c.byId.port.get(id)?.name ?? id;
  const eta = snap.etas.get(vo.voyageId);
  const shift = formatDuration(eta?.etaShiftMinutes, { signed: true });
  const refs: EntityRef[] = [
    { kind: 'incident', id: inc.incidentId },
    { kind: 'voyage', id: vo.voyageId },
    { kind: 'vessel', id: inc.vesselId },
  ];
  const footer = '\n\n— Draft prepared locally in the PORTOS synthetic prototype. Not sent.';
  if (kind === 'port_agent_eta_request') {
    return {
      kind,
      recipientRole: 'port_agent',
      subject: `${vessel} · berth window confirmation at ${port(inc.portId)}`,
      body: `Hello,\n\nCould you confirm the expected berth window for ${vessel} (voyage ${vo.voyageId}) at ${port(inc.portId)}? Our current forecast shows the vessel waiting at anchorage with an estimated berth that moves arrival at ${port(vo.destinationPortId)} by ${shift} (forecast as of ${formatUtc(eta?.asOfUtc)}, ${eta?.confidence ?? 'unknown'} confidence).\n\nPlease reply with the confirmed slot or your best estimate and its source.${footer}`,
      relatedEntityIds: [...refs, { kind: 'port', id: inc.portId }],
    };
  }
  return {
    kind,
    recipientRole: 'customer',
    subject: `Status update · ${vessel} arrival at ${port(vo.destinationPortId)}`,
    body: `Hello,\n\nA quick status update on ${vessel} (voyage ${vo.voyageId}). The vessel is waiting for a berth at ${port(inc.portId)}, and our forecast arrival at ${port(vo.destinationPortId)} is now ${formatUtc(eta?.estimatedArrivalUtc)}, ${shift} against plan. This is a forecast, not a confirmed schedule; we will update you when the berth window is confirmed.${footer}`,
    relatedEntityIds: refs,
  };
}

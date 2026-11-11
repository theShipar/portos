import { formatUtc } from '@/core/format';
import type { EntityRef } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { RECIPIENT_LABEL, type AuditActionType, type AuditEvent, type NotificationDraft, type Task, type WorkflowState } from '@/workflows/types';
import { taskRow, type TaskRow } from './incident';

export const AUDIT_ACTION_LABEL: Record<AuditActionType, string> = {
  'incident.transition': 'Status change',
  'incident.reopen': 'Reopened',
  'incident.assign': 'Assignment',
  'incident.note': 'Note',
  'incident.undo': 'Undo',
  'incident.escalate': 'Escalated',
  'history.note': 'Historical note',
  'task.create': 'Task created',
  'task.status': 'Task updated',
  'draft.create': 'Draft prepared',
  'draft.ready': 'Draft marked ready',
  'draft.discard': 'Draft discarded',
  'branch.propose': 'Option proposed',
  'branch.approve': 'Approved for simulation',
  'branch.discard': 'Branch discarded',
  'scenario.propose': 'Plan proposed (V1)',
  'scenario.accept': 'Plan accepted (V1)',
};

export interface AuditFilter {
  actorUserId: string | null;
  actionType: AuditActionType | null;
  /** Case-insensitive match against any entity ID on the event. */
  entity: string;
}

export interface AuditRow {
  auditId: string;
  actionLabel: string;
  summary: string;
  actorText: string;
  simText: string;
  wallText: string;
  notes: string | null;
  primaryRef: EntityRef | null;
  refsText: string;
}

export interface HubTaskRow extends TaskRow {
  regionId: string | null;
  incidentId: string | null;
}

export interface HubDraftRow {
  draft: NotificationDraft;
  recipientText: string;
  createdText: string;
  authorName: string;
  incidentId: string | null;
}

export function auditMatches(a: AuditEvent, f: AuditFilter): boolean {
  const q = f.entity.trim().toLowerCase();
  return (!f.actorUserId || a.actorUserId === f.actorUserId) && (!f.actionType || a.actionType === f.actionType) && (!q || a.entityRefs.some((r) => r.id.toLowerCase().includes(q)));
}

export function auditRows(c: Catalog, events: AuditEvent[]): AuditRow[] {
  return events.map((a) => ({
    auditId: a.auditId,
    actionLabel: AUDIT_ACTION_LABEL[a.actionType],
    summary: a.summary,
    actorText: `${c.byId.user.get(a.actorUserId)?.displayName ?? a.actorUserId} (${a.actorRole})`,
    simText: formatUtc(a.simulatedContextTimeUtc),
    wallText: formatUtc(a.occurredAtUtc, { seconds: true }),
    notes: a.notes ?? null,
    primaryRef: a.entityRefs.find((r) => r.kind === 'incident') ?? a.entityRefs[0] ?? null,
    refsText: a.entityRefs.map((r) => r.id).join(', '),
  }));
}

function taskRegion(c: Catalog, t: Task): string | null {
  const portId = t.portId ?? (t.relatedIncidentId ? c.byId.incident.get(t.relatedIncidentId)?.portId : null);
  return portId ? (c.byId.port.get(portId)?.regionId ?? null) : null;
}

export function hubTasks(c: Catalog, wf: WorkflowState, nowMs: number, opts: { mineUserId: string | null; regionId: string | null }): HubTaskRow[] {
  return wf.tasks
    .filter((t) => !opts.mineUserId || t.assigneeUserId === opts.mineUserId)
    .map((t) => ({ ...taskRow(c, t, nowMs), regionId: taskRegion(c, t), incidentId: t.relatedIncidentId }))
    .filter((r) => !opts.regionId || r.regionId === opts.regionId)
    .reverse();
}

export function hubDrafts(c: Catalog, wf: WorkflowState): HubDraftRow[] {
  return wf.drafts
    .map((d) => ({
      draft: d,
      recipientText: RECIPIENT_LABEL[d.recipientRole],
      createdText: formatUtc(d.createdAtUtc),
      authorName: c.byId.user.get(d.createdByUserId)?.displayName ?? d.createdByUserId,
      incidentId: d.relatedEntityIds.find((r) => r.kind === 'incident')?.id ?? null,
    }))
    .reverse();
}

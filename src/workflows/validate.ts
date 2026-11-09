import type { IncidentStatus } from '@/core/types';
import { LIFECYCLE } from './incidentMachine';
import { RESOLUTION_REASONS, TASK_TYPES, WORKFLOW_VERSION, type WorkflowState } from './types';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string';
const strOrNull = (v: unknown) => v === null || typeof v === 'string';
const isRef = (v: unknown) => isRec(v) && str(v.kind) && str(v.id);
const refs = (v: unknown) => Array.isArray(v) && v.every(isRef);

function isIncidentLocal(v: unknown): boolean {
  if (!isRec(v)) return false;
  if (!LIFECYCLE.includes(v.status as IncidentStatus) || !strOrNull(v.ownerUserId) || !strOrNull(v.dueAtUtc) || !Array.isArray(v.notes)) return false;
  if (!v.notes.every((n) => isRec(n) && str(n.noteId) && str(n.authorUserId) && str(n.simulatedAtUtc) && str(n.text))) return false;
  const r = v.resolution;
  return r === null || (isRec(r) && (RESOLUTION_REASONS as readonly unknown[]).includes(r.reason) && str(r.evidenceNote) && typeof r.simulationAck === 'boolean');
}

const isTask = (v: unknown) =>
  isRec(v) &&
  str(v.taskId) &&
  (TASK_TYPES as readonly unknown[]).includes(v.type) &&
  str(v.title) &&
  ['open', 'in_progress', 'done', 'cancelled'].includes(v.status as string) &&
  ['normal', 'high'].includes(v.priority as string) &&
  strOrNull(v.relatedIncidentId) &&
  strOrNull(v.voyageId) &&
  strOrNull(v.portId) &&
  str(v.assigneeUserId) &&
  str(v.createdByUserId) &&
  strOrNull(v.dueAtUtc) &&
  str(v.notes) &&
  str(v.createdAtUtc) &&
  str(v.updatedAtUtc);

const isDraft = (v: unknown) =>
  isRec(v) &&
  str(v.draftId) &&
  ['port_agent_eta_request', 'customer_status_update'].includes(v.kind as string) &&
  ['port_agent', 'customer', 'owner'].includes(v.recipientRole as string) &&
  str(v.subject) &&
  str(v.body) &&
  refs(v.relatedEntityIds) &&
  str(v.createdByUserId) &&
  str(v.createdAtUtc) &&
  ['draft', 'ready'].includes(v.status as string);

const isDecision = (v: unknown) =>
  isRec(v) &&
  str(v.decisionId) &&
  str(v.voyageId) &&
  strOrNull(v.incidentId) &&
  str(v.optionId) &&
  str(v.optionName) &&
  isRec(v.inputs) &&
  typeof v.inputs.extraWaitHours === 'number' &&
  (v.inputs.dailyCostUsd === null || typeof v.inputs.dailyCostUsd === 'number') &&
  typeof v.inputs.speedAssumptionKn === 'number' &&
  ['proposed', 'accepted'].includes(v.status as string) &&
  str(v.proposedByUserId) &&
  strOrNull(v.acceptedByUserId);

const isAudit = (v: unknown) =>
  isRec(v) && str(v.auditId) && str(v.actorUserId) && str(v.actorRole) && str(v.occurredAtUtc) && str(v.simulatedContextTimeUtc) && refs(v.entityRefs) && str(v.actionType) && str(v.summary) && v.source === 'local-demo';

/** Shape check plus referential rule: no duplicate IDs. Anything else is treated as corrupted storage. */
export function isWorkflowState(v: unknown): v is WorkflowState {
  if (!isRec(v) || v.version !== WORKFLOW_VERSION || typeof v.seq !== 'number' || !Number.isInteger(v.seq) || v.seq < 0) return false;
  if (!isRec(v.incidents) || !Object.values(v.incidents).every(isIncidentLocal)) return false;
  if (!Array.isArray(v.tasks) || !v.tasks.every(isTask)) return false;
  if (!Array.isArray(v.drafts) || !v.drafts.every(isDraft)) return false;
  if (!Array.isArray(v.decisions) || !v.decisions.every(isDecision)) return false;
  if (!Array.isArray(v.audit) || !v.audit.every(isAudit)) return false;
  const ids = [...v.tasks.map((t) => (t as Rec).taskId), ...v.drafts.map((d) => (d as Rec).draftId), ...v.decisions.map((d) => (d as Rec).decisionId), ...v.audit.map((a) => (a as Rec).auditId)];
  return new Set(ids).size === ids.length;
}

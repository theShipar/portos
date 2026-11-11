import { CASE_STAGES, SEVERITY_ORDER, STAGE_FROM_FIXTURE } from '@/core/caseStage';
import type { CaseStage, IncidentStatus, Severity } from '@/core/types';
import { RESOLUTION_REASONS, TASK_TYPES, WORKFLOW_VERSION, type DecisionBranch, type IncidentLocal, type WorkflowState } from './types';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string';
const strOrNull = (v: unknown) => v === null || typeof v === 'string';
const isRef = (v: unknown) => isRec(v) && str(v.kind) && str(v.id);
const refs = (v: unknown) => Array.isArray(v) && v.every(isRef);

const V1_STATUSES = Object.keys(STAGE_FROM_FIXTURE) as IncidentStatus[];

function isIncidentLocal(v: unknown, version: 1 | 2 = 2): boolean {
  if (!isRec(v)) return false;
  const statusOk = version === 1 ? V1_STATUSES.includes(v.status as IncidentStatus) : CASE_STAGES.includes(v.status as CaseStage) && v.status !== 'detected';
  if (version === 2 && !(v.severity === null || SEVERITY_ORDER.includes(v.severity as Severity))) return false;
  if (!statusOk || !strOrNull(v.ownerUserId) || !strOrNull(v.dueAtUtc) || !Array.isArray(v.notes)) return false;
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

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || num(v);
const isOutcome = (v: unknown) =>
  v === null ||
  (isRec(v) &&
    isRec(v.baseline) &&
    numOrNull(v.baseline.etaDeltaHours) &&
    numOrNull(v.baseline.exposureUsd) &&
    isRec(v.branch) &&
    numOrNull(v.branch.etaDeltaHours) &&
    numOrNull(v.branch.exposureUsd) &&
    ['high', 'medium', 'low', 'unknown'].includes(v.confidence as string) &&
    str(v.formula));

const isBranch = (v: unknown) =>
  isRec(v) &&
  str(v.branchId) &&
  str(v.voyageId) &&
  strOrNull(v.incidentId) &&
  str(v.optionId) &&
  str(v.optionName) &&
  isRec(v.inputs) &&
  num(v.inputs.extraWaitHours) &&
  numOrNull(v.inputs.dailyCostUsd) &&
  num(v.inputs.speedAssumptionKn) &&
  str(v.forkedAtUtc) &&
  isOutcome(v.outcome) &&
  ['proposed', 'approvedForSimulation', 'discarded'].includes(v.status as string) &&
  str(v.proposedByUserId) &&
  strOrNull(v.approvedByUserId);

const uniqueIds = (ids: unknown[]) => new Set(ids).size === ids.length;

/** Shape check plus referential rule: no duplicate IDs. Anything else is treated as corrupted storage. */
export function isWorkflowState(v: unknown): v is WorkflowState {
  if (!isRec(v) || v.version !== WORKFLOW_VERSION || typeof v.seq !== 'number' || !Number.isInteger(v.seq) || v.seq < 0) return false;
  if (!isRec(v.incidents) || !Object.values(v.incidents).every((i) => isIncidentLocal(i))) return false;
  if (!Array.isArray(v.tasks) || !v.tasks.every(isTask)) return false;
  if (!Array.isArray(v.drafts) || !v.drafts.every(isDraft)) return false;
  if (!Array.isArray(v.branches) || !v.branches.every(isBranch)) return false;
  if (!Array.isArray(v.audit) || !v.audit.every(isAudit)) return false;
  return uniqueIds([...v.tasks.map((t) => (t as Rec).taskId), ...v.drafts.map((d) => (d as Rec).draftId), ...v.branches.map((b) => (b as Rec).branchId), ...v.audit.map((a) => (a as Rec).auditId)]);
}

/** Version 1 storage (`portos:workflow:v1`): fixture-vocabulary statuses and `decisions`. */
function isWorkflowStateV1(v: unknown): v is Rec & { seq: number; incidents: Rec; tasks: unknown[]; drafts: unknown[]; decisions: Rec[]; audit: unknown[] } {
  if (!isRec(v) || v.version !== 1 || typeof v.seq !== 'number' || !Number.isInteger(v.seq) || v.seq < 0) return false;
  if (!isRec(v.incidents) || !Object.values(v.incidents).every((i) => isIncidentLocal(i, 1))) return false;
  if (!Array.isArray(v.tasks) || !v.tasks.every(isTask)) return false;
  if (!Array.isArray(v.drafts) || !v.drafts.every(isDraft)) return false;
  if (!Array.isArray(v.decisions) || !v.decisions.every(isDecision)) return false;
  if (!Array.isArray(v.audit) || !v.audit.every(isAudit)) return false;
  return uniqueIds([...v.tasks.map((t) => (t as Rec).taskId), ...v.drafts.map((d) => (d as Rec).draftId), ...v.decisions.map((d) => d.decisionId), ...v.audit.map((a) => (a as Rec).auditId)]);
}

/**
 * V1 → V2: statuses map through `STAGE_FROM_FIXTURE`, decisions become branches (accepted → approved for
 * simulation, outcome not recorded in V1 so it stays null), IDs, tasks, drafts and audit history are kept.
 * Returns null when the V1 data is not valid V1.
 */
export function migrateWorkflowV1(v: unknown): WorkflowState | null {
  if (!isWorkflowStateV1(v)) return null;
  const incidents: Record<string, IncidentLocal> = {};
  for (const [id, raw] of Object.entries(v.incidents)) {
    const i = raw as Omit<IncidentLocal, 'status' | 'severity'> & { status: IncidentStatus };
    incidents[id] = { ...i, status: STAGE_FROM_FIXTURE[i.status], severity: null };
  }
  const branches: DecisionBranch[] = v.decisions.map((d) => ({
    branchId: d.decisionId as string,
    incidentId: d.incidentId as string | null,
    voyageId: d.voyageId as string,
    optionId: d.optionId as string,
    optionName: d.optionName as string,
    inputs: { ...(d.inputs as DecisionBranch['inputs']) },
    forkedAtUtc: (d.createdAtUtc as string | undefined) ?? (d.updatedAtUtc as string),
    outcome: null,
    status: d.status === 'accepted' ? 'approvedForSimulation' : 'proposed',
    proposedByUserId: d.proposedByUserId as string,
    approvedByUserId: d.acceptedByUserId as string | null,
    createdAtUtc: d.createdAtUtc as string,
    updatedAtUtc: d.updatedAtUtc as string,
  }));
  const migrated = { version: WORKFLOW_VERSION, seq: v.seq, incidents, tasks: v.tasks, drafts: v.drafts, branches, audit: v.audit };
  return isWorkflowState(migrated) ? migrated : null;
}

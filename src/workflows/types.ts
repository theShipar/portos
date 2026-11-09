import type { EntityRef, IncidentStatus, IsoUtc, Role } from '@/core/types';

export const WORKFLOW_VERSION = 1;

export interface IncidentNote {
  noteId: string;
  authorUserId: string;
  simulatedAtUtc: IsoUtc;
  text: string;
}

export interface IncidentResolution {
  reason: ResolutionReason;
  evidenceNote: string;
  /** Explicit "Resolved in simulation" acknowledgement when no evidence note is given. */
  simulationAck: boolean;
}

export const RESOLUTION_REASONS = ['berth_confirmed', 'eta_recovered', 'customer_informed', 'false_alarm', 'duplicate', 'other'] as const;
export type ResolutionReason = (typeof RESOLUTION_REASONS)[number];
export const RESOLUTION_LABEL: Record<ResolutionReason, string> = {
  berth_confirmed: 'Berth slot confirmed',
  eta_recovered: 'ETA recovered within tolerance',
  customer_informed: 'Customer informed, delay accepted',
  false_alarm: 'False alarm (data issue)',
  duplicate: 'Duplicate of another case',
  other: 'Other (explain in note)',
};

/** Local demo decisions for one incident; the fixture record is never mutated. */
export interface IncidentLocal {
  status: IncidentStatus;
  ownerUserId: string | null;
  dueAtUtc: IsoUtc | null;
  notes: IncidentNote[];
  resolution: IncidentResolution | null;
}

export const TASK_TYPES = ['port_agent_eta_followup', 'voyage_monitoring', 'evidence_request', 'customer_update', 'scenario_followup'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  port_agent_eta_followup: 'Port-agent ETA follow-up',
  voyage_monitoring: 'Voyage monitoring',
  evidence_request: 'Request additional evidence',
  customer_update: 'Customer status update',
  scenario_followup: 'Scenario follow-up',
};

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'normal' | 'high';

export interface Task {
  taskId: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  relatedIncidentId: string | null;
  voyageId: string | null;
  portId: string | null;
  assigneeUserId: string;
  createdByUserId: string;
  dueAtUtc: IsoUtc | null;
  notes: string;
  createdAtUtc: IsoUtc;
  updatedAtUtc: IsoUtc;
  source: 'local-demo';
}

export type RecipientRole = 'port_agent' | 'customer' | 'owner';
export const RECIPIENT_LABEL: Record<RecipientRole, string> = { port_agent: 'Port agent (fictional)', customer: 'Customer (fictional)', owner: 'Vessel owner (fictional)' };

export interface NotificationDraft {
  draftId: string;
  kind: 'port_agent_eta_request' | 'customer_status_update';
  recipientRole: RecipientRole;
  subject: string;
  body: string;
  relatedEntityIds: EntityRef[];
  createdByUserId: string;
  createdAtUtc: IsoUtc;
  status: 'draft' | 'ready';
}

export interface ScenarioInputs {
  extraWaitHours: number;
  dailyCostUsd: number | null;
  speedAssumptionKn: number;
}

export interface ScenarioDecision {
  decisionId: string;
  voyageId: string;
  incidentId: string | null;
  optionId: string;
  optionName: string;
  inputs: ScenarioInputs;
  status: 'proposed' | 'accepted';
  proposedByUserId: string;
  acceptedByUserId: string | null;
  createdAtUtc: IsoUtc;
  updatedAtUtc: IsoUtc;
}

export type AuditActionType =
  | 'incident.transition'
  | 'incident.reopen'
  | 'incident.assign'
  | 'incident.note'
  | 'incident.undo'
  | 'task.create'
  | 'task.status'
  | 'draft.create'
  | 'draft.ready'
  | 'draft.discard'
  | 'scenario.propose'
  | 'scenario.accept';

export interface AuditEvent {
  auditId: string;
  actorUserId: string;
  actorRole: Role;
  /** Wall-clock time of the click (browser clock). */
  occurredAtUtc: IsoUtc;
  /** Simulation time the decision was taken at. */
  simulatedContextTimeUtc: IsoUtc;
  entityRefs: EntityRef[];
  actionType: AuditActionType;
  summary: string;
  previousState?: string;
  nextState?: string;
  notes?: string;
  source: 'local-demo';
}

export interface WorkflowState {
  version: typeof WORKFLOW_VERSION;
  seq: number;
  incidents: Record<string, IncidentLocal>;
  tasks: Task[];
  drafts: NotificationDraft[];
  decisions: ScenarioDecision[];
  audit: AuditEvent[];
}

export const emptyWorkflow = (): WorkflowState => ({ version: WORKFLOW_VERSION, seq: 0, incidents: {}, tasks: [], drafts: [], decisions: [], audit: [] });

/**
 * V2 case lifecycle (D-037):
 *
 *   detected → untriaged → investigating → optionProposed → approvedForSimulation → monitoring → resolved → closed
 *
 * - `detected` is the rule firing before a case exists; fixture cases open as `untriaged`.
 * - Triage (untriaged → investigating) needs `action.incident.acknowledge`; it does not claim the problem is solved.
 * - Option proposed and approved for simulation are reached only through decision branches (propose / approve);
 *   they are not offered as buttons. Option proposed, approved and monitoring may step back to investigating.
 * - Monitoring (approved → monitoring) needs `action.incident.transition`.
 * - Resolve needs `action.incident.resolve` (manager), a reason, and either an evidence note or an explicit
 *   "Resolved in simulation" acknowledgement. Cases that need verification (stale inputs) require the note.
 * - Close (resolved → closed) archives a reviewed case and needs `action.incident.resolve`.
 * - Reopen is a separate, audited action from resolved or closed back to investigating with a reason.
 * - Escalation raises severity with a reason when facts change; it never lowers it.
 * - Assigning an owner needs `action.incident.assign`; the assignee must exist and not be a view-only role.
 *
 * Role checks are UI guards for the demo identity, not authentication.
 */
import { CASE_STAGES, STAGE_LABEL, isClosedStage, severityRank } from '@/core/caseStage';
import type { CaseStage, Role, Severity, User } from '@/core/types';
import type { IncidentResolution } from './types';

export type TransitionId = 'triage' | 'propose' | 'approve' | 'monitor' | 'investigate' | 'resolve' | 'close' | 'reopen';

export interface TransitionRule {
  id: TransitionId;
  from: CaseStage[];
  to: CaseStage;
  permission: string;
  label: string;
  /** Lower-case verb phrase for permission messages ("triage cases"). */
  verb: string;
  /** Reached only through a decision branch command, never offered as a button. */
  viaBranch?: boolean;
}

const ACTIVE: CaseStage[] = ['untriaged', 'investigating', 'optionProposed', 'approvedForSimulation', 'monitoring'];

export const TRANSITIONS: Record<TransitionId, TransitionRule> = {
  triage: { id: 'triage', from: ['untriaged'], to: 'investigating', permission: 'action.incident.acknowledge', label: 'Triage · investigate', verb: 'triage cases' },
  propose: { id: 'propose', from: ['untriaged', 'investigating', 'optionProposed'], to: 'optionProposed', permission: 'action.scenario.propose', label: 'Option proposed', verb: 'propose options', viaBranch: true },
  approve: { id: 'approve', from: ['optionProposed', 'approvedForSimulation'], to: 'approvedForSimulation', permission: 'action.scenario.accept', label: 'Approve for simulation', verb: 'approve options for simulation', viaBranch: true },
  monitor: { id: 'monitor', from: ['approvedForSimulation'], to: 'monitoring', permission: 'action.incident.transition', label: 'Move to monitoring', verb: 'change case status' },
  investigate: {
    id: 'investigate',
    from: ['optionProposed', 'approvedForSimulation', 'monitoring'],
    to: 'investigating',
    permission: 'action.incident.transition',
    label: 'Back to investigating',
    verb: 'change case status',
  },
  resolve: { id: 'resolve', from: ACTIVE, to: 'resolved', permission: 'action.incident.resolve', label: 'Resolve', verb: 'resolve cases' },
  close: { id: 'close', from: ['resolved'], to: 'closed', permission: 'action.incident.resolve', label: 'Close case', verb: 'close cases' },
  reopen: { id: 'reopen', from: ['resolved', 'closed'], to: 'investigating', permission: 'action.incident.transition', label: 'Reopen', verb: 'reopen cases' },
};

/** Stages shown on the case stepper (detected precedes the case and is not a step). */
export const LIFECYCLE: CaseStage[] = CASE_STAGES.filter((s) => s !== 'detected');

export const PERMISSION = {
  note: 'action.incident.note',
  assign: 'action.incident.assign',
  task: 'action.task.create',
  propose: 'action.scenario.propose',
  accept: 'action.scenario.accept',
} as const;

export type Check = { ok: true } | { ok: false; reason: string };

const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', analyst: 'Analyst', dispatcher: 'Dispatcher', manager: 'Manager' };

export function permissionCheck(user: User | null, permission: string, verb: string): Check {
  if (!user) return { ok: false, reason: 'No demo identity selected.' };
  if (user.permissionFlags.includes(permission)) return { ok: true };
  return { ok: false, reason: `${ROLE_LABEL[user.role]} role cannot ${verb}. Switch the demo identity to a role that can.` };
}

/** Transitions offered as buttons from a stage, in lifecycle order (resolve last). */
export function transitionsFrom(status: CaseStage): TransitionRule[] {
  const order: TransitionId[] = ['triage', 'monitor', 'investigate', 'close', 'reopen', 'resolve'];
  return order.map((id) => TRANSITIONS[id]).filter((r) => r.from.includes(status));
}

export interface TransitionInput {
  note?: string;
  resolution?: IncidentResolution;
  needsVerification?: boolean;
}

export function checkTransition(status: CaseStage, id: TransitionId, user: User | null, input: TransitionInput = {}): Check {
  const rule = TRANSITIONS[id];
  if (!rule.from.includes(status)) return { ok: false, reason: `Cannot ${rule.label.toLowerCase()} a case that is ${STAGE_LABEL[status].toLowerCase()}.` };
  const perm = permissionCheck(user, rule.permission, rule.verb);
  if (!perm.ok) return perm;
  if (id === 'reopen' && !input.note?.trim()) return { ok: false, reason: 'Give a reason for reopening.' };
  if (id === 'resolve') {
    const r = input.resolution;
    if (!r) return { ok: false, reason: 'Choose a resolution reason.' };
    const evidence = r.evidenceNote.trim();
    if (input.needsVerification && !evidence) return { ok: false, reason: 'Inputs are stale: add a note naming the source or assumption you verified.' };
    if (!evidence && !r.simulationAck) return { ok: false, reason: 'Add the evidence that supports resolving, or confirm "Resolved in simulation".' };
    if (r.reason === 'other' && !evidence) return { ok: false, reason: 'Explain the "Other" reason in the evidence note.' };
  }
  return { ok: true };
}

export function checkAssignee(users: ReadonlyMap<string, User>, assigneeUserId: string | null): Check {
  if (assigneeUserId === null) return { ok: true };
  const u = users.get(assigneeUserId);
  if (!u) return { ok: false, reason: `Unknown assignee ${assigneeUserId}.` };
  if (u.role === 'viewer') return { ok: false, reason: `${u.displayName} has a view-only role and cannot own cases or tasks.` };
  return { ok: true };
}

/** Due times must be valid UTC and after the current simulation time. */
export function checkDue(dueAtUtc: string | null | undefined, simNowMs: number): Check {
  if (!dueAtUtc) return { ok: true };
  const ms = Date.parse(dueAtUtc);
  if (!Number.isFinite(ms)) return { ok: false, reason: 'Enter the due time as a valid UTC date and time.' };
  if (ms <= simNowMs) return { ok: false, reason: 'The due time has already passed at the current simulation time.' };
  return { ok: true };
}

/** Escalation only raises severity, needs a reason, and is not offered on closed cases. */
export function checkEscalation(status: CaseStage, current: Severity, next: Severity, user: User | null, reason: string | undefined): Check {
  if (isClosedStage(status)) return { ok: false, reason: 'Reopen the case before escalating it.' };
  if (severityRank(next) <= severityRank(current)) return { ok: false, reason: `Escalation raises severity; the case is already ${current}.` };
  const perm = permissionCheck(user, 'action.incident.transition', 'escalate cases');
  if (!perm.ok) return perm;
  if (!reason?.trim()) return { ok: false, reason: 'Say which facts changed to justify the escalation.' };
  return { ok: true };
}


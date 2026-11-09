/**
 * Incident lifecycle (DECISIONS: conflict defaults):
 *
 *   open → acknowledged → investigating → mitigation_planned → monitoring → resolved
 *
 * - Acknowledge needs `action.incident.acknowledge`; it does not claim the problem is solved.
 * - Investigating / mitigation planned / monitoring need `action.incident.transition`. Mitigation planned and
 *   monitoring may step back to investigating.
 * - Resolve needs `action.incident.resolve` (manager), a reason, and either an evidence note or an explicit
 *   "Resolved in simulation" acknowledgement. Cases that need verification (stale inputs) require the note.
 * - Reopen is a separate, audited action from resolved back to investigating with a reason
 *   (`action.incident.transition`).
 * - Assigning an owner needs `action.incident.assign`; the assignee must exist and not be a view-only role.
 *
 * Role checks are UI guards for the demo identity, not authentication.
 */
import type { IncidentStatus, Role, User } from '@/core/types';
import type { IncidentResolution } from './types';

export type TransitionId = 'acknowledge' | 'investigate' | 'plan' | 'monitor' | 'resolve' | 'reopen';

export interface TransitionRule {
  id: TransitionId;
  from: IncidentStatus[];
  to: IncidentStatus;
  permission: string;
  label: string;
  /** Lower-case verb phrase for permission messages ("acknowledge incidents"). */
  verb: string;
}

export const TRANSITIONS: Record<TransitionId, TransitionRule> = {
  acknowledge: { id: 'acknowledge', from: ['open'], to: 'acknowledged', permission: 'action.incident.acknowledge', label: 'Acknowledge', verb: 'acknowledge incidents' },
  investigate: {
    id: 'investigate',
    from: ['acknowledged', 'mitigation_planned', 'monitoring'],
    to: 'investigating',
    permission: 'action.incident.transition',
    label: 'Start investigating',
    verb: 'change case status',
  },
  plan: { id: 'plan', from: ['investigating'], to: 'mitigation_planned', permission: 'action.incident.transition', label: 'Mitigation planned', verb: 'change case status' },
  monitor: { id: 'monitor', from: ['mitigation_planned'], to: 'monitoring', permission: 'action.incident.transition', label: 'Move to monitoring', verb: 'change case status' },
  resolve: {
    id: 'resolve',
    from: ['open', 'acknowledged', 'investigating', 'mitigation_planned', 'monitoring'],
    to: 'resolved',
    permission: 'action.incident.resolve',
    label: 'Resolve',
    verb: 'resolve cases',
  },
  reopen: { id: 'reopen', from: ['resolved'], to: 'investigating', permission: 'action.incident.transition', label: 'Reopen', verb: 'reopen cases' },
};

export const LIFECYCLE: IncidentStatus[] = ['open', 'acknowledged', 'investigating', 'mitigation_planned', 'monitoring', 'resolved'];

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

/** Transitions offered from a status, in lifecycle order (resolve last). */
export function transitionsFrom(status: IncidentStatus): TransitionRule[] {
  const order: TransitionId[] = ['acknowledge', 'investigate', 'plan', 'monitor', 'reopen', 'resolve'];
  return order.map((id) => TRANSITIONS[id]).filter((r) => r.from.includes(status));
}

export interface TransitionInput {
  note?: string;
  resolution?: IncidentResolution;
  needsVerification?: boolean;
}

export function checkTransition(status: IncidentStatus, id: TransitionId, user: User | null, input: TransitionInput = {}): Check {
  const rule = TRANSITIONS[id];
  if (!rule.from.includes(status)) return { ok: false, reason: `Cannot ${rule.label.toLowerCase()} a case that is ${status.replace(/_/g, ' ')}.` };
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

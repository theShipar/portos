import type { EntityRef, IncidentStatus, User } from '@/core/types';
import { checkAssignee, checkDue, checkTransition, permissionCheck, PERMISSION, TRANSITIONS, type TransitionId } from './incidentMachine';
import {
  RECIPIENT_LABEL,
  RESOLUTION_LABEL,
  TASK_TYPE_LABEL,
  type AuditActionType,
  type AuditEvent,
  type IncidentLocal,
  type IncidentResolution,
  type NotificationDraft,
  type ScenarioInputs,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
  type WorkflowState,
} from './types';

export interface WorkflowContext {
  actor: User | null;
  users: ReadonlyMap<string, User>;
  simNowMs: number;
  simNowIso: string;
  wallNowIso: string;
  /** Fixture status/owner at "Now" (before local decisions). */
  baseIncident: (incidentId: string) => { status: IncidentStatus; ownerUserId: string | null; visible: boolean } | null;
  incidentRefs: (incidentId: string) => EntityRef[];
  needsVerification: (incidentId: string) => boolean;
}

export type WorkflowCommand =
  | { type: 'incident.transition'; incidentId: string; transition: TransitionId; note?: string; resolution?: IncidentResolution }
  | { type: 'incident.assign'; incidentId: string; assigneeUserId: string | null; dueAtUtc?: string | null; note?: string }
  | { type: 'incident.note'; incidentId: string; text: string }
  | { type: 'incident.undo'; incidentId: string; auditId: string }
  | {
      type: 'task.create';
      task: {
        type: TaskType;
        title?: string;
        relatedIncidentId?: string | null;
        voyageId?: string | null;
        portId?: string | null;
        assigneeUserId: string;
        dueAtUtc?: string | null;
        notes?: string;
        priority?: TaskPriority;
      };
    }
  | { type: 'task.status'; taskId: string; status: TaskStatus }
  | { type: 'draft.create'; draft: Pick<NotificationDraft, 'kind' | 'recipientRole' | 'subject' | 'body' | 'relatedEntityIds'> }
  | { type: 'draft.ready'; draftId: string }
  | { type: 'draft.discard'; draftId: string }
  | {
      type: 'scenario.propose';
      voyageId: string;
      incidentId: string | null;
      optionId: string;
      optionName: string;
      inputs: ScenarioInputs;
      followUpAssigneeUserId: string;
      portId: string | null;
    }
  | { type: 'scenario.accept'; decisionId: string };

export type WorkflowResult =
  | { ok: true; state: WorkflowState; audit: AuditEvent; message: string; undoable: boolean }
  | { ok: false; error: string };

const fail = (error: string): WorkflowResult => ({ ok: false, error });
const pad = (n: number) => String(n).padStart(4, '0');

/** Draft kinds and the recipient roles they may be addressed to. */
export const DRAFT_RECIPIENTS: Record<NotificationDraft['kind'], NotificationDraft['recipientRole'][]> = {
  port_agent_eta_request: ['port_agent'],
  customer_status_update: ['customer', 'owner'],
};

export const MAX_NOTE_LENGTH = 1000;

const STATE_CHANGING = new Set<AuditActionType>(['incident.transition', 'incident.reopen', 'incident.assign', 'incident.undo']);

function userLabel(users: ReadonlyMap<string, User>, id: string | null): string {
  if (!id) return 'Unassigned';
  return users.get(id)?.displayName ?? id;
}

function currentIncident(s: WorkflowState, ctx: WorkflowContext, id: string): IncidentLocal | null {
  const local = s.incidents[id];
  if (local) return local;
  const base = ctx.baseIncident(id);
  if (!base) return null;
  return { status: base.status, ownerUserId: base.ownerUserId, dueAtUtc: null, notes: [], resolution: null };
}

/**
 * Pure workflow reducer. Every accepted command appends exactly one audit event; past audit events are never
 * edited. Rejected commands return a user-facing reason and leave the state untouched.
 */
export function reduceWorkflow(s: WorkflowState, cmd: WorkflowCommand, ctx: WorkflowContext): WorkflowResult {
  const actor = ctx.actor;
  if (!actor) return fail('No demo identity selected.');
  let seq = s.seq;
  const nextId = (prefix: string) => `${prefix}-${pad(++seq)}`;

  const commit = (
    patch: Partial<WorkflowState>,
    a: { actionType: AuditActionType; entityRefs: EntityRef[]; summary: string; previousState?: string; nextState?: string; notes?: string },
    message: string,
    undoable = false,
  ): WorkflowResult => {
    const audit: AuditEvent = {
      auditId: nextId('LOC-AUD'),
      actorUserId: actor.userId,
      actorRole: actor.role,
      occurredAtUtc: ctx.wallNowIso,
      simulatedContextTimeUtc: ctx.simNowIso,
      source: 'local-demo',
      ...a,
    };
    return { ok: true, state: { ...s, ...patch, seq, audit: [...s.audit, audit] }, audit, message, undoable };
  };

  const withIncident = (id: string, next: IncidentLocal) => ({ incidents: { ...s.incidents, [id]: next } });

  switch (cmd.type) {
    case 'incident.transition': {
      const cur = currentIncident(s, ctx, cmd.incidentId);
      if (!cur || !ctx.baseIncident(cmd.incidentId)?.visible) return fail(`Incident ${cmd.incidentId} is not open at the current simulation time.`);
      const needsVerification = ctx.needsVerification(cmd.incidentId);
      const check = checkTransition(cur.status, cmd.transition, actor, { note: cmd.note, resolution: cmd.resolution, needsVerification });
      if (!check.ok) return fail(check.reason);
      const rule = TRANSITIONS[cmd.transition];
      const note = cmd.note?.trim() || undefined;
      if (note && note.length > MAX_NOTE_LENGTH) return fail(`Keep the note under ${MAX_NOTE_LENGTH} characters.`);
      const resolution = cmd.transition === 'resolve' ? { ...cmd.resolution!, evidenceNote: cmd.resolution!.evidenceNote.trim() } : cmd.transition === 'reopen' ? null : cur.resolution;
      const next: IncidentLocal = { ...cur, status: rule.to, resolution };
      const notes =
        resolution && cmd.transition === 'resolve'
          ? [RESOLUTION_LABEL[resolution.reason], resolution.evidenceNote || 'Resolved in simulation (no external confirmation).'].join(' · ')
          : note;
      return commit(
        withIncident(cmd.incidentId, next),
        {
          actionType: cmd.transition === 'reopen' ? 'incident.reopen' : 'incident.transition',
          entityRefs: ctx.incidentRefs(cmd.incidentId),
          summary: cmd.transition === 'reopen' ? `Reopened ${cmd.incidentId}` : `${rule.label} ${cmd.incidentId}`,
          previousState: cur.status,
          nextState: rule.to,
          notes,
        },
        cmd.transition === 'reopen' ? `${cmd.incidentId} reopened and back to investigating.` : `${cmd.incidentId} is now ${rule.to.replace(/_/g, ' ')}.`,
        cmd.transition !== 'resolve' && cmd.transition !== 'reopen',
      );
    }

    case 'incident.assign': {
      const cur = currentIncident(s, ctx, cmd.incidentId);
      if (!cur || !ctx.baseIncident(cmd.incidentId)?.visible) return fail(`Incident ${cmd.incidentId} is not open at the current simulation time.`);
      if (cur.status === 'resolved') return fail('Reopen the case before changing its owner.');
      const perm = permissionCheck(actor, PERMISSION.assign, 'assign cases');
      if (!perm.ok) return fail(perm.reason);
      const who = checkAssignee(ctx.users, cmd.assigneeUserId);
      if (!who.ok) return fail(who.reason);
      const due = checkDue(cmd.dueAtUtc, ctx.simNowMs);
      if (!due.ok) return fail(due.reason);
      const dueAtUtc = cmd.dueAtUtc === undefined ? cur.dueAtUtc : cmd.dueAtUtc;
      if (cmd.assigneeUserId === cur.ownerUserId && dueAtUtc === cur.dueAtUtc) return fail(`${userLabel(ctx.users, cur.ownerUserId)} already owns this case with that due time.`);
      const next: IncidentLocal = { ...cur, ownerUserId: cmd.assigneeUserId, dueAtUtc };
      return commit(
        withIncident(cmd.incidentId, next),
        {
          actionType: 'incident.assign',
          entityRefs: ctx.incidentRefs(cmd.incidentId),
          summary: cmd.assigneeUserId ? `Assigned ${cmd.incidentId} to ${userLabel(ctx.users, cmd.assigneeUserId)}` : `Unassigned ${cmd.incidentId}`,
          previousState: cur.ownerUserId ?? 'unassigned',
          nextState: cmd.assigneeUserId ?? 'unassigned',
          notes: [dueAtUtc ? `Due ${dueAtUtc}` : null, cmd.note?.trim() || null].filter(Boolean).join(' · ') || undefined,
        },
        cmd.assigneeUserId ? `${cmd.incidentId} assigned to ${userLabel(ctx.users, cmd.assigneeUserId)}.` : `${cmd.incidentId} is unassigned.`,
        true,
      );
    }

    case 'incident.note': {
      const cur = currentIncident(s, ctx, cmd.incidentId);
      if (!cur || !ctx.baseIncident(cmd.incidentId)?.visible) return fail(`Incident ${cmd.incidentId} is not open at the current simulation time.`);
      const perm = permissionCheck(actor, PERMISSION.note, 'add case notes');
      if (!perm.ok) return fail(perm.reason);
      const text = cmd.text.trim();
      if (!text) return fail('Write a note before saving.');
      if (text.length > MAX_NOTE_LENGTH) return fail(`Keep the note under ${MAX_NOTE_LENGTH} characters.`);
      const noteId = nextId('LOC-NOTE');
      const next: IncidentLocal = { ...cur, notes: [...cur.notes, { noteId, authorUserId: actor.userId, simulatedAtUtc: ctx.simNowIso, text }] };
      return commit(withIncident(cmd.incidentId, next), { actionType: 'incident.note', entityRefs: ctx.incidentRefs(cmd.incidentId), summary: `Note on ${cmd.incidentId}`, notes: text }, 'Note saved locally.');
    }

    case 'incident.undo': {
      const target = s.audit.find((a) => a.auditId === cmd.auditId);
      if (!target || (target.actionType !== 'incident.transition' && target.actionType !== 'incident.assign')) return fail('That action cannot be undone.');
      const latest = [...s.audit].reverse().find((a) => STATE_CHANGING.has(a.actionType) && a.entityRefs.some((r) => r.kind === 'incident' && r.id === cmd.incidentId));
      if (latest?.auditId !== target.auditId) return fail('A later change was made to this case, so this action can no longer be undone.');
      const cur = currentIncident(s, ctx, cmd.incidentId);
      if (!cur || target.previousState === undefined) return fail('That action cannot be undone.');
      const isAssign = target.actionType === 'incident.assign';
      if (!isAssign && target.nextState === 'resolved') return fail('Resolved cases are reopened, not undone.');
      const prevOwner = target.previousState === 'unassigned' ? null : target.previousState;
      const next: IncidentLocal = isAssign ? { ...cur, ownerUserId: prevOwner } : { ...cur, status: target.previousState as IncidentStatus };
      return commit(
        withIncident(cmd.incidentId, next),
        {
          actionType: 'incident.undo',
          entityRefs: target.entityRefs,
          summary: `Undid "${target.summary}"`,
          previousState: target.nextState,
          nextState: target.previousState,
          notes: `Reverts ${target.auditId}`,
        },
        `Undone: ${target.summary}.`,
      );
    }

    case 'task.create': {
      const perm = permissionCheck(actor, PERMISSION.task, 'create tasks');
      if (!perm.ok) return fail(perm.reason);
      const t = cmd.task;
      if (!t.assigneeUserId) return fail('Choose who the task is assigned to.');
      const who = checkAssignee(ctx.users, t.assigneeUserId);
      if (!who.ok) return fail(who.reason);
      const due = checkDue(t.dueAtUtc, ctx.simNowMs);
      if (!due.ok) return fail(due.reason);
      const notes = (t.notes ?? '').trim();
      if (notes.length > MAX_NOTE_LENGTH) return fail(`Keep the notes under ${MAX_NOTE_LENGTH} characters.`);
      const duplicate = s.tasks.find((x) => x.type === t.type && x.relatedIncidentId === (t.relatedIncidentId ?? null) && x.voyageId === (t.voyageId ?? null) && (x.status === 'open' || x.status === 'in_progress'));
      if (duplicate) return fail(`An open "${TASK_TYPE_LABEL[t.type]}" task (${duplicate.taskId}) already exists for this case.`);
      const task: Task = {
        taskId: nextId('LOC-TSK'),
        type: t.type,
        title: t.title?.trim() || TASK_TYPE_LABEL[t.type],
        status: 'open',
        priority: t.priority ?? 'normal',
        relatedIncidentId: t.relatedIncidentId ?? null,
        voyageId: t.voyageId ?? null,
        portId: t.portId ?? null,
        assigneeUserId: t.assigneeUserId,
        createdByUserId: actor.userId,
        dueAtUtc: t.dueAtUtc ?? null,
        notes,
        createdAtUtc: ctx.simNowIso,
        updatedAtUtc: ctx.simNowIso,
        source: 'local-demo',
      };
      return commit(
        { tasks: [...s.tasks, task] },
        { actionType: 'task.create', entityRefs: taskRefs(task, ctx), summary: `Created task ${task.taskId}: ${task.title}`, nextState: 'open', notes: `Assigned to ${userLabel(ctx.users, task.assigneeUserId)}${task.dueAtUtc ? ` · due ${task.dueAtUtc}` : ''}` },
        `Task ${task.taskId} created for ${userLabel(ctx.users, task.assigneeUserId)}.`,
      );
    }

    case 'task.status': {
      const task = s.tasks.find((t) => t.taskId === cmd.taskId);
      if (!task) return fail(`Task ${cmd.taskId} no longer exists.`);
      const perm = permissionCheck(actor, PERMISSION.task, 'update tasks');
      if (!perm.ok) return fail(perm.reason);
      const allowed: Record<TaskStatus, TaskStatus[]> = { open: ['in_progress', 'done', 'cancelled'], in_progress: ['done', 'cancelled', 'open'], done: ['open'], cancelled: ['open'] };
      if (!allowed[task.status].includes(cmd.status)) return fail(`A ${task.status.replace('_', ' ')} task cannot move to ${cmd.status.replace('_', ' ')}.`);
      const next: Task = { ...task, status: cmd.status, updatedAtUtc: ctx.simNowIso };
      return commit(
        { tasks: s.tasks.map((t) => (t.taskId === task.taskId ? next : t)) },
        { actionType: 'task.status', entityRefs: taskRefs(task, ctx), summary: `Task ${task.taskId} ${cmd.status.replace('_', ' ')}`, previousState: task.status, nextState: cmd.status },
        cmd.status === 'done' && task.relatedIncidentId ? `Task ${task.taskId} done. ${task.relatedIncidentId} stays open until it is verified and resolved separately.` : `Task ${task.taskId} is ${cmd.status.replace('_', ' ')}.`,
      );
    }

    case 'draft.create': {
      const perm = permissionCheck(actor, PERMISSION.task, 'prepare communication drafts');
      if (!perm.ok) return fail(perm.reason);
      const d = cmd.draft;
      if (!d.subject.trim() || !d.body.trim()) return fail('Add a subject and message before saving the draft.');
      const draft: NotificationDraft = { ...d, subject: d.subject.trim(), body: d.body.trim(), draftId: nextId('LOC-DRF'), createdByUserId: actor.userId, createdAtUtc: ctx.simNowIso, status: 'draft' };
      return commit(
        { drafts: [...s.drafts, draft] },
        { actionType: 'draft.create', entityRefs: d.relatedEntityIds, summary: `Draft ${draft.draftId} prepared for ${RECIPIENT_LABEL[d.recipientRole]}`, nextState: 'draft', notes: draft.subject },
        'Draft prepared locally. Nothing was sent.',
      );
    }

    case 'draft.ready': {
      const draft = s.drafts.find((x) => x.draftId === cmd.draftId);
      if (!draft) return fail(`Draft ${cmd.draftId} no longer exists.`);
      const perm = permissionCheck(actor, PERMISSION.task, 'prepare communication drafts');
      if (!perm.ok) return fail(perm.reason);
      if (!DRAFT_RECIPIENTS[draft.kind].includes(draft.recipientRole)) return fail('This draft has no permitted recipient role, so it cannot be marked ready.');
      if (draft.status === 'ready') return fail('The draft is already marked ready.');
      return commit(
        { drafts: s.drafts.map((x) => (x.draftId === draft.draftId ? { ...x, status: 'ready' as const } : x)) },
        { actionType: 'draft.ready', entityRefs: draft.relatedEntityIds, summary: `Draft ${draft.draftId} marked ready (not sent)`, previousState: 'draft', nextState: 'ready' },
        'Draft marked ready for review. The prototype has no mail integration, so nothing was sent.',
      );
    }

    case 'draft.discard': {
      const draft = s.drafts.find((x) => x.draftId === cmd.draftId);
      if (!draft) return fail(`Draft ${cmd.draftId} no longer exists.`);
      return commit(
        { drafts: s.drafts.filter((x) => x.draftId !== draft.draftId) },
        { actionType: 'draft.discard', entityRefs: draft.relatedEntityIds, summary: `Draft ${draft.draftId} discarded`, previousState: draft.status },
        'Draft discarded.',
      );
    }

    case 'scenario.propose': {
      const perm = permissionCheck(actor, PERMISSION.propose, 'propose scenario plans');
      if (!perm.ok) return fail(perm.reason);
      const who = checkAssignee(ctx.users, cmd.followUpAssigneeUserId);
      if (!who.ok) return fail(who.reason);
      const active = s.decisions.find((d) => d.voyageId === cmd.voyageId && d.optionId === cmd.optionId && sameInputs(d.inputs, cmd.inputs));
      if (active) return fail(`"${cmd.optionName}" with these inputs is already ${active.status} (${active.decisionId}).`);
      const decisionId = nextId('LOC-DEC');
      const taskId = nextId('LOC-TSK');
      const refs: EntityRef[] = [{ kind: 'voyage', id: cmd.voyageId }, ...(cmd.incidentId ? [{ kind: 'incident' as const, id: cmd.incidentId }] : [])];
      const task: Task = {
        taskId,
        type: 'scenario_followup',
        title: `Assess proposal: ${cmd.optionName}`,
        status: 'open',
        priority: 'normal',
        relatedIncidentId: cmd.incidentId,
        voyageId: cmd.voyageId,
        portId: cmd.portId,
        assigneeUserId: cmd.followUpAssigneeUserId,
        createdByUserId: actor.userId,
        dueAtUtc: null,
        notes: `Follow-up for ${decisionId}. Proposal only; no route or ETA was changed.`,
        createdAtUtc: ctx.simNowIso,
        updatedAtUtc: ctx.simNowIso,
        source: 'local-demo',
      };
      return commit(
        {
          decisions: [
            ...s.decisions,
            {
              decisionId,
              voyageId: cmd.voyageId,
              incidentId: cmd.incidentId,
              optionId: cmd.optionId,
              optionName: cmd.optionName,
              inputs: { ...cmd.inputs },
              status: 'proposed',
              proposedByUserId: actor.userId,
              acceptedByUserId: null,
              createdAtUtc: ctx.simNowIso,
              updatedAtUtc: ctx.simNowIso,
            },
          ],
          tasks: [...s.tasks, task],
        },
        {
          actionType: 'scenario.propose',
          entityRefs: refs,
          summary: `Proposed "${cmd.optionName}" for ${cmd.voyageId} (${decisionId})`,
          nextState: 'proposed',
          notes: `Inputs: wait +${cmd.inputs.extraWaitHours} h, rate ${cmd.inputs.dailyCostUsd ?? 'n/a'} USD/day, speed ${cmd.inputs.speedAssumptionKn} kn. Follow-up ${taskId}. No route or ETA changed.`,
        },
        `Proposal ${decisionId} recorded with follow-up task ${taskId}. Actual route and ETA are unchanged.`,
      );
    }

    case 'scenario.accept': {
      const d = s.decisions.find((x) => x.decisionId === cmd.decisionId);
      if (!d) return fail(`Proposal ${cmd.decisionId} no longer exists.`);
      const perm = permissionCheck(actor, PERMISSION.accept, 'accept scenario plans');
      if (!perm.ok) return fail(perm.reason);
      if (d.status === 'accepted') return fail('This plan is already accepted.');
      return commit(
        { decisions: s.decisions.map((x) => (x.decisionId === d.decisionId ? { ...x, status: 'accepted' as const, acceptedByUserId: actor.userId, updatedAtUtc: ctx.simNowIso } : x)) },
        {
          actionType: 'scenario.accept',
          entityRefs: [{ kind: 'voyage', id: d.voyageId }, ...(d.incidentId ? [{ kind: 'incident' as const, id: d.incidentId }] : [])],
          summary: `Accepted plan "${d.optionName}" (${d.decisionId})`,
          previousState: 'proposed',
          nextState: 'accepted',
          notes: 'Scenario decision status only; no vessel routing or external system was changed.',
        },
        `Plan ${d.decisionId} accepted as the scenario decision. Vessel route and ETA data are unchanged.`,
      );
    }
  }
}

function sameInputs(a: ScenarioInputs, b: ScenarioInputs) {
  return a.extraWaitHours === b.extraWaitHours && a.dailyCostUsd === b.dailyCostUsd && a.speedAssumptionKn === b.speedAssumptionKn;
}

function taskRefs(t: Task, ctx: WorkflowContext): EntityRef[] {
  if (t.relatedIncidentId) return ctx.incidentRefs(t.relatedIncidentId);
  const refs: EntityRef[] = [];
  if (t.voyageId) refs.push({ kind: 'voyage', id: t.voyageId });
  if (t.portId) refs.push({ kind: 'port', id: t.portId });
  return refs;
}

/** Incident status/owner overlay for the snapshot (only incidents with local decisions). */
export function incidentOverlay(s: WorkflowState): Record<string, { status: IncidentStatus; ownerUserId: string | null }> {
  const out: Record<string, { status: IncidentStatus; ownerUserId: string | null }> = {};
  for (const [id, v] of Object.entries(s.incidents)) out[id] = { status: v.status, ownerUserId: v.ownerUserId };
  return out;
}

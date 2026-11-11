import { describe, expect, it } from 'vitest';
import { toIsoUtc } from '@/core/time';
import type { EntityRef, Incident } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { cohortSets, dedupedExposureUsd, selectKpis } from '@/engines/kpis';
import { buildCaseQueue, needsVerification } from '@/engines/priority';
import { compareScenarios, defaultScenarioInputs, validateScenarioInputs } from '@/engines/scenario';
import { getSnapshotAt, incidentStatusAt } from '@/engines/snapshot';
import { checkTransition, transitionsFrom } from '@/workflows/incidentMachine';
import { auditFor, draftTemplate, exportAudit, handoffSummary } from '@/workflows/handoff';
import { incidentOverlay, reduceWorkflow, type WorkflowCommand, type WorkflowContext } from '@/workflows/reducer';
import { emptyWorkflow, type WorkflowState } from '@/workflows/types';
import { isWorkflowState, migrateWorkflowV1 } from '@/workflows/validate';
import { auditMatches, auditRows, hubTasks } from '@/selectors/activity';
import { buildQueueRows, filterQueueRows } from '@/selectors/queue';
import { catalog } from './fixtures';

const c = catalog();
const NOW = c.anchorMs;
const live = getSnapshotAt(c, NOW);

function ctx(userId: string, cat: Catalog = c, simNowMs = NOW): WorkflowContext {
  return {
    actor: cat.byId.user.get(userId) ?? null,
    users: cat.byId.user,
    simNowMs,
    simNowIso: toIsoUtc(simNowMs),
    wallNowIso: '2026-11-09T20:00:00Z',
    baseIncident: (id) => {
      const inc = cat.byId.incident.get(id);
      return inc ? { ...incidentStatusAt(cat, inc, cat.anchorMs), severity: inc.severity } : null;
    },
    incidentRefs: (id) => [{ kind: 'incident', id }, ...(cat.byId.incident.get(id)?.entityRefs ?? [])],
    needsVerification: (id) => {
      const inc = cat.byId.incident.get(id);
      return inc ? needsVerification(cat, live, inc) : true;
    },
  };
}

/** Applies commands in order and fails the test on the first rejection. */
function run(cmds: [string, WorkflowCommand][], start: WorkflowState = emptyWorkflow()): WorkflowState {
  return cmds.reduce((s, [user, cmd]) => {
    const r = reduceWorkflow(s, cmd, ctx(user));
    if (!r.ok) throw new Error(`${cmd.type} rejected: ${r.error}`);
    return r.state;
  }, start);
}

const DISPATCHER = 'USR-005';
const MANAGER = 'USR-001';
const ANALYST = 'USR-003';
const VIEWER = 'USR-004';
const ack: WorkflowCommand = { type: 'incident.transition', incidentId: 'INC-0001', transition: 'triage' };
const assign: WorkflowCommand = { type: 'incident.assign', incidentId: 'INC-0001', assigneeUserId: 'USR-002', dueAtUtc: '2026-11-09T18:00:00Z', note: 'Port agent call' };

describe('incident state machine', () => {
  it('offers only legal next steps from each status', () => {
    expect(transitionsFrom('untriaged').map((t) => t.id)).toEqual(['triage', 'resolve']);
    expect(transitionsFrom('investigating').map((t) => t.id)).toEqual(['resolve']);
    expect(transitionsFrom('optionProposed').map((t) => t.id)).toEqual(['investigate', 'resolve']);
    expect(transitionsFrom('approvedForSimulation').map((t) => t.id)).toEqual(['monitor', 'investigate', 'resolve']);
    expect(transitionsFrom('resolved').map((t) => t.id)).toEqual(['close', 'reopen']);
    expect(transitionsFrom('closed').map((t) => t.id)).toEqual(['reopen']);
    expect(transitionsFrom('detected')).toEqual([]);
  });

  it('enforces role guards with an explanation', () => {
    const viewer = c.byId.user.get(VIEWER)!;
    const r = checkTransition('untriaged', 'triage', viewer);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Viewer role cannot triage/);
    expect(checkTransition('investigating', 'resolve', c.byId.user.get(DISPATCHER)!, { resolution: { reason: 'berth_confirmed', evidenceNote: 'x', simulationAck: false } }).ok).toBe(false);
    expect(checkTransition('optionProposed', 'investigate', c.byId.user.get(ANALYST)!).ok).toBe(false);
    expect(checkTransition('resolved', 'close', c.byId.user.get(DISPATCHER)!).ok).toBe(false);
  });

  it('rejects skipping states', () => {
    const r = reduceWorkflow(emptyWorkflow(), { type: 'incident.transition', incidentId: 'INC-0001', transition: 'monitor' }, ctx(DISPATCHER));
    expect(r.ok).toBe(false);
    const viaButton = reduceWorkflow(run([[DISPATCHER, ack]]), { type: 'incident.transition', incidentId: 'INC-0001', transition: 'propose' }, ctx(DISPATCHER));
    expect(!viaButton.ok && viaButton.error).toMatch(/decision branches/);
  });

  it('requires a reason and evidence (or explicit simulation acknowledgement) to resolve', () => {
    const s = run([[MANAGER, ack]]);
    const noEvidence = reduceWorkflow(s, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'berth_confirmed', evidenceNote: ' ', simulationAck: false } }, ctx(MANAGER));
    expect(!noEvidence.ok && noEvidence.error).toMatch(/Resolved in simulation/);
    const other = reduceWorkflow(s, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'other', evidenceNote: '', simulationAck: true } }, ctx(MANAGER));
    expect(other.ok).toBe(false);
    const ok = reduceWorkflow(s, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'berth_confirmed', evidenceNote: '', simulationAck: true } }, ctx(MANAGER));
    expect(ok.ok && ok.state.incidents['INC-0001'].status).toBe('resolved');
    expect(ok.ok && ok.audit.notes).toMatch(/Resolved in simulation/);
  });

  it('cases that need verification cannot be resolved by acknowledgement alone', () => {
    const stale = ctx(MANAGER);
    stale.needsVerification = () => true;
    const s = reduceWorkflow(emptyWorkflow(), ack, stale);
    expect(s.ok).toBe(true);
    const r = reduceWorkflow(s.ok ? s.state : emptyWorkflow(), { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'eta_recovered', evidenceNote: '', simulationAck: true } }, stale);
    expect(!r.ok && r.error).toMatch(/stale/);
  });

  it('reopen is a separate audited event that keeps the earlier trail', () => {
    const resolved = run([
      [MANAGER, ack],
      [MANAGER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'berth_confirmed', evidenceNote: 'Agent confirmed W-1 slot', simulationAck: false } }],
    ]);
    expect(reduceWorkflow(resolved, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'reopen' }, ctx(DISPATCHER)).ok).toBe(false);
    const reopened = run([[DISPATCHER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'reopen', note: 'Slot withdrawn by terminal' }]], resolved);
    expect(reopened.incidents['INC-0001'].status).toBe('investigating');
    expect(reopened.incidents['INC-0001'].resolution).toBeNull();
    expect(reopened.audit.map((a) => a.actionType)).toEqual(['incident.transition', 'incident.transition', 'incident.reopen']);
    expect(reopened.audit.slice(0, 2)).toEqual(resolved.audit);
  });
});

describe('INC-0001 pass condition: untriaged → investigating (triage), assigned', () => {
  const s = run([
    [DISPATCHER, ack],
    [DISPATCHER, assign],
    [DISPATCHER, { type: 'incident.note', incidentId: 'INC-0001', text: 'Agent says berth W-1 tomorrow 14:00 local, unconfirmed.' }],
  ]);

  it('records status, owner, due time and note', () => {
    const local = s.incidents['INC-0001'];
    expect(local.status).toBe('investigating');
    expect(local.ownerUserId).toBe('USR-002');
    expect(local.dueAtUtc).toBe('2026-11-09T18:00:00Z');
    expect(local.notes[0].text).toMatch(/W-1/);
  });

  it('audit captures each action with actor, role, both times and previous/next state', () => {
    expect(s.audit).toHaveLength(3);
    expect(s.audit.map((a) => [a.actionType, a.previousState, a.nextState])).toEqual([
      ['incident.transition', 'untriaged', 'investigating'],
      ['incident.assign', 'unassigned', 'USR-002'],
      ['incident.note', undefined, undefined],
    ]);
    for (const a of s.audit) {
      expect(a.actorUserId).toBe(DISPATCHER);
      expect(a.actorRole).toBe('dispatcher');
      expect(a.simulatedContextTimeUtc).toBe('2026-11-09T12:00:00Z');
      expect(a.source).toBe('local-demo');
    }
  });

  it('applies at Now, never to history', () => {
    const now = getSnapshotAt(c, NOW, { incidents: incidentOverlay(s) });
    expect(now.incidents.get('INC-0001')).toMatchObject({ status: 'investigating', ownerUserId: 'USR-002', locallyModified: true });
    const past = getSnapshotAt(c, Date.parse('2026-11-09T11:30:00Z'), { incidents: incidentOverlay(s) });
    expect(past.incidents.get('INC-0001')).toMatchObject({ status: 'untriaged', locallyModified: false });
  });

  it('is visible in both the incident and the vessel audit views', () => {
    expect(auditFor(c, s, { kind: 'incident', id: 'INC-0001' })).toHaveLength(3);
    expect(auditFor(c, s, { kind: 'vessel', id: 'VSL-0001' })).toHaveLength(3);
    expect(auditFor(c, s, { kind: 'voyage', id: 'VYG-0001' })).toHaveLength(3);
    expect(auditFor(c, s, { kind: 'vessel', id: 'VSL-0002' })).toHaveLength(0);
  });

  it('survives a JSON round trip (reload) and validates', () => {
    const reloaded: unknown = JSON.parse(JSON.stringify(s));
    expect(isWorkflowState(reloaded)).toBe(true);
    expect(reloaded).toEqual(s);
  });

  it('reset returns the reproducible initial metrics', () => {
    const before = selectKpis(c, getSnapshotAt(c, NOW));
    const afterReset = selectKpis(c, getSnapshotAt(c, NOW, { incidents: incidentOverlay(emptyWorkflow()) }));
    expect(afterReset.map((k) => k.value)).toEqual(before.map((k) => k.value));
  });

  it('handoff summary states status, owner, ETA, exposure, freshness and the caveat', () => {
    const text = handoffSummary(c, getSnapshotAt(c, NOW, { incidents: incidentOverlay(s) }), s, 'INC-0001');
    expect(text).toMatch(/Status: investigating · owner: Jordan Lee · due 2026-11-09 18:00 UTC/);
    expect(text).toMatch(/\+18\.0 h vs plan/);
    expect(text).toMatch(/\$24,000/);
    expect(text).toMatch(/Synthetic prototype/);
  });
});

describe('assignment, undo and guards', () => {
  it('rejects unknown, view-only and past-due assignments', () => {
    const base = run([[DISPATCHER, ack]]);
    const bad = (cmd: WorkflowCommand) => {
      const r = reduceWorkflow(base, cmd, ctx(DISPATCHER));
      return r.ok ? null : r.error;
    };
    expect(bad({ ...assign, assigneeUserId: 'USR-999' } as WorkflowCommand)).toMatch(/Unknown assignee/);
    expect(bad({ ...assign, assigneeUserId: VIEWER } as WorkflowCommand)).toMatch(/view-only/);
    expect(bad({ ...assign, dueAtUtc: '2026-11-09T11:00:00Z' } as WorkflowCommand)).toMatch(/already passed/);
    expect(reduceWorkflow(base, assign, ctx(ANALYST)).ok).toBe(false);
  });

  it('undo reverts the latest change only', () => {
    const s = run([
      [DISPATCHER, ack],
      [DISPATCHER, assign],
    ]);
    const last = s.audit[1];
    const undone = run([[DISPATCHER, { type: 'incident.undo', incidentId: 'INC-0001', auditId: last.auditId }]], s);
    expect(undone.incidents['INC-0001']).toMatchObject({ status: 'investigating', ownerUserId: null });
    const triageUndone = run([[DISPATCHER, { type: 'incident.undo', incidentId: 'INC-0001', auditId: s.audit[0].auditId }]], run([[DISPATCHER, ack]]));
    expect(triageUndone.incidents['INC-0001'].status).toBe('untriaged');
    expect(undone.audit.at(-1)!.actionType).toBe('incident.undo');
    const stale = reduceWorkflow(s, { type: 'incident.undo', incidentId: 'INC-0001', auditId: s.audit[0].auditId }, ctx(DISPATCHER));
    expect(!stale.ok && stale.error).toMatch(/later change/);
  });

  it('never produces duplicate IDs', () => {
    const s = run([
      [DISPATCHER, ack],
      [DISPATCHER, { type: 'task.create', task: { type: 'port_agent_eta_followup', relatedIncidentId: 'INC-0001', voyageId: 'VYG-0001', portId: 'PRT-SIN', assigneeUserId: 'USR-005' } }],
      [DISPATCHER, { type: 'task.create', task: { type: 'voyage_monitoring', relatedIncidentId: 'INC-0001', voyageId: 'VYG-0001', assigneeUserId: 'USR-002' } }],
    ]);
    const ids = [...s.audit.map((a) => a.auditId), ...s.tasks.map((t) => t.taskId)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('tasks and drafts', () => {
  const task: WorkflowCommand = { type: 'task.create', task: { type: 'port_agent_eta_followup', relatedIncidentId: 'INC-0001', voyageId: 'VYG-0001', portId: 'PRT-SIN', assigneeUserId: 'USR-005', dueAtUtc: '2026-11-09T16:00:00Z', notes: 'Confirm W-1' } };

  it('create → in progress → done keeps the incident open', () => {
    const s = run([
      [DISPATCHER, ack],
      [DISPATCHER, task],
    ]);
    const id = s.tasks[0].taskId;
    expect(reduceWorkflow(s, task, ctx(DISPATCHER)).ok).toBe(false);
    const done = run(
      [
        [DISPATCHER, { type: 'task.status', taskId: id, status: 'in_progress' }],
        [DISPATCHER, { type: 'task.status', taskId: id, status: 'done' }],
      ],
      s,
    );
    expect(done.tasks[0].status).toBe('done');
    expect(done.incidents['INC-0001'].status).toBe('investigating');
    expect(reduceWorkflow(done, { type: 'task.status', taskId: id, status: 'in_progress' }, ctx(DISPATCHER)).ok).toBe(false);
  });

  it('viewer cannot create tasks; assignee must exist', () => {
    expect(reduceWorkflow(emptyWorkflow(), task, ctx(VIEWER)).ok).toBe(false);
    expect(reduceWorkflow(emptyWorkflow(), { type: 'task.create', task: { type: 'voyage_monitoring', assigneeUserId: '' } }, ctx(DISPATCHER)).ok).toBe(false);
  });

  it('draft templates use the shared numbers and say they were not sent', () => {
    const agent = draftTemplate(c, live, 'INC-0001', 'port_agent_eta_request')!;
    expect(agent.recipientRole).toBe('port_agent');
    expect(agent.body).toMatch(/\+18\.0 h/);
    expect(agent.body).toMatch(/Not sent/);
    const s = run([[DISPATCHER, { type: 'draft.create', draft: agent }]]);
    expect(s.drafts[0].status).toBe('draft');
    const ready = run([[DISPATCHER, { type: 'draft.ready', draftId: s.drafts[0].draftId }]], s);
    expect(ready.drafts[0].status).toBe('ready');
    expect(ready.audit.at(-1)!.summary).toMatch(/not sent/);
  });

  it('a draft without a permitted recipient role cannot be marked ready; empty drafts are rejected', () => {
    const agent = draftTemplate(c, live, 'INC-0001', 'port_agent_eta_request')!;
    const s = run([[DISPATCHER, { type: 'draft.create', draft: { ...agent, recipientRole: 'customer' } }]]);
    const r = reduceWorkflow(s, { type: 'draft.ready', draftId: s.drafts[0].draftId }, ctx(DISPATCHER));
    expect(!r.ok && r.error).toMatch(/no permitted recipient/);
    expect(reduceWorkflow(emptyWorkflow(), { type: 'draft.create', draft: { ...agent, body: ' ' } }, ctx(DISPATCHER)).ok).toBe(false);
  });
});

describe('scenario comparison', () => {
  const inputs = defaultScenarioInputs(c, live, 'VYG-0001')!;
  const cmp = compareScenarios(c, live, 'VYG-0001', inputs)!;
  const opt = (id: string) => cmp.options.find((o) => o.optionId === id)!;

  it('baseline matches the +18 h / $24,000 gate', () => {
    expect(inputs).toEqual({ extraWaitHours: 0, dailyCostUsd: 32000, speedAssumptionKn: 14 });
    expect(opt('baseline')).toMatchObject({ etaDeltaHours: 18, exposureUsd: 24000, extraDistanceNm: 0 });
    expect(opt('baseline').formula).toMatch(/\$24,000/);
  });

  it('agent confirmation narrows uncertainty without inventing savings', () => {
    expect(opt('agent_confirmation')).toMatchObject({ etaDeltaHours: 18, exposureUsd: 24000, diffVsBaseline: { hours: 0, usd: 0 } });
    expect(opt('agent_confirmation').confidence).not.toBe(opt('baseline').confidence);
  });

  it('alternative corridor adds sailing time on top of the wait', () => {
    const alt = opt('alternative_corridor');
    expect(alt.feasible).toBe(true);
    expect(alt.extraDistanceNm).toBe(3756);
    expect(alt.etaDeltaHours).toBeCloseTo(18 + 268.3, 1);
    expect(alt.requiredApproval).toBe('manager');
    expect(alt.geometry).toEqual({ routeId: 'RTE-SIN-RTM-CAPE', style: 'proposed' });
  });

  it('changing wait hours recomputes deterministically; missing cost keeps non-financial comparison', () => {
    const six = compareScenarios(c, live, 'VYG-0001', { ...inputs, extraWaitHours: 6 })!;
    expect(six.options[0]).toMatchObject({ etaDeltaHours: 24, exposureUsd: 32000 });
    expect(compareScenarios(c, live, 'VYG-0001', { ...inputs, extraWaitHours: 6 })).toEqual(six);
    const noRate = compareScenarios(c, live, 'VYG-0001', { ...inputs, dailyCostUsd: null })!;
    expect(noRate.options[0].exposureUsd).toBeNull();
    expect(noRate.options[0].etaDeltaHours).toBe(18);
  });

  it('voyages without an alternative keep the option disabled with a reason', () => {
    const other = c.voyages.find((v) => v.routeId !== 'RTE-SIN-RTM' && live.etas.get(v.voyageId)?.etaShiftMinutes !== null)!;
    const r = compareScenarios(c, live, other.voyageId, defaultScenarioInputs(c, live, other.voyageId)!)!;
    expect(r.options[2].feasible).toBe(false);
    expect(r.options[2].notApplicableReason).toMatch(/No verified alternative/);
  });

  it('validates inputs', () => {
    expect(validateScenarioInputs({ ...inputs, extraWaitHours: -1 })).toMatch(/Extra wait/);
    expect(validateScenarioInputs({ ...inputs, speedAssumptionKn: 40 })).toMatch(/Speed/);
    expect(validateScenarioInputs(inputs)).toBeNull();
  });

  const outcomeFor = (optionId: string) => {
    const cmp = compareScenarios(c, live, 'VYG-0001', inputs)!;
    const base = cmp.options[0];
    const o = cmp.options.find((x) => x.optionId === optionId)!;
    return { baseline: { etaDeltaHours: base.etaDeltaHours, exposureUsd: base.exposureUsd }, branch: { etaDeltaHours: o.etaDeltaHours, exposureUsd: o.exposureUsd }, confidence: o.confidence, formula: o.formula };
  };
  const propose = (optionId = 'agent_confirmation', optionName = 'Request port-agent ETA confirmation'): WorkflowCommand => ({
    type: 'branch.propose',
    voyageId: 'VYG-0001',
    incidentId: 'INC-0001',
    optionId,
    optionName,
    inputs,
    outcome: outcomeFor(optionId),
    followUpAssigneeUserId: 'USR-005',
    portId: 'PRT-SIN',
  });

  it('propose forks a branch with a frozen outcome and moves the case to option proposed', () => {
    const s = run([[DISPATCHER, ack], [DISPATCHER, propose()]]);
    expect(s.branches[0]).toMatchObject({ branchId: 'LOC-BR-0002', status: 'proposed', optionId: 'agent_confirmation', forkedAtUtc: '2026-11-09T12:00:00Z' });
    expect(s.branches[0].outcome).toMatchObject({ baseline: { etaDeltaHours: 18, exposureUsd: 24_000 }, branch: { etaDeltaHours: 18, exposureUsd: 24_000 } });
    expect(s.incidents['INC-0001'].status).toBe('optionProposed');
    expect(s.tasks[0]).toMatchObject({ type: 'scenario_followup', relatedIncidentId: 'INC-0001' });
    expect(s.audit.at(-1)).toMatchObject({ actionType: 'branch.propose', previousState: 'investigating', nextState: 'optionProposed' });
    expect(s.audit.at(-1)!.notes).toMatch(/No route or ETA changed/);
    expect(reduceWorkflow(s, propose(), ctx(DISPATCHER)).ok).toBe(false);
  });

  it('approve for simulation is manager-only, one approved branch per voyage, and never touches fixture data', () => {
    const s = run([[DISPATCHER, ack], [DISPATCHER, propose()], [DISPATCHER, propose('alternative_corridor', 'Flag alternative')]]);
    const [a, b] = s.branches;
    expect(reduceWorkflow(s, { type: 'branch.approve', branchId: a.branchId }, ctx(DISPATCHER)).ok).toBe(false);
    const one = run([[MANAGER, { type: 'branch.approve', branchId: a.branchId }]], s);
    expect(one.branches[0]).toMatchObject({ status: 'approvedForSimulation', approvedByUserId: MANAGER });
    expect(one.incidents['INC-0001'].status).toBe('approvedForSimulation');
    const two = run([[MANAGER, { type: 'branch.approve', branchId: b.branchId }]], one);
    expect(two.branches.map((x) => x.status)).toEqual(['proposed', 'approvedForSimulation']);
    const monitoring = run([[DISPATCHER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'monitor' }]], two);
    expect(monitoring.incidents['INC-0001'].status).toBe('monitoring');
    expect(c.byId.voyage.get('VYG-0001')!.routeId).toBe('RTE-SIN-RTM');
    expect(getSnapshotAt(c, NOW, { incidents: incidentOverlay(monitoring) }).etas.get('VYG-0001')!.etaShiftMinutes).toBe(18 * 60);
  });

  it('discarding the last live branch returns the case to investigating', () => {
    const s = run([[DISPATCHER, ack], [DISPATCHER, propose()]]);
    const d = run([[DISPATCHER, { type: 'branch.discard', branchId: s.branches[0].branchId }]], s);
    expect(d.branches[0].status).toBe('discarded');
    expect(d.incidents['INC-0001'].status).toBe('investigating');
    expect(reduceWorkflow(d, { type: 'branch.approve', branchId: s.branches[0].branchId }, ctx(MANAGER)).ok).toBe(false);
  });
});

describe('escalation, close and reopen', () => {
  it('escalation raises severity with a reason and reorders the queue score', () => {
    const s = run([[DISPATCHER, ack]]);
    const noReason = reduceWorkflow(s, { type: 'incident.escalate', incidentId: 'INC-0001', severity: 'critical', note: ' ' }, ctx(DISPATCHER));
    expect(!noReason.ok && noReason.error).toMatch(/facts changed/);
    expect(reduceWorkflow(s, { type: 'incident.escalate', incidentId: 'INC-0001', severity: 'medium', note: 'x' }, ctx(DISPATCHER)).ok).toBe(false);
    const e = run([[DISPATCHER, { type: 'incident.escalate', incidentId: 'INC-0001', severity: 'critical', note: 'Wait estimate doubled at 11:22' }]], s);
    expect(e.incidents['INC-0001'].severity).toBe('critical');
    expect(e.audit.at(-1)).toMatchObject({ actionType: 'incident.escalate', previousState: 'high', nextState: 'critical' });
    const before = buildCaseQueue(c, getSnapshotAt(c, NOW, { incidents: incidentOverlay(s) })).find((q) => q.caseId === 'INC-0001')!;
    const after = buildCaseQueue(c, getSnapshotAt(c, NOW, { incidents: incidentOverlay(e) })).find((q) => q.caseId === 'INC-0001')!;
    expect(after.priority.score - before.priority.score).toBe(15);
    expect(after.priority.rationale[0]).toMatch(/Critical severity \(escalated\) \+45/);
  });

  it('a resolved case can be closed by a manager and reopened with a reason', () => {
    const resolved = run([
      [MANAGER, ack],
      [MANAGER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'berth_confirmed', evidenceNote: 'W-1 confirmed', simulationAck: false } }],
    ]);
    expect(reduceWorkflow(resolved, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'close' }, ctx(DISPATCHER)).ok).toBe(false);
    const closed = run([[MANAGER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'close' }]], resolved);
    expect(closed.incidents['INC-0001'].status).toBe('closed');
    expect(buildCaseQueue(c, getSnapshotAt(c, NOW, { incidents: incidentOverlay(closed) })).some((q) => q.incidentIds.includes('INC-0001'))).toBe(false);
    expect(reduceWorkflow(closed, { type: 'incident.escalate', incidentId: 'INC-0001', severity: 'critical', note: 'x' }, ctx(MANAGER)).ok).toBe(false);
    const reopened = run([[DISPATCHER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'reopen', note: 'Terminal withdrew the slot' }]], closed);
    expect(reopened.incidents['INC-0001'].status).toBe('investigating');
  });
});

describe('storage migration v1 → v2', () => {
  const v1 = {
    version: 1,
    seq: 6,
    incidents: {
      'INC-0001': { status: 'mitigation_planned', ownerUserId: 'USR-002', dueAtUtc: null, notes: [], resolution: null },
      'INC-0002': { status: 'acknowledged', ownerUserId: null, dueAtUtc: null, notes: [], resolution: null },
      'INC-0003': { status: 'open', ownerUserId: null, dueAtUtc: null, notes: [], resolution: null },
    },
    tasks: [],
    drafts: [],
    decisions: [
      { decisionId: 'LOC-DEC-0004', voyageId: 'VYG-0001', incidentId: 'INC-0001', optionId: 'agent_confirmation', optionName: 'Request port-agent ETA confirmation', inputs: { extraWaitHours: 0, dailyCostUsd: 32000, speedAssumptionKn: 14 }, status: 'accepted', proposedByUserId: 'USR-005', acceptedByUserId: 'USR-001', createdAtUtc: '2026-11-09T12:00:00Z', updatedAtUtc: '2026-11-09T12:00:00Z' },
    ],
    audit: [{ auditId: 'LOC-AUD-0005', actorUserId: 'USR-001', actorRole: 'manager', occurredAtUtc: '2026-11-09T20:00:00Z', simulatedContextTimeUtc: '2026-11-09T12:00:00Z', entityRefs: [{ kind: 'voyage', id: 'VYG-0001' }], actionType: 'scenario.accept', summary: 'Accepted plan', source: 'local-demo' }],
  };

  it('maps statuses to stages, decisions to branches, and keeps IDs and audit', () => {
    const m = migrateWorkflowV1(v1)!;
    expect(m).not.toBeNull();
    expect(isWorkflowState(m)).toBe(true);
    expect(m.version).toBe(2);
    expect(m.seq).toBe(6);
    expect(Object.fromEntries(Object.entries(m.incidents).map(([k, v]) => [k, v.status]))).toEqual({ 'INC-0001': 'optionProposed', 'INC-0002': 'investigating', 'INC-0003': 'untriaged' });
    expect(m.incidents['INC-0001'].severity).toBeNull();
    expect(m.branches[0]).toMatchObject({ branchId: 'LOC-DEC-0004', status: 'approvedForSimulation', approvedByUserId: 'USR-001', outcome: null, forkedAtUtc: '2026-11-09T12:00:00Z' });
    expect(m.audit).toEqual(v1.audit);
  });

  it('rejects invalid V1 data instead of guessing', () => {
    expect(migrateWorkflowV1({ ...v1, incidents: { 'INC-0001': { status: 'optionProposed', ownerUserId: null, dueAtUtc: null, notes: [], resolution: null } } })).toBeNull();
    expect(migrateWorkflowV1({ ...v1, version: 2 })).toBeNull();
    expect(migrateWorkflowV1('nope')).toBeNull();
  });
});

describe('exception queue', () => {
  const queue = buildCaseQueue(c, live);

  it('lists unresolved visible incidents worst first with an explainable score', () => {
    expect(queue.length).toBeGreaterThan(5);
    for (let i = 1; i < queue.length; i++) expect(queue[i - 1].priority.score).toBeGreaterThanOrEqual(queue[i].priority.score);
    const inc1 = queue.find((q) => q.caseId === 'INC-0001')!;
    expect(inc1.priority.rationale.join(' · ')).toMatch(/High severity \+30 · \$24,000 exposure \+18/);
    expect(inc1.relatedOnVoyage).toEqual(['INC-0050']);
  });

  it('collapses related forecast alerts on the same voyage/category/time bucket, not unrelated ones', () => {
    const base = c.byId.incident.get('INC-0001')!;
    const dup: Incident = { ...base, incidentId: 'INC-9001', openedAtUtc: '2026-11-09T11:10:00Z', severity: 'medium' };
    const weather: Incident = { ...base, incidentId: 'INC-9002', category: 'weather_exposure', openedAtUtc: '2026-11-09T11:10:00Z' };
    const incidents = [...c.incidents, dup, weather];
    const c2: Catalog = { ...c, incidents, byId: { ...c.byId, incident: new Map(incidents.map((i) => [i.incidentId, i])) } };
    const q = buildCaseQueue(c2, getSnapshotAt(c2, NOW));
    const inc1 = q.find((x) => x.caseId === 'INC-0001')!;
    expect(inc1.incidentIds).toEqual(['INC-0001', 'INC-9001']);
    expect(q.some((x) => x.caseId === 'INC-9002')).toBe(true);
    expect(q.some((x) => x.caseId === 'INC-9001')).toBe(false);
  });

  it('resolving one of two incidents on a voyage keeps exposure counted once', () => {
    const s = run([
      [MANAGER, ack],
      [MANAGER, { type: 'incident.transition', incidentId: 'INC-0001', transition: 'resolve', resolution: { reason: 'berth_confirmed', evidenceNote: 'Slot confirmed', simulationAck: false } }],
    ]);
    const snap = getSnapshotAt(c, NOW, { incidents: incidentOverlay(s) });
    const ex = dedupedExposureUsd(c, snap, cohortSets(c, snap));
    expect(ex.voyageIds.filter((v) => v === 'VYG-0001')).toHaveLength(1);
    expect(buildCaseQueue(c, snap).some((q) => q.caseId === 'INC-0001')).toBe(false);
  });
});

describe('persistence validation', () => {
  it('rejects corrupted or duplicate-ID state', () => {
    const s = run([[DISPATCHER, ack]]);
    expect(isWorkflowState({ ...s, version: 1 })).toBe(false);
    expect(isWorkflowState({ ...s, incidents: { 'INC-0001': { ...s.incidents['INC-0001'], status: 'acknowledged' } } })).toBe(false);
    expect(isWorkflowState({ ...s, incidents: { 'INC-0001': { ...s.incidents['INC-0001'], status: 'detected' } } })).toBe(false);
    expect(isWorkflowState({ ...s, incidents: { 'INC-0001': { ...s.incidents['INC-0001'], severity: 'low' } } })).toBe(false);
    expect(isWorkflowState({ ...s, audit: [...s.audit, s.audit[0]] })).toBe(false);
    expect(isWorkflowState('nope')).toBe(false);
  });

  it('audit export carries the synthetic caveat', () => {
    const s = run([[DISPATCHER, ack]]);
    const out = exportAudit(s, '2026-11-09T20:00:00Z');
    expect(out.caveat).toMatch(/Synthetic prototype/);
    expect(out.events).toHaveLength(1);
    const refs: EntityRef[] = out.events[0].entityRefs;
    expect(refs).toContainEqual({ kind: 'vessel', id: 'VSL-0001' });
  });
});

describe('queue and activity read models', () => {
  it('queue rows follow priority order, filter by region and search', () => {
    const rows = buildQueueRows(c, live, emptyWorkflow(), null);
    const scores = rows.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(rows.length).toBe(buildCaseQueue(c, live).length);
    const region = c.byId.port.get(c.byId.incident.get(rows[0].caseId)!.portId)!.regionId;
    expect(buildQueueRows(c, live, emptyWorkflow(), region).every((r) => r.regionId === region)).toBe(true);
    const inc1 = filterQueueRows(rows, 'inc-0001');
    expect(inc1.map((r) => r.caseId)).toContain('INC-0001');
    expect(filterQueueRows(rows, 'zzz-no-such')).toEqual([]);
  });

  it('queue reflects a local owner', () => {
    const s = run([[DISPATCHER, ack], [DISPATCHER, assign]]);
    const snap = getSnapshotAt(c, NOW, { incidents: incidentOverlay(s) });
    const row = buildQueueRows(c, snap, s, null).find((r) => r.caseId === 'INC-0001');
    expect(row?.ownerName).toBe('Jordan Lee');
    expect(row?.hasLocalDecision).toBe(true);
  });

  it('audit filters combine actor, action and entity', () => {
    const s = run([[DISPATCHER, ack], [DISPATCHER, assign]]);
    expect(s.audit.filter((a) => auditMatches(a, { actorUserId: DISPATCHER, actionType: 'incident.assign', entity: '' }))).toHaveLength(1);
    expect(s.audit.filter((a) => auditMatches(a, { actorUserId: MANAGER, actionType: null, entity: '' }))).toHaveLength(0);
    expect(s.audit.filter((a) => auditMatches(a, { actorUserId: null, actionType: null, entity: 'vsl-0001' }))).toHaveLength(2);
    expect(auditRows(c, s.audit)[0].actorText).toBe('Taylor Cruz (dispatcher)');
  });

  it('hub task list filters to the current user', () => {
    const s = run([[DISPATCHER, { type: 'task.create', task: { type: 'voyage_monitoring', relatedIncidentId: 'INC-0001', voyageId: 'VYG-0001', portId: null, assigneeUserId: 'USR-002', dueAtUtc: null, notes: '' } }]]);
    expect(hubTasks(c, s, NOW, { mineUserId: 'USR-002', regionId: null })).toHaveLength(1);
    expect(hubTasks(c, s, NOW, { mineUserId: DISPATCHER, regionId: null })).toHaveLength(0);
  });
});

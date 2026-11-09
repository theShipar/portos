import { formatCoord, formatDuration, formatLocal, formatTimestampFreshness, formatUsd, formatUtc, sentenceCase } from '@/core/format';
import { parseUtc } from '@/core/time';
import type { EntityRef, Evidence, Incident, User } from '@/core/types';
import type { Catalog } from '@/data/catalog';
import { incidentPriority, type CasePriority } from '@/engines/priority';
import { freshnessOf, makeProvenance, type FeedKind, type Freshness, type Provenance } from '@/engines/provenance';
import type { IncidentState, Snapshot } from '@/engines/snapshot';
import { checkTransition, PERMISSION, permissionCheck, transitionsFrom, type Check, type TransitionRule } from '@/workflows/incidentMachine';
import { auditFor } from '@/workflows/handoff';
import { TASK_TYPE_LABEL, type AuditEvent, type NotificationDraft, type ScenarioDecision, type Task, type WorkflowState } from '@/workflows/types';
import { statusStyle, type StatusStyle } from '@/styles/tokens';
import { selectVoyageImpact, type VoyageImpact } from './impact';
import { describeEvent, type InspectorField } from './vessel';

export interface EvidenceRow {
  evidenceId: string;
  label: string;
  valueText: string;
  observedText: string;
  ageText: string;
  freshness: Freshness;
  qualityLabel: string;
  sourceLabel: string;
  provenance: Provenance;
}

export interface TimelineRow {
  key: string;
  kind: 'fixture' | 'local';
  utcText: string;
  localText: string;
  label: string;
  detail: string | null;
  actor: string | null;
  ref: EntityRef | null;
}

export interface TaskRow {
  task: Task;
  typeLabel: string;
  assigneeName: string;
  dueText: string | null;
  overdue: boolean;
  statusStyle: StatusStyle;
}

export interface TransitionOption {
  rule: TransitionRule;
  check: Check;
}

export interface IncidentModel {
  incident: Incident;
  state: IncidentState;
  vesselName: string;
  portName: string;
  portTimeZone: string;
  severityStyle: StatusStyle;
  statusStyle: StatusStyle;
  confidenceStyle: StatusStyle;
  ageText: string;
  ownerName: string;
  dueText: string | null;
  needsVerification: boolean;
  priority: CasePriority | null;
  effectText: string;
  causeText: string;
  impact: VoyageImpact;
  related: { incidentId: string; title: string; style: StatusStyle }[];
  facts: InspectorField[];
  evidence: EvidenceRow[];
  evidenceHidden: number;
  computedEvidence: InspectorField[];
  timeline: TimelineRow[];
  localHiddenInReplay: number;
  tasks: TaskRow[];
  drafts: NotificationDraft[];
  decisions: ScenarioDecision[];
  notes: { noteId: string; author: string; atText: string; text: string }[];
  resolutionText: string | null;
  transitions: TransitionOption[];
  can: { assign: Check; note: Check; task: Check; propose: Check };
}

const FIELD_LABEL: Record<string, string> = {
  estimatedArrivalUtc: 'Revised forecast ETA',
  waitingEstimateHours: 'Port waiting estimate',
  lastKnownPosition: 'Last AIS-style position',
  estimatedBerthUtc: 'Estimated berth time',
  dailyDelayCostUsd: 'Daily delay rate (assumption)',
};
const FIELD_FEED: Record<string, FeedKind> = {
  estimatedArrivalUtc: 'eta',
  waitingEstimateHours: 'portWait',
  lastKnownPosition: 'position',
  estimatedBerthUtc: 'berth',
  dailyDelayCostUsd: 'snapshot',
};

function evidenceValue(e: Evidence): string {
  const v = e.value;
  if (e.field.endsWith('Utc') && typeof v === 'string') return formatUtc(v);
  if (e.field === 'lastKnownPosition' && v && typeof v === 'object') return formatCoord(v as { lat: number; lon: number });
  if (e.unit === 'USD/day' && typeof v === 'number') return `${formatUsd(v)}/day`;
  if (e.unit === 'h' && typeof v === 'number') return `${v} h`;
  return String(v);
}

export function taskRow(c: Catalog, t: Task, nowMs: number): TaskRow {
  const due = parseUtc(t.dueAtUtc);
  const active = t.status === 'open' || t.status === 'in_progress';
  const overdue = active && due !== null && due < nowMs;
  const tone = t.status === 'done' ? 'healthy' : t.status === 'cancelled' ? 'neutral' : overdue ? 'critical' : t.status === 'in_progress' ? 'info' : 'warning';
  return {
    task: t,
    typeLabel: TASK_TYPE_LABEL[t.type],
    assigneeName: c.byId.user.get(t.assigneeUserId)?.displayName ?? t.assigneeUserId,
    dueText: t.dueAtUtc ? formatUtc(t.dueAtUtc) : null,
    overdue,
    statusStyle: { tone, label: overdue ? 'Overdue' : sentenceCase(t.status), icon: t.status === 'done' ? 'check' : overdue ? 'alert' : 'clock' },
  };
}

function auditRow(c: Catalog, a: AuditEvent, tz: string): TimelineRow {
  return {
    key: a.auditId,
    kind: 'local',
    utcText: formatUtc(a.simulatedContextTimeUtc),
    localText: formatLocal(a.simulatedContextTimeUtc, tz),
    label: a.summary,
    detail: a.notes ?? null,
    actor: `${c.byId.user.get(a.actorUserId)?.displayName ?? a.actorUserId} (${a.actorRole})`,
    ref: a.entityRefs.find((r) => r.kind === 'incident') ?? a.entityRefs[0] ?? null,
  };
}

export function buildIncidentModel(c: Catalog, snap: Snapshot, wf: WorkflowState, user: User | null, incidentId: string): IncidentModel | null {
  const inc = c.byId.incident.get(incidentId);
  const st = snap.incidents.get(incidentId);
  if (!inc || !st) return null;
  const port = c.byId.port.get(inc.portId);
  const vo = c.byId.voyage.get(inc.voyageId);
  const tz = port?.timeZone ?? 'UTC';
  const t = snap.timeMs;
  const local = !snap.isHistorical ? wf.incidents[incidentId] : undefined;
  const impact = selectVoyageImpact(snap, inc.voyageId);
  const priority = incidentPriority(c, snap, inc);
  const userName = (id: string | null) => (id ? (c.byId.user.get(id)?.displayName ?? id) : 'Unassigned');
  const opened = parseUtc(inc.openedAtUtc) ?? t;
  const portName = port?.name ?? inc.portId;
  const destName = vo ? (c.byId.port.get(vo.destinationPortId)?.name ?? vo.destinationPortId) : 'destination';

  const evidence: EvidenceRow[] = [];
  let evidenceHidden = 0;
  for (const id of inc.evidenceIds) {
    const e = c.evidence.find((x) => x.evidenceId === id);
    if (!e) continue;
    const observed = parseUtc(e.observedAtUtc);
    if (observed !== null && observed > t) {
      evidenceHidden++;
      continue;
    }
    const feed = FIELD_FEED[e.field] ?? 'snapshot';
    const freshness: Freshness = e.quality === 'assumption' ? 'fresh' : freshnessOf(feed, observed, t).freshness;
    const source = c.events.find((ev) => ev.eventId === e.sourceId);
    evidence.push({
      evidenceId: e.evidenceId,
      label: FIELD_LABEL[e.field] ?? sentenceCase(e.field),
      valueText: evidenceValue(e),
      observedText: formatUtc(e.observedAtUtc),
      ageText: formatTimestampFreshness(observed, t),
      freshness,
      qualityLabel: e.quality === 'assumption' ? 'Assumption' : 'Synthetic',
      sourceLabel: source ? `${source.eventId} · ${source.type}` : `${e.sourceId} record`,
      provenance: makeProvenance({
        sourceClass: 'simulated-fixture',
        evidence: e.quality === 'assumption' ? 'scenario' : 'observed',
        method: `Evidence item ${e.evidenceId} (${e.field})`,
        feed: e.quality === 'assumption' ? 'snapshot' : feed,
        asOf: e.observedAtUtc,
        nowMs: t,
        confidence: e.quality === 'assumption' ? 'medium' : 'high',
        sources: [{ kind: source ? 'event' : 'record', id: e.sourceId, label: source ? `${source.type} · events.json` : 'Fixture record', atUtc: e.observedAtUtc }],
        assumptions: [`Received ${formatUtc(e.receivedAtUtc)}.`],
      }),
    });
  }

  const vessel = snap.vessels.get(inc.vesselId);
  const wait = snap.portWait.get(inc.portId);
  const risk = snap.risks.get(inc.voyageId);
  const computedEvidence: InspectorField[] = [
    { label: 'ETA change', value: impact.shiftText, mono: true, hint: impact.eta?.estimatedArrivalUtc ? `Forecast ${formatUtc(impact.eta.estimatedArrivalUtc)}` : 'No forecast', provenance: impact.eta?.provenance },
    { label: 'Port wait input', value: wait ? `${wait.hours} h` : 'Unknown', mono: true, hint: wait ? `PORT_WAIT_UPDATED ${formatUtc(wait.asOfUtc)}` : 'No port-wait update at this time' },
    {
      label: 'Last position report',
      value: vessel?.sourceTimeMs ? formatTimestampFreshness(vessel.sourceTimeMs, t) : 'No report',
      mono: true,
      hint: vessel ? sentenceCase(vessel.state.replace('-', ' ')) : undefined,
    },
    { label: 'Weather intersection', value: impact.riskStyle.label, hint: risk?.rationale[0] ?? impact.riskSummary, provenance: impact.riskProvenance },
  ];

  const timeline: TimelineRow[] = [];
  const seen = new Set<string>();
  for (const key of [`incident:${incidentId}`, `voyage:${inc.voyageId}`]) {
    for (const e of c.eventsByEntity.get(key) ?? []) {
      const ms = c.eventMs.get(e.eventId) ?? Infinity;
      if (seen.has(e.eventId) || ms > t || ms < opened - 24 * 3600_000) continue;
      if (key.startsWith('voyage') && e.type === 'AIS_REPORT') continue;
      seen.add(e.eventId);
      const ref = e.entityRefs.find((r) => r.kind === 'incident') ?? e.entityRefs.find((r) => r.kind === 'port') ?? e.entityRefs[0] ?? null;
      timeline.push({ key: e.eventId, kind: 'fixture', utcText: formatUtc(e.occurredAtUtc), localText: formatLocal(e.occurredAtUtc, tz), label: describeEvent(e, c), detail: `${e.eventId} · ${e.quality}`, actor: null, ref });
    }
  }
  timeline.sort((a, b) => (a.utcText < b.utcText ? -1 : a.utcText > b.utcText ? 1 : a.key.localeCompare(b.key)));
  const audit = auditFor(c, wf, { kind: 'incident', id: incidentId }).reverse();
  if (!snap.isHistorical) for (const a of audit) timeline.push(auditRow(c, a, tz));

  const status = st.status;
  const verify = priority?.needsVerification ?? true;
  const transitions = transitionsFrom(status).map((rule) => ({ rule, check: checkTransition(status, rule.id, user, rule.id === 'resolve' || rule.id === 'reopen' ? { note: 'x', resolution: { reason: 'berth_confirmed', evidenceNote: 'x', simulationAck: true } } : {}) }));

  const related = (c.incidentsByVoyage.get(inc.voyageId) ?? [])
    .filter((i) => i.incidentId !== incidentId && snap.incidents.get(i.incidentId)?.visible)
    .map((i) => ({ incidentId: i.incidentId, title: i.title, style: statusStyle('incident', snap.incidents.get(i.incidentId)!.status) }));

  const tasks = wf.tasks.filter((x) => x.relatedIncidentId === incidentId).map((x) => taskRow(c, x, t));
  const shift = impact.eta?.etaShiftMinutes ?? null;
  const effectText =
    shift === null
      ? `The effect on arrival at ${destName} cannot be computed: no usable ETA forecast.`
      : `Forecast arrival at ${destName} is ${formatDuration(shift, { signed: true })} against plan while the vessel is associated with ${portName}. Estimated exposure ${impact.exposureText === 'Unavailable' ? 'is unavailable (no daily rate)' : impact.exposureText}.`;

  return {
    incident: inc,
    state: st,
    vesselName: c.byId.vessel.get(inc.vesselId)?.name ?? inc.vesselId,
    portName,
    portTimeZone: tz,
    severityStyle: statusStyle('severity', inc.severity),
    statusStyle: statusStyle('incident', status),
    confidenceStyle: statusStyle('confidence', impact.eta?.confidence ?? 'unknown'),
    ageText: st.visible ? `Open ${formatDuration(Math.max(0, (t - opened) / 60_000))}` : 'Not yet opened',
    ownerName: userName(st.ownerUserId),
    dueText: local?.dueAtUtc ? formatUtc(local.dueAtUtc) : null,
    needsVerification: verify,
    priority,
    effectText,
    causeText: `Detected by rule "${String(c.events.find((e) => e.type === 'INCIDENT_OPENED' && e.payload.incidentId === incidentId)?.payload.ruleKey ?? inc.category).replace(/_/g, ' ')}". Cause not confirmed: the evidence shows an anchorage wait and revised forecasts, not why the berth slot moved.`,
    impact,
    related,
    facts: [
      { label: 'Category', value: sentenceCase(inc.category) },
      { label: 'Detected', value: formatUtc(inc.detectedAtUtc), mono: true },
      { label: 'Opened', value: formatUtc(inc.openedAtUtc), mono: true, hint: formatLocal(inc.openedAtUtc, tz) },
      { label: 'Owner', value: userName(st.ownerUserId), hint: local?.dueAtUtc ? `Due ${formatUtc(local.dueAtUtc)}` : undefined },
      { label: 'Port', value: portName },
    ],
    evidence,
    evidenceHidden,
    computedEvidence,
    timeline,
    localHiddenInReplay: snap.isHistorical ? audit.length : 0,
    tasks,
    drafts: wf.drafts.filter((d) => d.relatedEntityIds.some((r) => r.kind === 'incident' && r.id === incidentId)),
    decisions: wf.decisions.filter((d) => d.incidentId === incidentId || d.voyageId === inc.voyageId),
    notes: (local?.notes ?? []).map((n) => ({ noteId: n.noteId, author: userName(n.authorUserId), atText: formatUtc(n.simulatedAtUtc), text: n.text })),
    resolutionText: local?.resolution ? `${local.resolution.evidenceNote || 'Resolved in simulation (no external confirmation).'}` : null,
    transitions,
    can: {
      assign: permissionCheck(user, PERMISSION.assign, 'assign cases'),
      note: permissionCheck(user, PERMISSION.note, 'add case notes'),
      task: permissionCheck(user, PERMISSION.task, 'create tasks or drafts'),
      propose: permissionCheck(user, PERMISSION.propose, 'propose scenario plans'),
    },
  };
}

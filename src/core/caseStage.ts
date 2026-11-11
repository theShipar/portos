import type { CaseStage, IncidentStatus, Severity } from './types';

/** V2 case lifecycle in order (D-037). `detected` precedes the case; `closed` follows review of a resolved case. */
export const CASE_STAGES: readonly CaseStage[] = ['detected', 'untriaged', 'investigating', 'optionProposed', 'approvedForSimulation', 'monitoring', 'resolved', 'closed'];

export const STAGE_LABEL: Record<CaseStage, string> = {
  detected: 'Detected',
  untriaged: 'Untriaged',
  investigating: 'Investigating',
  optionProposed: 'Option proposed',
  approvedForSimulation: 'Approved for simulation',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * Fixture vocabulary → V2 stage. "Acknowledged" meant someone took the case, which V2 calls triage, so it lands in
 * investigating; "mitigation planned" is an option proposal.
 */
export const STAGE_FROM_FIXTURE: Record<IncidentStatus, CaseStage> = {
  open: 'untriaged',
  acknowledged: 'investigating',
  investigating: 'investigating',
  mitigation_planned: 'optionProposed',
  monitoring: 'monitoring',
  resolved: 'resolved',
};

/** Resolved and closed cases leave queues, counts and map halos. */
export const isClosedStage = (s: CaseStage): boolean => s === 'resolved' || s === 'closed';
/** A case exists and still needs attention. */
export const isActiveStage = (s: CaseStage): boolean => s !== 'detected' && !isClosedStage(s);

export const SEVERITY_ORDER: readonly Severity[] = ['medium', 'high', 'critical'];
export const severityRank = (s: Severity): number => SEVERITY_ORDER.indexOf(s);

import type { BerthBooking, DcsaClassifier } from '@/core/types';
import { milestoneMs } from './berthTimeline';

export type ServiceStepStatus = 'actual' | 'inProgress' | 'planned' | 'requested' | 'forecast' | 'missed' | 'unconfirmed' | 'notRecorded' | 'notInDataset';

export interface ServiceStep {
  key: 'pilotBoarding' | 'towage' | 'mooring' | 'berthArrival' | 'cargoOperations' | 'berthDeparture';
  label: string;
  status: ServiceStepStatus;
  atMs: number | null;
  classifier: DcsaClassifier | null;
  note: string;
}

/**
 * DCSA-style service chain of one port call at `t`, from the E/R/P/A milestones in the record. A planned time
 * that passed without an actual is `missed`; a berth arrival with only an estimate is `unconfirmed` (never shown as
 * availability). Services the dataset does not carry (towage, mooring) are listed as not in the dataset.
 */
export function serviceChain(b: BerthBooking, t: number): ServiceStep[] {
  const arr = { act: milestoneMs(b, 'ARRIVAL', 'ACT', t), pln: milestoneMs(b, 'ARRIVAL', 'PLN', t), req: milestoneMs(b, 'ARRIVAL', 'REQ', t), est: milestoneMs(b, 'ARRIVAL', 'EST', t) };
  const dep = { act: milestoneMs(b, 'DEPARTURE', 'ACT', t), pln: milestoneMs(b, 'DEPARTURE', 'PLN', t), est: milestoneMs(b, 'DEPARTURE', 'EST', t) };
  const pbp = { act: milestoneMs(b, 'ARRIVAL', 'ACT', t, 'PBP'), est: milestoneMs(b, 'ARRIVAL', 'EST', t, 'PBP') };
  const arrived = arr.act !== null || b.status === 'awaiting_berth' || b.status === 'at_berth';

  const pilot: ServiceStep =
    pbp.act !== null
      ? { key: 'pilotBoarding', label: 'Pilot boarding', status: 'actual', atMs: pbp.act, classifier: 'ACT', note: 'Recorded actual.' }
      : arrived
        ? { key: 'pilotBoarding', label: 'Pilot boarding', status: 'notRecorded', atMs: null, classifier: null, note: 'Vessel is in port; boarding time not recorded.' }
        : pbp.est !== null
          ? { key: 'pilotBoarding', label: 'Pilot boarding', status: 'forecast', atMs: pbp.est, classifier: 'EST', note: 'Estimated arrival at the pilot boarding place (not a berth time).' }
          : { key: 'pilotBoarding', label: 'Pilot boarding', status: 'unconfirmed', atMs: null, classifier: null, note: 'No pilot boarding estimate.' };

  let berth: ServiceStep;
  if (arr.act !== null) berth = { key: 'berthArrival', label: 'Berth arrival', status: 'actual', atMs: arr.act, classifier: 'ACT', note: 'Alongside.' };
  else if (arr.pln !== null && arr.pln < t) berth = { key: 'berthArrival', label: 'Berth arrival', status: 'missed', atMs: arr.pln, classifier: 'PLN', note: 'Planned time passed without a recorded arrival.' };
  else if (arr.pln !== null) berth = { key: 'berthArrival', label: 'Berth arrival', status: 'planned', atMs: arr.pln, classifier: 'PLN', note: arr.est !== null && arr.est !== arr.pln ? 'Planned slot; the estimate differs.' : 'Planned slot.' };
  else if (arr.req !== null) berth = { key: 'berthArrival', label: 'Berth arrival', status: 'requested', atMs: arr.req, classifier: 'REQ', note: 'Requested, not yet planned by the terminal.' };
  else berth = { key: 'berthArrival', label: 'Berth arrival', status: 'unconfirmed', atMs: arr.est, classifier: arr.est !== null ? 'EST' : null, note: arr.est !== null ? 'Unconfirmed slot: an estimate only, not a planned or confirmed berth time.' : 'Unconfirmed slot: no berth time recorded.' };

  const cargo: ServiceStep =
    dep.act !== null
      ? { key: 'cargoOperations', label: 'Cargo operations', status: 'actual', atMs: arr.act, classifier: 'ACT', note: 'Completed.' }
      : arr.act !== null
        ? { key: 'cargoOperations', label: 'Cargo operations', status: 'inProgress', atMs: arr.act, classifier: 'ACT', note: 'Alongside since the recorded arrival.' }
        : { key: 'cargoOperations', label: 'Cargo operations', status: berth.status === 'planned' ? 'planned' : 'unconfirmed', atMs: null, classifier: null, note: 'Starts after berthing.' };

  let depart: ServiceStep;
  if (dep.act !== null) depart = { key: 'berthDeparture', label: 'Berth departure', status: 'actual', atMs: dep.act, classifier: 'ACT', note: 'Departed.' };
  else if (dep.pln !== null && dep.pln < t) depart = { key: 'berthDeparture', label: 'Berth departure', status: 'missed', atMs: dep.pln, classifier: 'PLN', note: 'Planned departure passed without a recorded departure.' };
  else if (dep.pln !== null) depart = { key: 'berthDeparture', label: 'Berth departure', status: 'planned', atMs: dep.pln, classifier: 'PLN', note: 'Planned.' };
  else depart = { key: 'berthDeparture', label: 'Berth departure', status: dep.est !== null ? 'forecast' : 'unconfirmed', atMs: dep.est, classifier: dep.est !== null ? 'EST' : null, note: dep.est !== null ? 'Estimate only.' : 'No departure time recorded.' };

  const missing = (key: 'towage' | 'mooring', label: string): ServiceStep => ({ key, label, status: 'notInDataset', atMs: null, classifier: null, note: `${label} is not in the simulated dataset.` });
  return [pilot, missing('towage', 'Towage'), missing('mooring', 'Mooring'), berth, cargo, depart];
}

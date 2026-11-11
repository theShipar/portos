import { formatCount, formatHours, formatPercent, formatUsd } from '@/core/format';
import type { Kpi, KpiKey } from '@/engines/kpis';
import type { Provenance } from '@/engines/provenance';
import type { StatusTone } from '@/styles/tokens';
import type { PortViewModel } from './port';

/** The map KPI rail shows at most this many values (V2 spec 13). */
export const KPI_RAIL_MAX = 4;
export const DEFAULT_RAIL_KEYS: KpiKey[] = ['trackedVessels', 'delayedVoyages', 'atRiskVoyages', 'exposureUsd'];

export interface RailCell {
  key: string;
  label: string;
  valueText: string;
  /** Short context after the value, e.g. `tracked · 50 in scope`. */
  contextText: string;
  ariaLabel: string;
  tone?: StatusTone;
  provenance?: Provenance;
}

export function kpiValueText(k: Kpi): string {
  if (k.unit === 'usd') return formatUsd(k.value, { compact: true });
  if (k.unit === 'fraction') return formatPercent(k.value);
  return formatCount(k.value);
}

function context(k: Kpi): string {
  const den = k.denominator === undefined ? null : formatCount(k.denominator);
  switch (k.key) {
    case 'trackedVessels':
      return den ? `tracked · ${den} in scope` : 'tracked';
    case 'delayedVoyages':
    case 'atRiskVoyages':
    case 'onTimeForecastRate':
      return den ? `of ${den} voyages` : '';
    case 'underwayVessels':
      return den ? `of ${den} vessels` : '';
    case 'exposureUsd':
      return 'modelled';
    case 'unresolvedIncidents':
      return 'actionable';
  }
}

const RAIL_LABEL: Partial<Record<KpiKey, string>> = { trackedVessels: 'Vessels', exposureUsd: 'Exposure' };

/** Rail cells for the scope KPIs: at most four, in the requested order. */
export function kpiRailCells(kpis: Kpi[], keys: KpiKey[] = DEFAULT_RAIL_KEYS): RailCell[] {
  return keys
    .slice(0, KPI_RAIL_MAX)
    .map((key) => kpis.find((k) => k.key === key))
    .filter((k): k is Kpi => !!k)
    .map((k) => {
      const valueText = kpiValueText(k);
      const contextText = context(k);
      const label = RAIL_LABEL[k.key] ?? k.label;
      return { key: k.key, label, valueText, contextText, ariaLabel: `${label}: ${valueText}${contextText ? ` ${contextText}` : ''}. Show definition, source and members` };
    });
}

const LEVEL: Record<PortViewModel['congestion']['level'], { label: string; tone: StatusTone }> = {
  normal: { label: 'Normal', tone: 'info' },
  elevated: { label: 'Elevated', tone: 'warning' },
  critical: { label: 'Critical', tone: 'critical' },
  unknown: { label: 'Unknown', tone: 'unknown' },
};

/** Port rail: queue (with anchored count), arrivals, median known wait, congestion. */
export function portRailCells(vm: PortViewModel): RailCell[] {
  const k = vm.kpis;
  const cg = vm.congestion;
  const cells: RailCell[] = [
    { key: 'queue', label: 'Berth queue', valueText: formatCount(k.awaitingBerth), contextText: `${formatCount(k.atAnchor)} at anchor`, ariaLabel: '', provenance: k.queueProvenance },
    { key: 'arrivals', label: 'Arrivals 24 h', valueText: formatCount(k.arrivalsNext24h), contextText: 'scheduled', ariaLabel: '' },
    { key: 'wait', label: 'Median wait', valueText: formatHours(k.medianKnownWaitHours), contextText: `${k.waitSampleSize}/${k.awaitingBerth} known`, ariaLabel: '', provenance: k.waitProvenance },
    { key: 'congestion', label: 'Congestion', valueText: LEVEL[cg.level].label, contextText: cg.score0to100 === null ? '' : `${cg.score0to100}/100`, ariaLabel: '', tone: LEVEL[cg.level].tone, provenance: cg.provenance },
  ];
  return cells.map((c) => ({ ...c, ariaLabel: `${c.label}: ${c.valueText}${c.contextText ? ` ${c.contextText}` : ''}` }));
}

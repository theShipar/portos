import { formatHours, formatNm, formatUsd } from '@/core/format';
import type { Confidence } from '@/core/types';
import type { ScenarioComparison, ScenarioOption } from '@/engines/scenario';

/** Decision compare shows the baseline and at most two proposals side by side (V2 spec 13: 2–3 columns). */
export const DECISION_COLUMNS_MAX = 3;
export const NOT_CONFIRMED_TEXT = 'Simulated outcomes, not confirmed. Nothing here changes a route, ETA or external system.';

export interface DeltaBar {
  /** Signed delta vs baseline; null when either side is unknown. */
  delta: number | null;
  text: string;
  /** 0–50: half-width share of the chart (the axis sits at the centre). */
  widthPct: number;
  direction: 'better' | 'worse' | 'same' | 'unknown';
}

export interface DecisionColumn {
  optionId: ScenarioOption['optionId'];
  name: string;
  role: 'original' | 'proposed';
  roleLabel: string;
  delayText: string;
  exposureText: string;
  distanceText: string;
  confidence: Confidence;
  delayBar: DeltaBar;
  exposureBar: DeltaBar;
}

export interface DecisionCompareView {
  columns: DecisionColumn[];
  assumptions: string[];
  footnote: string;
}

function bar(delta: number | null, scale: number, text: (d: number) => string): DeltaBar {
  if (delta === null) return { delta, text: 'n/a', widthPct: 0, direction: 'unknown' };
  if (delta === 0) return { delta, text: 'same', widthPct: 0, direction: 'same' };
  return { delta, text: text(delta), widthPct: scale > 0 ? Math.min(50, (Math.abs(delta) / scale) * 50) : 0, direction: delta < 0 ? 'better' : 'worse' };
}

export function decisionCompareView(cmp: ScenarioComparison): DecisionCompareView | null {
  const base = cmp.options.find((o) => o.optionId === 'baseline');
  if (!base) return null;
  const proposals = cmp.options.filter((o) => o.optionId !== 'baseline' && o.feasible).slice(0, DECISION_COLUMNS_MAX - 1);
  const shown = [base, ...proposals];
  const hScale = Math.max(0, ...proposals.map((o) => Math.abs(o.diffVsBaseline.hours ?? 0)));
  const uScale = Math.max(0, ...proposals.map((o) => Math.abs(o.diffVsBaseline.usd ?? 0)));
  const usdText = (d: number) => `${d > 0 ? '+' : '−'}${formatUsd(Math.abs(d))}`;
  const columns = shown.map<DecisionColumn>((o) => {
    const original = o.optionId === 'baseline';
    return {
      optionId: o.optionId,
      name: o.name,
      role: original ? 'original' : 'proposed',
      roleLabel: original ? 'Original plan' : 'Proposed · simulated',
      delayText: formatHours(o.etaDeltaHours, { signed: true }),
      exposureText: o.exposureUsd === null ? 'Unavailable' : formatUsd(o.exposureUsd),
      distanceText: o.extraDistanceNm ? `+${formatNm(o.extraDistanceNm)}` : '0 nm',
      confidence: o.confidence,
      delayBar: original ? { delta: 0, text: 'reference', widthPct: 0, direction: 'same' } : bar(o.diffVsBaseline.hours, hScale, (d) => formatHours(d, { signed: true })),
      exposureBar: original ? { delta: 0, text: 'reference', widthPct: 0, direction: 'same' } : bar(o.diffVsBaseline.usd, uScale, usdText),
    };
  });
  const assumptions = [...new Set(shown.flatMap((o) => o.assumptions))].slice(0, 4);
  return { columns, assumptions, footnote: NOT_CONFIRMED_TEXT };
}

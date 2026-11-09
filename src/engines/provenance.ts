import { parseUtc, toIsoUtc } from '@/core/time';
import type { Confidence } from '@/core/types';

/** Where a number comes from. Every displayed metric carries exactly one. */
export type SourceClass = 'simulated-fixture' | 'derived-model' | 'user-scenario';
export const SOURCE_CLASS_LABEL: Record<SourceClass, string> = {
  'simulated-fixture': 'Simulated fixture',
  'derived-model': 'Derived model',
  'user-scenario': 'User scenario',
};

/** Observed, estimated, scenario and unknown values are never merged into one undifferentiated number. */
export type EvidenceKind = 'observed' | 'estimated' | 'scenario' | 'unknown';
export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  observed: 'Observed (simulated report)',
  estimated: 'Estimated',
  scenario: 'Scenario assumption',
  unknown: 'Unknown',
};

export type Freshness = 'fresh' | 'aging' | 'stale' | 'unknown';
export type FeedKind = 'position' | 'eta' | 'portWait' | 'berth' | 'weather' | 'snapshot';

/** Age limits in minutes per feed (declared thresholds; values past `stale` are flagged, never hidden). */
export const FRESHNESS_LIMITS_MIN: Record<FeedKind, { aging: number; stale: number }> = {
  position: { aging: 15, stale: 30 },
  eta: { aging: 6 * 60, stale: 24 * 60 },
  portWait: { aging: 6 * 60, stale: 24 * 60 },
  berth: { aging: 2 * 60, stale: 12 * 60 },
  weather: { aging: 6 * 60, stale: 12 * 60 },
  snapshot: { aging: Number.POSITIVE_INFINITY, stale: Number.POSITIVE_INFINITY },
};

export interface SourceRef {
  kind: 'event' | 'record' | 'engine' | 'assumption';
  id: string;
  label: string;
  atUtc?: string | null;
}

export interface Provenance {
  sourceClass: SourceClass;
  evidence: EvidenceKind;
  /** One-line description of how the value is produced. */
  method: string;
  asOfUtc: string | null;
  ageMinutes: number | null;
  freshness: Freshness;
  confidence: Confidence;
  formula?: string;
  sources: SourceRef[];
  assumptions: string[];
  warnings: string[];
}

export function freshnessOf(feed: FeedKind, asOf: string | number | null, nowMs: number): { ageMinutes: number | null; freshness: Freshness } {
  const ms = typeof asOf === 'number' ? asOf : parseUtc(asOf);
  if (ms === null) return { ageMinutes: null, freshness: 'unknown' };
  const ageMinutes = Math.max(0, Math.round((nowMs - ms) / 60_000));
  const lim = FRESHNESS_LIMITS_MIN[feed];
  return { ageMinutes, freshness: ageMinutes > lim.stale ? 'stale' : ageMinutes > lim.aging ? 'aging' : 'fresh' };
}

export interface ProvenanceInput {
  sourceClass: SourceClass;
  evidence: EvidenceKind;
  method: string;
  feed: FeedKind;
  asOf: string | number | null;
  nowMs: number;
  confidence: Confidence;
  formula?: string;
  sources?: SourceRef[];
  assumptions?: string[];
  warnings?: string[];
}

export function makeProvenance(i: ProvenanceInput): Provenance {
  const f = freshnessOf(i.feed, i.asOf, i.nowMs);
  const asOfMs = typeof i.asOf === 'number' ? i.asOf : parseUtc(i.asOf);
  const warnings = [...(i.warnings ?? [])];
  if (f.freshness === 'stale') warnings.push(`Input older than the ${FRESHNESS_LIMITS_MIN[i.feed].stale} min ${i.feed} freshness limit.`);
  return {
    sourceClass: i.sourceClass,
    evidence: i.evidence,
    method: i.method,
    asOfUtc: asOfMs === null ? null : toIsoUtc(asOfMs),
    ageMinutes: f.ageMinutes,
    freshness: f.freshness,
    confidence: i.confidence,
    formula: i.formula,
    sources: i.sources ?? [],
    assumptions: i.assumptions ?? [],
    warnings,
  };
}

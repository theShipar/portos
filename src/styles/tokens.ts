import raw from './tokens.json';
import type { BerthStatus, Confidence, IncidentStatus, NavStatus, Severity } from '@/core/types';

export const tokens = raw;

/** Spec-only roles kept alongside tokens.json (DECISIONS D-002). */
export const mapColors = {
  ocean: raw.surface.mapOcean,
  oceanMid: '#102837',
  land: raw.surface.mapLand,
  landOutline: '#4D6974',
  routeBase: '#82B8C9',
  routeSelected: '#FF905B',
  accent: raw.brand.accent,
  info: '#2E658B',
} as const;

export type StatusTone = 'healthy' | 'warning' | 'critical' | 'unknown' | 'info' | 'selected' | 'neutral';

export interface StatusStyle {
  tone: StatusTone;
  label: string;
  /** Glyph name from components/ui/Icon.vue. */
  icon: 'check' | 'alert' | 'octagon' | 'question' | 'info' | 'dot' | 'anchor' | 'clock' | 'ship' | 'user';
}

export const toneColor: Record<StatusTone, string> = {
  healthy: raw.status.healthy,
  warning: raw.status.warning,
  critical: raw.status.critical,
  unknown: raw.status.unknown,
  info: '#2E658B',
  selected: raw.status.selected,
  neutral: raw.ink.secondary,
};

const NAV: Record<NavStatus, StatusStyle> = {
  underway: { tone: 'healthy', label: 'Underway', icon: 'dot' },
  at_anchor: { tone: 'info', label: 'At anchor', icon: 'anchor' },
  moored: { tone: 'neutral', label: 'Moored', icon: 'anchor' },
  not_under_command: { tone: 'critical', label: 'Not under command', icon: 'octagon' },
  unknown: { tone: 'unknown', label: 'Unknown', icon: 'question' },
};

const SEVERITY: Record<Severity, StatusStyle> = {
  medium: { tone: 'warning', label: 'Medium', icon: 'alert' },
  high: { tone: 'critical', label: 'High', icon: 'alert' },
  critical: { tone: 'critical', label: 'Critical', icon: 'octagon' },
};

const INCIDENT: Record<IncidentStatus, StatusStyle> = {
  open: { tone: 'critical', label: 'Open', icon: 'alert' },
  acknowledged: { tone: 'warning', label: 'Acknowledged', icon: 'check' },
  investigating: { tone: 'warning', label: 'Investigating', icon: 'clock' },
  mitigation_planned: { tone: 'info', label: 'Mitigation planned', icon: 'info' },
  monitoring: { tone: 'info', label: 'Monitoring', icon: 'clock' },
  resolved: { tone: 'healthy', label: 'Resolved', icon: 'check' },
};

const BERTH: Record<BerthStatus, StatusStyle> = {
  occupied: { tone: 'neutral', label: 'Occupied', icon: 'anchor' },
  scheduled: { tone: 'info', label: 'Scheduled', icon: 'clock' },
  unavailable: { tone: 'critical', label: 'Unavailable', icon: 'octagon' },
  free: { tone: 'healthy', label: 'Free', icon: 'check' },
  unknown: { tone: 'unknown', label: 'Unknown', icon: 'question' },
};

const CONFIDENCE: Record<Confidence, StatusStyle> = {
  high: { tone: 'healthy', label: 'High confidence', icon: 'check' },
  medium: { tone: 'warning', label: 'Medium confidence', icon: 'info' },
  low: { tone: 'critical', label: 'Low confidence', icon: 'alert' },
  unknown: { tone: 'unknown', label: 'Unknown confidence', icon: 'question' },
};

export type StatusDomain = 'nav' | 'severity' | 'incident' | 'berth' | 'confidence';

/** Status → token/icon/label tuple. Components never pick raw hex for a status. */
export function statusStyle(domain: StatusDomain, value: string): StatusStyle {
  const table = { nav: NAV, severity: SEVERITY, incident: INCIDENT, berth: BERTH, confidence: CONFIDENCE }[domain] as Record<string, StatusStyle>;
  return table[value] ?? { tone: 'unknown', label: value || 'Unknown', icon: 'question' };
}

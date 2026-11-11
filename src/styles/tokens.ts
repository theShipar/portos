import kit from './tokens.json';
import v2 from './tokens.v2.json';
import v3 from './tokens.v3.json';
import { flags } from '@/core/flags';
import { STAGE_LABEL } from '@/core/caseStage';
import type { BerthStatus, CaseStage, Confidence, NavStatus, Severity } from '@/core/types';

/** True when the V3 graphite/teal palette is active (D-041); V2 (D-038) otherwise. */
export const V3 = flags.v3Glass;
const c3 = v3.colors;

/**
 * Colour roles for TypeScript consumers (Three scenes, MapLibre styles). The shape follows the kit tokens.json so
 * callers did not change; `disclosure` still comes from the kit.
 */
export const tokens = V3
  ? ({
      brand: { accent: c3.selection, accentHover: c3.selectionHover, accentSubtle: c3.selectionSubtle },
      surface: { app: c3.canvas, panel: c3.surface1, panelSecondary: c3.surface2, border: '#2A3B3E', mapOcean: v3.map.ocean, mapLand: v3.map.land },
      ink: { primary: c3.textPrimary, secondary: c3.textSecondary, muted: c3.textMuted, onDark: c3.textPrimary },
      status: { healthy: c3.success, warning: c3.warning, critical: c3.danger, unknown: c3.unknown, selected: c3.selection },
      data: { observed: v3.data.observed, planned: v3.data.planned, uncertain: v3.data.uncertain },
      disclosure: kit.disclosure,
    } as const)
  : ({
      brand: { accent: v2.accent.focus, accentHover: v2.accent.focusHover, accentSubtle: v2.accent.focusSubtle },
      surface: { app: v2.surface.app, panel: v2.surface.panel, panelSecondary: v2.surface.muted, border: v2.line.default, mapOcean: v2.map.ocean, mapLand: v2.map.land },
      ink: { primary: v2.text.primary, secondary: v2.text.secondary, muted: v2.text.muted, onDark: v2.text.onDark },
      status: { healthy: v2.state.success, warning: v2.state.warning, critical: v2.state.critical, unknown: v2.state.unknown, selected: v2.accent.focus },
      data: v2.data,
      disclosure: kit.disclosure,
    } as const);

export const mapColors = V3
  ? ({
      ocean: v3.map.ocean,
      oceanMid: v3.map.oceanMid,
      land: v3.map.land,
      landOutline: v3.map.landOutline,
      routeBase: v3.map.routeBase,
      routeSelected: c3.selection,
      accent: c3.selection,
      info: c3.info,
    } as const)
  : ({
      ocean: v2.map.ocean,
      oceanMid: v2.map.oceanMid,
      land: v2.map.land,
      landOutline: v2.map.landOutline,
      routeBase: v2.map.routeBase,
      routeSelected: v2.accent.focus,
      accent: v2.accent.focus,
      info: v2.state.info,
    } as const);

/** Chart series colours (V3 data visual language, spec 02/09); categorical, never a status. */
export const seriesColors: readonly string[] = V3 ? v3.data.series : [v2.data.observed, v2.data.planned, v2.state.info, v2.state.warning, v2.data.uncertain, v2.state.critical];

export type StatusTone = 'healthy' | 'warning' | 'critical' | 'unknown' | 'info' | 'selected' | 'neutral';

export interface StatusStyle {
  tone: StatusTone;
  label: string;
  /** Glyph name from components/ui/Icon.vue. */
  icon: 'check' | 'alert' | 'octagon' | 'question' | 'info' | 'dot' | 'anchor' | 'clock' | 'ship' | 'user';
}

export const toneColor: Record<StatusTone, string> = {
  healthy: tokens.status.healthy,
  warning: tokens.status.warning,
  critical: tokens.status.critical,
  unknown: tokens.status.unknown,
  info: V3 ? c3.info : v2.state.info,
  selected: tokens.status.selected,
  neutral: tokens.ink.secondary,
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

const INCIDENT: Record<CaseStage, StatusStyle> = {
  detected: { tone: 'unknown', label: STAGE_LABEL.detected, icon: 'info' },
  untriaged: { tone: 'critical', label: STAGE_LABEL.untriaged, icon: 'alert' },
  investigating: { tone: 'warning', label: STAGE_LABEL.investigating, icon: 'clock' },
  optionProposed: { tone: 'info', label: STAGE_LABEL.optionProposed, icon: 'info' },
  approvedForSimulation: { tone: 'info', label: STAGE_LABEL.approvedForSimulation, icon: 'check' },
  monitoring: { tone: 'info', label: STAGE_LABEL.monitoring, icon: 'clock' },
  resolved: { tone: 'healthy', label: STAGE_LABEL.resolved, icon: 'check' },
  closed: { tone: 'neutral', label: STAGE_LABEL.closed, icon: 'check' },
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

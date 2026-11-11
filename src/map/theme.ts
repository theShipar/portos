import { Color } from 'three';
import { mapColors, tokens } from '@/styles/tokens';

/**
 * portosMapTheme — the single colour entry for Three scenes (replaces the skill's mapTheme.ts green HUD roles).
 * Derived from tokens.json; see DECISIONS D-001/D-002.
 */
export const portosMapTheme = {
  space: new Color('#03080d'),
  ocean: new Color(mapColors.ocean),
  oceanMid: new Color(mapColors.oceanMid),
  oceanHighlight: new Color('#7fa7bd'),
  land: new Color(mapColors.land),
  landLight: new Color('#30505e'),
  landOutline: new Color(mapColors.landOutline),
  grid: new Color('#5d7f8f'),
  atmosphere: new Color('#6f9fbf'),
  outerAtmosphere: new Color('#3d6a88'),
  regionFill: new Color('#4e7486'),
  regionOutline: new Color('#cfe1ea'),
  regionHover: new Color('#9fc1d1'),
  cityLight: new Color('#d9b48a'),
  accent: new Color(tokens.brand.accent),
  routeBase: new Color(mapColors.routeBase),
  routeSelected: new Color(mapColors.routeSelected),
  star: new Color('#c9d6df'),
  critical: new Color(tokens.status.critical),
  warning: new Color(tokens.status.warning),
  healthy: new Color(tokens.status.healthy),
  unknown: new Color(tokens.status.unknown),
  inkOnDark: new Color(tokens.ink.onDark),
} as const;

/**
 * Extruded geography (region / country / city scenes), V2 palette: ocean #071A27, land #243A42, focus #E66A2D,
 * observed #5AADB7. Context countries stay dark; in-scope land is one step lighter; only the selected feature gets a
 * lit contour.
 */
export const planarTheme = {
  ocean: new Color('#071A27'),
  oceanGrid: new Color('#1B3442'),
  land: new Color('#243A42'),
  landScope: new Color('#2F4A54'),
  landHover: new Color('#3A5A66'),
  wallTop: new Color('#3A5560'),
  wallMid: new Color('#1B3038'),
  wallBottom: new Color('#0B1E28'),
  border: new Color('#5AADB7'),
  coast: new Color('#8FB7C2'),
  contour: new Color('#E66A2D'),
  frame: new Color('#A6A9B4'),
} as const;

const lift = (hex: string, amount: number) => new Color(hex).lerp(new Color('#ffffff'), amount);

/**
 * Marker colours on the dark ocean. Status hues come from tokens.json, lifted toward white so they reach ≥3:1 against
 * #071A27 (DECISIONS D-009). Shape cues (incident ring, stale dimming, cluster badge) back up every colour.
 */
export const markerColors = {
  incident: lift(tokens.status.critical, 0.34),
  atRisk: lift(tokens.status.warning, 0.22),
  delayed: lift(tokens.status.warning, 0.55),
  onPlan: new Color('#d3dde3'),
  ambient: new Color('#7d93a1'),
  stale: lift(tokens.status.unknown, 0.1),
  selected: new Color(tokens.status.selected),
  route: new Color(mapColors.routeBase),
  routeFocus: new Color(mapColors.routeSelected),
  track: new Color('#c9d6df'),
  /** Reporting gap ("position unverified"): V2 uncertain tone. */
  unverified: new Color('#a6a9b4'),
  portHealthy: lift(tokens.status.healthy, 0.3),
  portWarning: lift(tokens.status.warning, 0.3),
  portCritical: lift(tokens.status.critical, 0.34),
  portUnknown: lift(tokens.status.unknown, 0.25),
  hazardModerate: lift(tokens.status.warning, 0.45),
  hazardHigh: lift(tokens.status.warning, 0.2),
  hazardSevere: lift(tokens.status.critical, 0.3),
  density: new Color('#7fb2c9'),
} as const;

export function cssHex(c: Color): string {
  return `#${c.getHexString()}`;
}

export type QualityTier = 'high' | 'standard' | 'low';

export interface QualitySettings {
  pixelRatioCap: number;
  atmosphere: boolean;
  stars: boolean;
  oceanSpecular: boolean;
  positionUpdateHz: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: { pixelRatioCap: 2, atmosphere: true, stars: true, oceanSpecular: true, positionUpdateHz: 15 },
  standard: { pixelRatioCap: 1.5, atmosphere: true, stars: true, oceanSpecular: true, positionUpdateHz: 10 },
  low: { pixelRatioCap: 1, atmosphere: false, stars: false, oceanSpecular: false, positionUpdateHz: 5 },
};

import { Color } from 'three';
import { mapColors, tokens, V3 } from '@/styles/tokens';
import v3 from '@/styles/tokens.v3.json';

const m3 = v3.map;
const pick = (v2Hex: string, v3Hex: string) => new Color(V3 ? v3Hex : v2Hex);

/**
 * portosMapTheme — the single colour entry for Three scenes (replaces the skill's mapTheme.ts green HUD roles).
 * V3 (D-041): graphite/teal ocean, softened olive land; V2 (D-038) otherwise.
 */
export const portosMapTheme = {
  space: pick('#03080d', m3.space),
  ocean: new Color(mapColors.ocean),
  oceanMid: new Color(mapColors.oceanMid),
  oceanHighlight: pick('#7fa7bd', '#7FA9AE'),
  land: new Color(mapColors.land),
  landLight: pick('#30505e', m3.landScope),
  landOutline: new Color(mapColors.landOutline),
  grid: pick('#5d7f8f', '#4F6E70'),
  atmosphere: pick('#6f9fbf', m3.atmosphere),
  outerAtmosphere: pick('#3d6a88', '#3B6268'),
  regionFill: pick('#4e7486', '#4D6A5F'),
  regionOutline: pick('#cfe1ea', '#D5E4DF'),
  regionHover: pick('#9fc1d1', '#A6C3BA'),
  cityLight: pick('#d9b48a', '#D9B48A'),
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
 * Extruded geography (region / country / city scenes). Context countries stay dark; in-scope land is one step
 * lighter; only the selected feature gets a lit contour. V3: olive land on a teal ocean, ghost neighbours as
 * wireframe; V2: ocean #071A27, land #243A42, focus #E66A2D.
 */
export const planarTheme = {
  ocean: pick('#071A27', m3.ocean),
  oceanGrid: pick('#1B3442', m3.oceanGrid),
  land: pick('#243A42', m3.land),
  landScope: pick('#2F4A54', m3.landScope),
  landHover: pick('#3A5A66', m3.landHover),
  wallTop: pick('#3A5560', m3.wallTop),
  wallMid: pick('#1B3038', m3.wallMid),
  wallBottom: pick('#0B1E28', m3.wallBottom),
  border: pick('#5AADB7', m3.border),
  coast: pick('#8FB7C2', m3.coast),
  contour: pick('#E66A2D', v3.colors.selection),
  frame: pick('#A6A9B4', '#A6A9B4'),
  ghost: pick('#4D6974', m3.ghost),
} as const;

/** V3 status hues are already light enough for the dark ocean, so they are lifted far less. */
const lift = (hex: string, amount: number) => new Color(hex).lerp(new Color('#ffffff'), V3 ? amount * 0.25 : amount);

/**
 * Marker colours on the dark ocean. Status hues come from tokens.json, lifted toward white so they reach ≥3:1 against
 * #071A27 (DECISIONS D-009). Shape cues (incident ring, stale dimming, cluster badge) back up every colour.
 */
export const markerColors = {
  incident: lift(tokens.status.critical, 0.34),
  atRisk: lift(tokens.status.warning, 0.22),
  delayed: lift(tokens.status.warning, 0.55),
  onPlan: pick('#d3dde3', '#D5E2DD'),
  ambient: pick('#7d93a1', '#7F9693'),
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

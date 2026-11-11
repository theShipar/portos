import type { ShipLod } from '../vessels3d/library';

/** Overlay detail: 0 = instanced glyphs, 1 = per-type models, 2 = per-type models with the selected ship at LOD2. */
export type VesselDetail = ShipLod;

/** Marker length in CSS px for a camera altitude above the surface (scene units, R = 2). ≈9 px Earth, 18–20 region, 34 port. */
export function markerPxForAltitude(altitude: number): number {
  const px = 20 * Math.pow(1.6 / Math.max(altitude, 0.02), 0.65);
  return Math.min(44, Math.max(7, px));
}

/** LOD by projected pixel size with hysteresis so markers do not flicker at a threshold (spec 04/02). */
export const LOD_THRESHOLDS: { up: readonly number[]; down: readonly number[] } = { up: [13, 26], down: [11, 23] };

export function nextLod(current: VesselDetail, px: number): VesselDetail {
  let lod: number = current;
  while (lod < 2 && px > LOD_THRESHOLDS.up[lod]!) lod++;
  while (lod > 0 && px < LOD_THRESHOLDS.down[lod - 1]!) lod--;
  return lod as VesselDetail;
}

/**
 * V3 per-ship LOD bands by projected (displayed) hull length in CSS px (spec 04/05):
 * < 4 dot · 4–16 oriented type icon · 16–55 low-poly model · 55–160 detailed model · > 160 inspection model.
 */
export const LOD_BANDS = ['dot', 'icon', 'lowpoly', 'detailed', 'inspection'] as const;
export type LodBand = 0 | 1 | 2 | 3 | 4;
export const BAND_THRESHOLDS_PX = [4, 16, 55, 160] as const;
/** Enter a band 15 % above its threshold, leave it 15 % below (spec: 10–20 %). */
export const BAND_HYSTERESIS = 0.15;

/** Band with no history: plain thresholds. */
export function bandFor(px: number): LodBand {
  let b = 0;
  while (b < 4 && px >= BAND_THRESHOLDS_PX[b]!) b++;
  return b as LodBand;
}

/** Band with hysteresis: a ship near a threshold keeps its band until it is clearly past it. */
export function nextBand(current: LodBand | undefined, px: number, hysteresis = BAND_HYSTERESIS): LodBand {
  if (current === undefined) return bandFor(px);
  let b: number = current;
  while (b < 4 && px > BAND_THRESHOLDS_PX[b]! * (1 + hysteresis)) b++;
  while (b > 0 && px < BAND_THRESHOLDS_PX[b - 1]! * (1 - hysteresis)) b--;
  return b as LodBand;
}

/** The selected ship may sit one band above its neighbours (spec 04/05), never below the oriented icon. */
export function selectedBand(band: LodBand): LodBand {
  return Math.min(4, Math.max(2, band + 1)) as LodBand;
}

/** Close-model budgets per frame (device budget): ships beyond the cap fall back one band. */
export const BAND_CAPS = { inspection: 2, detailed: 12 } as const;

export interface BandCandidate {
  id: string;
  band: LodBand;
  px: number;
  pinned: boolean;
}

/**
 * Enforces {@link BAND_CAPS}: pinned ships first, then the largest on screen. Inspection overflow drops to detailed,
 * detailed overflow to low-poly. Returns the final band per id.
 */
export function allocateBands(cands: readonly BandCandidate[], caps: { inspection: number; detailed: number } = BAND_CAPS): Map<string, LodBand> {
  const out = new Map<string, LodBand>();
  const byPriority = [...cands].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.px - a.px || (a.id < b.id ? -1 : 1));
  let inspect = 0;
  let detail = 0;
  for (const c of byPriority) {
    let band = c.band;
    if (band === 4 && inspect >= caps.inspection) band = 3;
    if (band === 4) inspect++;
    if (band === 3 && detail >= caps.detailed) band = 2;
    if (band === 3) detail++;
    out.set(c.id, band);
  }
  return out;
}

/** Geographic cluster cell (deg) by camera distance with hysteresis; 0 = no clustering. */
export const CLUSTER_BANDS = [
  { cellDeg: 6, enterAbove: 6.2, leaveBelow: 5.8 },
  { cellDeg: 3, enterAbove: 4.6, leaveBelow: 4.3 },
] as const;

export function nextClusterCell(current: number, distance: number): number {
  for (const b of CLUSTER_BANDS) {
    const holding = current !== 0 && current >= b.cellDeg;
    if (distance > (holding ? b.leaveBelow : b.enterAbove)) return b.cellDeg;
  }
  return 0;
}

/** Region/port stack cells (deg): powers of two so a stack splits cleanly into its halves as the camera closes in. */
export const STACK_CELLS = [1.6, 0.8, 0.4, 0.2, 0.1, 0.05, 0.025] as const;
/** Vessels sharing a stack cell before they collapse into a count badge; below this they stay individual. */
export const STACK_MIN_COUNT = 6;

/**
 * Stack cell (deg) for a target ground size, normally the span over which glyphs overlap. A held cell survives until
 * the target is 15 % larger or 60 % smaller than it, so wheel zoom does not make stacks flicker.
 */
export function nextStackCell(current: number, targetDeg: number): number {
  if (current && targetDeg <= current * 1.15 && targetDeg >= current * 0.4) return current;
  for (let i = STACK_CELLS.length - 1; i >= 0; i--) if (STACK_CELLS[i]! >= targetDeg) return STACK_CELLS[i]!;
  return STACK_CELLS[0];
}

/** Ground degrees covered by `px` CSS pixels at the view centre for a camera `distance` from the globe centre. */
export function degreesPerPx(distance: number, radius: number, pxToWorld: number): number {
  return ((pxToWorld * Math.max(distance - radius, 0.001)) / radius) * (180 / Math.PI);
}

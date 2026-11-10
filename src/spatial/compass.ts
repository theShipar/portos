/** Largest 1-2-5 × 10ⁿ length (metres) not exceeding `maxMetres`; drives the scale bar. */
export function niceScaleLength(maxMetres: number): number {
  if (!Number.isFinite(maxMetres) || maxMetres <= 0) return 0;
  const pow = 10 ** Math.floor(Math.log10(maxMetres));
  for (const m of [5, 2, 1]) if (m * pow <= maxMetres) return m * pow;
  return pow;
}

export function formatScaleLength(metres: number): string {
  return metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
}

/** Scale bar for a target width in CSS pixels at the given ground resolution. */
export function scaleBar(metresPerPx: number, targetPx = 110): { px: number; label: string } | null {
  const metres = niceScaleLength(metresPerPx * targetPx);
  if (!metres) return null;
  return { px: metres / metresPerPx, label: formatScaleLength(metres) };
}

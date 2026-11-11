import v2 from './tokens.v2.json';

/** Docked inspector width in px for a viewport width: `min(400px, 34vw)` (tokens.css `--inspector-w`). */
export function inspectorWidthPx(viewportWidth: number): number {
  return Math.round(Math.min(v2.layout.inspectorMaxPx, (viewportWidth * v2.layout.inspectorVw) / 100));
}

/** Map inset reserved on the right while the inspector is docked: its width plus the control gap on both sides. */
export function inspectorInsetPx(viewportWidth: number): number {
  return inspectorWidthPx(viewportWidth) + 24;
}

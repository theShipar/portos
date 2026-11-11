import v2 from './tokens.v2.json';
import v3 from './tokens.v3.json';
import { V3 } from './tokens';

/**
 * Docked inspector width in px for a viewport width (tokens.css `--inspector-w`):
 * V3 `clamp(360px, 29vw, 464px)`, V2 `min(400px, 34vw)`.
 */
export function inspectorWidthPx(viewportWidth: number): number {
  if (V3) {
    const { drawerMinPx, drawerMaxPx, drawerVw } = v3.layout;
    return Math.round(Math.min(drawerMaxPx, Math.max(drawerMinPx, (viewportWidth * drawerVw) / 100)));
  }
  return Math.round(Math.min(v2.layout.inspectorMaxPx, (viewportWidth * v2.layout.inspectorVw) / 100));
}

/** Map inset reserved on the right while the inspector is docked: its width plus the control gap on both sides. */
export function inspectorInsetPx(viewportWidth: number): number {
  return inspectorWidthPx(viewportWidth) + (V3 ? 2 * v3.layout.hudOffsetPx : 24);
}

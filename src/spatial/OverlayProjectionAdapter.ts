export interface ScreenPoint {
  x: number;
  y: number;
  /** False behind the globe, outside the frustum or outside the viewport margin. */
  visible: boolean;
}

/** Geographic point → canvas pixels for the active scene's camera. */
export type Projector = (lon: number, lat: number, altitudeM?: number) => ScreenPoint;

export interface OverlayAnchor {
  id: string;
  lon: number;
  lat: number;
  altitudeM?: number;
}

type Apply = (p: ScreenPoint) => void;

const HIDDEN: ScreenPoint = Object.freeze({ x: -9999, y: -9999, visible: false });

/**
 * The one bridge between 3D scenes and Vue overlays. The active scene installs its projector on activation; overlays
 * register anchors and receive pixel positions once per drawn frame, so labels never run their own loop and never
 * read a camera directly. Swapping scenes swaps the projector, not the overlays.
 */
export class OverlayProjectionAdapter {
  private projector: Projector | null = null;
  private width = 1;
  private height = 1;
  private readonly anchors = new Map<string, { anchor: OverlayAnchor; apply: Apply }>();
  private versionValue = 0;

  constructor(private readonly marginPx = 48) {}

  /** Bumps on every projector or viewport change so cached projections can be invalidated. */
  get version() {
    return this.versionValue;
  }

  get hasProjector() {
    return this.projector !== null;
  }

  setProjector(p: Projector | null) {
    this.projector = p;
    this.versionValue++;
  }

  setViewport(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.versionValue++;
  }

  project(lon: number, lat: number, altitudeM = 0): ScreenPoint {
    if (!this.projector || !Number.isFinite(lon) || !Number.isFinite(lat)) return HIDDEN;
    const p = this.projector(lon, lat, altitudeM);
    const m = this.marginPx;
    const inView = p.x >= -m && p.y >= -m && p.x <= this.width + m && p.y <= this.height + m;
    return { x: p.x, y: p.y, visible: p.visible && inView };
  }

  track(anchor: OverlayAnchor, apply: Apply): () => void {
    this.anchors.set(anchor.id, { anchor, apply });
    apply(this.project(anchor.lon, anchor.lat, anchor.altitudeM));
    return () => {
      if (this.anchors.get(anchor.id)?.apply === apply) this.anchors.delete(anchor.id);
    };
  }

  get anchorCount() {
    return this.anchors.size;
  }

  /** Re-projects every tracked anchor; called by the director after a drawn frame. Returns the visible count. */
  update(): number {
    let visible = 0;
    for (const { anchor, apply } of this.anchors.values()) {
      const p = this.project(anchor.lon, anchor.lat, anchor.altitudeM);
      if (p.visible) visible++;
      apply(p);
    }
    return visible;
  }

  clear() {
    this.anchors.clear();
  }
}

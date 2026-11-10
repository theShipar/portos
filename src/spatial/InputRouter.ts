/** Something under the pointer, resolved by the highest-priority tester that reports a hit. */
export interface HitResult<T = unknown> {
  layer: string;
  /** Stable identity used to detect hover changes (e.g. `vessel:VSL-0001`). */
  key: string;
  target: T;
}

export interface HitTester {
  layer: string;
  /** Higher wins. Vessels > ports > regions > globe surface. */
  priority: number;
  test(x: number, y: number): HitResult | null;
}

export interface PointerLike {
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  pointerType?: string;
}

interface InputEvents {
  click: (hit: HitResult | null, e: PointerLike, local: { x: number; y: number }) => void;
  hover: (hit: HitResult | null, e: PointerLike, local: { x: number; y: number }) => void;
  hoverchange: (hit: HitResult | null) => void;
  dragstart: (e: PointerLike) => void;
  leave: (e: PointerLike) => void;
}

type PointerType = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave';

export interface InputTarget {
  addEventListener(type: PointerType, fn: (e: PointerEvent) => void): void;
  removeEventListener(type: PointerType, fn: (e: PointerEvent) => void): void;
  getBoundingClientRect(): { left: number; top: number };
}

export const DRAG_THRESHOLD_PX = 5;
export const CLICK_MAX_MS = 600;

/**
 * One pointer pipeline per canvas. A press that moves more than 5 px is a drag (camera), never a click; hover is
 * coalesced to one hit test per animation frame and suppressed while a button is held; exactly one target is
 * hovered at a time, chosen by tester priority.
 */
export class InputRouter {
  private readonly testers: HitTester[] = [];
  private readonly listeners: { [K in keyof InputEvents]: Set<InputEvents[K]> } = {
    click: new Set(),
    hover: new Set(),
    hoverchange: new Set(),
    dragstart: new Set(),
    leave: new Set(),
  };
  private down: { x: number; y: number; t: number; dragging: boolean } | null = null;
  private pendingHover: PointerLike | null = null;
  private hoverKey: string | null = null;
  private enabled = true;
  private disposed = false;

  constructor(
    private readonly el: InputTarget,
    private readonly opts: { schedule?: (cb: () => void) => void; now?: () => number } = {},
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', this.onLeave);
  }

  on<K extends keyof InputEvents>(event: K, fn: InputEvents[K]): () => void {
    (this.listeners[event] as Set<InputEvents[K]>).add(fn);
    return () => (this.listeners[event] as Set<InputEvents[K]>).delete(fn);
  }

  private emit<K extends keyof InputEvents>(event: K, ...args: Parameters<InputEvents[K]>) {
    for (const fn of this.listeners[event] as Set<(...a: Parameters<InputEvents[K]>) => void>) fn(...args);
  }

  register(tester: HitTester): () => void {
    this.testers.push(tester);
    this.testers.sort((a, b) => b.priority - a.priority);
    return () => {
      const i = this.testers.indexOf(tester);
      if (i >= 0) this.testers.splice(i, 1);
    };
  }

  /** Inactive scenes and flights disable input; a pending hover is dropped and the hover target cleared. */
  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) {
      this.down = null;
      this.pendingHover = null;
      this.setHoverKey(null);
    }
  }

  get isEnabled() {
    return this.enabled;
  }

  get dragging() {
    return !!this.down?.dragging;
  }

  local(e: PointerLike) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  resolve(x: number, y: number): HitResult | null {
    for (const t of this.testers) {
      const hit = t.test(x, y);
      if (hit) return hit;
    }
    return null;
  }

  private now() {
    return this.opts.now ? this.opts.now() : performance.now();
  }

  private schedule(cb: () => void) {
    if (this.opts.schedule) this.opts.schedule(cb);
    else requestAnimationFrame(cb);
  }

  private setHoverKey(key: string | null, hit: HitResult | null = null) {
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.emit('hoverchange', hit);
  }

  private readonly onDown = (e: PointerLike) => {
    if (!this.enabled) return;
    this.down = { x: e.clientX, y: e.clientY, t: this.now(), dragging: false };
  };

  private readonly onMove = (e: PointerLike) => {
    if (!this.enabled) return;
    const d = this.down;
    if (d && e.buttons) {
      if (!d.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD_PX) {
        d.dragging = true;
        this.pendingHover = null;
        this.setHoverKey(null);
        this.emit('dragstart', e);
      }
      return;
    }
    const first = this.pendingHover === null;
    this.pendingHover = e;
    if (!first) return;
    this.schedule(() => {
      const ev = this.pendingHover;
      this.pendingHover = null;
      if (!ev || this.disposed || !this.enabled) return;
      const p = this.local(ev);
      const hit = this.resolve(p.x, p.y);
      this.setHoverKey(hit?.key ?? null, hit);
      this.emit('hover', hit, ev, p);
    });
  };

  private readonly onUp = (e: PointerLike) => {
    const d = this.down;
    this.down = null;
    if (!this.enabled || !d || e.button !== 0 || d.dragging) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD_PX || this.now() - d.t > CLICK_MAX_MS) return;
    const p = this.local(e);
    this.emit('click', this.resolve(p.x, p.y), e, p);
  };

  private readonly onLeave = (e: PointerLike) => {
    this.pendingHover = null;
    this.setHoverKey(null);
    this.emit('leave', e);
  };

  dispose() {
    this.disposed = true;
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointerleave', this.onLeave);
    this.testers.length = 0;
    for (const s of Object.values(this.listeners)) s.clear();
  }
}

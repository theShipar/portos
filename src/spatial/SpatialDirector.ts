import { SceneCache } from './SceneCache';
import type { CameraState, FlightOutcome, FlightPhase, FrameContext, SceneFactory, SceneTarget, SpatialScene } from './types';

/** Hooks for a cross-scene transition (the Earth → geography bridge in Phase 3). Each resolves false when cancelled. */
export interface TransitionPlan {
  /** Runs on the outgoing scene before the swap (e.g. globe focus + dive). */
  fly?(signal: AbortSignal): Promise<boolean>;
  /** Runs while both scenes are alive, after the incoming scene drew its static frame (crossfade). */
  handoff?(signal: AbortSignal): Promise<boolean>;
  /** Runs on the incoming scene after it became active. */
  settle?(signal: AbortSignal): Promise<boolean>;
}

export type TransitionPlanner = (from: { scene: SpatialScene; target: SceneTarget } | null, to: { scene: SpatialScene; target: SceneTarget }) => TransitionPlan | null;

export interface FrameScheduler {
  request(cb: (now: number) => void): number;
  cancel(id: number): void;
}

const rafScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

interface DirectorEvents {
  phase: (phase: FlightPhase, target: SceneTarget | null) => void;
  active: (scene: SpatialScene, target: SceneTarget) => void;
  error: (error: Error, target: SceneTarget) => void;
  frame: (ctx: FrameContext, drew: boolean) => void;
}

export interface DirectorState {
  phase: FlightPhase;
  activeSceneKey: string | null;
  activeKind: SceneTarget['kind'] | null;
  activeFocusId: string | null;
  pendingFocusId: string | null;
  lastOutcome: FlightOutcome | null;
  lastError: string | null;
  flights: number;
  cancelled: number;
}

export const targetKey = (t: SceneTarget) => `${t.sceneKey}|${t.focusId}`;

/**
 * Single owner of the render loop, the active scene and the camera. Scope changes become flights through fixed
 * phases (preparing → flying → handoff → settling → idle); a new navigation aborts the one in progress, which is how
 * Back works mid-flight. Errors before the handoff keep the previous scene on screen.
 */
export class SpatialDirector {
  readonly cache: SceneCache;
  private readonly factory: SceneFactory;
  private readonly planner: TransitionPlanner | null;
  private readonly scheduler: FrameScheduler;
  private readonly listeners: { [K in keyof DirectorEvents]: Set<DirectorEvents[K]> } = { phase: new Set(), active: new Set(), error: new Set(), frame: new Set() };
  private readonly memory = new Map<string, CameraState>();
  private active: SpatialScene | null = null;
  private activeTarget: SceneTarget | null = null;
  private pending: { ctrl: AbortController; target: SceneTarget } | null = null;
  private phaseValue: FlightPhase = 'idle';
  private raf = 0;
  private lastFrame = 0;
  private running = false;
  private disposed = false;
  private lastOutcome: FlightOutcome | null = null;
  private lastError: string | null = null;
  private flights = 0;
  private cancelled = 0;

  constructor(opts: { factory: SceneFactory; cache?: SceneCache; planner?: TransitionPlanner; scheduler?: FrameScheduler }) {
    this.factory = opts.factory;
    this.cache = opts.cache ?? new SceneCache(3);
    this.planner = opts.planner ?? null;
    this.scheduler = opts.scheduler ?? rafScheduler;
  }

  on<K extends keyof DirectorEvents>(event: K, fn: DirectorEvents[K]): () => void {
    (this.listeners[event] as Set<DirectorEvents[K]>).add(fn);
    return () => (this.listeners[event] as Set<DirectorEvents[K]>).delete(fn);
  }

  private emit<K extends keyof DirectorEvents>(event: K, ...args: Parameters<DirectorEvents[K]>) {
    for (const fn of this.listeners[event] as Set<(...a: Parameters<DirectorEvents[K]>) => void>) fn(...args);
  }

  get phase(): FlightPhase {
    return this.phaseValue;
  }

  get activeScene(): SpatialScene | null {
    return this.active;
  }

  get target(): SceneTarget | null {
    return this.activeTarget;
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  state(): DirectorState {
    return {
      phase: this.phaseValue,
      activeSceneKey: this.active?.key ?? null,
      activeKind: this.activeTarget?.kind ?? null,
      activeFocusId: this.activeTarget?.focusId ?? null,
      pendingFocusId: this.pending?.target.focusId ?? null,
      lastOutcome: this.lastOutcome,
      lastError: this.lastError,
      flights: this.flights,
      cancelled: this.cancelled,
    };
  }

  private setPhase(p: FlightPhase, target: SceneTarget | null) {
    if (this.phaseValue === p) return;
    this.phaseValue = p;
    this.emit('phase', p, target);
  }

  /** Saved camera of a target, if the user has been there before. */
  savedCamera(t: SceneTarget): CameraState | null {
    return this.memory.get(targetKey(t)) ?? null;
  }

  forgetCameras() {
    this.memory.clear();
  }

  /** Aborts the flight in progress. The camera stays where it is; the active scene does not change. */
  cancel() {
    if (!this.pending) return;
    this.pending.ctrl.abort();
    this.pending = null;
    this.cancelled++;
    this.lastOutcome = 'cancelled';
    this.setPhase('idle', this.activeTarget);
  }

  async navigate(target: SceneTarget, opts: { restoreCamera?: boolean } = {}): Promise<FlightOutcome> {
    if (this.disposed) return 'cancelled';
    this.cancel();
    const ctrl = new AbortController();
    const { signal } = ctrl;
    this.pending = { ctrl, target };
    this.flights++;
    const from = this.active;
    const fromTarget = this.activeTarget;
    if (from && fromTarget) {
      const cam = from.getCameraState();
      if (cam) this.memory.set(targetKey(fromTarget), cam);
    }
    const restore = opts.restoreCamera === false ? null : this.savedCamera(target);
    const finish = (outcome: FlightOutcome): FlightOutcome => {
      if (this.pending?.ctrl !== ctrl) return 'cancelled';
      this.pending = null;
      this.lastOutcome = outcome;
      if (outcome !== 'error') this.setPhase('idle', this.activeTarget);
      return outcome;
    };

    try {
      if (from && from.key === target.sceneKey) {
        this.setPhase('flying', target);
        this.activeTarget = target;
        const ok = await from.focus(target, signal, { restore });
        if (signal.aborted) return 'cancelled';
        return finish(ok ? 'done' : 'cancelled');
      }

      this.setPhase('preparing', target);
      const scene = this.cache.createOrReuse(target, this.factory);
      this.cache.pin(scene.key);
      if (from) this.cache.pin(from.key);
      try {
        await scene.preload(signal);
        if (signal.aborted) return 'cancelled';
        scene.renderStaticFrame(target);
        const plan = this.planner?.(from && fromTarget ? { scene: from, target: fromTarget } : null, { scene, target }) ?? null;

        if (plan?.fly) {
          this.setPhase('flying', target);
          const ok = await plan.fly(signal);
          if (signal.aborted) return 'cancelled';
          if (!ok) return finish('cancelled');
        }

        this.setPhase('handoff', target);
        if (plan?.handoff) {
          const ok = await plan.handoff(signal);
          if (signal.aborted) return 'cancelled';
          if (!ok) return finish('cancelled');
        }
        from?.deactivate();
        scene.activate(target);
        if (restore) scene.restoreCameraState(restore);
        this.active = scene;
        this.activeTarget = target;
        this.emit('active', scene, target);

        this.setPhase('settling', target);
        if (plan?.settle) await plan.settle(signal);
        else await scene.focus(target, signal, { restore });
        if (signal.aborted) return 'cancelled';
        return finish('done');
      } finally {
        if (from && from !== this.active) this.cache.unpin(from.key);
        if (this.active !== scene) this.cache.unpin(scene.key);
      }
    } catch (e) {
      if (signal.aborted) return 'cancelled';
      const err = e instanceof Error ? e : new Error(String(e));
      this.lastError = err.message;
      if (this.pending?.ctrl === ctrl) {
        this.pending = null;
        this.lastOutcome = 'error';
        this.setPhase('error', target);
        this.emit('error', err, target);
      }
      return 'error';
    }
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastFrame = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = this.scheduler.request(loop);
      this.tick(now);
    };
    this.raf = this.scheduler.request(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) this.scheduler.cancel(this.raf);
    this.raf = 0;
  }

  get isRunning() {
    return this.running;
  }

  /** One frame: the active scene updates and draws, then frame listeners (overlay projection) run. */
  tick(now: number) {
    const dtMs = this.lastFrame ? Math.min(1000, now - this.lastFrame) : 0;
    this.lastFrame = now;
    const ctx: FrameContext = { nowMs: now, dtMs };
    const drew = this.active ? this.active.updateFrame(ctx) : false;
    this.emit('frame', ctx, drew);
  }

  dispose() {
    this.disposed = true;
    this.cancel();
    this.stop();
    this.active?.deactivate();
    this.active = null;
    this.activeTarget = null;
    this.cache.clear();
    for (const s of Object.values(this.listeners)) s.clear();
  }
}

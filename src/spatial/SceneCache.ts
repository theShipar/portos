import type { SceneFactory, SceneTarget, SpatialScene } from './types';

/**
 * LRU of scene instances keyed by scene key. Pinned keys (the active scene and the flight destination) are never
 * evicted; evicted scenes are disposed so GPU memory stays flat across scene round trips.
 */
export class SceneCache {
  private readonly scenes = new Map<string, SpatialScene>();
  private readonly pinned = new Set<string>();
  private created = 0;
  private disposed = 0;

  constructor(private readonly capacity = 3) {
    if (capacity < 1) throw new Error('SceneCache capacity must be at least 1');
  }

  get size() {
    return this.scenes.size;
  }

  keys(): string[] {
    return [...this.scenes.keys()];
  }

  has(key: string) {
    return this.scenes.has(key);
  }

  get(key: string): SpatialScene | undefined {
    const s = this.scenes.get(key);
    if (s) this.touch(key, s);
    return s;
  }

  /** Returns the cached scene for `target.sceneKey`, creating it with `factory` when absent. */
  createOrReuse(target: SceneTarget, factory: SceneFactory): SpatialScene {
    const hit = this.get(target.sceneKey);
    if (hit) return hit;
    const scene = factory(target);
    if (scene.key !== target.sceneKey) throw new Error(`Scene factory returned key ${scene.key} for ${target.sceneKey}`);
    this.scenes.set(target.sceneKey, scene);
    this.created++;
    this.evict(target.sceneKey);
    return scene;
  }

  pin(key: string) {
    this.pinned.add(key);
  }

  unpin(key: string) {
    this.pinned.delete(key);
    this.evict();
  }

  delete(key: string) {
    const s = this.scenes.get(key);
    if (!s) return;
    this.scenes.delete(key);
    this.pinned.delete(key);
    s.dispose();
    this.disposed++;
  }

  clear() {
    for (const key of [...this.scenes.keys()]) this.delete(key);
    this.pinned.clear();
  }

  stats() {
    return { size: this.scenes.size, created: this.created, disposed: this.disposed, keys: this.keys() };
  }

  private touch(key: string, s: SpatialScene) {
    this.scenes.delete(key);
    this.scenes.set(key, s);
  }

  /** `keep` is the scene just handed to a caller; it may push the cache over capacity until something is unpinned. */
  private evict(keep?: string) {
    if (this.scenes.size <= this.capacity) return;
    for (const key of [...this.scenes.keys()]) {
      if (this.scenes.size <= this.capacity) break;
      if (key !== keep && !this.pinned.has(key)) this.delete(key);
    }
  }
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Static-frame reveal layer for scene handoffs, modified from the "china-map-stage" cloud reveal in
// three-scope-map-skill by 宋夏天Dazzle (EarthChinaMap.vue). 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import type { BridgeStage } from './EarthGeographyBridge';

/**
 * Two DOM layers above the shared WebGL canvas: a 2D canvas holding one pre-rendered frame of the destination (or
 * the outgoing scene), and an atmosphere veil for the dive. Animations use the Web Animations API, so they run on
 * the compositor and never compete with the director's render loop.
 */
export class HandoffStage implements BridgeStage {
  private running = new Set<Animation>();

  constructor(
    private readonly frame: HTMLCanvasElement,
    private readonly veil: HTMLElement,
  ) {
    this.clear();
  }

  capture(source: HTMLCanvasElement): void {
    if (this.frame.width !== source.width || this.frame.height !== source.height) {
      this.frame.width = source.width;
      this.frame.height = source.height;
    }
    const ctx = this.frame.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.frame.width, this.frame.height);
    ctx.drawImage(source, 0, 0);
    this.frame.dataset.captured = '1';
  }

  show(): void {
    this.stopAll(this.frame);
    this.frame.style.visibility = 'visible';
    this.frame.style.opacity = '1';
    this.frame.style.transform = 'none';
  }

  reveal(keyframes: Keyframe[], ms: number, signal: AbortSignal): Promise<boolean> {
    this.frame.style.visibility = 'visible';
    return this.play(this.frame, keyframes, ms, signal, 'cubic-bezier(0.22, 0.72, 0.18, 1)');
  }

  fadeOut(keyframes: Keyframe[], ms: number, signal: AbortSignal): Promise<boolean> {
    return this.play(this.frame, keyframes, ms, signal, 'ease-out').then((ok) => {
      if (ok) this.hideFrame();
      return ok;
    });
  }

  atmosphere(opacity: number, ms: number, signal: AbortSignal): Promise<boolean> {
    const from = Number(getComputedStyle(this.veil).opacity) || 0;
    this.veil.style.visibility = 'visible';
    return this.play(this.veil, [{ opacity: from }, { opacity }], ms, signal, 'ease-in-out').then((ok) => {
      if (ok && opacity === 0) this.veil.style.visibility = 'hidden';
      return ok;
    });
  }

  clear(): void {
    for (const a of this.running) a.cancel();
    this.running.clear();
    this.hideFrame();
    this.veil.style.opacity = '0';
    this.veil.style.visibility = 'hidden';
  }

  get visible() {
    return this.frame.style.visibility === 'visible';
  }

  private hideFrame() {
    this.stopAll(this.frame);
    this.frame.style.visibility = 'hidden';
    this.frame.style.opacity = '0';
    this.frame.style.transform = 'none';
    delete this.frame.dataset.captured;
  }

  private stopAll(el: Element) {
    for (const a of [...this.running]) {
      if ((a.effect as KeyframeEffect | null)?.target === el) {
        a.cancel();
        this.running.delete(a);
      }
    }
  }

  private play(el: HTMLElement, keyframes: Keyframe[], ms: number, signal: AbortSignal, easing: string): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const last = keyframes[keyframes.length - 1];
    const commit = () => {
      if (last.opacity !== undefined) el.style.opacity = String(last.opacity);
      if (last.transform !== undefined) el.style.transform = String(last.transform);
    };
    this.stopAll(el);
    if (ms <= 0 || typeof el.animate !== 'function') {
      commit();
      return Promise.resolve(true);
    }
    const anim = el.animate(keyframes, { duration: ms, easing, fill: 'forwards' });
    this.running.add(anim);
    return new Promise<boolean>((resolve) => {
      const onAbort = () => {
        anim.cancel();
        resolve(false);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      anim.finished.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          this.running.delete(anim);
          commit();
          anim.cancel();
          resolve(true);
        },
        () => {
          signal.removeEventListener('abort', onAbort);
          this.running.delete(anim);
          resolve(false);
        },
      );
    });
  }
}

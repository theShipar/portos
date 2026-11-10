// SPDX-License-Identifier: GPL-3.0-or-later
// PORTOS Earth renderer. Techniques adapted from three-scope-map EarthView.vue (textured shader sphere, Fresnel
// atmosphere shells, batched LineSegments outlines, layered star points, damped OrbitControls); see
// third_party/three-scope-map/NOTICE and docs/TECHNICAL_DEVIATIONS.md.
// 作者全平台ID：宋夏天Dazzle；公众号：送你整个夏天
import gsap from 'gsap';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import dayUrl from '@/assets/textures/world/earth-day.jpg';
import lightsUrl from '@/assets/textures/world/earth-lights.png';
import normalUrl from '@/assets/textures/world/earth-normal.jpg';
import specularUrl from '@/assets/textures/world/earth-specular.jpg';
import { inverseSpherical, sphericalPosition } from '@/core/geo';
import { portosMapTheme as T, QUALITY, type QualitySettings, type QualityTier } from '../theme';
import { CameraTransitionController, EARTH_PRESET, EARTH_RADIUS, poseToPosition, positionToPose, type CameraPose, type CameraPreset } from './camera';
import type { InputRouter } from '@/spatial/InputRouter';
import { atmosphereFragmentShader, atmosphereVertexShader, earthFragmentShader, earthVertexShader } from './shaders';
import type { Country, WorldGeo } from './worldGeo';

export interface EarthPointerHit {
  lat: number;
  lon: number;
  screenX: number;
  screenY: number;
  country: Country | null;
}

export interface EarthSceneEvents {
  hover: (hit: EarthPointerHit | null, e: PointerEvent) => void;
  click: (hit: EarthPointerHit | null, e: PointerEvent) => void;
  userInteract: () => void;
  cameraSettled: (pose: CameraPose) => void;
  contextLost: () => void;
}

type Listener<K extends keyof EarthSceneEvents> = EarthSceneEvents[K];

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maskCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function drawCountries(canvas: HTMLCanvasElement, countries: Country[], blurPx: number) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  // One path and one fill: a canvas blur filter is applied per fill call, so filling per polygon costs ~200 ms.
  ctx.beginPath();
  for (const c of countries) {
    for (const poly of c.polygons) {
      for (const ring of poly) {
        ring.forEach(([lon, lat], i) => {
          const x = ((lon + 180) / 360) * w;
          const y = ((90 - lat) / 180) * h;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
    }
  }
  ctx.filter = blurPx ? `blur(${blurPx}px)` : 'none';
  ctx.fill('evenodd');
  ctx.restore();
}

function outlinePositions(countries: Country[], radius: number): Float32Array {
  let n = 0;
  for (const c of countries) for (const p of c.polygons) for (const r of p) n += r.length;
  const out = new Float32Array(n * 6);
  let o = 0;
  for (const c of countries)
    for (const p of c.polygons)
      for (const ring of p) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          if (Math.abs(a[0] - b[0]) > 180) continue;
          const pa = sphericalPosition(a[1], a[0], radius);
          const pb = sphericalPosition(b[1], b[0], radius);
          out[o++] = pa[0];
          out[o++] = pa[1];
          out[o++] = pa[2];
          out[o++] = pb[0];
          out[o++] = pb[1];
          out[o++] = pb[2];
        }
      }
  return out.subarray(0, o);
}

export class EarthScene {
  static isWebGLAvailable(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Globe-fixed group; overlays (ports, routes, vessels) attach here in geographic coordinates. */
  readonly overlay = new THREE.Group();
  readonly quality: QualitySettings;

  private readonly host: HTMLElement;
  private readonly globe = new THREE.Group();
  private readonly flight: CameraTransitionController;
  private readonly raycaster = new THREE.Raycaster();
  private readonly sphere = new THREE.Sphere(new THREE.Vector3(), EARTH_RADIUS);
  private readonly listeners: { [K in keyof EarthSceneEvents]: Set<Listener<K>> } = {
    hover: new Set(),
    click: new Set(),
    userInteract: new Set(),
    cameraSettled: new Set(),
    contextLost: new Set(),
  };
  /** Called every animation frame before rendering; `dirty` is true when this frame will be drawn. */
  private readonly frameHooks = new Set<(nowMs: number, dirty: boolean) => void>();
  private earthMaterial: THREE.ShaderMaterial | null = null;
  private atmosphereMaterials: THREE.ShaderMaterial[] = [];
  private regionMask = maskCanvas(2048, 1024);
  private hoverMask = maskCanvas(1024, 512);
  private regionMaskTex = new THREE.CanvasTexture(this.regionMask);
  private hoverMaskTex = new THREE.CanvasTexture(this.hoverMask);
  private overlayTex: THREE.CanvasTexture | null = null;
  private readonly blankOverlay = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  private regionOutline: THREE.LineSegments | null = null;
  private world: WorldGeo | null = null;
  private resizeObserver: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private width = 1;
  private height = 1;
  private viewOffsetPx = 0;
  private reducedMotion: boolean;
  private lastInteraction = performance.now();
  private idleRotationAllowed = false;
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private pendingHover: PointerEvent | null = null;
  private readonly lightDir = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly limits = { min: EARTH_PRESET.minDistance, max: EARTH_PRESET.maxDistance };
  /** Managed by the SpatialDirector: no own animation loop, pointer input arrives through an InputRouter. */
  private readonly managed: boolean;
  private input: InputRouter | null = null;
  private inputUnsubs: (() => void)[] = [];
  private activeValue = true;

  constructor(host: HTMLElement, opts: { quality?: QualityTier; reducedMotion?: boolean; managed?: boolean } = {}) {
    this.host = host;
    this.managed = !!opts.managed;
    this.quality = QUALITY[opts.quality ?? 'standard'];
    this.reducedMotion = !!opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';
    this.renderer.domElement.setAttribute('data-testid', 'earth-canvas');
    host.appendChild(this.renderer.domElement);

    this.scene.background = T.space.clone();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    poseToPosition({ ...EARTH_PRESET.center, distance: EARTH_PRESET.distance }, this.camera.position);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = this.limits.min;
    this.controls.maxDistance = this.limits.max;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotateSpeed = 0.18;
    this.controls.addEventListener('start', this.onControlsStart);
    this.controls.addEventListener('change', this.invalidate);

    this.flight = new CameraTransitionController(
      () => positionToPose(this.camera.position),
      (p) => {
        poseToPosition(p, this.camera.position);
        this.camera.lookAt(0, 0, 0);
        this.updateRotateSpeed();
        this.invalidate();
      },
    );

    this.scene.add(this.globe);
    this.globe.add(this.overlay);

    const el = this.renderer.domElement;
    if (!this.managed) {
      el.addEventListener('pointerdown', this.onPointerDown);
      el.addEventListener('pointerup', this.onPointerUp);
      el.addEventListener('pointermove', this.onPointerMove);
      el.addEventListener('pointerleave', this.onPointerLeave);
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    el.addEventListener('webglcontextlost', this.onContextLost);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
  }

  on<K extends keyof EarthSceneEvents>(event: K, fn: EarthSceneEvents[K]): () => void {
    (this.listeners[event] as Set<EarthSceneEvents[K]>).add(fn);
    return () => (this.listeners[event] as Set<EarthSceneEvents[K]>).delete(fn);
  }

  private emit<K extends keyof EarthSceneEvents>(event: K, ...args: Parameters<EarthSceneEvents[K]>) {
    for (const fn of this.listeners[event] as Set<(...a: Parameters<EarthSceneEvents[K]>) => void>) fn(...args);
  }

  onFrame(fn: (nowMs: number, dirty: boolean) => void): () => void {
    this.frameHooks.add(fn);
    return () => this.frameHooks.delete(fn);
  }

  readonly invalidate = () => {
    this.dirty = true;
  };

  async load(world: WorldGeo): Promise<void> {
    this.world = world;
    const manager = new THREE.LoadingManager();
    const loader = new THREE.TextureLoader(manager);
    const anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    const load = (url: string, srgb: boolean) =>
      new Promise<THREE.Texture>((resolve, reject) =>
        loader.load(
          url,
          (t) => {
            t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            t.anisotropy = anisotropy;
            resolve(t);
          },
          undefined,
          () => reject(new Error(`Texture failed: ${url}`)),
        ),
      );
    const [day, normal, specular, lights] = await Promise.all([load(dayUrl, true), load(normalUrl, false), load(specularUrl, false), load(lightsUrl, true)]);
    if (this.disposed) return;

    drawCountries(this.regionMask, [], 0);
    drawCountries(this.hoverMask, [], 0);
    this.earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDayMap: { value: day },
        uNormalMap: { value: normal },
        uSpecularMap: { value: specular },
        uNightMap: { value: lights },
        uRegionMask: { value: this.regionMaskTex },
        uHoverMask: { value: this.hoverMaskTex },
        uOverlayMap: { value: this.overlayTex ?? this.blankOverlay },
        uOverlayStrength: { value: this.overlayTex ? 1 : 0 },
        uLightDirection: { value: new THREE.Vector3(-0.5, 0.6, 0.6).normalize() },
        uOcean: { value: T.ocean },
        uOceanMid: { value: T.oceanMid },
        uOceanHighlight: { value: T.oceanHighlight },
        uLand: { value: T.land },
        uLandLight: { value: T.landLight },
        uGrid: { value: T.grid },
        uAtmosphere: { value: T.atmosphere },
        uCityLight: { value: T.cityLight },
        uRegionFill: { value: T.regionFill },
        uRegionHover: { value: T.regionHover },
        uRegionStrength: { value: 0 },
        uHoverStrength: { value: 0 },
        uSpecular: { value: this.quality.oceanSpecular ? 1 : 0 },
        uFade: { value: 1 },
      },
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 128, 96), this.earthMaterial);
    earth.name = 'earth';
    this.globe.add(earth);

    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions(world.countries, EARTH_RADIUS * 1.0015), 3));
    const outlines = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: T.landOutline, transparent: true, opacity: 0.42, depthWrite: false }));
    outlines.renderOrder = 2;
    outlines.name = 'country-outlines';
    this.globe.add(outlines);

    if (this.quality.atmosphere) {
      for (const [radius, intensity, color] of [
        [2.045, 0.42, T.atmosphere],
        [2.09, 0.08, T.outerAtmosphere],
      ] as const) {
        const m = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: color }, uFade: { value: 1 }, uIntensity: { value: intensity }, uLightDirection: { value: new THREE.Vector3(-0.5, 0.6, 0.6) } },
          vertexShader: atmosphereVertexShader,
          fragmentShader: atmosphereFragmentShader,
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
        });
        this.atmosphereMaterials.push(m);
        this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), m));
      }
    }
    if (this.quality.stars) this.scene.add(this.createStars());
    this.renderer.compile(this.scene, this.camera);
    this.invalidate();
  }

  private createStars(): THREE.Group {
    const group = new THREE.Group();
    const rand = mulberry32(92026);
    for (const [count, minR, maxR, size, opacity] of [
      [900, 15, 36, 0.05, 0.5],
      [400, 10, 25, 0.07, 0.32],
    ] as const) {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const u = rand() * 2 - 1;
        const th = rand() * Math.PI * 2;
        const r = minR + rand() * (maxR - minR);
        const s = Math.sqrt(1 - u * u);
        positions.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: T.star, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true })));
    }
    group.name = 'stars';
    return group;
  }

  /** One frame: controls, frame hooks, then a render when something changed. Returns true when it drew. */
  tick(now: number): boolean {
    if (this.disposed) return false;
    this.controls.autoRotate = this.activeValue && this.idleRotationAllowed && !this.reducedMotion && !this.flight.active && now - this.lastInteraction > 20000;
    if (this.controls.update()) this.dirty = true;
    for (const fn of this.frameHooks) fn(now, this.dirty);
    if (!this.dirty) return false;
    this.dirty = false;
    this.updateLight();
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  start() {
    if (this.managed || this.raf || this.disposed) return;
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Director-managed input: clicks and hovers arrive already filtered (5 px drag threshold, one per frame). */
  attachInput(router: InputRouter) {
    this.detachInput();
    this.input = router;
    this.inputUnsubs = [
      router.register({ layer: 'globe', priority: 0, test: () => null }),
      router.on('click', (_hit, e) => {
        if (this.activeValue) this.emit('click', this.pick(e.clientX, e.clientY), e as PointerEvent);
      }),
      router.on('hover', (_hit, e) => {
        if (this.activeValue && !this.disposed) this.emit('hover', this.pick(e.clientX, e.clientY), e as PointerEvent);
      }),
      router.on('leave', (e) => this.emit('hover', null, e as PointerEvent)),
      router.on('dragstart', () => {
        this.lastInteraction = performance.now();
      }),
    ];
  }

  private detachInput() {
    this.inputUnsubs.forEach((u) => u());
    this.inputUnsubs = [];
    this.input = null;
  }

  get hasInput() {
    return this.input !== null;
  }

  /** Inactive while another scene owns the screen: no orbit, no idle spin, no pointer events. */
  setActive(v: boolean) {
    this.activeValue = v;
    this.controls.enabled = v && !this.flight.active;
    if (v) this.invalidate();
  }

  get active() {
    return this.activeValue;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private updateLight() {
    this.lightDir.set(-0.55, 0.6, 0.62).applyQuaternion(this.camera.quaternion).normalize();
    if (this.earthMaterial) (this.earthMaterial.uniforms.uLightDirection.value as THREE.Vector3).copy(this.lightDir);
    for (const m of this.atmosphereMaterials) (m.uniforms.uLightDirection.value as THREE.Vector3).copy(this.lightDir);
  }

  private updateRotateSpeed() {
    const alt = Math.max(0.05, this.camera.position.length() - EARTH_RADIUS);
    this.controls.rotateSpeed = Math.min(0.5, 0.06 + alt * 0.09);
    this.controls.zoomSpeed = alt < 0.6 ? 0.5 : 0.8;
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.applyViewOffset();
    this.invalidate();
  }

  private applyViewOffset() {
    if (this.viewOffsetPx > 0.5) this.camera.setViewOffset(this.width, this.height, this.viewOffsetPx / 2, 0, this.width, this.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  /** Shift the projection so the globe centre stays in the map area left of an open inspector. */
  setRightInset(px: number) {
    const state = { v: this.viewOffsetPx };
    gsap.to(state, {
      v: px,
      duration: this.reducedMotion ? 0 : 0.18,
      ease: 'power2.out',
      onUpdate: () => {
        this.viewOffsetPx = state.v;
        this.applyViewOffset();
        this.invalidate();
      },
    });
  }

  get viewAspect() {
    return { fov: this.camera.fov, aspect: (this.width - this.viewOffsetPx) / this.height };
  }

  /** Orbit distance limits of the current scope. */
  get distanceLimits() {
    return { min: this.controls.minDistance, max: this.controls.maxDistance };
  }

  get viewport() {
    return { width: this.width, height: this.height };
  }

  /** World units per CSS pixel at view depth 1 (multiply by depth for a point's pixel scale). */
  get pxToWorld() {
    return (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / this.height;
  }

  /** Equirectangular RGBA canvas (lon −180…180 → x, lat 90…−90 → y) blended over the globe surface. */
  setOverlayCanvas(canvas: HTMLCanvasElement | null) {
    if (canvas && (!this.overlayTex || this.overlayTex.image !== canvas)) {
      this.overlayTex?.dispose();
      this.overlayTex = new THREE.CanvasTexture(canvas);
      this.overlayTex.colorSpace = THREE.SRGBColorSpace;
      this.overlayTex.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    }
    if (this.overlayTex) this.overlayTex.needsUpdate = true;
    if (this.earthMaterial) {
      this.earthMaterial.uniforms.uOverlayMap.value = canvas && this.overlayTex ? this.overlayTex : this.blankOverlay;
      this.earthMaterial.uniforms.uOverlayStrength.value = canvas ? 1 : 0;
    }
    this.invalidate();
  }

  setReducedMotion(v: boolean) {
    this.reducedMotion = v;
  }

  setIdleRotation(allowed: boolean) {
    this.idleRotationAllowed = allowed;
    this.lastInteraction = performance.now();
  }

  getPose(): CameraPose {
    return positionToPose(this.camera.position);
  }

  async flyTo(preset: CameraPreset, opts: { duration?: number } = {}): Promise<boolean> {
    this.controls.minDistance = Math.min(preset.minDistance, this.camera.position.length());
    this.controls.maxDistance = Math.max(preset.maxDistance, this.camera.position.length());
    this.controls.enabled = false;
    const done = await this.flight.flyTo({ ...preset.center, distance: preset.distance }, { duration: opts.duration, reducedMotion: this.reducedMotion });
    if (this.disposed) return false;
    this.controls.minDistance = preset.minDistance;
    this.controls.maxDistance = preset.maxDistance;
    this.controls.enabled = this.activeValue;
    if (done) this.emit('cameraSettled', this.getPose());
    return done;
  }

  flyToPose(pose: CameraPose, limits: { min: number; max: number }): Promise<boolean> {
    return this.flyTo({ id: 'restore', scope: 'earth', center: { lat: pose.lat, lon: pose.lon }, distance: pose.distance, minDistance: limits.min, maxDistance: limits.max });
  }

  /** Instant move within the current scope limits (2D → 3D hand-off). */
  jumpToPose(pose: CameraPose): Promise<boolean> {
    const { min, max } = this.distanceLimits;
    const distance = Math.max(min, Math.min(max, pose.distance));
    return this.flyTo({ id: 'handoff', scope: 'earth', center: { lat: pose.lat, lon: pose.lon }, distance, minDistance: min, maxDistance: max }, { duration: 0 });
  }

  /** True when the point is on the near hemisphere and inside the central part of the free map area. */
  isComfortablyInView(lat: number, lon: number, margin = 0.12): boolean {
    const s = this.project(lat, lon);
    const w = this.width - this.viewOffsetPx;
    return s.visible && s.x > w * margin && s.x < w * (1 - margin) && s.y > this.height * margin && s.y < this.height * (1 - margin);
  }

  /** Recentre on a point at the current distance (optionally capped) without changing scope limits. */
  focusPoint(lat: number, lon: number, opts: { maxDistance?: number } = {}): Promise<boolean> {
    const distance = Math.min(this.camera.position.length(), opts.maxDistance ?? Infinity);
    return this.flyTo({ id: 'focus', scope: 'earth', center: { lat, lon }, distance, minDistance: this.controls.minDistance, maxDistance: this.controls.maxDistance });
  }

  cancelFlight() {
    this.flight.cancel();
    this.controls.enabled = this.activeValue;
  }

  /** Highlight the land of a set of ISO-3 countries (null clears). */
  setRegionHighlight(iso3: string[] | null) {
    if (!this.world || !this.earthMaterial) return;
    const countries = (iso3 ?? []).map((c) => this.world!.byIso3.get(c)).filter((c): c is Country => !!c);
    const uniform = this.earthMaterial.uniforms.uRegionStrength;
    if (this.regionOutline) {
      this.globe.remove(this.regionOutline);
      this.regionOutline.geometry.dispose();
      (this.regionOutline.material as THREE.Material).dispose();
      this.regionOutline = null;
    }
    if (countries.length) {
      drawCountries(this.regionMask, countries, 2);
      this.regionMaskTex.needsUpdate = true;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(outlinePositions(countries, EARTH_RADIUS * 1.002), 3));
      this.regionOutline = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: T.regionOutline, transparent: true, opacity: 0.75, depthWrite: false }));
      this.regionOutline.renderOrder = 3;
      this.regionOutline.name = 'region-outline';
      this.globe.add(this.regionOutline);
    }
    gsap.to(uniform, { value: countries.length ? 1 : 0, duration: this.reducedMotion ? 0 : 0.6, onUpdate: this.invalidate });
  }

  setHoverHighlight(iso3: string[] | null) {
    if (!this.world || !this.earthMaterial) return;
    const countries = (iso3 ?? []).map((c) => this.world!.byIso3.get(c)).filter((c): c is Country => !!c);
    if (countries.length) {
      drawCountries(this.hoverMask, countries, 1);
      this.hoverMaskTex.needsUpdate = true;
    }
    this.earthMaterial.uniforms.uHoverStrength.value = countries.length ? 1 : 0;
    this.invalidate();
  }

  /** Screen position of a geographic point; `visible` is false on the far hemisphere. */
  project(lat: number, lon: number, radius = EARTH_RADIUS * 1.003): ScreenPoint {
    const [x, y, z] = sphericalPosition(lat, lon, radius);
    const p = this.tmp.set(x, y, z);
    const facing = p.dot(this.camera.position) - radius * radius;
    p.project(this.camera);
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height, visible: facing > 0 && p.z < 1 };
  }

  pick(clientX: number, clientY: number): EarthPointerHit | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.ray.intersectSphere(this.sphere, new THREE.Vector3());
    if (!hit) return null;
    const g = inverseSpherical(hit.x, hit.y, hit.z);
    return { lat: g.lat, lon: g.lon, screenX: clientX - rect.left, screenY: clientY - rect.top, country: this.world?.countryAt(g.lon, g.lat) ?? null };
  }

  private onControlsStart = () => {
    this.lastInteraction = performance.now();
    if (this.flight.active) this.cancelFlight();
    this.emit('userInteract');
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.lastInteraction = performance.now();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.pointerDown;
    this.pointerDown = null;
    if (!d || e.button !== 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 600) return;
    this.emit('click', this.pick(e.clientX, e.clientY), e);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const first = this.pendingHover === null;
    this.pendingHover = e;
    if (!first) return;
    requestAnimationFrame(() => {
      const ev = this.pendingHover;
      this.pendingHover = null;
      if (ev && !this.disposed) this.emit('hover', this.pick(ev.clientX, ev.clientY), ev);
    });
  };

  private onPointerLeave = (e: PointerEvent) => {
    this.pendingHover = null;
    this.emit('hover', null, e);
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.stop();
    this.emit('contextLost');
  };

  private onVisibility = () => {
    if (document.hidden) this.stop();
    else {
      this.invalidate();
      this.start();
    }
  };

  get flying() {
    return this.flight.active;
  }

  get motionReduced() {
    return this.reducedMotion;
  }

  /** Draw-call and memory figures for the performance report. */
  stats() {
    const info = this.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points, geometries: info.memory.geometries, textures: info.memory.textures };
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.detachInput();
    this.flight.cancel();
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibility);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('webglcontextlost', this.onContextLost);
    this.controls.removeEventListener('start', this.onControlsStart);
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mat of mats) {
        for (const v of Object.values((mat as THREE.ShaderMaterial).uniforms ?? {})) if (v.value instanceof THREE.Texture) v.value.dispose();
        mat.dispose();
      }
    });
    this.regionMaskTex.dispose();
    this.hoverMaskTex.dispose();
    this.overlayTex?.dispose();
    this.blankOverlay.dispose();
    for (const s of Object.values(this.listeners)) s.clear();
    this.frameHooks.clear();
    this.renderer.dispose();
    el.remove();
  }
}

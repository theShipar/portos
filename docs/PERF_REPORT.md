# Performance report

Measured on 2026-11-09 with `tests/e2e/perf.spec.ts` against the production build (`vite build --mode e2e`,
served by `vite preview` on 127.0.0.1). Raw figures: `docs/perf/perf-metal.json`, `docs/perf/perf-swiftshader.json`
and `docs/perf/perf-metal-60-switches.json`. These are measurements on one machine, not universal guarantees.

```bash
PERF=1 PERF_ANGLE=metal npx playwright test perf                        # hardware GPU (macOS)
PERF=1 npx playwright test perf                                         # SwiftShader CPU renderer
PERF=1 PERF_ANGLE=metal PERF_ROUND_TRIPS=30 npx playwright test perf    # 60 scope switches
```

## Environment

| | Value |
|---|---|
| Device | Apple M4 Pro, 14 cores, 24 GB, macOS (Darwin 27.2.0), arm64 |
| Browser | Playwright Chromium 158.0.8127.18, headless, viewport 1440 × 900, DPR 1 |
| GPU (primary run) | ANGLE Metal Renderer: Apple M4 Pro |
| GPU (worst case) | ANGLE SwiftShader (CPU rasteriser; what the CI-style E2E suite uses) |
| Data | 500 vessels, 200 voyages, 15 hazards, default layers (routes, ports, weather, vessels) |

## Results

| Metric | Metal (M4 Pro) | SwiftShader (CPU) | Target (spec 10/03) |
|---|---|---|---|
| First interactive (navigation → globe ready and search usable) | 0.6–2.0 s (warm 0.6–0.7 s; first run after a build 2.0 s) | 3.8 s | < 5 s on development hardware |
| DOMContentLoaded / load | 0.23 s / 0.43 s | 0.26 s / 1.30 s | — |
| FPS during an Earth → region flight, p50 / p5 | 59.9 / 59.5 | 7.5 / 1.7 | 60 desired, 30 minimum |
| FPS during orbit drag (500 vessels, routes), p50 / p5 | 59.9 / 59.5 | 7.5 / 6.7 | 30 minimum |
| Worst frame (p95 frame time) during flight | 16.8 ms | 583 ms | — |
| Scope switch Earth → Southeast Asia (click → camera at rest) | 1.24 s | 1.91 s | — |
| Scope switch Southeast Asia → Singapore | 0.99 s | 1.28 s | — |
| Scope switch, 20 repeats: p50 / max | 1.38 s / 1.75 s | 1.75 s / 4.75 s | — |

Scope-switch times are dominated by the authored camera flight (0.8–1.4 s, scaled by angular distance and zoom change); with reduced motion the
switch is immediate (E2E `reduced motion makes scope changes instant` asserts < 1.5 s including the wait).
Playback and flights are time-based, so a slow renderer drops frames but never slows the simulation clock.

## Renderer (`renderer.info` via the test adapter `__portos.stats()`)

| Scope | Draw calls | Triangles | Line segments | Points | Geometries | Textures |
|---|---|---|---|---|---|---|
| Earth | 34 | 56,762 | 145,571 | 1,300 | 35 | 7 |
| Southeast Asia | 40 | 73,319 | 162,960 | 1,300 | 42 | 7 |
| Singapore (3D) | 40 | 73,319 | 162,960 | 1,300 | 41 | 7 |
| Earth after 20 switches | 34 | 56,762 | 145,571 | 1,300 | 47 | 7 |

500 vessels render through instanced meshes (one per visible class and LOD, plus two ring meshes), so vessel
count does not change draw calls. Singapore's 2D port view is MapLibre GL JS 6.17 on its own canvas; the globe's
loop is stopped while it is visible.

## Memory after repeated scope switches

| | Value |
|---|---|
| JS heap (forced GC) at Earth before switching | 17.2 MB |
| After the first Earth ↔ Southeast Asia round trip | 24.2 MB (region layers, vessel LOD geometry and label caches warm up) |
| After 20 switches | 24.9 MB |
| After 60 switches | 25.2 MB |
| GPU geometries at Earth after each round trip (1 → 30) | 47 every time |
| Textures | 7 throughout |

Heap growth after warm-up falls from ~0.08 MB per round trip to ~0.01 MB per round trip by switch 60, and GPU
geometry and texture counts are flat: no uncontrolled growth. The remaining creep is consistent with browser history
entries (every switch is a real route navigation).

## Notes and limits of this measurement

- Headless Chromium with ANGLE Metal reflects a fast laptop GPU; a midrange integrated GPU will be slower. SwiftShader
  is a CPU worst case (no GPU at all) and is below the 30 fps minimum; the app stays usable (time-based animation,
  reduced motion available) but this is not a supported performance target.
- FPS is sampled from `requestAnimationFrame` deltas while the scene is rendering continuously (flight, drag). At rest
  the scene renders on demand only, so idle FPS is not meaningful.
- Not measured: Firefox/Safari, high-DPR displays (the app runs the `standard` quality tier, which caps the pixel ratio at 1.5), long sessions beyond 60 switches,
  and the 2D MapLibre view's frame rate.

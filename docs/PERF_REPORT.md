# Performance report

V2 figures were measured on 2026-11-11 (Phase V2-9) with `tests/e2e/perf.spec.ts` against the production build
(`vite build --mode e2e`, served by `vite preview` on 127.0.0.1). Raw figures: `docs/perf/perf-metal.json`
(10 round trips) and `docs/perf/perf-metal-60-switches.json` (30 round trips). The V1 figures from 2026-11-09 are
kept for comparison; `docs/perf/perf-swiftshader.json` is still the V1 run and was not re-measured for V2.
These are measurements on one machine, not universal guarantees.

```bash
PERF=1 PERF_ANGLE=metal npx playwright test perf --project=chromium                        # hardware GPU (macOS)
PERF=1 PERF_ANGLE=metal PERF_ROUND_TRIPS=30 npx playwright test perf --project=chromium    # 60 scope switches
PERF=1 npx playwright test perf --project=chromium                                         # SwiftShader CPU renderer
```

## Environment

| | Value |
|---|---|
| Device | Apple M4 Pro, 14 cores, 24 GB, macOS (Darwin 27.2.0), arm64 |
| Browser | Playwright Chromium 158.0.8127.18, headless, viewport 1440 × 900, DPR 1 |
| GPU | ANGLE Metal Renderer: Apple M4 Pro |
| Data | 500 vessels, 200 voyages, 15 hazards, default layers; V2 extruded region scene and Singapore port twin |

## Results (Metal)

| Metric | V2 (2026-11-11) | V1 (2026-11-09) | Target (V2 spec "Rendering budgets") |
|---|---|---|---|
| First interactive (navigation → globe ready and search usable) | 0.64–0.65 s | 0.6–0.7 s warm | < 5 s on development hardware |
| DOMContentLoaded / load | 0.24–0.28 s / 0.46–0.61 s | 0.23 s / 0.43 s | — |
| FPS during an Earth → region flight, p50 / p5 | 59.9 / 59.5–59.9 | 59.9 / 59.5 | 60 desired, 30 minimum |
| FPS during orbit drag (500 vessels, routes), p50 / p5 | 59.9 / 59.5–59.9 | 59.9 / 59.5 | 30 minimum |
| Worst frame (p95 frame time) during flight | 16.7–16.8 ms | 16.8 ms | — |
| Scope switch Earth → Southeast Asia (click → camera at rest) | 2.76–2.77 s | 1.24 s | — (cinematic transition) |
| Scope switch Southeast Asia → Singapore port twin | 1.69–1.72 s | 0.99 s | — |
| Scope switch, repeated: p50 / max | 2.86 s / 3.23 s | 1.38 s / 1.75 s | — |

The V2 scope switch is longer by design. Earth → region now plays the cinematic handoff of spec 05: prepare and
render the destination's static frame, focus, dive, cloud reveal, handoff and settle (D-033). The region scene
renders at 60 fps throughout, so the extra time is authored animation, not stalls (153–164 flight frames against 72 in
V1). With reduced motion the switch is a short crossfade. E2E `reduced motion makes scope changes instant` keeps the
budget at < 1.5 s from the end of scene preparation to idle. Input latency outside transitions was not measured
automatically.

## Renderer (`renderer.info` via the test adapter `__portos.stats()`)

| Scope | Draw calls | Triangles | Line segments | Points | Geometries | Textures |
|---|---|---|---|---|---|---|
| Earth | 34 | 90,152 | 145,571 | 1,300 | 35 | 7 |
| Southeast Asia (extruded `region3d`) | 246 | 277,638 | 3,807 | 0 | 293 | 9 |
| Singapore port twin (`port3d`) | 55 | 107,279 | 1,780 | 0 | 360 | 9 |
| Earth after 20 / 60 switches | 34 | 90,152 | 145,571 | 1,300 | 359 | 9 |

- The extruded region is the most expensive scene at 246 draw calls, and it still holds 59.9 fps at p5 on Metal.
  Batching its land meshes is the first optimisation to try on weaker GPUs.
- The port twin batches decks, cranes and yard blocks, so it needs only 55 calls.
- Earth triangles rose from 56,762 (V1) to 90,152.
- Geometries at Earth stay at 359 after warm-up because the scene cache keeps the region and port scenes built
  (D-031). That count is identical after every round trip, from 1 to 30.

## Memory after repeated scope switches

| | V2 | V1 |
|---|---|---|
| JS heap (forced GC) at Earth before switching | 20.9 MB | 17.2 MB |
| After the first Earth ↔ Southeast Asia round trip | 25.7 MB | 24.2 MB |
| After 20 switches | 26.6 MB | 24.9 MB |
| After 60 switches | 26.9 MB | 25.2 MB |
| GPU geometries at Earth after each round trip (1 → 30) | 359 every time | 47 every time |
| Textures | 9 after warm-up | 7 throughout |

Heap growth after warm-up falls to about 0.01 MB per round trip by switch 60, and GPU geometry and texture counts
stay flat, so there is no uncontrolled growth. The remaining creep is consistent with browser history entries:
every switch is a real route navigation. `handoff.spec.ts` checks the same property on SwiftShader. Earth → SEA →
Singapore → Back → Back, repeated three times, gives identical geometry and texture counts on loops 2 and 3, and the
scene cache never holds more than 3 scenes.

## SwiftShader (V1, not re-measured)

| Metric | V1 SwiftShader |
|---|---|
| First interactive | 3.8 s |
| FPS flight p50 / p5 | 7.5 / 1.7 |
| FPS orbit p50 / p5 | 7.5 / 6.7 |

SwiftShader is the CPU rasteriser the E2E suite uses. It is a worst case below the 30 fps minimum and not a
supported performance target. The app stays usable because animation is time-based and reduced motion is
available. In V2 the E2E suite is capped at 4 workers, and wall-clock handoff gates run in a separate
`chromium-timing` project (D-034).

## Notes and limits of this measurement

- Headless Chromium with ANGLE Metal reflects a fast laptop GPU; a midrange integrated GPU will be slower.
- FPS is sampled from `requestAnimationFrame` deltas while the scene is rendering continuously (flight, drag). At
  rest the scene renders on demand only, so idle FPS is not meaningful.
- Not measured: input latency, Firefox and Safari, high-DPR displays (the app runs the `standard` quality tier,
  which caps the pixel ratio at 1.5), sessions beyond 60 switches, the 2D MapLibre view's frame rate, and V2 on
  SwiftShader.

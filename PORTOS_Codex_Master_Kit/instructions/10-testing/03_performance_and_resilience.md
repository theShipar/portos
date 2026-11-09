# Performance And Resilience

> PORTOS / 10-testing / 03_performance_and_resilience  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make the product responsive under realistic simulated volume and degraded data conditions.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Targets for midrange laptop on Chrome: 60fps desired on Earth with no overlays, 30fps minimum with default routes and 500 vessels after stabilization; initial interactive map load ideally <5s on development hardware and local asset server. Measure, don't promise universally.
- Use instanced markers/LOD and geometry reuse for fleets; render only visible/nearby detailed hulls, and aggregate markers at low zoom. Preprocess GeoJSON and region rings; batch same-material outlines, texture atlas, avoid per-vessel expensive material.
- Split CPU work into idle chunks, let Earth own active RAF while next scene preps. Dispose geometries, materials, textures, observers and event listeners on scope change. Keep renderer counts under observation.
- Handle window resize, WebGL context loss/recovery, failed map tile request, missing hazard dataset and corrupted browser storage gracefully. Indicate quality / partial coverage in UI.
- Progressive quality profiles High/Balanced/Reduced choose antialiasing, bloom, line density, label count and detailed ship meshes; never hide incidents or modify incident logic based on performance.
- Build data indexes, throttle pointer raycasting and coalesce replay updates, lazy load port-level map; avoid importing 12MB raw world geometry into first-paint bundle.
- Use browser performance profile and Three renderer.info to report draw calls, triangles, memory and worst transition frame timings before completion.


## Interface / data contracts

- Performance metrics in `docs/PERF_REPORT.md`: device, browser, GPU, FPS p50/p5, first interactive, scope switch time, draw calls, JS heap if available.


## Interaction and system states

- Context lost: show recovery banner, retain selection and workflow data.
- High-density zone: cluster before visual overcrowding and expose item list.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Render 500 moving synthetic vessels with stable interaction and no uncontrolled memory growth after 20 scope switches.
- Reduced mode preserves all decision-support functions.


## Build instructions for Codex

1. Find the closest existing implementation before creating a new component; preserve the original Three Scope Map renderer and its GPL attribution when reusing code.
2. Define TypeScript types, JSON inputs and deterministic selectors; add unit tests for calculations and event transitions before connecting visual elements.
3. Connect semantic design tokens from `02-design-system` and render controlled loading, empty and error states.
4. Verify interactions with the real running app in a browser, including camera, selection, layer and deep-link transitions when applicable.
5. Update `docs/BUILD_LOG.md` with implemented files, verification commands, screenshot evidence, known limitations, and next work.

## Explicit non-goals / safety

- The build is an illustrative offline maritime command-center prototype; it is **not an AIS service, certified nautical chart, vessel routing advisory or safety-critical operating system**.
- Never imply simulated data is actual live vessel telemetry. Use labeled source and as-of date on every operational estimate.
- No inert primary buttons, nonfunctional simulated controls, screenshot replacement maps, or inconsistent numbers across screens.
- Respect GPL-3.0-or-later source conditions of the original map skill and map/texture data licensing.

## References and order

- Prerequisites: `instructions/10-testing/02_visual_regression_accessibility.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/10-testing/04_codex_execution_and_release.md`

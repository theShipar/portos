# Rendering Performance Quality

> PORTOS / 03-earth-and-map / 07_rendering_performance_quality  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Keep maritime globe responsive with hundreds of entities and smooth transitions on normal hardware.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Three scenes may contain 500 vessel records, 100 ports, 200 routes and regional overlays; use instanced sprites/meshes at overview, spatial tiling or zoom-dependent culling, label throttling and material batching.
- Avoid thousands of separate LineLoop draw calls. Follow original skill recommendation to batch geographic boundaries with `THREE.LineSegments` where materials match.
- Define quality tiers High, Standard, Low; use device pixel ratio cap 1.5 for Standard, 1.0 Low, 2.0 High. Switch expensive bloom, atmosphere and contour effects gracefully; never discard operational markers.
- At Earth scope: vessel aggregation per geographic cell then zoom-based expansion. At region: detail markers and selected LOD ship, hidden markers culled. At port: 2D symbols for most vessels and optional 3D focus model.
- Use one render loop per currently active scene; destination prewarming is one-shot only. Pause visible rendering when tab hidden and replay simulation clock when configured.
- Clean up Three geometries, materials, render targets, textures, event listeners, GSAP timelines and map layer sources on unmount or scope swap.
- Profile first paint, interactions, draw calls, memory, route update cost, data filtering and pointer picking; log environment and hardware.
- Treat no WebGL as supported diagnostic failure; do not claim WebGL works if replacing it with image.


## Interface / data contracts

- Performance budgets target on 1440x900 midrange laptop: global standard 45–60 FPS in steady state; no >200ms interaction freeze under typical input; initial usable shell ≤3s on local Vite warm load. Budgets aspirational and hardware-dependent.
- `QualityTier` controls pixel ratio, bloom, reflections, label density, animation update rates.


## Interaction and system states

- Heavy assets delayed; no blank intro or main-thread geographical parse hiccup.
- If low FPS is detected, offer quality setting rather than silently hiding alerts.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Save frame-time snapshots; documented test machine, tier and screen size.
- No RAF or GPU memory leak after 20 region/port/earth transitions.


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

- Prerequisites: `instructions/03-earth-and-map/06_spatial_coordinate_system.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

# Vessel Models Lod Materials

> PORTOS / 04-maritime-3d / 02_vessel_models_lod_materials  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Control ship-level detail, loading and GPU cost without sacrificing realistic cues.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- LOD0 global: instanced compass-arrow or elongated ship triangle, 6–12px; LOD1 regional: hull silhouette and bridge, 12–32px; LOD2 port focus: simplified geometric model with superstructure; LOD3 inspector hero: optional licensed glTF model in secondary viewer.
- Switch LOD by projected screen pixels, not solely geographic distance. Use hysteresis so marker doesn't flicker around thresholds.
- Material specification: PBR base metal/paint, hull roughness 0.55–0.8, subtle windows and deck contrasts; aggressive bloom prohibited, only selected outline/ground ring gets orange.
- Load referenced glTF with GLTFLoader, compress with Draco/Meshopt only when build support configured; maintain placeholder hull while loading; cache per class rather than per vessel.
- Instanced rendering: same class material batches; recolor status through vertex/instance attribute; each instance carries vesselId lookup in CPU table for hit tests.
- Optional docked view uses 3D ship model but stores authoritative position in 2D GIS. Vessels cannot be visually drawn through land.
- Support network-less demo: bundle tiny procedural model classes in source, no runtime external GLB dependencies.
- Create asset manifest documenting ownership/license, format, size, dimensions, compression, and whether real-world source or synthetic.


## Interface / data contracts

- `assets/models/manifest.json` with class, path, license, triangleBudget, defaultFallback.
- Budgets: LOD0 ≤40 triangles/instance, LOD1 ≤600, LOD2 ≤5k, LOD3 ≤30k for selected single object.


## Interaction and system states

- Bad glTF: use procedural model and show optional diagnostic in dev console.
- Quality Low: no LOD3, but vessel selection remains functional.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- 500 vessel records do not instantiate 500 individual heavy GLTF scenes.
- Model unload leaves no stray textures or failed hit zones.


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

- Prerequisites: `instructions/04-maritime-3d/01_vessel_mesh_geometry.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/04-maritime-3d/03_vessel_motion_and_heading.md`

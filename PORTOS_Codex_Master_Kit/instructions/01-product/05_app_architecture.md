# App Architecture

> PORTOS / 01-product / 05_app_architecture  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Choose a coherent Vue/Three application architecture and module dependency boundaries.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Adopt Vue 3 + TypeScript + Vite, preserving the original skill template as a source of authoritative map components. Add Pinia for shared, serializable UI/workflow state only if useful; do not port to React midway.
- Layers: `src/core` business entities + projections, `src/data` loaders/validators, `src/engines` pure calculations/simulation, `src/map` GlobeAdapter/RegionView/MaritimeOverlaySystem, `src/components` UI, `src/features` domain views, `src/router` deep links, `src/styles` tokens.
- Never put business filtering or KPI calculations inside a shader, mesh setup, Vue template or Three scene graph. State selectors return view models; renderers consume minimal typed descriptors.
- Original `EarthView.vue`, `EarthChinaMap.vue`, `ChinaMap.vue`, `ZhejiangThreeMap.vue`, `mapTheme.ts` are a China-first reference baseline. For global maritime, create an adapter around reused techniques; do not pretend its China interaction automatically supports 100 ports.
- Own one RAF per active Three scene. Preload next scope thoughtfully and release previous GPU resources. Render Earth and regional map separately if needed, with deterministic handoff event contract.
- Unit tests focus on pure engines; integration tests on selection/state; Playwright-style browser tests on the actual Vite server, including WebGL canvas rendering and pointer hit targets.
- Prefer resilient progressive enhancement: app remains operational if atmospheric bloom is disabled, but no falsely rendered screenshot “map” is accepted as WebGL implementation.


## Interface / data contracts

- Essential modules: `geo.ts` projections; `clock.ts` time control; `selectors.ts` derived values; `catalog.ts` validated entity lookup; `sceneBus.ts` typed map events; `workflow.ts` local action reducer.
- Avoid cyclical import dependencies; `engines` must not depend on `components` or `map`.


## Interaction and system states

- Missing WebGL: show a clear error and allow data-only inspector; explain 3D is unavailable.
- Failed data validation: block mock-live state and report schema issues.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Production build, typecheck and test commands succeed.
- Swapping selected vessel does not rebuild entire global geographic geometry.


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

- Prerequisites: `instructions/01-product/04_end_to_end_user_journeys.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

# Earth Renderer

> PORTOS / 03-earth-and-map / 02_earth_renderer  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Preserve a realistic spherical world and render spatially truthful vessel/port/route context.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Establish world sphere from bundled `EarthView.vue` technique: sphere geometry, multi-map Earth day/night material, normal/specular lighting, subtle atmosphere, neutral starfield, idle orientation. Preserve geographic axis agreement with label/route layers.
- Ocean stays visually dominant but not oversaturated; use dark navy shader hue and subtle reflected light. Only coastline/port activity receives brand orange highlights when selected or high-risk.
- Render port icons using instanced markers or billboard sprites anchored to `lat/lon`; geographic visibility depends on hemisphere and camera occlusion to avoid ships visible through Earth.
- Route lines follow geodesically interpolated curated maritime waypoints along sphere surface plus 0.003–0.006 sphere radius elevation. Use separate highlighted route for selection; don't draw naive great-circle arcs crossing continents.
- Ship markers are dense at global scope: render clustered symbolic vessels per cell or screen tile, never 500 full-detail ship meshes at Earth distance. Zoom threshold swaps clusters into heading chevrons and selected vessel into LOD ship mesh.
- Earth atmosphere should not destroy contrast of orange routes. Sensor rings/scan grid may be subtle optional visual effects; avoid hiding nautical information.
- Camera initial target: Indian Ocean / Southeast Asia with enough Earth visible to convey scale. Show counts and global KPI ribbon from derived data, not arbitrary static UI numbers.
- Map overlay interpolation updates GPU instance buffers at controlled frequency (max 10–15Hz for positions in demo), independent of frame rendering.


## Interface / data contracts

- `latLonToSphere(lat, lon, radius)` and inverse use one convention; reference data is WGS84 degrees in [-90,90]/[-180,180].
- `EarthSceneHandle` supports `focusLatLon`, `focusBounds`, `selectEntity`, `setVisibleLayers`, `setClock`, `dispose`.


## Interaction and system states

- Near poles and antimeridian should not cause broken lines or camera flip.
- Hidden-side markers not visible; Earth routes don't float absurdly high at normal zoom.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Globe stable at 500 vessels and 100 ports on normal laptop.
- Selecting Singapore smoothly focuses globe and reveals the corresponding region stage.


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

- Prerequisites: `instructions/03-earth-and-map/01_original_skill_integration.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/03-earth-and-map/03_geographic_region_drilldown.md`

# Geographic Region Drilldown

> PORTOS / 03-earth-and-map / 03_geographic_region_drilldown  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Provide meaningful Earth->maritime-region->port navigation with explicit geometry and bound selection.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Define operational regions using registry: Southeast Asia, East Asia, Indian Ocean, North Europe, Mediterranean, North America Pacific, North America Atlantic, West Africa, Oceania, Latin America. Maritime regions are operational groupings, not sovereign territories.
- For region geometry, aggregate visible country shapes from licensed GeoJSON; outlines never imply a political boundary for ocean areas. Name region in an overlay label anchored to a representative position.
- On region selection, compute lat/lon bounds with antimeridian handling, animate camera to preset, and show 3D coastal geography, port nodes, shipping lanes, port congestion and density.
- Click on geographic land highlights administrative area if valid; click sea corridor or port marker selects maritime data, not a fake province. Country-level details must not block vessel selection.
- Drilldown to port via marker or quick-search, then hand off to a high-resolution 2D MapLibre nautical-context map (with licensed map style) containing port/anchorage zones and vessel positions. Show explicit visual change 3D Region -> 2D Port.
- Back actions must preserve prior camera, layers, highlighted route and selected incident context; a breadcrumb click restores state from stack.
- Use stable `regionId` and `countryIso3` registries, not fragile display-name matching.
- Region and port views should include a visible legend and time/freshness indicator. No unlabeled heat color without underlying metric.


## Interface / data contracts

- `regions.json` each {id,name,countryIso3[],bbox:{west,south,east,north},focus:[lon,lat],defaultZoom,portIds[]}, plus optional routes.
- `GeoScopeStack` items {scope,id,cameraPose,layerState,clockUtc,selectedEntity}.


## Interaction and system states

- Region crossing 180th meridian uses split bounds, not 360° zoom.
- Click on open ocean without target keeps scene stable and removes only hover.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Full path Earth -> Southeast Asia -> Singapore -> anchorage -> vessel works with actual named targets.
- Direct region URL and Back navigation produce consistent viewport positions.


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

- Prerequisites: `instructions/03-earth-and-map/02_earth_renderer.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/03-earth-and-map/04_camera_flight_and_preset_system.md`

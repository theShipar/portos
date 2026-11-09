# Original Skill Integration

> PORTOS / 03-earth-and-map / 01_original_skill_integration  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Integrate the exact original Three Scope Map as a controlled geographic base without assuming it already supports maritime data.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Original skill: `https://github.com/songsummer920-dazzle/three-scope-map-skill`. Install skill in Codex, keep its source, GPL/NOTICE/CITATION attribution. Bundled Vue template location `three-scope-map/assets/templates/smart-mine-vue/`.
- Begin with author-provided `EarthView.vue`, `EarthChinaMap.vue`, `ChinaMap.vue`, `ZhejiangThreeMap.vue`, `mapTheme.ts`, GeoJSON and world/China textures as an integrated reference. Run `verify_template_integrity.py` before any modification.
- The bundled Earth-to-China experience targets China specifically. Do NOT relabel China as Southeast Asia, pretend global drilldown works, or redirect every click to China. Implement separate `PortosEarthView`/`PortosRegionMap` adapters with explicit scope registry and geographic feature IDs; reuse texture/material/render techniques and animation patterns where licensing permits.
- Adapt world country hit-testing to allow region-group lookups (e.g. Southeast Asia = countries with ISO IDs), not artificial giant GeoJSON landfills. Region selection must focus camera on actual lat/lon bounds.
- Replace China-specific colors with the role palette from design system while keeping the intended map depth/textures. Do not mass-replace shader colors; create a new `portosMapTheme` adapter.
- Skill’s country/province/city drilldown is administrative; PORTOS drilldown is operational: Earth -> shipping region -> port -> berth/anchorage -> vessel. Regional terrain is only a contextual phase. At port level transition to accurate 2D basemap, not fake extruded terminal boundaries.
- Separate renderer from operational overlay data; overlays represent `vesselId`, `portId`, `voyageId`, `incidentId`; support selection events into product store.
- Verify original skill’s reusable files and build successfully before combining maritime enhancements; log any necessary adaptation in `docs/TECHNICAL_DEVIATIONS.md`.


## Interface / data contracts

- Map event interface: `onMapSelect({kind,id,scope,position})`, `onMapHover({kind,id})`, `onScopeReady({scope})`, `onCameraSettled({scope,target})`.
- Requirements: world, regions, globe camera, highlighted sea routes, 3D region tiles and port map handoff.


## Interaction and system states

- If only China drilldown works, global feature is incomplete; block release until independent countries and region-group selection work.
- Missing port basemap must not trigger inaccurate procedurally generated coastlines.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Earth opens with real WebGL canvas, then Singapore selection enters correct region rather than China.
- `scripts/verify_template_integrity.py` and adapted strict checks pass or report exact blockers.


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

- Prerequisites: `instructions/INDEX.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/03-earth-and-map/02_earth_renderer.md`

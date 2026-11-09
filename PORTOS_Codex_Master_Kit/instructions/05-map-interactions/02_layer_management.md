# Layer Management

> PORTOS / 05-map-interactions / 02_layer_management  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Create a small controlled cartographic layer system, not a collection of overlapping dashboard toggles.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Five operator layers: Fleet, Ports, Routes, Weather, Incidents. Additional conceptual overlays Anchorage and Traffic Density appear only at port/region levels respectively. Use switch/segmented controls and keep only two top-level visual overlays active by default.
- Define layer visibility per scope: global Fleet/Ports/Routes, region Fleet/Ports/Traffic/Weather, port Fleet/Anchorage/Berths/Weather. Hide irrelevant controls with explanation in layer menu instead of silently failing.
- Preserve enabled layer choices when navigating back; selected entity is always visible in focus mode even if its base layer is off, marked as selection-only.
- Maintain each layer's legend, data vintage, provenance and whether the layer is `Simulated`, `Derived` or `Imported`. State of missing coverage must be visible, not interpreted as safe/zero.
- Use opacity slider only for overlays needing spatial blending; never let users obscure all base coastline and critical markers at once.
- Layer order: base sea/land -> region boundaries -> density -> weather polygons -> routes -> vessel/port symbols -> selected highlights -> labels -> UI.
- State management must prevent redraw of unrelated layers. Dirty a layer's view model when relevant filters/time changes; dispose geometries when permanently detached.


## Interface / data contracts

- `LayerConfig` {id,label,minScope,maxScope,visibleByDefault,opacity,legend,source,freshness,renderOrder}; persist layer preferences with versioned local storage key `portos:layers:v1`.


## Interaction and system states

- Disabled/missing layer shows source limitation and does not claim zero incidents.
- Reduced-performance mode disables haze/particles first, never critical port/incident markers.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Toggling weather leaves vessel selection and route highlights intact.
- Legend values match actual semantic tokens and visible data ranges.


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

- Prerequisites: `instructions/05-map-interactions/01_selection_and_hover.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/05-map-interactions/03_global_search_and_filters.md`

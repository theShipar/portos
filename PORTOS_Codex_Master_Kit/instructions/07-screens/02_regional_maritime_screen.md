# Regional Maritime Screen

> PORTOS / 07-screens / 02_regional_maritime_screen  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Use original skill-inspired regional geography to explore real operational density and route interactions.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- On entering a region, preserve globe orientation and transition camera smoothly toward its bbox. Then show a scoped map with coastlines, selected country outlines, active ports, vessels, incident clusters and regional shipping corridors.
- Regional region IDs include Southeast Asia, Mediterranean, North Sea, Indian Ocean, East Asia, Pacific West Coast and Gulf/Arabian Sea. All have explicit bounds; ocean-based regions need a polygon/bbox not an administrative boundary.
- Left floating region status capsule: active vessels, inbound port calls, unresolved incidents, median known wait. Right compact filter/layer panel with dynamic regional legend.
- Click vessel for vessel focus; click port for port-level detail; click weather polygon for affected voyages. The back crumb returns to globe at previous orientation.
- Maritime region mesh must not pretend it is a country province boundary; use a thin accented region mask on real topography. Avoid extruding sea region as land.
- Use routes categorized by commercial lane but no imaginary lines through land. Semantic fill for hotspots from actual aggregated waiting / incident count.
- Maintain per-region camera presets and prefetch relevant subset of vessels for the next scope.


## Interface / data contracts

- `regions.json` {regionId,name,bounds,center,portIds[],cameraPreset,kind:'maritime-region'}.
- Region counts use selected time snapshot and filters, not file-level counts.


## Interaction and system states

- Region with 0 own fleet vessels still displays ports/routes and `No fleet assets in selection`.
- No matching risk data: show unknown rather than green.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Southeast Asia -> Singapore click proceeds to correct port.
- Region back restores globe orientation and selected layer state.


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

- Prerequisites: `instructions/07-screens/01_global_fleet_screen.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/07-screens/03_port_operations_screen.md`

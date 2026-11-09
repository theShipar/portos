# Port Operations Screen

> PORTOS / 07-screens / 03_port_operations_screen  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make port detail a functional queue and terminal operations workspace with map-first prioritization.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Port screen uses precise 2D MapLibre base at correct coordinates, optional abstract terminals/berths polygons if licensed or clearly simulated. Header breadcrumb Singapore / Port Operations and current UTC plus local Singapore time.
- Main layers: vessel positions, terminal/berth status, anchorage zones, planned arrival paths, active queue, incident markers and optional weather.
- Default floating KPI bar: at anchor, awaiting berth, next 24h arrivals, median known wait. A narrow left queue shelf can be collapsed to maximize map; right inspector opens on berth/ship selection only.
- Anchorage click shows breakdown: waiting vessels, elapsed wait median, forecast berth delay, queue evidence quality; row click flies camera to vessel and selects related voyage.
- Terminal click shows berth states and schedule window. Unknown berth occupancy must never appear as 0% utilization. Selecting berth must show linked upcoming port calls and source timestamp.
- Color port surfaces neutral light grays; caution fills muted orange; selected ship true orange. No 3D building towers that sacrifice accurate vessel location.
- Port actions: review port-call exception, request agent update (draft), assign coordinator, compare port options with conditions; action log persists locally.


## Interface / data contracts

- `PortViewModel` includes `queueEntries`, `anchorageSummaries`, `berths`, `arrivalsNext24h`, `portKpis`, `selectedPortCalls`, `localTimeZone`.


## Interaction and system states

- Missing terminal polygon: display accurate centroid pin plus `Geometry unavailable`.
- Data inconsistent: validation marks source rather than silently drawing fake berth status.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Selecting a vessel in Singapore queue opens same VSL entity as global search.
- Total queue shown in KPI matches visible queue count after filters.


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

- Prerequisites: `instructions/07-screens/02_regional_maritime_screen.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/07-screens/04_vessel_voyage_screen.md`

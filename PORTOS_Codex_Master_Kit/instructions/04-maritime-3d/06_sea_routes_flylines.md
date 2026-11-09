# Sea Routes Flylines

> PORTOS / 04-maritime-3d / 06_sea_routes_flylines  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Render accurate-looking maritime corridors with real operational meaning and selected path intelligence.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Route layers: planned route (blue/gray solid), selected voyage track (orange solid), historical path (muted dotted), candidate scenario path (dashed orange), hazard intersection (caution overlay). Avoid using bright pulsing line to imply an approved operational diversion.
- Build route from vetted conceptual maritime waypoint sets: Singapore–Suez–Rotterdam, Singapore–Cape–Rotterdam, Shanghai–Singapore, Los Angeles–Panama–Rotterdam, etc. Every waypoint must lie in water or clearly be a conceptual port node, with no straights across land.
- Segment densification on sphere uses geographic interpolation; 2D MapLibre draw antimeridian-safe segmented GeoJSON LineStrings. Shared route ID links Earth and port details.
- Curved 3D flight-style ribbons are visually optional for Earth-level trade lanes, but actual vessel positions must project onto the geographical path, not travel along an invented high altitude arc.
- Selected voyage route gains bright thin line and time markers for departure, current vessel position, next waypoint and arrival. Alternative routes show estimated extra distance and assumptions.
- Route comparisons must not be called navigationally safe; mention they are planning scenarios and require professional operational review.
- Hover reveals corridor name, approximate distance, current affected voyages, known restrictions and data date; click opens route inspector.
- When 200 voyages overlap, bundle by lane or density before drawing all route paths. Focus state shows a few relevant paths only.


## Interface / data contracts

- `routes.json`: {routeId,originPortId,destinationPortId,corridorId,waypoints:GeoPoint[],distanceNmEstimate,provenance:'synthetic'}.
- `voyages.json` references routeId; `routeCompare` returns scenario IDs and explicit assumptions.


## Interaction and system states

- Missing marine waypoint path: do not render straight water/land chord. Show `Route geometry unavailable` and linked port endpoints only.
- Suez disruption can switch scenario to Cape corridor without silently moving the vessel's actual track.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Route shows consistently between Earth, region and vessel inspector.
- Selected lane selection remains linked to relevant voyages and incidents.


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

- Prerequisites: `instructions/04-maritime-3d/05_anchorage_and_queue_visuals.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/04-maritime-3d/07_weather_hazard_overlays.md`

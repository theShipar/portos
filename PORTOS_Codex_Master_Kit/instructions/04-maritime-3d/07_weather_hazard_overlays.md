# Weather Hazard Overlays

> PORTOS / 04-maritime-3d / 07_weather_hazard_overlays  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Use weather overlays only as grounded operational context with clear timing and uncertainty.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Weather layers: wind severity, wave-height categorical polygons, storm/typhoon footprints, visibility and severe-weather warning per region. Prototype is synthetic; data sources labeled `Scenario model` with issue/valid times.
- Display forecast polygons semi-transparent, with discrete legend and time valid range, never full neon storm covering content. Animation may show directional vectors, but only if sourced from vector data rather than noise art.
- Intersect vessel planned route segments with hazard polygons using a geometry helper. A route risk event should be traceable to polygon ID, validAt window and affected route segment.
- Selected hazard inspector: type, severity, issue time, validity, affected ports/voyages, evidence and recommended investigation—not automatic diversion commands.
- Risk score based on route intersection, lead time, exposure duration, vessel class sensitivity and confidence; display formula inputs in Evidence tab.
- Avoid false precision: if weather cell spacing is coarse, explain geographic uncertainty. Route simulation must not be used for ship navigation or weather routing decisions.
- Allow time scrub to change valid polygons and affected vessel list. Old forecast overlays visually expire when simulation clock moves beyond validity.
- Users can toggle hazards independently of route layer; if hazard is hidden, risk badges remain in vessel inspector with source link.


## Interface / data contracts

- `weatherHazards.json` {hazardId,type,severity,polygon,issuedAtUtc,validFromUtc,validToUtc,confidence,affectedVoyageIds[]}; computed affected list validated against intersections.
- `HazardViewModel` includes `displayLabel`, `source`, `validity`, `affectedCount`, `quality`.


## Interaction and system states

- Expired warnings are not shown as current.
- Missing hazard cells -> `No data` not `Safe`.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- One chosen voyage visibly intersects a forecast hazard and produces a linked risk event.
- Time scrub updates hazard and risk state together.


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

- Prerequisites: `instructions/04-maritime-3d/06_sea_routes_flylines.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

# Weather Route Risk Engine

> PORTOS / 06-intelligence / 04_weather_route_risk_engine  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Compute explainable spatial risk from time-bounded hazard polygons and voyage paths.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Route exposure occurs only when planned/actual track overlaps hazard polygon and forecast-valid period intersects expected traversal interval. A hazard near a route without intersection should not automatically count as affected.
- For prototype, create a transparent risk score based on severity weight, route segment overlap length, proximity to validity time, vessel class sensitivity and confidence. Store each factor and explain how missing factors affect result.
- Affected-voyage list must be calculated using geometry and time, not manually listed inconsistent with intersections. Scenario fixtures can include explicit prevalidated affected IDs for bootstrap and validator checks.
- Expose alert reasons: `forecast severe waves over route segment`, `high wind approaching port area`, `visibility reduced at ETA window`; no automatic assertion of unsafe navigation.
- Render hazards with time-valid opacity and legible legend, and route overlap segments highlighted. Use coastal warnings by region and avoid precision not supported by underlying data.
- Risk bands can map 0–34 low, 35–64 moderate, 65–84 high, 85–100 severe; configurable thresholds with explicit reasoning.
- Operators can acknowledge risk, attach context or request routing review, but prototype never automatically recommends a navigationally safe track or executes reroute.


## Interface / data contracts

- `RouteRiskResult` {voyageId,score,band,affectedSegments[],hazardIds[],validAtUtc,confidence,rationale[],limitations[]}.
- `computeRouteHazards(voyage,route,weather,atUtc)` takes time-sliced data.


## Interaction and system states

- Hazard removed/expired => risk score recomputes; alert history remains in replay.
- No weather feed => unknown risk, never `Clear`.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Indian Ocean weather scenario produces consistent linked voyage and hazard.
- Risk badges and map overlays reflect the same computed exposure.


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

- Prerequisites: `instructions/06-intelligence/03_delay_exposure_calculator.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/06-intelligence/05_analytics_kpi_contracts.md`

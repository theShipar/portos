# Analytics Kpi Contracts

> PORTOS / 06-intelligence / 05_analytics_kpi_contracts  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define every displayed maritime KPI mathematically and tie it to one source selector.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Global default KPIs: tracked vessels, underway vessels, predicted late voyages, at-risk voyage count, unresolved incidents, forecast delay exposure USD. Use only counts within current visible filter/time cohort.
- `trackedVessels`: unique vessel IDs with a last known position in allowed age threshold, with denominator disclosure. `underway`: nav state underway + valid position. `lateVoyages`: active voyages whose forecast ETA exceeds scheduled ETA by configured threshold (e.g. >60m).
- `onTimeForecastRate`: fraction active voyages with both planned/revised ETA and delay <= threshold, with eligible sample `n`. Do not label as actual historical on-time performance.
- `avgPortWaitHours`: mean or median, consistently named and over specified ports/eligible calls. `totalExposureUsd`: sum latest non-duplicated voyage exposure, not one total per incident on same voyage.
- Regional aggregation maps port IDs/geo coordinates to region boundaries; unknown geographic assignment grouped as `Unlocated`, not silently dropped. Incident severity counts deduplicate by incidentId.
- Every metric supports drill action: click `Delayed voyages` to filter the fleet/region map and open corresponding list. All mini charts must label time range, units and provenance.
- At Earth scope show max four compact KPIs by default; more through contextual `Metrics` flyout to maintain dominant map.


## Interface / data contracts

- KPI objects: `{key,label,value,unit,asOfUtc,cohort,denominator?,source,quality,trend?,drillFilter?}`.
- `selectKpis({catalog,snapshot,filter,selectedRegion,time})` is pure and memoizable.


## Interaction and system states

- Missing data shows `—` not `0` and retains a tooltip.
- Replay snapshots update all KPI numerators/denominators together.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Screens, tooltips and export use same KPI selector values.
- Test with duplicate incidents and incomplete ETA to prevent overcounting.


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

- Prerequisites: `instructions/06-intelligence/04_weather_route_risk_engine.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/06-intelligence/06_provenance_uncertainty_alerts.md`

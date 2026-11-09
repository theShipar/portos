# Voyage Eta Engine

> PORTOS / 06-intelligence / 01_voyage_eta_engine  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Explain ETA changes from recorded estimates rather than inventing navigationally precise arrival predictions.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Store planned ETA, source-estimated current ETA, timestamp when estimated, optional agency/terminal ETA and quality. Prototype derives a revised ETA from deterministic scenario events plus remaining synthetic route distance / reported speed only when permitted by data quality.
- Delay = `currentEstimatedArrivalUtc - plannedArrivalUtc`; track negative early arrivals separately. Show +18h as a signed forecast change, never as an observed late arrival until actual arrival.
- Define source precedence: externally provided trusted ETA (future production) > scenario source estimate > conservative derived projection. ETA calculated from SOG alone must be `Low confidence`; vessel can be at anchor, waiting on berth, rerouting or on slow steaming plan.
- Use timezone-aware UTC parse and route planning geodesic distance in nautical miles when needed. For segment estimates, `hours = remainingNm / max(1, effectiveKnots)` only in explicit demonstration model.
- Explain change drivers: port waiting forecast, scheduled speed change, weather corridor exposure, voyage schedule adjustment and source correction. Avoid double counting event deltas.
- Store baseline/revised ETA event history for 200 voyages and selected full journey. The timeline displays received/valid timestamps and evidence references.
- KPI on-time ETA uses a declared tolerance and cohort; never mix actual arrivals with predicted on-time rates without labels.


## Interface / data contracts

- `EtaResult` {plannedArrivalUtc,estimatedArrivalUtc,etaShiftMinutes,confidence:'high'|'medium'|'low',asOfUtc,sourceType,drivers[],assumptions[]}.
- `computeEta(voyage, vesselSnapshot, applicableEvents, nowUtc)` pure and deterministic.


## Interaction and system states

- Missing planned ETA -> show no shift, `Missing schedule baseline`.
- Unknown SOG or stale position -> do not infer a precise new ETA.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Showcase Pacific Horizon planned vs forecast ETA remains +18h before user scenario action.
- UTC calculations pass dates crossing month boundaries and DST.


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
- Next in this module: `instructions/06-intelligence/02_port_congestion_engine.md`

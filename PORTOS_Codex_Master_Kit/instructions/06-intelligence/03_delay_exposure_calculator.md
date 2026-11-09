# Delay Exposure Calculator

> PORTOS / 06-intelligence / 03_delay_exposure_calculator  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Translate operational time loss into transparent and bounded monetary exposure estimates.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Financial exposure is decision-support estimate, not an invoice or guaranteed loss. Separate demurrage-like charges (when contract fixture supports), operating delay cost, cargo/contract penalties (if explicitly modeled) and optional fuel variance. Default uses per-voyage daily exposure only.
- `estimatedExposureUsd = max(0, incrementalDelayHours / 24) * dailyDelayCostUsd` in simple demo model; show calculation and rate basis. Example 18h at $32,000/day => $24,000, not a hardcoded disconnected card.
- Costs by scenario must compare the same baseline, time horizon, currency, and assumptions. Show risk-adjusted range when confidence insufficient; use visible `Estimate` badge.
- Never use a vessel's nominal speed to calculate contractual penalties, dispatch rights or customs costs. If unknown, show `Financial exposure unavailable` and invite user to enter simulation assumptions.
- Costs and delay snapshots tied to `voyageId`, incident ID and `asOfUtc`; when ETA changes, recalculate immediately. Use Intl.NumberFormat with currency and unit abbreviation and exact detailed view.
- Show separated `already incurred` vs `forecast exposure` only when supporting event data exists. No mixing gross cargo value with operational cost.
- Route comparison action modifies scenario forecast, not authoritative actual observed costs or ETA source.


## Interface / data contracts

- `DelayCostInput` {voyageId,incrementalHours,dailyDelayCostUsd,otherEstimatedUsd?,assumptionSource,confidence}; `ExposureEstimate` {totalUsd,components[],asOfUtc,confidence,formulaText}.
- Fixture VYG-0001 has +18h shift and rate $32,000/day => $24,000.


## Interaction and system states

- Negative delay is zero exposure, not negative invoice.
- Missing contract rate shows a dash and a labeled manual assumption state.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- All six KPI surfaces use shared exposure selector (no contradicting totals).
- Changing assumed daily rate updates incident, voyage and comparison values consistently.


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

- Prerequisites: `instructions/06-intelligence/02_port_congestion_engine.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/06-intelligence/04_weather_route_risk_engine.md`

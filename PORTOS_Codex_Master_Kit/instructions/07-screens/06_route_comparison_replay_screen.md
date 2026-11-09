# Route Comparison Replay Screen

> PORTOS / 07-screens / 06_route_comparison_replay_screen  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make uncertainty-aware decision comparison and temporal replay central showcase features.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Map comparison starts from selected voyage/incident; split scenario routes by color/line style, never overload with more than three candidates. One selected baseline, two possible response plans at most.
- Comparison panel rows: baseline, wait for berth/maintain plan, candidate port-agent negotiation, alternative port call (when feasible). Columns: projected delay, extra nautical miles, estimated exposure, assumptions, evidence confidence, coordination steps.
- Scenario changes are client-side simulations; selecting `Choose plan` records a proposed operational decision and updates illustrative case state only, not ship navigation or actual ETA.
- Replay rail may enter split map mode with `Now` versus `24h ago` position or a single time slider. Overlay event markers, known/forecast changes and port congestion change.
- On timeline scrubbing, show data-age and indicate when scenario assumption no longer applies. Prevent mixing a scenario created today with historical baseline as if it was observed.
- A strong example demonstrates Singapore congestion creating ETA shift and a coordinator task lowering planning uncertainty, not magically eliminating queue time.
- Export `Scenario Comparison` as static JSON/print view with disclaimer and sources to make portfolio demo convincing.


## Interface / data contracts

- `ScenarioComparison` {baselineVoyageId,asOfUtc,options:[{scenarioId,name,etaDeltaHours,extraDistanceNm,exposureUsd,assumptions,feasibilityConfidence,requiredApproval}]}.


## Interaction and system states

- No verified feasible alternative: show only `Monitor & coordinate` with explanation.
- Insufficient data: allow noting missing data, not fabricated cost savings.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Scenario inputs recompute the metrics and audit proposed choice.
- Replay timeline remains deterministic after switching route option and restoring baseline.


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

- Prerequisites: `instructions/07-screens/05_incident_investigation_screen.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

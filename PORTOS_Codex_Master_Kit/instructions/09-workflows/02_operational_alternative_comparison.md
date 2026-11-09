# Operational Alternative Comparison

> PORTOS / 09-workflows / 02_operational_alternative_comparison  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Support defensible maritime response decisions without implying navigational authority.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Compare scenarios around operational responses: monitor current ETA, request updated terminal/agent slot, stage berth readiness, coordinate customer schedule update, or flag candidate alternate port for feasibility assessment.
- For each comparison show baseline ETA, changed assumptions, forecast incremental delay, extra distance if route changes, exposure estimate, confidence, required stakeholders and operational risks. Decisions are tentative until approval.
- Do not implement autopilot actions or direct vessel routing commands. Avoid text like `Safe to reroute` or `Guaranteed save $X`.
- Scenario engine combines existing ETA/cost/weather data with explicit user-editable assumptions, returns one computation from shared selectors. Show differences and confidence; noncomparable options should be disabled with evidence.
- `Propose` records operator preference and creates follow-up action. `Accept plan` only available to manager mock role and changes scenario decision status, not actual route geometry or external system.
- Comparison route geometry must visually distinguish `Planned`, `Proposed`, `Recorded`. Actual track never changes merely because a proposal is selected.
- Allow export of comparison as JSON with timestamps, inputs and simulation disclaimer for case study demonstration.


## Interface / data contracts

- Scenario input: `baseVoyageId`, optionId, speedAssumptionKn?, extraWaitHours?, alternativePortId?, dailyCostUsd?, approvalState.
- Outputs include formula breakdown, difference vs baseline, reasons not applicable.


## Interaction and system states

- No verified waypoint geometry: keep options textual; don't draw straight segment through land.
- Missing financial assumption: costs unavailable, still display nonfinancial comparison.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Changing proposed wait hours updates forecast exposure and side-by-side comparison deterministically.
- Proposed action can be located in audit log, not passed off as real reroute.


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

- Prerequisites: `instructions/09-workflows/01_alert_triage_and_case_lifecycle.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/09-workflows/03_action_assignment_notifications.md`

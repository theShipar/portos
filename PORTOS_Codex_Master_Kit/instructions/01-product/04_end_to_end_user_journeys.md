# End To End User Journeys

> PORTOS / 01-product / 04_end_to_end_user_journeys  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Specify actionable workflows that can be demonstrated end to end using coherent sample data.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Primary journey A (congestion): open Earth; orange risk cluster at Singapore; enter Southeast Asia; select Singapore; inspect anchorage queue and waiting forecast; select vessel assigned to waiting anchorage; view berth update; create a port-agent follow-up; mark in progress; replay prior queue state.
- Journey B (weather): select Indian Ocean weather overlay; see affected voyage list sorted by projected exposure; open voyage; inspect hazard intersection and forecast issuance time; compare speed hold vs deviation (labeled illustrative only); record a recommendation pending approval.
- Journey C (delayed vessel): global incident chip -> vessel focused camera -> planned vs revised ETA -> evidence timeline -> cost estimate with daily rate and delay hours -> assign coordinator -> acknowledge action -> check status.
- Journey D (leadership): executive launch view -> filtered high exposure corridor -> drill into region -> identify top three active issues -> export local demo briefing JSON or printable in-browser summary.
- Journey E (investigation replay): select voyage -> enter replay with UTC timeline -> scrub, view ship position at exact snapshot and event markers -> jump to alert issuance -> open evidence snapshot -> return to current simulated time.
- For every journey, define starting state, actor, trigger, interactions, expected in-app mutations, validation checks, and success endpoint in `docs/DEMO_RUNBOOK.md`.
- Make customer-facing actions explicitly drafts in prototype; do not claim real notifications were sent.


## Interface / data contracts

- Each journey has stable demo IDs from scenario fixture `SCENARIO_SINGAPORE_CONGESTION`, `SCENARIO_INDIAN_OCEAN_WEATHER`, etc.
- Actions append `ActionEvent` with eventId, actorId, timeUtc, entityType, entityId, previousState, nextState and scenarioId.


## Interaction and system states

- No competing alternative: show why unavailable.
- Stale AIS position: maintain last-known location and data-age warning; never move asset artificially.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Each demo journey can be run from reset and produces the same evidence.
- No critical step depends on random assignment or live network.


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

- Prerequisites: `instructions/01-product/03_information_architecture.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/01-product/05_app_architecture.md`

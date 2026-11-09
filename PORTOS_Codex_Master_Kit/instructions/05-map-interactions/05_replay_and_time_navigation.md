# Replay And Time Navigation

> PORTOS / 05-map-interactions / 05_replay_and_time_navigation  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Build a deterministic temporal inspection workflow for voyage positions and port exceptions.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Bottom replay rail toggled by `Replay` button in selected voyage or port inspector. Modes `Now (simulated)` and `Historical`; user can play/pause, scrub, jump incident markers, choose speed 1x/10x/60x and return to now.
- All temporal read models derive from a single UTC simulation timestamp. Interpolate vessel samples only across bounded intervals; no interpolation across missing data beyond threshold; show last-seen age.
- A 24h local range can be displayed using port timezone labels, but internal storage and computation always UTC. Day boundary and DST edge states must be tested.
- Scrubbing updates vessel position, weather forecast validity, incident lifecycle, berth windows, queue values and corresponding KPI snapshot together. Do not mutate source JSON.
- Historical replay must never create a real new incident or send action. Option to `Create note from historical snapshot` writes to local simulated action log with current authored UTC time and referenced historical instant.
- Timeline event chips show category (ETA shift, anchor entered, port delay, storm warning, case assignment); keyboard Left/Right steps one minute or next sample with modifier.
- When user scrubs fast, coalesce rendering and cancel outdated async computation. Pause playback if a detail modal requiring precise review is opened.


## Interface / data contracts

- `SimulationClock` {mode:'live-demo'|'replay',timeUtc,playing,speed,rangeStartUtc,rangeEndUtc}; `getSnapshot(timeUtc)` pure selector.


## Interaction and system states

- A voyage with no samples shows unavailable range rather than fabricated track.
- Returning to now restores latest simulated snapshot, filters and incident selection.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Jump to INC-0001 event marker and confirm consistent vessel position, ETA and port conditions.
- Running replay twice produces the same entity values and event order.


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

- Prerequisites: `instructions/05-map-interactions/04_3d_2d_view_switch.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

# Deterministic Simulation Clock

> PORTOS / 08-data-simulation / 03_deterministic_simulation_clock  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make an offline prototype feel alive without pretending to use live operational feeds.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Establish immutable scenario time origin `2026-11-09T12:00:00Z`; `Now (simulated)` advances predictably from session start, may pause, and resets to fixture anchor with one control.
- A single `SimulationClockStore` owns nowUtc, replayUtc, speed, playing and dataVersion. All engines and map animations subscribe; no independent `Date.now()` logic inside unrelated cards.
- Movement interpolation between samples is time-based and cap-aware; when data gap >30 minutes show last known position with `stale` state, never invent a new current coordinate. Model could include richer 5-min seed samples for selected vessels.
- Event schedule includes ETA updates, port queue changes, weather warnings and case status transitions. Event application is deterministic and idempotent; seeking backward rebuilds snapshot from baseline, not reversing manual mutations.
- Keep clock separate from user action log. Local decisions are authored in actual current browser time but demonstrate with an explicit `Demo action` label and scenario snapshot reference.
- Restart and reset: `Reset demo` clears local state after confirmation, sets clock to seed anchor, restores default layer/filter/camera but preserves app settings if user chooses.
- Use `requestAnimationFrame` display tick only when playing and visible; background tabs pause presentation time or derive from delta with cap to prevent a giant jump on refocus.


## Interface / data contracts

- Clock API `nowUtc()`, `seek(iso)`, `play(speed)`, `pause()`, `reset()`, `getSnapshotAt(iso)`.
- `SimulationEvent` must have unique eventId + effectiveAtUtc + type + payload, total chronological sort stable by id.


## Interaction and system states

- Out-of-range seek snaps to nearest allowed sample with visible notice.
- Data gap shows transparent stale/frozen marker.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Same seek gives identical positions, KPIs, weather and incident statuses across repeated runs.
- 1x/10x/60x controls all use same underlying virtual time.


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

- Prerequisites: `instructions/08-data-simulation/02_demo_dataset_generation.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/08-data-simulation/04_events_and_replay_data.md`

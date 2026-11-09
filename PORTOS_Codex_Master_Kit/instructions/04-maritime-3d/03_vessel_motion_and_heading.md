# Vessel Motion And Heading

> PORTOS / 04-maritime-3d / 03_vessel_motion_and_heading  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Animate vessel state from timestamped positions without inventing continuous real-time telemetry.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Vessel positions come from deterministic `tracks.json` arrays of {vesselId,timeUtc,lat,lon,sogKn,cogDeg,navStatus,source}. Current position at simulation time is sampled from adjacent records; pause outside recorded range or show `Last-known` explicitly.
- Interpolate within realistic time gaps (default ≤30 minutes), using marine route segment interpolation, not a direct line through a peninsula. Long gaps use a dashed uncertainty connector and freeze at known point.
- Heading and course are differentiated: COG from track, heading from equipment if provided. Use COG for marker orientation in demo unless a trustworthy heading exists.
- Operational states: underway, at_anchor, moored, not_under_command, unknown. At anchor, position remains within small explicit deterministic drift radius or exact static track (never random walk per frame).
- Animation speed is screen visualization speed; label simulated clock advance speed (`1x`, `10x`, `60x`) and keep physics/track interpolation time-consistent. Do not multiply vessel speed arbitrarily while showing same clock.
- Vessel wake length scales with SOG only after valid track; do not show wake on paused replay unless selected sample includes underway state and presentation intentionally previews velocity.
- Vessels entering / leaving viewport are culled, not deleted from data store. Selection pins vessel even when filtering others and shows `outside current viewport` state if necessary.
- Selecting vessel camera `follow` mode moves with entity; user dragging map suspends auto-follow until resumed.


## Interface / data contracts

- `getVesselAtTime(vesselId,timeUtc): {point,sogKn,cogDeg,navStatus,sourceTimeUtc,freshness}`.
- `trackGapPolicy` maxInterpolationMinutes 30; over threshold use last-known + staleness.


## Interaction and system states

- Antimeridian crossing interpolates short side.
- Vessel at berth never glides along seawall due to missing track samples.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- At replay 2026-11-09T12:00:00Z and same seed, position is bitwise reproducible.
- No ship appears above Earth horizon or on land due to raw great-circle interpolation.


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

- Prerequisites: `instructions/04-maritime-3d/02_vessel_models_lod_materials.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/04-maritime-3d/04_ports_terminals_and_berths.md`

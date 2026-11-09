# Anchorage And Queue Visuals

> PORTOS / 04-maritime-3d / 05_anchorage_and_queue_visuals  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Represent congestion without misrepresenting queue rank or making invented navigation claims.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- At port level depict anchorage polygons, queue clusters, arrival/entry points, occupancy status and waiting durations. Precise anchorage boundaries must be licensed/verified; synthetic ones styled `Demo zone` with not-for-navigation label.
- Queue metrics distinguish vessels currently at anchor, vessels awaiting berth with confirmed arrival, vessels en route arriving within 24h, and vessels with unknown agent/berth status.
- Draw anchorages as translucent navy/blue boundary with medium caution accent for crowded regions, not bright hazard red. Selected zone shows count, median/p90 waiting, vessels awaiting berth, forecast trend and uncertainty.
- The queue list sorts by elapsed/forecast waiting but explicitly does not claim official berth priority or actual berth slot order. Actual priority can depend on contracts, terminal rules, cargo, pilotage and safety.
- Clicking a queue row focuses vessel; clicking a vessel highlights zone and its berth assignment if available.
- Queue time starts from relevant operational milestone (arrival at anchorage or NOR where available), never from voyage departure or initial AIS first seen.
- Cross-filter by vessel class, terminal, arrival window, delay severity and source freshness. Connect time slider to historical occupancy snapshots.
- Use occupancy histograms and tiny sparklines sparingly within contextual inspector; main map remains primary.


## Interface / data contracts

- Anchorage {id,portId,polygon,capacityEstimate?,vesselIds[]}; queue entry {vesselId,portId,arrivalAtUtc,waitingSinceUtc?,estimatedBerthUtc?,queueEvidence}.
- `medianWaitHours` excludes unknown waiting start rather than treating as zero.


## Interaction and system states

- Unknown queue position shows `Unconfirmed`, not an authoritative rank.
- Unreliable weather/berth conditions reduce prediction confidence visibly.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Singapore port shows realistic status composition and exact counts derived from entries.
- Queue totals reconcile with list count on the selected time snapshot.


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

- Prerequisites: `instructions/04-maritime-3d/04_ports_terminals_and_berths.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/04-maritime-3d/06_sea_routes_flylines.md`

# Ports Terminals And Berths

> PORTOS / 04-maritime-3d / 04_ports_terminals_and_berths  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Translate real geographic port concepts into inspectable, correctly scoped entities.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Map port entities: port centroid, harbor boundary if licensed, terminals, berth points/polylines, anchorages and optional navigable access reference. For prototype use synthetic sublocations around approximate real port centroid but label as non-navigational demonstrator geometry.
- Zoom levels: Earth shows ports as aggregate pins; region shows port status/throughput indicators; detailed port view uses 2D MapLibre with terminals/berths and boat symbols; selected terminal may reveal a lightweight isometric 3D schematic separate from chart.
- `port` contains UN/LOCODE when verified; synthetic port fixture may omit and instead use demo ID. Each berth has parent terminal/port, position, occupancy and scheduled window references.
- Port detail focuses on decision metrics: arrivals in next 24h, vessels waiting, median predicted waiting, estimated berth utilization, incidents and operational notes.
- Dock geometry must come from map tiles or supplied licensed boundaries; don't create inaccurate public coastline as a maritime navigation aid. Synthetic demo zones should show disclaimer.
- Berth statuses: occupied, scheduled, unavailable, free, unknown; unknown is not free. Clicking berth opens assigned vessel and projected window.
- Use port-specific time zone stored in data; UTC always available and default. Conversion of berth times must not silently shift dates across midnight.
- For each showcase port include at least one landmark terminal and anchorage zone, and link every visible vessel to track data and voyage where applicable.


## Interface / data contracts

- `ports.json` {portId,name,countryIso2,unlocode?,location,timeZone,congestion,terminalIds[]}; `terminals.json` {terminalId,portId,berthIds[]}; `berths.json` and `anchorages.json` valid refs.
- Map client consumes `PortViewModel` rather than raw records.


## Interaction and system states

- Port with no berth data displays `Berth feed unavailable` instead of `0% occupied`.
- Two vessels cannot occupy one berth over overlapping actual time windows in demo fixture unless marked as an error case.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Port click loads correct regional/port spatial stage with labeled controls.
- One terminal -> berth -> vessel drill path works.


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

- Prerequisites: `instructions/04-maritime-3d/03_vessel_motion_and_heading.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/04-maritime-3d/05_anchorage_and_queue_visuals.md`

# Demo Dataset Generation

> PORTOS / 08-data-simulation / 02_demo_dataset_generation  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Create a substantial but coherent synthetic world of maritime operations for full UI behavior.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Deterministic `random.Random(92026)` fixture generation. Target baseline 500 vessels, 100 ports, 200 active voyages, >=50 linked active/historical incidents, >=6 regions, >=12 route corridors, >=2,000 position samples, >=100 port calls, >=15 weather hazard polygons and >=200 operational events.
- Named anchor scenario: VSL-0001 MV Pacific Horizon, VYG-0001 from Singapore to Rotterdam (or clear next planned port in voyage), PRT-SIN and PRT-RTM, route RTE-SIN-RTM, INC-0001 related to Singapore congestion with +18h forecast shift and $32k/day cost basis.
- Generate vessel identities using realistic but fictitious names, vessel classes (container, bulk, tanker, LNG, general cargo, RoRo), route assignments, speeds appropriate for class, nav statuses; avoid using real MMSIs or actual ship names as claims of current whereabouts.
- Port catalog: 100 globally distributed real named locations with approximate non-navigational centroids or obvious fictitious demo hubs. Every location tagged `syntheticOperationalData: true`; avoid fabricating official berth position/boundaries.
- Track samples clustered near plausible paths; if route geometry missing, retain point + provenance rather than drawing a path through land. Create explicit scenario voyage track near Singapore and historical replay events.
- Build country/region coverage with enough incidents, vessels and queue states to make geographic filtering meaningful (not only one Singapore example). Distinct high-priority scenarios: weather event Indian Ocean, congestion Singapore, berth equipment issue Rotterdam, slower transit North Sea.
- Provide overview README with fixture counts, authoritative scenario IDs, sample UTC timestamps, reset method and `python scripts/validate_data.py` command.


## Interface / data contracts

- `scripts/generate_demo_data.py --seed 92026 --output sample-data/` must be reproducible; outputs sorted by ID/time.
- `sample-data/manifest.json` exposes counts, seed, generatedAtUtc (fixed fixture time), scenario version and source disclosure.


## Interaction and system states

- Re-running generator never deletes user local prototype decisions; base fixture is read-only.
- Missing expected scenario ID fails tests immediately.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Target dataset counts exactly match manifest and integrity checks.
- All displayed Singapore voyage numbers derive from fixture and calculation engine.


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

- Prerequisites: `instructions/08-data-simulation/01_json_entity_relationships.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/08-data-simulation/03_deterministic_simulation_clock.md`

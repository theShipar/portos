# Global Search And Filters

> PORTOS / 05-map-interactions / 03_global_search_and_filters  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make findability fast for busy operators and avoid disorienting map navigation.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Global search indexes ports, vessels, voyages, incidents, regions and maritime corridors from fixture data. Support names, IMO/MMSI demo identifiers, UN/LOCODE, origin/destination, callsign and incident ID where provided.
- Search UI centered in top bar; keyboard `/`, Cmd/Ctrl+K focus. Results grouped by entity with icon, matching token, current status, UTC data age and disambiguating location.
- Use normalization for case, whitespace, punctuation and diacritics; fuzzy matching is an optional enhancement. Debounce keyboard search ~150ms, but local indexed search should feel immediate.
- Filter chips: vessel type, nav status, delay severity, selected fleet, destination, route corridor, source freshness and incident state. Filters must be composable with AND between groups / OR within group.
- Search selection navigates focus path and camera; type `Singapore` offers Port of Singapore and Singapore Strait region distinctly. A result can be previewed without ending search.
- Empty result shows `No match in simulated dataset` plus reset filter; do not offer fake internet-wide search. Provide filter count and clear all action at every level.
- Persist last used filters in URL query with correct encoding; never put sensitive personal fields in URL.


## Interface / data contracts

- `SearchResult` {kind,id,title,subtitle,matchReason,status?,location?,recencyMinutes?}; `FilterState` typed per group; `searchIndex` built once from validated catalog.


## Interaction and system states

- Multiple identical names appear as separate disambiguated results, no silent jumps.
- Search from replay preserves simulation time until user explicitly chooses current.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Search `Pacific Horizon` selects fixture vessel VSL-0001 and its current voyage.
- 500-vessel filtering and search remains keyboard-responsive.


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

- Prerequisites: `instructions/05-map-interactions/02_layer_management.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/05-map-interactions/04_3d_2d_view_switch.md`

# Json Entity Relationships

> PORTOS / 08-data-simulation / 01_json_entity_relationships  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Establish validated, linked JSON sources that support every visible entity and calculation.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- One normalized catalog: regions, ports, terminals, berths, anchorages, vessels, voyages, routes, positions, port calls, weather hazards, incidents, evidence, actions, users, scenario assumptions and event timeline. All IDs stable and unique; no display text is used as key.
- IDs: `REG-`, `PRT-`, `TRM-`, `BRH-`, `ANC-`, `VSL-`, `VYG-`, `RTE-`, `POS-`, `PCL-`, `WX-`, `INC-`, `EVD-`, `ACT-`, `USR-`. Referential integrity validated before app boot.
- Coordinates always `{lon:number,lat:number}` WGS84; projected x/y reserved renderer-only. ISO 8601 UTC timestamps end in `Z`. Distance nautical miles, SOG knots, monetary USD, time duration minutes.
- Vessels belong to one home fleet and may have current voyage; voyages link vessel/originPort/destinationPort/route with scheduled and forecast ETAs; port calls link vessel/voyage/port and optionally terminal/berth. Incidents link entities and evidence.
- Denormalize read-only materialized selectors only for performance; do not duplicate authoritative ETA or severity values in UI components. Use `@/data/catalog` to build indices and runtime validation from generated JSON Schemas.
- Numeric fields use null for unknown, never zero for unavailable. Source class and last-updated timestamp required for telemetry-like fields. An entity without good location stays in search/list with `Location unavailable`.
- The seeded dataset is fictitious, even where named real ports are used; all berth coordinates and operational statuses must be marked demonstrative.


## Interface / data contracts

- Entity JSON schema in `schemas/entities.schema.json` and separate `schemas/{vessels,voyages,ports,incidents,events}.schema.json`.
- `catalog.getVessel(id)`, `getPort(id)`, `getVoyage(id)`, `getIncident(id)`, `getEvents(entityId)`, `getPortCalls(portId)` typed accessors.


## Interaction and system states

- Invalid FK: fail fixture validation and display developer-readable error; no generated placeholders during normal runtime.
- Partial record: preserve and label unknown rather than making up values.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Python validator checks 100% of FK references and all coordinate ranges, unique IDs and chronology.
- Clicking event evidence resolves exactly to the entity it references.


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

- Prerequisites: `instructions/INDEX.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/08-data-simulation/02_demo_dataset_generation.md`

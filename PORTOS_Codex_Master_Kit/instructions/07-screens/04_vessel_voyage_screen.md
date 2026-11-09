# Vessel Voyage Screen

> PORTOS / 07-screens / 04_vessel_voyage_screen  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Create a single entity investigation panel that places evidence beside a geographically meaningful route.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Vessel focus is a view mode not a separate full-screen dashboard. Map pans to vessel while planned route is highlighted; vessel right inspector opens at 384–420px.
- Inspector tabs: Overview, Voyage, Events, Documents (demo documents only). Overview: vessel name, class, IMO demo ID, current coordinates, speed/heading, nav state, last report UTC. Voyage: origin/destination, schedule vs projected ETA, distance and current stage.
- Incident banner appears only if an active linked incident exists. Key action `Investigate delay` opens incident without losing spatial context.
- Voyage path draws visited portion vs remaining portion distinctly and marks dated events. Origin/destination pins clickable; selecting next port pans camera to its map.
- Small efficiency panel shows remaining transit assumption and ETA source confidence. Avoid operational commands such as exact speed/heading change or safe passage recommendation.
- Back from incident restores selected vessel, route, and inspector tab. Shareable URL should encode selected vessel+voyage+time and work after refresh.
- Data details dense yet readable: UTC times in mono, coordinates precision appropriate for data source, speed as kn, distance as nm, ETA uncertainty inline.


## Interface / data contracts

- `VesselInspectorModel` {identity,position,positionQuality,voyageId,eta,incidents,events,actions,routeGeometry}.


## Interaction and system states

- Vessel has no voyage: identity + tracking still accessible; show `No assigned voyage`.
- Ship has stale location: position badge red/gray `Last reported`, no drifting animation.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Pacific Horizon shows scenario voyage VYG-0001, +18h ETA shift, matching $24k delay estimate.
- Vessel selection in Earth and port view yields same inspector values.


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

- Prerequisites: `instructions/07-screens/03_port_operations_screen.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/07-screens/05_incident_investigation_screen.md`

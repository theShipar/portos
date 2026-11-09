# Events And Replay Data

> PORTOS / 08-data-simulation / 04_events_and_replay_data  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define event sourcing and history sufficient to explain why a visible state changed.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Events: AIS_REPORT, ETA_REVISED, ANCHORAGE_ENTER, ANCHORAGE_EXIT, BERTH_SCHEDULED, BERTH_OCCUPIED, WEATHER_WARNING_ISSUED, INCIDENT_OPENED, INCIDENT_ACKNOWLEDGED, ACTION_ASSIGNED, INCIDENT_RESOLVED.
- Every historical event includes eventId, occurredAtUtc, ingestedAtUtc, entityRefs, sourceType, payload and quality. Events must never refer to a future entity unknown to catalog.
- For Singapore case, create a consistent sequence: vessel report near Singapore; port queue buildup; ETA forecast change; incident opens; coordinator follow-up assigned; status update. Show incident event timeline with at least six relevant events.
- Derived snapshots fold event records up to virtual current time; maintain reducer state for queue, incident lifecycle, ETA override and position. Long history can use checkpoints, but prototype's modest dataset can start with indexed event arrays.
- Replay timeline seek links visual ship marker, route completion, port occupancy/queue numbers, weather polygons and KPI summaries; all sourced from same fold.
- Manual action events are stored separately and not injected into recorded historical physical telemetry. Show audit trail as user activity at authoring time.
- Timeline navigation clicking event zooms map to linked entity and positions replay time at event timestamp. Display both occurrence and source ingestion time if discrepancy matters.


## Interface / data contracts

- `TimelineEvent` {eventId,type,occurredAtUtc,ingestedAtUtc,entityRefs:[{kind,id}],payload:{},sourceType,quality}.
- `foldEvents(baseState,events,t)` pure and stable; nested payload versioned.


## Interaction and system states

- Out-of-order arrival handled by sorting occurred time, with ingestion time for provenance.
- Historical selection before vessel exists displays `Not yet tracked`.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Singapore incident replay reaches the same +18h ETA at its revision event.
- Event timeline never shows a resolved case before first detection.


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

- Prerequisites: `instructions/08-data-simulation/03_deterministic_simulation_clock.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/08-data-simulation/05_client_state_and_persistence.md`

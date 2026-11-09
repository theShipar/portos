# Client State And Persistence

> PORTOS / 08-data-simulation / 05_client_state_and_persistence  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Persist prototype UI/workflows safely while keeping seed data immutable and testable.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Split state: immutable catalog from JSON, derived selectors at current simulated time, ephemeral presentation state, user preferences, and separately persisted synthetic workflow action log.
- Persist to localStorage with versioned keys and migrations: `portos:preferences:v1`, `portos:workflow:v1`, `portos:view:v1`; avoid storing giant position arrays twice or copying secrets.
- Client state includes selected entity, active route, layers, filtered cohort, map viewport, drawer, replay time, scenario comparison and action audit. URL encodes shareable harmless selection state; local storage retains case changes.
- Reducer ensures legal incident lifecycle, role restrictions as UI guard, assignee existence, no duplicate action IDs, and data-validation errors rather than silent mutation.
- State reset options: Reset view (camera/filters), Reset decisions (workflow only), Reset full demo. Confirmation dialog states exactly which data will be cleared.
- Prefer Pinia or Vue composition stores with computed derived selectors. Prevent reactive proxy wrapping of Three objects and WebGL resources.
- No server, synchronization or real notifications in MVP: label all actions as local demo state. Cross-tab coordination not required; if tab detects newer version, show gentle reload notice.


## Interface / data contracts

- `WorkflowAction` {actionId,entityKind,entityId,type,actorId,createdAtUtc,payload,previousState?,nextState?,source:'demo-user'}.
- Stored payload validated before hydrate; corrupted storage reset with warning and optional JSON export.


## Interaction and system states

- Browser storage unavailable: continue in-memory with `Not saved` status.
- Old schema version: migrate or ask reset; no crash.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Reload selected incident and see same assigned coordinator and note.
- `Reset demo` returns reproducible initial UI and metrics.


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

- Prerequisites: `instructions/08-data-simulation/04_events_and_replay_data.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

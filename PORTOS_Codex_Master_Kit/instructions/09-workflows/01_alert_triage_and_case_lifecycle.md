# Alert Triage And Case Lifecycle

> PORTOS / 09-workflows / 01_alert_triage_and_case_lifecycle  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Implement a complete maritime exception queue, not decorative risk chips.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Incident queue groups by urgency, age, operational exposure and data confidence. Sort must be explainable; do not prioritize solely by color. Show 5 highest-impact cases by default and a searchable expandable list.
- Lifecycle allowed: new -> acknowledged -> investigating -> mitigation_planned -> monitoring -> resolved. Reopen as separate auditable event with reason. Case status unrelated to physical ship position.
- Triage opens evidence and supports assigned owner, due time, escalation note, impact estimate and related vessel/port/voyage. Operators can acknowledge without claiming problem solved.
- Deduplicate closely related forecast changes as one case when same voyage/category/time bucket; maintain distinct unrelated weather/port events.
- State change emits local workflow action with actor, timestamp, previous/next status and explanation. UI feedback includes undo when safe; no fake external side effect.
- Cases with stale data show `Needs verification`; can't be definitively resolved without a note identifying source/assumption. Escalation aging timers use simulation clock in demo.
- Queue filtering changes map emphasized markers; selecting a case flies to affected corridor, preserves current layer settings and opens investigation drawer.


## Interface / data contracts

- `IncidentStateMachine` transitions + role requirements documented in `src/workflows/incidentMachine.ts` with unit tests.
- Priority output includes `severity`, `exposureUsd`, `ageMinutes`, `confidence` and rationale.


## Interaction and system states

- No assignee: case remains unassigned and assign action visible.
- Multiple alerts for same voyage: rollup and per-alert evidence accessible.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- User can progress INC-0001 through triage and monitoring, then reset the demo.
- Audit log captures each transition and actor ID.


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
- Next in this module: `instructions/09-workflows/02_operational_alternative_comparison.md`

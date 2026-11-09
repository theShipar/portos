# Audit Trail And Handoffs

> PORTOS / 09-workflows / 04_audit_trail_and_handoffs  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Track who decided what, on what evidence, and whether a handoff was completed.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Every synthetic user action emits append-only local audit entry: actor, role, entity refs, UTC event time, action, old/new values, scenario simulation time, note and source. Never overwrite past record when editing current state.
- Audit drawer reachable from case, voyage, port and activity hub. Filter by actor/entity/action; clicking entry focuses same map object with the replay timestamp only if it references historical event.
- Make handoff summaries concise: current status, unresolved questions, owner, due next step, latest reliable ETA, evidence freshness and draft communications.
- Add `Copy handoff summary` and `Export audit JSON` controls. Exports must include `Synthetic prototype` caveat and omit fabricated external confirmations.
- Resolve workflow requires resolution reason, supporting evidence or explicit `Resolved in simulation` acknowledgment. Reopen records new event and preserve prior decision trail.
- Avoid presenting localStorage as tamper-proof compliance audit. In production require server-side append-only logging and access control; clearly separate roadmap from current prototype.
- Scenario reset clears local decisions but not base fixture event history; optional export before reset.


## Interface / data contracts

- `AuditEvent` {auditId,actorUserId,occurredAtUtc,simulatedContextTimeUtc,entityRefs,actionType,previousState?,nextState?,notes?,source:'local-demo'}.


## Interaction and system states

- Missing local trail: show `No demo actions yet` with explanation.
- Permission changes after action do not remove old history.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Action on INC-0001 is visible in both incident and vessel audit views.
- Reset leaves underlying synthetic historic timeline intact.


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

- Prerequisites: `instructions/09-workflows/03_action_assignment_notifications.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

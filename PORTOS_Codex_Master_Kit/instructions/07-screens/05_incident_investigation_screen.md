# Incident Investigation Screen

> PORTOS / 07-screens / 05_incident_investigation_screen  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Give operators a practical evidence-led case workflow embedded into map context.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Selected incident opens a right investigation drawer; map remains visible with highlighted affected route/vessel/port. Header: incident ID, severity, state, age, owner, evidence confidence.
- Tab set: Summary, Evidence, Timeline, Actions. Summary articulates effect and unknown cause. Evidence includes structured ETA change, port wait inputs, last AIS report age, weather intersection and provenance.
- Timeline is chronological with UTC and local toggle: detected, acknowledged, assigned, recommendations, response updates, recovery. Each event links associated object.
- Actions include Acknowledge, Assign coordinator, Request port-agent ETA (draft), Open comparison, Add note and Resolve with reason. Ensure permission control and reversible local state transitions where appropriate.
- Multiple related incidents on same voyage should not double count cost exposure or create repeated owner tasks by default.
- Use focus orange only for active selection and warning. Red restricted for explicitly critical severity; use labels/icons because not all users distinguish colors.
- Display as-of UTC, source, confidence and model caveat directly in drawer; a business operator should be able to explain why this is prioritized.


## Interface / data contracts

- `Incident` {incidentId,entityRefs,category,severity,status,detectedAtUtc,acknowledgedAtUtc?,resolvedAtUtc?,ownerUserId?,evidenceIds[],actionIds[]}.
- Allowed transitions: open -> acknowledged -> investigating -> mitigated -> resolved; reopen resolved only via explicit action with audit.


## Interaction and system states

- Missing evidence: show `Insufficient evidence` and block definitive conclusions.
- View-only role cannot trigger assignment; disabled control tells user why.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Update INC-0001 from Open to Investigating; evidence and action log reflect state immediately.
- Reload restores local simulated incident action and assignment.


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

- Prerequisites: `instructions/07-screens/04_vessel_voyage_screen.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/07-screens/06_route_comparison_replay_screen.md`

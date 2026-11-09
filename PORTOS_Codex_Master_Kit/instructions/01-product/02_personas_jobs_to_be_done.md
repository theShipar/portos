# Personas Jobs To Be Done

> PORTOS / 01-product / 02_personas_jobs_to_be_done  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define who pays for and operates PORTOS, separating decision authority from day-to-day analysis.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Persona A: Fleet Operations Manager; monitors 10–100 vessels, owns on-time performance, disruption triage and escalation. JTBD: “When voyage plans change, quickly find the affected voyage and coordinate a defensible response.”
- Persona B: Port Call Coordinator; tracks arrival notices, anchorage, terminal readiness, agents and berth appointments. JTBD: “When a port call slips, coordinate stakeholders with one version of the facts.”
- Persona C: Marine Operations Analyst; compares route, weather, speed and delay drivers. JTBD: “When risk rises, understand why and produce feasible response options.”
- Persona D: COO / Shipping Business Owner; visits at start of day to see exception exposure, operating trends and unresolved cases, not 300 ship markers at once.
- Persona E: Customer-service coordinator; can view vessel/ETA and draft a notification, but cannot approve route plans or overwrite source telemetry.
- RBAC mock roles: viewer, analyst, dispatcher, manager. Viewer can inspect, analyst can prepare recommendations, dispatcher can assign tasks, manager can confirm scenario decisions. In a frontend prototype, simulate roles honestly—do not misrepresent client-side guards as backend security.
- Document first five minutes for each persona: search or pivot globe, drill to problem, interpret confidence and freshness, open history, take approved action.
- Produce persona-based saved views, not wholly different screen layouts. Information density differs by role through configurable summary surfaces.


## Interface / data contracts

- `users.json`: userId, displayName, role, organizationId, defaultWorkspace, permissionFlags, locale and timeZone.
- UI action authorization key convention: `action.{resource}.{verb}`, e.g. `action.incident.assign`.


## Interaction and system states

- Permission denied: explain action is unavailable, no fake button success.
- Analyst without live feed: show synthetic provenance prominently.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Each role can finish its own top task with no more than 3 major UI state changes.
- Manager dashboard never relies on technical AIS fields alone for its summary.


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

- Prerequisites: `instructions/01-product/01_product_vision.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/01-product/03_information_architecture.md`

# Product Vision

> PORTOS / 01-product / 01_product_vision  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make PORTOS a decision-oriented maritime exception-management product, not a vessel-tracking decoration.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Product category: maritime fleet and port operations decision support for fleet operations centers, vessel operators, port-call managers, and logistics coordinators. Initial release is a coherent, synthetic-data frontend prototype, not a live AIS product.
- Primary operator question: “Which voyage, port call, or risk requires attention now, what evidence explains it, and which operational response is available?” Every screen must be capable of answering it.
- Differentiator: navigable Earth -> region -> port -> vessel -> incident path with context preserved. Avoid routing users into unrelated flat dashboards.
- Scope: 500 simulated vessels, 100 ports, 200 voyages, 50 incidents, geospatial weather hazards, timeline snapshots, alternatives, work items and auditable decisions. The core demonstration centers on Singapore congestion and one vessel predicted late to Rotterdam.
- Commercial user value: faster identification of at-risk voyages, lower manual tab-switching, traceable operating decisions, timely customer updates and port-call coordination. Never imply guaranteed cost savings.
- Out of scope: actual AIS ingestion, navigational route certification, collision avoidance, vessel automation, berth booking, customs clearance, financial accounting, unrestricted real-time data claims.
- Demo storyline: 1) open global Earth, 2) click Southeast Asia, 3) inspect Singapore anchorages, 4) select MV Pacific Horizon, 5) review revised ETA and evidence, 6) compare wait/expedite/port-option scenarios, 7) assign a coordination action, 8) replay and verify state changes.
- Success is functional continuity across this journey and coherent computed numbers, not the number of cards or effects. A user should complete the primary demo with at most two persistent navigation controls visible.


## Interface / data contracts

- Product modules: globe, region, port, fleet, voyage, incident, route, risk, replay and action queue.
- Read-only imported source truth resides in `sample-data/*.json`; mutable prototype state consists of local action log + UI selection + simulation clock.
- Core artifact contract: no screen displays “live” without the qualifier `Simulated`; every selected entity opens a grounded route.


## Interaction and system states

- Valid global: no selection, selected vessel, selected port, active incident and replay.
- Valid empty: no matches, unavailable feed, unknown ETA, no comparable route, stale telemetry.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Start from Earth and navigate to Singapore in ≤4 interactions.
- Inspect an incident and make a reversible synthetic decision without a page refresh.
- Show provenance and assumptions alongside estimated financial exposure.


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

- Prerequisites: `START_HERE.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/01-product/02_personas_jobs_to_be_done.md`

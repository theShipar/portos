# Acceptance And E2E Matrix

> PORTOS / 10-testing / 01_acceptance_and_e2e_matrix  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define measurable journey and data correctness gates for an authentic working prototype.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Minimum core tests: Earth first paint, global-to-region flight, region-to-port drill, port vessel selection, incident evidence, scenario comparison, assignment, replay, deep link, browser back, reset, WebGL error path.
- Use Playwright Chromium tests for DOM controls and map interactions via stable accessibility labels and exposed test-only scene adapter method—not brittle screenshot coordinates alone. Verify canvas is present, renderer initialized and selected map hit targets work.
- Include contract tests for 500 vessels, 100 ports, 200 voyages, >=50 incidents, all FKs, plausible ISO UTC dates, coordinate bounds, unique IDs and signed ETA calculation.
- Verify KPI consistency: selected incident exposure = voyage panel exposure for single incident; global aggregation deduplicates same voyage; queue count = linked visible queue list; alert counts respond to active filter.
- State tests: replay same timestamp produces same position and ETA; stale feed stops movement; query URL reproduces selected entity; local actions persist after refresh and reset cleanly.
- Accessibility smoke: all major map targets reachable through search/list, no keyboard trap in inspector, focus visible, semantic labels, motion reduction respected.
- E2E test data must reference known scenario fixtures `VSL-0001`, `VYG-0001`, `INC-0001`, `PRT-SIN` and fixed simulation UTC anchor.


## Interface / data contracts

- Tests live `tests/e2e`, `tests/unit`, `scripts/validate_data.py`; use deterministic seeded fixture.
- Every test asserts a user-visible result plus underlying state where feasible.


## Interaction and system states

- Browser lacks WebGL in CI: document limitation, do not claim visual fidelity passed; run browser on WebGL-capable host before delivery.
- Missing tile provider: verify explicit unavailable state without app crash.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Core Singapore journey passes end to end on real Vite server.
- `npm run build`, `npm run typecheck`, `npm run test`, `python scripts/validate_data.py` succeed.


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
- Next in this module: `instructions/10-testing/02_visual_regression_accessibility.md`

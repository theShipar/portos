# Codex Execution And Release

> PORTOS / 10-testing / 04_codex_execution_and_release  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make the instruction pack a reliable staged implementation contract rather than one huge ambiguous request.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Codex must read `AGENTS.md`, `START_HERE.md`, `instructions/INDEX.md`, `schemas`, and `CODEX_MASTER_PROMPT.md`. Before coding confirm original skill availability, repo and license, and inspect actual `three-scope-map/SKILL.md` and bundled Vue template.
- Recommended phases: (1) scaffold typed Vue/Vite app and validate fixture; (2) integrate original Earth scene faithfully; (3) extend global regions and navigation; (4) maritime overlays/vessel LOD; (5) port 2D mapping; (6) shared business logic engines; (7) investigation UI and actions; (8) replay and QA.
- Work in small independently buildable slices: write implementation tasks with files changed, data dependencies, acceptance tests, screenshots, error logs and next phase. Stop if high-risk licensing or data authenticity issue cannot be resolved.
- Do not replace real WebGL with screenshot, CSS globe, flat SVG or fake live integrations. If WebGL unavailable, explain source and leave explicit diagnostic view; do not falsely mark complete.
- Maintain a working `docs/BUILD_LOG.md`, `docs/DECISIONS.md`, and `docs/KNOWN_LIMITATIONS.md`; document any divergence from visual reference and original skill.
- Before finalizing: execute Python dataset validator, original skill integrity script when available, strict map project checker where applicable, `npm ci`, `npm run build`, unit tests and browser E2E. Report concrete outcomes rather than aspirational checkboxes.
- Deliver actual source project, accessible local dev URL (only after running), screenshots from built app, README with commands and limitations; no promise of real-time vessel information.


## Interface / data contracts

- Each phase records `implemented`, `tested`, `blocked`, `changedFiles`, `next`. All generated components must use the same typed entity contract.


## Interaction and system states

- Missing skill installation: install from user-provided repository or pause with precise instruction; don't recreate a loose generic globe.
- Missing real AIS: continue clearly labeled synthetic data path; never block frontend simulation on live API keys.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Full scripted demo completes in browser, with no inert primary controls.
- Final README explicitly distinguishes prototype implementation from production requirements.


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

- Prerequisites: `instructions/10-testing/03_performance_and_resilience.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

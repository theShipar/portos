# Provenance Uncertainty Alerts

> PORTOS / 06-intelligence / 06_provenance_uncertainty_alerts  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make every operational recommendation auditable and distinguish modeled data from observed facts.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Every position/port/weather/ETA metric displays source class (Simulated fixture, Derived model, User scenario), `asOfUtc`, age and confidence; do not use a bright green `LIVE` badge on synthetic data.
- Define freshness bands by feed category, e.g. AIS last position older than 30 min becomes stale for visual movement; source-specific thresholds are settings not universal maritime standards.
- Separate `Observed`, `Estimated`, `Scenario`, `Unknown`. Status should not derive solely from color. Observed refers to source fixture event within demo, not real live telemetry.
- Alert object contains rule key, trigger observations, opened timestamp, linked vessel/voyage/port, severity rationale, confidence, lifecycle and owner; deduplicate repeated same-type events within a configured window.
- Incident prioritization combines exposure, service impact, risk severity and time unresolved. Evidence panel shows each source entry, changed value, valid time, calculation assumptions and recommended next investigation step.
- Distinguish `data unavailable`, `stale`, `no active alert`, `acknowledged`, `resolved`. Loss of signal is its own operational situation, not evidence of safety.
- Provide user-accessible source disclosure in floating inspector while preserving visual minimalism. Export includes caveat `Illustrative simulation — not a navigational or operational data feed`.


## Interface / data contracts

- `Evidence` {evidenceId,sourceType,sourceId,observedAtUtc,receivedAtUtc,entityRef,field,value,unit?,quality}; `Alert` links evidenceIds[] and ruleId.


## Interaction and system states

- Conflicting ETA sources: show authoritative currently selected source and an unresolved discrepancy note.
- Source offline: retain last known with explicit age and stop extrapolation.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Every risk/impact chip can reveal provenance within one click.
- A stale AIS vessel does not animate indefinitely.


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

- Prerequisites: `instructions/06-intelligence/05_analytics_kpi_contracts.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

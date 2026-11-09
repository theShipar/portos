# Visual Regression Accessibility

> PORTOS / 10-testing / 02_visual_regression_accessibility  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Ensure consistency and serious professional quality across all spatial states.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Capture baseline desktop screenshots at 1440x900 and 1920x1080 for Earth, selected cluster, regional map, Singapore port, selected vessel, investigation drawer, route comparison and replay.
- Visual checks: map visible (not screenshot substitute), proportional vessel symbols, readable white panels, coherent 8px rhythm, no clipped text, no overlapping flyouts, no neon HUD flourishes, no inconsistent orange statuses.
- Use explicit theme tokens and contrast tests. Text on white >=4.5:1 where standard text; larger text >=3:1; selected markers also use stroke/shape beyond hue.
- Responsive 1280x800, 1024x768, 768x900. Tablet: inspector becomes bottom sheet and map remains central; below minimum supported width show safe navigation/data list mode not broken UI.
- Honor prefers-reduced-motion: Earth intro shortens or disables, flashing routes and pulsing incident effects are off, replay visuals update discretely.
- Screen reader: exposed table/list alternative for canvas data, accessible `aria-label` for search results and controls, keyboard escape/back functionality.
- Review actual UI screenshots against generated concept only for hierarchy; never reuse rendered concept art instead of code-built canvas geometry.


## Interface / data contracts

- Snapshot naming `tests/visual/01-earth-desktop.png` ... `08-replay-desktop.png`; include a checklist in `docs/VISUAL_QA.md`.


## Interaction and system states

- Browser zoom at 200%: major controls remain operable without clipping.
- Reduced motion: no autoplay camera flourish or hidden vital content.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Screens visually consistent with token system and repeated component dimensions.
- All listed critical views have captured evidence from real app rendering.


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

- Prerequisites: `instructions/10-testing/01_acceptance_and_e2e_matrix.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/10-testing/03_performance_and_resilience.md`

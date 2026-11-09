# Layout Grid Spacing

> PORTOS / 02-design-system / 04_layout_grid_spacing  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define precise desktop geometry, responsive rules and harmonious padding rather than visual guesswork.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Work at 1440×900 canonical desktop, verify 1280×800 and 1920×1080, then tablet 1024 width. Prototype desktop-first; do not claim mobile operations-grade support.
- Global 8px spacing unit with approved substeps 4px; spacing scale 4,8,12,16,20,24,32,40,48. Repeated panels use 16px internal padding, inspector uses 20px, dense rows 10–12px vertical.
- Header height 56px; vertical rail 56–64px (icons, tooltips, accessible names); map host uses remaining viewport size; bottom timeline 56px when enabled.
- Floating inspector width 368px default, expandable to 420px, min remaining map width 680px. Position top-right with 12px inset; preserve map center/right safe area for labels.
- Top-left scope breadcrumb bar 36px; top-right layer switcher and FPS-independent map utilities. No overlapping controls at 1280px.
- Component corners 8px standard, 4px dense technical chips, 12px overlay. Avoid 24px consumer app pills. 1px dividing lines aligned to grid.
- Data tables row 36–40px, clear selected 2px left indicator and a11y focus ring; no heavy zebra stripes.
- Use CSS grid for structure, flex for control groups; Three.js canvas positioned absolute inside observed-size container. Never hardcode 1920x1080 `.map-host`.
- `ResizeObserver` updates renderer dimensions and pixel ratio; do not react to viewport size alone.


## Interface / data contracts

- CSS variables `--shell-header-h`, `--shell-rail-w`, `--inspector-w`, `--map-control-gap`, `--panel-radius`, `--space-1..12`.
- Layout contract: `MapWorkspace` owns canvas bounds; overlays cannot capture map pointer events outside their rectangles.


## Interaction and system states

- Inspector closed: preserve zoom and selection but reclaim map width.
- 1024px: inspector becomes a sheet with map partially visible; never overflow horizontal.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- No collisions among map controls, overlays and breadcrumb at widths ≥1280px.
- Safe area preserved around port labels and selected vessel marker.


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

- Prerequisites: `instructions/02-design-system/03_typography_and_data_readability.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/02-design-system/05_components_states_accessibility.md`

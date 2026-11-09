# Global Fleet Screen

> PORTOS / 07-screens / 01_global_fleet_screen  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define the visually distinctive but operationally useful first view, with Earth as the primary canvas.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Default route `/operations` uses full-viewport world globe, restrained daylight/earth textures and dark navy water against light page chrome. Header height 64px; left logo, global search, right simulation clock and profile.
- Map default camera centered to show Europe/Africa/Asia with subtle orbit only after user inactivity; persistent user interaction cancels orbit. Fleet aggregated by region/latitude cluster until zoom threshold.
- Overlays: top-left slender global KPI row (tracked, delayed, at-risk, exposure) using compact datum cards, upper-right layer stack, lower-left incident queue chip, lower-center playback control collapsed.
- Interactions: click cluster -> region, click major port -> fly to region preserving port, click vessel -> right inspector, click incident -> select vessel/region, click KPI -> applied map filter.
- Coordinate portal and panel layout so map is visually central, not squeezed into a decorative card. Show own fleet vs world ambient markers as separate visibility toggles.
- Use geographic borders only where appropriate; dark glowing country extrusions are subtle and do not obscure shipping corridors. Route ribbons encode actual voyages in fixture.
- Selected markers highlighted orange; high severity incident orange-red. Strong monochrome hierarchy with only operational colors glowing.


## Interface / data contracts

- Data view model includes `visibleVessels`, `portClusters`, `activeVoyages`, `globalKpis`, `incidentDigest` generated from central selectors.


## Interaction and system states

- No ships in visible hemisphere: rotate/zoom indicator + search entry, not a blank canvas.
- WebGL unavailable: clear error with list/inspector backup and no counterfeit interactive globe.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Layout at 1440x900 retains ≥80% map exposure when drawer closed.
- Demo first-click Singapore goes to regional scope with a coherent camera transition.


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
- Next in this module: `instructions/07-screens/02_regional_maritime_screen.md`

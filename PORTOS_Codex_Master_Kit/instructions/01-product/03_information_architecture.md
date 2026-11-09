# Information Architecture

> PORTOS / 01-product / 03_information_architecture  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Establish a map-first navigation taxonomy with deep links and persistent geographic context.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Root workspace is `/operations` and defaults to the Earth unless a saved selection/deep link exists. The map remains mounted while mode, scope or entity selection changes.
- Route families: `/operations` global, `/region/:regionId`, `/port/:portId`, `/vessel/:vesselId`, `/voyage/:voyageId`, `/incidents/:incidentId`, `/compare/:voyageId`, `/replay/:voyageId`.
- Breadcrumb example: Earth / Asia / Southeast Asia / Singapore / MV Pacific Horizon / Incident INC-0001. Breadcrumb clicks restore the relevant camera preset and visible overlays.
- Header: logo left, persistent search centered, simulation timestamp/freshness and profile right. Add top-level destinations only if they do not obscure the map.
- Overlay panels: floating collection collapsed to chips by default; contextual inspector at 344–420px width when selected; bottom time rail 52–64px only when needed.
- At Earth scope, show aggregate markers with cluster status. At regional scope, show ports, routes and vessel density. At port scope, show terminals, anchorage zones, queues and vessel motion. At voyage scope, highlight its track and hide unrelated clutter.
- Use `selection`, `scope`, `layers`, `time`, `camera`, `scenario` as independent slices of view state. Navigation must not reset layer preferences or simulation time accidentally.
- Keyboard: `/` focuses search, `Esc` closes most recent overlay, `Backspace` (outside input) traverses geo breadcrumbs, `?` opens shortcuts.


## Interface / data contracts

- `ViewRoute = { level: 'earth'|'region'|'port'|'vessel'|'incident'|'compare'|'replay'; id?: string; parentTrail: GeoCrumb[] }`.
- URL search params: `t`, `layers`, `selection`; decode with validation and sane defaults.


## Interaction and system states

- Invalid deep link: explain missing entity and return to nearest valid parent.
- Cross-mode transitions: retain active incident and related voyage.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Back/forward browser navigation reproduces geographic selection and panel state.
- No action causes redundant complete WebGL remount.


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

- Prerequisites: `instructions/01-product/02_personas_jobs_to_be_done.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/01-product/04_end_to_end_user_journeys.md`

# Visual Direction

> PORTOS / 02-design-system / 01_visual_direction  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Deliver a credible serious industrial maritime interface rather than glossy game HUD or consumer concept art.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Brand adjective sequence: precise, restrained, authoritative, technical, calm, spatial. Do not imitate sci-fi dashboards with neon borders, glowing corner ornaments or constant animation.
- App shell near-white/off-white. Main cartographic canvas very deep navy water and subtly lit land; semantic orange for focus/action, not every outline; technical grays for hierarchy.
- Match desktop operations center density: headings 20–28px, supporting type 12–14px, data numbers 16–28px depending context; never giant marketing headlines inside the active workspace.
- Keep map-first composition: target 80–85% viewable area for spatial canvas when inspector collapsed; when inspector opens, keep at least 65–70% spatial canvas at 1440px.
- Interface chrome: flat or gently elevated panels, 1px hairline boundaries, 8–12px radius maximum, subdued shadow, deliberate alignment; no dashboard of disconnected rounded tiles.
- Ship markers use encoded status/heading not illustration thumbnails; an active selection may show silhouette/label, the rest use low-clutter vector or instanced glyphs.
- Primary workflows: user can spot a cluster, fly to a region, inspect a port queue, investigate vessel evidence and create an action without shifting navigation mentally.
- Provide two grounded product visual references in `assets/` only if licensed. Do not embed copyrighted maps/screenshots or AI concept illustrations as functional data layers.


## Interface / data contracts

- Visual tokens must come from `src/styles/tokens.css` or `tokens.ts`, never scatter arbitrary styles in views.
- Default first paint uses calm Earth with 3–5 meaningful context controls visible.


## Interaction and system states

- High alert state emphasizes event row/marker, not every surface.
- Motion preference `prefers-reduced-motion` disables nonessential flourish.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Screenshot of 1440x900 global view reads as professional control software.
- User can identify selected object, scope, status and data timestamp within three seconds.


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
- Next in this module: `instructions/02-design-system/02_color_and_semantic_tokens.md`

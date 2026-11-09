# Motion And Microinteractions

> PORTOS / 02-design-system / 06_motion_and_microinteractions  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Set intentional animation to help map continuity without sacrificing operational clarity.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Movement hierarchy: important camera transitions 900–1600ms, map focus 450–750ms, drawer 180–240ms, selection halo 150ms, hover feedback 80–120ms. No infinite bouncing cards.
- Globe idle rotation optional and extremely subtle; pause on pointer drag, selection, active incident, tab-hidden and reduced motion. Do not rotate selected vessel away from view.
- Earth-to-region handoff: prewarm destination scene; camera approaches selected region along a smooth arc; fade globe and reveal geographically aligned region without a blank frame; keep UI context breadcrumb.
- Interpolate vessel position only between known synthetic timestamp samples; do not pretend fresh positions beyond last sample. Heading changes ease briefly, but the replay marker must land on exact underlying coordinates.
- Selected route animates a traveling pulse at readable speed, but disables under reduced motion and doesn't imply actual vessel speed. Route risk sections use dotted/solid semantic line styles.
- Panel open moves and slightly resizes map viewport carefully; preserve geographic center target. No camera jump after drawer animates.
- Alert transitions should avoid color flashes. Severity change updates badge and briefly highlights row, with accessible announcement.
- Performance: no animation tied to repeated Vue reactive writes each frame; update Three attributes or scene uniforms inside one render loop.


## Interface / data contracts

- `MotionPreset` with durations/easing; GSAP only for camera orchestration, CSS transitions for UI, requestAnimationFrame for rendering.
- `prefers-reduced-motion`: immediate camera preset / crossfade ≤100ms / disable pulses and idle rotation.


## Interaction and system states

- Interrupted camera motion cancels previous GSAP timeline; final target remains stable.
- Paused simulation freezes vessel motion and timeline progress but map orbit remains interactive.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Complete drilldown has no blank canvas or double visible geometry.
- Short user input during transition doesn't leave broken selection state.


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

- Prerequisites: `instructions/02-design-system/05_components_states_accessibility.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: Proceed to the next module in `instructions/INDEX.md`.

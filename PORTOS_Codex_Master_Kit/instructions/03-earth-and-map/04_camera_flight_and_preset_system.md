# Camera Flight And Preset System

> PORTOS / 03-earth-and-map / 04_camera_flight_and_preset_system  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Implement polished camera transitions that respect positions and avoid unnecessary cinematic delay.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Store camera presets per scope: Earth global, East Asia, Southeast Asia, Singapore, Rotterdam, Suez, Indian Ocean, vessel-focused; each preset includes target geo-coordinate, distance/altitude, tilt, heading, max pitch and clipping range.
- On user navigation use 800–1400ms GSAP ease for meaningful scope change; minor selected-object focus 350–650ms. Calculate look-at quaternions to avoid gimbal jumps when orbiting near poles.
- Transition order: 1. validate target; 2. preload destination geometry/tiles; 3. disable conflicting picking; 4. animate to bounding focus; 5. unveil next scene with no blank frame; 6. restore selection/list focus; 7. release prior temporary assets.
- Hold `CameraTransitionController` singleton per active view with cancel/pause/resume methods. On new user selection, cancel current flight and start from actual camera pose, never original starting pose.
- Native pan/zoom/rotate allowed on globe and region; 2D port map uses separate map camera. Provide reset-view action and camera bookmark for named voyage or region.
- Keep the selected entity visible when inspector opens: adjust target offset or camera FOV rather than moving the marker behind panel.
- Respect reduced-motion: jump to stable target with short opacity crossfade; no mandatory Earth fly-through for frequent operations.
- Start globe scene from preview-ready state while region renderer warms quietly, consistent with skill's phase ownership policy.


## Interface / data contracts

- `CameraPreset{ id,scope,center:{lat,lon},distance,headingDeg,pitchDeg,minDistance,maxDistance }`.
- `flyToPreset(preset,{duration,retainSelection,signal})` resolves only when projection and scene ready.


## Interaction and system states

- Interrupted/rapid clicks maintain finite camera coordinates.
- Camera reset at every scope must not discard current incident details.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Ten rapid entity selections do not leave overlapping transitions or active RAF leaks.
- Reduced motion jumps preserve geographic consistency.


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

- Prerequisites: `instructions/03-earth-and-map/03_geographic_region_drilldown.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/03-earth-and-map/05_ocean_coastlines_lighting.md`

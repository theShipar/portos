# Vessel Mesh Geometry

> PORTOS / 04-maritime-3d / 01_vessel_mesh_geometry  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Build believable low-poly-to-detailed maritime vessel geometry with consistent anchors and scale.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Ship classes: container carrier, bulk carrier, oil/product tanker, LNG carrier, car carrier/RoRo and general cargo. Each has distinctive silhouette, proportional hull, bow/stern, deck profile, superstructure and class-specific cargo geometry.
- Source visible selected-vessel model from licensed glTF where possible; otherwise create parametric geometric representation using beveled hull primitives and deck modules. Do not use generic cubes for all vessel classes.
- Coordinate convention: model forward local +Z, up +Y; hull centroid at origin, waterline y=0, target length normalization 1 unit. Set bow tip positive Z; verify this with heading math.
- For each class define approximate proportions in class preset (e.g. container length/beam 7–9, tanker 5–7, bulker 5–7; illustrative only). Geometry details never imply exact ship design certification.
- Selected port vessel can show readable bow, aft deck, bridge, stacks or tanks. Global vessels use simplified triangles and heading vectors; do not place dozens of large detailed meshes on Earth.
- Mesh selection via invisible hit proxy at minimum 12 screen pixels; hover label shows vessel ID, speed, last update and state; selected vessel anchors inspector and route highlight.
- Cargo ship materials are charcoal/steel gray with subtle orange selection outline; do not paint all ships orange. Unknown identifiers use generic hull, never a real operator logo.
- Add optional wake for underway state only, tied to speed threshold; never show wake on moored vessel.


## Interface / data contracts

- `VesselModelDescriptor{vesselId,class,lengthM,beamM,draughtM,headingDeg,speedKn,operationalState,lod}`.
- `buildVesselGeometry(class,detail)` returns group with forward +Z and waterline origin.


## Interaction and system states

- Missing dimensions use class preset tagged `estimated`; no fabricated precision on details.
- 0 speed or at berth -> no directional wake or position interpolation.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Six visual class silhouettes distinguishable without labels when zoomed in.
- Heading and focus state are consistent on globe, region and port map.


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
- Next in this module: `instructions/04-maritime-3d/02_vessel_models_lod_materials.md`

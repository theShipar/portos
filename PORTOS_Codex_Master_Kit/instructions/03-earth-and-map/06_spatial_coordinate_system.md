# Spatial Coordinate System

> PORTOS / 03-earth-and-map / 06_spatial_coordinate_system  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Standardize geographic placement for globe, regional meshes, port map and replay.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Canonical data is WGS84 decimal latitude and longitude, lon in [-180,180], latitude in [-90,90]. Never store projected canvas XY as entity source truth.
- Implement pure coordinate utilities: normalizeLon, clampLatitude, haversineDistanceNm, sphericalPosition, headingToQuaternion, antimeridianSplit, interpolateGeodesicShortArc, unprojectMapClick, projectLngLatToViewport.
- Sphere conversion convention (example): x=R*cos(lat)*sin(lon), y=R*sin(lat), z=R*cos(lat)*cos(lon), with radians; match visual globe texture orientation empirically before overlays.
- Render Earth radius in scene units (e.g. 100); keep ship physical model scale independent of distance by LOD, because true vessel length versus Earth radius is imperceptible.
- AIS heading values 0° north, 90° east; convert bearing to model yaw based on mesh's forward axis. Course over ground and gyro heading may differ; use course when available and label source.
- Route lines crossing ±180 must be split into distinct segments in geographic 2D and interpolated in 3D, not connect across entire map.
- Avoid interpolating through land: route geometry comes from curated marine waypoints. A short-arc spherical interpolation is allowed only between adjacent vetted water points.
- Date/time and spatial interpolation must share simulation UTC. Replay selecting timestamp maps to coordinate sample position deterministically.


## Interface / data contracts

- Required test fixtures: Singapore [103.8198,1.3521], Rotterdam [4.47917,51.9225], Pacific [179,0] -> [-179,0]. Coordinates are illustrative anchors, not authoritative berth locations.
- `GeoPoint {lat:number;lon:number}` and `RoutePoint{point:GeoPoint;timeUtc?:string;source:'synthetic'}`.


## Interaction and system states

- Null/invalid geographic coordinates quarantined from renderer with data quality report.
- Heading 359°->1° interpolates over 2°, not 358°.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Unit tests cover five continents, antimeridian, northern/southern hemispheres and distance bounds.
- Selected vessel icon aligns with voyage direction visually.


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

- Prerequisites: `instructions/03-earth-and-map/05_ocean_coastlines_lighting.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/03-earth-and-map/07_rendering_performance_quality.md`

# Ocean Coastlines Lighting

> PORTOS / 03-earth-and-map / 05_ocean_coastlines_lighting  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Define credible maritime cartography and lighting without fabricating navigational charts.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Earth uses texture source consistent with bundled skill; land relief subdued with physically legible seas. Ambient and directional lights support orientation, not decorative color saturation.
- Regional view shows coastlines, simplified bathymetric shading where properly licensed and documented, navigable channels only if derived from licensed geospatial sources. Do not invent contours and call them safety-critical nautical channels.
- Emphasize major chokepoints (Singapore Strait, Malacca, Suez, Panama, Gibraltar) with precise reference markers; curated route corridor shapes are approximate conceptual visualization only.
- Custom land extrusion is restrained and tied to zoom; extrusions must not occlude ships near coast. The skill's dramatic terrain thickness can be retained in regional overview but reduced for working port views.
- Ocean effects: very low-amplitude shader normal animation, soft specular movement and subtle fog; switch off on low-quality tier. No cartoon waves or looping giant glow pulses.
- Time of day influences optional Earth lighting if desired, but do not alter AIS vessel location or source fact. Night texture should not obscure administrative context.
- Labels: country at global, port at regional, terminal/anchorage at port, vessel at focused selection; prevent simultaneous labels from saturating view.
- Keep a small geospatial attribution/control footer for any basemap, dataset and tile licensing; maintain skill source code attribution separately.


## Interface / data contracts

- Shader settings centrally typed: opacity, atmospheric intensity, relief/extrusion, contour brightness, ocean normal speed.
- Port 2D style source has attributed provider, license and access policy.


## Interaction and system states

- Unavailable bathymetry hides layer with `Not installed` message.
- Low FPS quality setting drops bloom and wave normal first, never symbols/critical alerts.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Coastline stays legible at both 3D overview and 2D port.
- No falsely precise marine channel data in demo.


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

- Prerequisites: `instructions/03-earth-and-map/04_camera_flight_and_preset_system.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/03-earth-and-map/06_spatial_coordinate_system.md`

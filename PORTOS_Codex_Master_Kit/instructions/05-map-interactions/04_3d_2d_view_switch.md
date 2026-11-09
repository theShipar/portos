# 3D 2D View Switch

> PORTOS / 05-map-interactions / 04_3d_2d_view_switch  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Use 3D where it explains context and 2D where it improves maritime spatial accuracy.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Earth mode: Three.js textured globe, global corridors, selected vessels and region rings. Region mode: original skill-derived 3D geographic mesh or geospatial globe tilt where supported. Port mode: MapLibre GL 2D detailed map with terminal/anchorage geometry and data markers; optional isometric port conceptual overlay.
- Provide explicit `3D / 2D` control in compatible region scopes and offer `Port detail` when precise positions need 2D. A 2D nautical-chart substitute must not be presented as certified navigational information.
- When switching mode preserve center longitude/latitude, approximate geographic bounds, selected object, filter set, layer set, replay time and the open inspector. Camera tilt is mode-specific.
- Projection is shared through geographic coordinates and metadata; never transform lon/lat by arbitrary pixel scale. Longitude crosses the antimeridian safely and port map can use zoom appropriate to local detail.
- Loading 2D map tiles must not block the rest of the interface. If tiles unavailable, display truthful map unavailable message plus list-based data access, not a fake geospatial diagram.
- WebGL scene mount/unmount coordinated to prevent two continuously rendered layers consuming GPU. Keep a single source of truth for selected objects.
- Position markers and existing geometry must match within map projection precision when switching modes. Ship model scales by world-meters in port detail; use UI glyph instead when detailed mesh impractical.


## Interface / data contracts

- `ViewportState = {mode:'globe'|'region3d'|'port2d',center:{lon,lat},bounds,tiltDeg,zoom,selectedId?,utcTime}`.
- External basemap requires explicit license/attribution; use a configurable map source URL and documented fallback.


## Interaction and system states

- Incompatible 3D representation: disable toggle with tooltip explaining why.
- Offline tiles: keep selected vessel's technical details accessible.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Global -> Southeast Asia -> Singapore -> 2D -> 3D region -> Earth retains selected vessel context.
- No duplicate marker appearing at shifted longitudes after mode switch.


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

- Prerequisites: `instructions/05-map-interactions/03_global_search_and_filters.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/05-map-interactions/05_replay_and_time_navigation.md`

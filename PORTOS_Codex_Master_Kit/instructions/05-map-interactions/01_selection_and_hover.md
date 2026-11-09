# Selection And Hover

> PORTOS / 05-map-interactions / 01_selection_and_hover  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Make every map element an accessible, grounded entry to a concrete operational entity.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Implement an interaction priority: selected vessel/port/incident > hovered direct object > cluster > regional polygon > ocean background. Limit hover hit tests to visible selectable layers, and ignore controls embedded over the canvas.
- Hover on a ship reveals its name, IMO/MMSI only if present in fixture, SOG, last report age, heading, voyage and current exception count; do not show an incident solely because marker is orange.
- Vessel click sets `selectedEntity={kind:'vessel',id}`, focuses it without disorienting camera movement, highlights a linked voyage route, and opens right inspector. Ctrl/Cmd click can pin additional comparison vessel; max 3 selected.
- Port click enters port focus only when the user is at region level; from Earth, first flight to enclosing region preserving port intent, then focus. Provide explicit quick action `Go directly to port` for returning users.
- Background click dismisses hover but not a pinned inspector. Escape unwinds dialog > flyout > selection > scope. Clear selection action always visible.
- Touch click uses 28px+ hit targets; pointer hit areas may exceed visual glyph size. Keyboard search results offer same actions as map markers.
- For clusters: show fleet count, latest exception severity, geographic extent; click zooms to bounds, never picks a random vessel.
- Tooltips remain in viewport and avoid occluding the selected marker. Pointer movement throttled to once per animation frame; cancel stale hover when mode changes.


## Interface / data contracts

- `MapHit = {kind:'vessel'|'port'|'region'|'hazard'|'route'|'cluster',entityId:string,screenX:number,screenY:number}`.
- `selectionStore.select(hit)` returns normalized selection; scene emits `map:hover`, `map:select`, `map:double-click` typed events.


## Interaction and system states

- Missing entity record: drop invalid hit gracefully with nonblocking message.
- Selected item filtered out: retain selected inspector but show `Hidden by active filter` chip and clear shortcut.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Selecting one of 500 vessels opens correct inspector in <300ms excluding camera travel.
- Mouse/keyboard selection produce identical entity state and URL.


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
- Next in this module: `instructions/05-map-interactions/02_layer_management.md`

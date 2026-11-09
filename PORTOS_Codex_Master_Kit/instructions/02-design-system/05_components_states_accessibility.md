# Components States Accessibility

> PORTOS / 02-design-system / 05_components_states_accessibility  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

List reusable UI primitives and behavior across loading, error, disabled, hover, focus and selected states.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Primitives: AppHeader, AppRail, MapToolbar, LayerToggle, IconButton, SegmentedControl, StatusChip, TechnicalTag, KPIReadout, MetricDelta, UTCStamp, SearchCombobox, EvidenceList, EntityBreadcrumb, MapTooltip, InspectorDrawer, ActionMenu, OptionCompareCard, IncidentRow, TimelineScrubber, Toast, ConfirmDialog, DataFreshnessBadge.
- Each primitive has default, hover, pressed, focus-visible, disabled, loading and error when applicable. Disabled controls show reason; buttons must have actual handlers.
- Map selection is keyboard-reachable via a corresponding results list, because WebGL picking alone is not accessible; highlight linked marker when focusing a list row.
- Search Combobox: arrow navigation, enter to select, escape to close, deterministic type-ahead, 10-result cap and grouped vessel/port/voyage/incident options.
- Status chips always have label plus icon. Data freshness control shows simulated clock and source; never show fake `Live` green dot unqualified.
- Inspector semantics: heading contains entity name, tabs are semantic, content remains mounted appropriately, close returns focus to prior trigger.
- Toast confirms only local prototype actions, e.g. `Draft task created locally`. Never say vessel changed course or stakeholders notified.
- Long data lists virtualized only when necessary; maintain stable scroll anchor when filtering or replaying.


## Interface / data contracts

- Component props must be typed; CSS tokens only; input/output event types declared centrally.
- Unit-test interaction contract of SearchCombobox, InspectorDrawer, TimelineScrubber and OptionCompareCard.


## Interaction and system states

- No results, loading, invalid ID, expired scenario, stale data, not enough permissions and reduced-motion all have explicit visuals.
- Empty-state copy suggests a concrete next action; never fake data.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- All actionable elements keyboard reachable, labeled and visible on focus.
- No decorative button pretending to work.


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

- Prerequisites: `instructions/02-design-system/04_layout_grid_spacing.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/02-design-system/06_motion_and_microinteractions.md`

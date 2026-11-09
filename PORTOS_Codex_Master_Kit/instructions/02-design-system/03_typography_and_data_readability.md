# Typography And Data Readability

> PORTOS / 02-design-system / 03_typography_and_data_readability  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Create an enterprise data typography system that makes technical numbers trustworthy and scannable.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- UI family: Inter, system fallback sans. Data family: IBM Plex Mono or similar monospace for UTC timestamps, ISO port codes, numeric rates and vessel identifiers. Use licensed web delivery or local system fallbacks.
- Typography scale: workspace title 24/32 semibold; section title 16/24 semibold; card title 14/20 semibold; body 13/20 regular; dense table 12/18; micro-label 11/16 medium; KPI compact 24/28 semibold.
- Use `font-variant-numeric: tabular-nums` on ETA, dollars, minutes, percentages, speed and columns. Units displayed beside—not merged into—the numeric reading.
- All timestamps stored in UTC ISO; user-facing times show `UTC` explicitly unless a user-selected timezone exists. An ETA with local destination timezone must be labeled `local` with IANA zone.
- Show `nm`, `kn`, `h`, `USD`, `TEU` unambiguously. Avoid abbreviations such as `M` without tooltip/legend. Define confidence/freshness not just status.
- Text hierarchy in inspector: entity name first; vessel class and identifier second; decisive ETA delta and cause third; scenario assumptions/quality secondary but inspectable.
- Numeric KPIs have consistent decimals: hours one decimal; currency whole dollars in large aggregate, two decimals if transactional; risk 0–100 integer; percent one decimal where useful.
- Truncation: never truncate IMO/UNLOCODE/incident IDs; allow tooltip/copy; vessel names ellipsize only with accessible full label.


## Interface / data contracts

- `formatUtc`, `formatDuration`, `formatNm`, `formatKn`, `formatUsd`, `formatPercent`, `formatTimestampFreshness` pure functions.
- No locale-dependent parsing of date strings.


## Interaction and system states

- Null ETA -> `Unavailable`, never `0h`.
- Stale numbers carry `Last update` or data-age marker.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Every KPI includes exact definition tooltip.
- Dense inspector remains readable at 125% browser zoom.


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

- Prerequisites: `instructions/02-design-system/02_color_and_semantic_tokens.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/02-design-system/04_layout_grid_spacing.md`

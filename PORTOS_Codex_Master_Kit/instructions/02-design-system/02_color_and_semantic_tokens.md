# Color And Semantic Tokens

> PORTOS / 02-design-system / 02_color_and_semantic_tokens  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Specify an accessible white-orange technical palette where accent and status have different jobs.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Base palette: `canvas #F7F8F6`, `surface #FFFFFF`, `surfaceSubtle #F1F3F2`, `border #DDE3E5`, `textPrimary #141B22`, `textSecondary #596773`, `textMuted #74818B`.
- Brand palette: `orange600 #C84B16`, `orange500 #E25B23`, `orange100 #FDEDE5`; use main orange for primary action, active tabs and selected features, not unselected boundaries.
- Geo map: `oceanDeep #081723`, `oceanMid #102837`, `landDeep #1B3441`, `landOutline #4D6974`, `routeBase #82B8C9`, `routeSelected #FF905B`.
- Semantic: critical `#B43732`, caution `#B46E14`, success `#23724D`, information `#2E658B`, unknown `#66727D`; use icon/text labels in addition to color.
- Every map status layer has a contrast-checked solid symbol alternative. Avoid relying on glow; keep legible grayscale when animation off.
- Sidebar and floating card shadows: `0 10px 30px rgba(13,31,42,.10)` maximum for drawers. Separator 1px, crisp hover overlay.
- Error and severity chips use pale tint background and dark text, not orange for every severity. No automatic red gradient on entire Earth for one incident.
- Test contrast for 12–14px labels and numbers; dark text on near-white surfaces; on ocean use white text with shadow or dark label chip.


## Interface / data contracts

- `tokens.css` with named CSS variables; `mapTheme.ts` adaptation should derive glow/outline role colors using coherent theme roles.
- `statusColor(status)` returns status token and icon/label tuple; no raw hex per component.


## Interaction and system states

- `unknown`, `stale` and `unavailable` must look distinct from healthy.
- Selected + critical combines visible halo and explicit icon without loss of meaning.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- All critical UI text meets WCAG AA contrast or documented accepted large-text threshold.
- Two themes (light UI + dark map) coexist without inconsistent text colors.


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

- Prerequisites: `instructions/02-design-system/01_visual_direction.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/02-design-system/03_typography_and_data_readability.md`

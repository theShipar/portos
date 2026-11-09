# Port Congestion Engine

> PORTOS / 06-intelligence / 02_port_congestion_engine  
> Status: normative implementation specification · Version: 1.0 · Data source: synthetic prototype

## Goal and product relevance

Use defensible congestion metrics grounded in observed/simulated port events.

This file is intended to guide Codex through **working implementation**, not a static visual mockup. Read the repository's `AGENTS.md`, this module's adjacent specs, and the shared schemas before changing code. Do not describe a feature as implemented until the real browser demonstrates it.

## Implementation requirements

- Distinguish `atAnchorCount`, `awaitingBerthCount`, `arrivalsNext24h`, `berthsOccupied`, `berthsKnown`, `knownWaitHours`, `forecastWaitHours` and `dataQuality`. Do not equate a ship anchored outside a port with a verified commercial berth queue slot.
- For median wait use actual wait durations from `waitingSinceUtc` among eligible vessels. Unknown wait starts excluded from denominator; show `n` and data coverage.
- For forward forecast use explicit scenario queue model, terminal capacity assumptions and scheduled berth windows. Label derived wait as an estimate, show p50/p90 only if there are enough samples and model rationale.
- Port congestion score = weighted percentile of normalized verified wait, arrival pressure and berth utilization. Expose exact formula and weights in the Evidence drawer; treat missing inputs as missing, renormalize with quality warning, never zero.
- One port event can affect multiple inbound voyages but must be linked to affected voyage IDs. Recompute affected count from port/voyage relationships instead of a decorative number.
- Historical snapshots should reflect queue event progression; local simulation clock must update both map zone shade and queue panel count.
- Color semantic: normal neutral/blue, elevated amber, critical red only with threshold and sufficient confidence.


## Interface / data contracts

- `PortCongestionResult` {portId,asOfUtc,atAnchorCount,awaitingBerthCount,arrivalsNext24h,medianWaitHours?,p90WaitHours?,berthUtilization?,score0to100?,coverage,confidence}.
- `computePortCongestion(portId,portCalls,berths,clock)`.


## Interaction and system states

- Sparse history: show `insufficient evidence` and no false p90.
- No berth feed: no percentage utilization; still count physically present ships if position known.


The implementation must handle `loading`, `ready`, `empty`, `partial-data`, `error`, `selected`, `stale`, and `disabled` when applicable. All dynamic states must derive from typed data and a shared UTC clock, not hardcoded UI labels. Ensure keyboard, screen-reader, and pointer interaction access to the same entity.

## Acceptance checks

- Visible selected port queue list count matches KPI count.
- Filtering terminal updates metrics, markers and vessel list consistently.


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

- Prerequisites: `instructions/06-intelligence/01_voyage_eta_engine.md`; `04_DATA_CONTRACTS.md`.
- Supporting documentation: `docs/IMPLEMENTATION_ORDER.md`, `docs/DEMO_RUNBOOK.md`, `schemas/`, `sample-data/manifest.json`.
- Next in this module: `instructions/06-intelligence/03_delay_exposure_calculator.md`

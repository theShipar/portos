# PORTOS V2 changelog

V2 turns the V1 globe prototype into a spatial operations demo: Earth hands off to real extruded geography, ships
are recognisable 3D models, Singapore has a port twin with berth timelines, one scenario clock runs from 1× to 100×,
and cases carry decision branches. All data remains **synthetic and simulated**; nothing here is live AIS or
navigation guidance. Per-phase commands and results are in `docs/BUILD_LOG.md`, decisions in `docs/DECISIONS.md`
(D-029 to D-039), departures from the spec in `docs/TECHNICAL_DEVIATIONS.md`, and browser evidence in
`docs/PORTOS_V2_QA_EVIDENCE.md`.

## Phase 9 — Flagship journey, acceptance evidence and release (D-039)

- `tests/e2e/flagship.spec.ts` runs the full journey in one session: Earth → Southeast Asia → Singapore → port twin →
  VSL-0001 / INC-0001 → follow VSL-0047 at ×1 / ×10 / ×100 → compare → save decision → replay. It writes ten
  evidence frames to `docs/qa/v2-phase9/`.
- `tests/e2e/acceptance.spec.ts` covers the spec 19 rows no other spec reached:
  - M03: orbit, tilt and wheel, with marker and label georeferencing.
  - M07: clicking an underway ship.
  - M11: vessel, time, layer filters and centre kept across 3D ↔ 2D.
  - M15: Back and Forward with one renderer.
  - M16: corridor and weather legacy links.
  - M17: a failed scene load.
  - M19: the same vessel found from two scopes.
  - M20: 100× playback by keyboard with reduced motion.
- A region or city scene that fails to load now keeps the previous surface, frames the requested scope on it and
  shows "… could not be loaded" with Retry and Back. Before, the URL changed silently.
- The replay compare table shows stage labels ("Option proposed") instead of raw keys.
- The expanded replay bar keeps Follow and Note in the meta row, so the compare side panel no longer pushes
  content out of the rail.
- Test adapter: `orbit()` and `vesselScreen()`; `Region3DScene.orbitState()`.
- New unit test: a vessel without a voyage renders no destination ETA, exposure or ETA peek.
- Docs: `PORTOS_V2_QA_EVIDENCE.md` (M01–M20 matrix), this changelog, refreshed `PERF_REPORT.md` (Metal, 10 and 30
  round trips), README for V2, and the skill integrity checks in `docs/qa/v2-phase9/skill-checks.txt`.
- Visual baselines regenerated (16 views at 1440×900 and 1920×1080).

## Phase 8 — V2 palette, map-first layout and premium UI (D-038)

- Spec 13 palette in `src/styles/tokens.v2.json`; `tokens.css` / `tokens.ts` are generated from it. The kit
  `tokens.json` is unchanged.
- Map share with the inspector closed at 1440×900: Earth 85.7%, region 84.9%, Singapore port 83.5%.
- New or reworked components:
  - `IncidentRibbon` (≤ 3 cases) and `MapKpiRail` (≤ 4 values, with denominators).
  - `EntityPeek`, a two-line hover card with Follow and Inspect.
  - `VesselInspector` overview: schematic silhouette, route progress, ≤ 3 priorities, recent events.
  - `PortInspector` with a one-berth mini-Gantt.
  - `LayerPalette` with five groups.
  - `ReplayTimeline`: 60 px collapsed, 116 px expanded, with decision and note bookmarks.
  - `DecisionCompare`: original plus up to two proposals, labelled "Simulated outcomes, not confirmed."
- At port scope, the berth schedule folds to a summary and the planar HUD no longer sits under the queue shelf.

## Phase 7 — Value engines, case lifecycle and decision branches (D-037)

- V2 case stages: detected → untriaged → investigating → option proposed → approved for simulation → monitoring →
  resolved → closed. Fixture statuses are mapped to these stages at read time.
- Decision branches record a baseline and a simulated outcome; propose, approve and discard are all local.
- Escalation rules.
- Storage `portos:workflow:v2`, with a one-time V1 migration and a notice.
- New engines:
  - ETA variance (compares like with like);
  - JIT opportunity;
  - service chain (towage and mooring shown as "Not in dataset");
  - route feasibility.
- Port-call card for VSL-0001: queue from 04:00, 34 h with 26 h remaining, estimated berth 2026-11-10 14:00
  (unconfirmed), +18 h, $24,000, with sources.

## Phase 6 — Scenario clock, world snapshot and follow camera (D-036)

- One scenario clock from ×1 to ×100 with a single rAF loop and 10 Hz commits:
  - phases (history / now / simulation);
  - ranges of 6 h, 24 h, 72 h and 7 d;
  - loop;
  - steps of ±5 min, or ±1 h with Shift;
  - event-edge spans, so no event is skipped at 100×.
- `deriveWorldSnapshot` is pure, so forward and backward seeks give identical frames.
- Follow camera with chase, above, orbit and course-up modes. A pan releases it, "Resume following" restores it, and
  there is an edge note.
- Track runs are drawn as observed, modelled or unverified. The VSL-0059 reporting gap is drawn as unverified and
  never interpolated.

## Phase 5 — Singapore port twin, DCSA berth timeline and Gantt (D-035)

- The port twin is a `Region3DScene` variant with terminal decks, berth strips, cranes, yard blocks and moored ships.
  Singapore has 3 terminals, 10 berths, 41 cranes, about 6,000 containers and 2 anchorages.
- Rotterdam and Genoa get procedural twins; other ports stay 2D.
- The berth timeline engine keeps actual, planned and forecast times apart and shows conflicts.
- The berth Gantt and berth card stay in sync with the 3D selection.
- Switching 3D ↔ 2D keeps the berth and `?time=`.

## Phase 4 — Procedural 3D ship library (D-034)

- Seven model keys across six categories (container, tanker, gas, bulk, RoRo, tug and other), each at LOD0, LOD1 and
  LOD2 (up to about 20k triangles).
- Heading-to-yaw contract with cardinal tests.
- Wakes only on ships that are underway; anchored ships sway.
- Viewport culling and instanced batches (≤ 10 ship draw calls).
- QA page `qa/ships.html`.

## Phase 3 — Earth ↔ geography cinematic handoff (D-033)

- A single-renderer snapshot bridge drives the down, rise and reduced-motion transitions against planned-duration
  budgets. The destination frame is rendered before it is revealed.
- Back or Escape cancels a flight safely.
- Input is disabled while flying, and a "Preparing …" chip appears after 300 ms.
- City drill chips.
- Evidence frames are in `docs/qa/v2-phase3/`.

## Phase 2 — Natural Earth geometry and extruded scenes (D-032)

- `scripts/build_geo.py` builds 62 scene files (11 regions, 48 countries, 3 cities) from Natural Earth, with
  provenance recorded.
- Projections: LAEA and WGS84 ENU, reversible, with grid convergence.
- `Region3DScene`: extruded land with terrain maps, hover lift, double-click drilldown, north arrow and scale bar.
  It carries GPL headers for the code adapted from the Three Scope Map skill.

## Phase 1 — Spatial director and canonical routes (D-031)

- `SpatialDirector`, `SceneCache`, `InputRouter`, `OverlayProjectionAdapter` and the spatial registry (countries,
  cities, ports).
- Canonical `/ops/{earth,region,country,city,port}` routes. All ten v1 URLs redirect.

## Phase 0 — Audit and fixture v2.0 (D-029, D-030)

- `docs/PORTOS_V2_AUDIT.md` and "before" screenshots.
- Fixture v2.0 realigns the Singapore case:
  - VSL-0001 holds at anchor;
  - the queue starts at 04:00;
  - the berth estimate is unconfirmed;
  - VSL-0047 is the underway follow demo.
- `sample-data/v2/` adds 30 flagship tracks, 3 port layouts and 122 berth bookings, with schemas and validator
  checks.
- `spatialV2` feature flag: `VITE_SPATIAL_V2=0` or `?spatialV2=0` turns it off.

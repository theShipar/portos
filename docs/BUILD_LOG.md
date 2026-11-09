# Build Log

Each entry records what was implemented, the commands actually run with exit codes, browser evidence and
blockers. Status values: implemented / tested / blocked.

## Phase 0 — Inspect and data repair

- **Implemented:** copied kit `scripts/`, `schemas/` to root; rewrote `scripts/generate_demo_data.py` (fixture v1.1,
  see DECISIONS D-006); extended `scripts/validate_data.py`; regenerated `sample-data/` and `schemas/`;
  `docs/DECISIONS.md`, `docs/TECHNICAL_DEVIATIONS.md`, root `AGENTS.md`.
- **Tested:**
  - `python3 ~/.cursor/skills/three-scope-map/scripts/verify_template_integrity.py` → exit 0 (31 files).
  - `python3 scripts/generate_demo_data.py` twice, SHA-1 of all fixtures identical (`d49fc5d4…`) → deterministic.
  - `python3 scripts/validate_data.py` → exit 0, PASS (500 vessels, 100 ports, 200 voyages, 12,789 positions,
    261 port calls, 50 incidents, 352 events; +18h / $24,000 verified).
  - `python3 scripts/build_schemas.py` → 16 schemas.
- **Browser evidence:** n/a (no UI in this phase).
- **Licensing:** skill is GPL-3.0-or-later; derived map code will carry SPDX + attribution. Port centroids are
  approximate; all operational data synthetic.
- **Blockers:** none. Basemap provider deferred to Phase 4 (D-007).

## Phase 1 — Foundation

- **Implemented:**
  - Scaffold: Vite 7, Vue 3, TS strict, Pinia, vue-router, Vitest, Playwright config (`package.json`, `vite.config.ts`,
    `tsconfig.json`, `playwright.config.ts`).
  - Core: `src/core/{types,geo,time,format,places,layers}.ts`.
  - Data: `src/data/{catalog,loader}.ts` (referential validation, indexes, sorted tracks/events).
  - Engines: `src/engines/{tracks,eta,exposure,congestion,weatherRisk,search,snapshot,kpis}.ts` (pure; no map/UI imports).
  - Stores: `catalog`, `clock` (D-008), `snapshot`, `view` (scope/selection/layers/inspector), `session` (demo role),
    `notices`, versioned localStorage helper (`portos:*:v1`).
  - Router: all eight route families plus `in`/`t`/`layers` query; routes render an empty outlet so the map stays
    mounted; invalid IDs redirect to nearest parent with a notice.
  - Styles: `src/styles/tokens.{json,css,ts}` (tokens.json copy, `statusStyle()`), `base.css`.
  - Shell: `AppHeader` (logo, `SearchCombobox`, `SimulationStamp`, `UserMenu`), `KpiRow`, `InspectorDrawer`,
    `VesselInspector`, `SummaryInspector` (voyage/incident/corridor), `NoticeStack`, `TempCanvasMap` (Phase 1 stand-in).
- **Tested:**
  - `npx vue-tsc --noEmit` → exit 0.
  - `npx vitest run` → exit 0, 30 tests (geo, engines incl. +18h/$24,000, determinism, KPI de-dup, congestion,
    WX-0001 affected voyages, search, token parity, layer URL codec, vessel inspector model).
  - `npm run build` → exit 0 (three/maplibre chunks empty until Phase 2/4).
- **Browser evidence (dev server, 1440×900 emulated):**
  - Typing `VSL-0001` + Enter → `/vessel/VSL-0001`, inspector heading "MV Pacific Horizon", ETA shift `+18.0 h`,
    exposure `$24,000`, formula `18 h ÷ 24 × $32,000/day = $24,000`, INC-0001 banner, focus moved to heading.
  - `/vessel/VSL-0001?t=2026-11-09T08:00:00Z` → stamp "Replay · paused", no incident banner, KPIs at 08:00.
  - `/vessel/VSL-9999` → redirected to `/operations` with "Vessel VSL-9999 is not in the simulated dataset."
  - Screenshot: `docs/screenshots/phase1-vessel-inspector.png`.
  - Fixed during verification: header right side wrapped the Simulated stamp onto three lines at 1440px.
- **Not yet run:** Playwright `tests/e2e/gate.spec.ts` (browser binaries installed in Phase 8).
- **Blockers:** none.

## Phase 2 — Earth view and regional scope

- **Implemented:**
  - `src/map/theme.ts` (map colour roles from tokens, quality tiers), `src/map/earth/worldGeo.ts` (render-cache loader,
    ISO3 fallback, point-in-polygon), `src/map/earth/shaders.ts` (GPL-derived earth/atmosphere shaders, region mask
    + hover mask), `src/map/earth/camera.ts` (pose math, bounds fit, great-circle flights, cancellable controller),
    `src/map/earth/EarthScene.ts` (renderer, dirty-flag loop, idle rotation, picking, projection, region highlight,
    context-loss handling, `overlay` group for Phase 3), `src/map/regions.ts` (region registry).
  - `src/map/PortosEarthView.vue`: region labels as focusable buttons, hover tooltip + highlight, click → scope route,
    `GeoScopeStack` pose restore, inspector inset via `setViewOffset`, reduced-motion = instant cuts, WebGL-unavailable
    and load-error states with retry. `MapWorkspace.vue` hosts it with reset-camera control and attribution.
  - Removed `TempCanvasMap.vue`.
- **Tested:**
  - `npx vitest run` → exit 0, 42 tests (+12: scope stack restore/sideways/jump, bounds fit monotonic, region preset
    clamp for all 8 regions, antimeridian interpolation, flight cancellation, ISO3 fallback, country/region picking).
  - `npm run typecheck` → exit 0. `npm run build` → exit 0 (three chunk 473 kB / 119 kB gzip).
  - `check_three_map_project.py --strict .` → reports missing China template files (`EarthView.vue`,
    `ChinaMap.vue`, `china.json`…), extrusion/chase-light/fly-line/handoff effects and the South China Sea inset.
    Expected per TECHNICAL_DEVIATIONS (D-001); not "fixed".
- **Browser evidence (dev server, 1440×900):**
  - Earth: globe, outlines, atmosphere, eight region labels culled by hemisphere, KPI row, breadcrumb "Earth".
  - Click "Southeast Asia" label → `/region/REG-SEA`, camera flight, region countries highlighted, breadcrumb
    "Earth › Southeast Asia". Backspace → `/operations`, Earth pose restored exactly.
  - `/region/REG-OCE` deep link frames Australia/NZ across the antimeridian.
  - Eight rapid `router.push` scope changes 180 ms apart (including an invalid port) → final scope correct, zero
    console errors / unhandled rejections; invalid port shows notice.
  - `/port/PRT-SIN` breadcrumb "Earth › Southeast Asia › Singapore"; on-globe port altitude raised 0.32 → 0.7 after
    texture blur at close range (2D port view replaces this in Phase 4).
  - Screenshots: `docs/screenshots/phase2-earth.png`, `docs/screenshots/phase2-region-sea.png`.
  - Fixed during verification: limb haze washed out land/ocean contrast (fresnel and lighting retuned, atmosphere
    intensities lowered).
- **Blockers:** none.

## Phase 3 — Maritime layer (vessels, ports, corridors, clustering, selection)

- **Implemented:**
  - `src/selectors/mapLayers.ts` (pure): vessel markers with tone priority incident > at risk > late forecast (> 60 min)
    > managed on plan > other traffic, stale flag, exception count; port markers with wait tone (6 h / 18 h, unknown
    never healthy); densified corridors with voyage counts; selection focus (vessel/voyage/incident → corridor,
    endpoint ports, vessel point; corridor; weather → hazard + affected corridors; port); active/upcoming hazards;
    traffic density; deterministic geographic clustering that never absorbs pinned vessels.
  - `src/map/earth/vesselGeometry.ts`: procedural hulls per class (container, bulk, tanker, LNG, RoRo, general) at
    three LODs within budgets 40 / 600 / 5,000 triangles; ring and port glyph geometry.
  - `src/map/earth/markerShader.ts`, `lod.ts`, `MaritimeOverlay.ts`: instanced screen-sized glyphs with vertex-shader
    horizon culling, LOD by projected size with hysteresis, Earth cluster bands, region/port stack cells (D-010),
    `Line2` corridors with focus styling, dotted recorded track, hazard outlines (dashed when upcoming) and an
    equirectangular overlay canvas for hazard fills and traffic density blended in the Earth shader, paint-order hit
    testing (vessel > port > corridor).
  - `PortosEarthView.vue`: hover tooltips (vessel, port, corridor, hazard, region), click → inspector routes for
    vessel/port/corridor/weather, cluster badges (zoom at Earth, picker at region/port), port labels with collision
    avoidance, badges that step around labels, track for the selected vessel up to the clock time.
  - `LayerMenu.vue` (layer switches with legend, source and "not available at this scope"), vessel legend,
    corridor and weather inspectors, `/corridors/:routeId` and `/weather/:hazardId` routes with ID validation.
  - `src/core/geo.ts` `densifyPath` keeps original waypoints exactly (no float drift at corridor endpoints).
  - Decisions D-009 (marker colours lifted for the dark map) and D-010 (dense-spot handling); deviation rows for
    corridor lines and instanced glyphs.
- **Tested:**
  - `npx vitest run` → exit 0, 65 tests (+23 in `tests/unit/maritime.test.ts`: marker tones and Pacific Horizon
    incident, `focusForSelection` VSL-0001 → `['RTE-SIN-RTM']` (also via INC-0001 and VYG-0001), weather focus,
    corridor/weather route helpers, port tone thresholds, corridor densification ≤ 120 nm with exact endpoints,
    hazard phases, density totals, cluster pinning/determinism, Singapore stack at port scale, LOD and cluster
    hysteresis, stack cells, triangle budgets for all classes × LODs, hull normalisation).
  - `npm run typecheck` → exit 0. `npm run build` → exit 0 (three chunk 492 kB / 125 kB gzip).
- **Browser evidence (dev server, 1440×900):**
  - **Gate:** real pointer click on Pacific Horizon at `/region/REG-SEA` → `/vessel/VSL-0001?in=region:REG-SEA`,
    inspector "MV Pacific Horizon" (+18.0 h, $24,000), overlay `highlightedRoutes = ['RTE-SIN-RTM']`, 145-point
    recorded track. Clicking other vessels highlights their own corridor only (e.g. VSL-0135 → `RTE-SIN-JEA`).
  - 500 vessels: region scope LOD1, 40 draw calls, 75.6k triangles; port scope LOD2, 40 draw calls, 206k triangles;
    Earth scope LOD0 with 235 vessels in clusters. Frame time over five scope flights (Earth ↔ region ↔ vessel ↔
    port): p50 8.3 ms, p95 9.1 ms, p99 9.3 ms, max 9.4 ms (120 Hz display), no frame > 25 ms.
  - Weather layer off with VSL-0001 selected → URL and corridor highlight unchanged; Esc closes the layer menu only and
    returns focus to its button. Hover over the Singapore pile → Pacific Horizon tooltip with "+5 more vessels here".
  - Port scope: Singapore anchorage shown as a "47" stack; picker lists members worst-state first with "Zoom to area".
  - Screenshots: `docs/screenshots/phase3-earth-clusters.png`, `phase3-region-sea.png`,
    `phase3-selection-pacific-horizon.png`, `phase3-port-singapore.png`, `phase3-stack-menu.png`.
  - Fixed during verification:
    - 200 ms stall on every Earth → region flight: the region mask applied a canvas `blur()` per country polygon
      (463 fills ≈ 230 ms). Now one path, one fill (≈ 3 ms); no long frames remain.
    - Clicks in the Singapore anchorage picked a random neighbour (≈ 50 vessels within 2 px) → paint-order hit test
      and stacks (D-010).
    - Port scope rendered ~50 overlapping 3D hulls as a white block → stack badge + picker.
    - Hazard fills and incident rings dominated the map; deck details hid status colour; port labels overlapped;
      cluster badges covered port and region labels; stale tooltip survived a scope change.
- **Blockers:** none.

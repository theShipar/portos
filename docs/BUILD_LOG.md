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

## Phase 4 — Port 2D (OpenFreeMap), anchorage, berths, queue, 3D/2D switch

- **Decision:** basemap = OpenFreeMap vector tiles restyled to the PORTOS palette (user choice; D-011). Selection
  now survives scope changes (D-012).
- **Implemented:**
  - `src/selectors/port.ts` (pure): `buildPortViewModel` on top of `computePortCongestion`: KPIs (in berth queue, at
    anchor, arrivals next 24 h, median known wait with sample size), queue rows (status, elapsed wait, berth
    confirmed only with berth + time, terminal/berth names, anchorage membership, evidence), anchorage summaries
    from positions inside the polygon (occupancy vs capacity estimate, crowded ≥ 80 %, median, p90 only with ≥ 5
    known waits, unknown-start count), berths with occupant/scheduled names and 7-day linked calls, terminals,
    arrivals, berth-feed availability, layout bounds. Shared through `useSnapshotStore().portView` (and shared
    `markers`) so the map, shelf, KPI row and inspector read one model.
  - `src/map/port2d/`: `basemapStyle.ts` (config + PORTOS style), `features.ts` (GeoJSON builders, antimeridian
    unwrap, pinned/clustered vessel split), `icons.ts` (canvas vessel chevrons, heading-free anchored glyphs, stale
    variants, berth status icons with "?" for unknown), `PortMap2D.vue` (lazy MapLibre: hazards, anchorage zone,
    corridors, recorded track, berths, clustered + pinned vessels, incident rings, orange selection halo; DOM
    terminal/anchorage/port labels and cluster badges with collision placement; hover tooltips; click priority
    vessel > berth > anchorage > hazard > corridor; berth/terminal/anchorage cards; selection highlights its berth
    and zone and is kept on screen; padding for shelf and inspector; basemap-unavailable and WebGL-error states).
  - `PortQueueShelf.vue`: port name, UTC + local time, filter chips (all / at anchor / not anchored / berth
    unconfirmed) with counts, "N of M in queue", "Sorted by elapsed wait — not berth priority", rows without rank
    (status, terminal, elapsed wait or "Wait start unknown", berth "in 26.0 h" or "Unconfirmed"), arrivals next
    24 h, sample-size footnote; selected row highlighted and scrolled into view. Shown at port scope in both modes.
  - `PortKpiRow.vue` replaces the global KPIs at port scope; definitions and source in each tooltip.
  - `ViewModeSwitch.vue` (3D | 2D, `aria-pressed`, 2D disabled at Earth with reason); `MapWorkspace` orchestrates the
    lazy 2D map, cross-fade (none under reduced motion), camera hand-off both ways (`src/map/viewport.ts`), 2D
    attribution footer, reset per mode. `PortosEarthView` gains `active`: hides labels, stops/starts its loop.
  - Routing: `view` query (only when not the scope default), `setViewMode` (replace), `openScope` keeps the
    selection (`in=earth|region:…|port:…`), `home()` for the brand link, breadcrumb current-scope click closes the
    selection.
- **Tested:**
  - `npx vitest run` → exit 0, 86 tests (+21 in `tests/unit/port.test.ts`: KPI ↔ queue reconciliation, median over
    known waits only, sort with unknown last and no rank, berth confirmation rule and Pacific Horizon → W-1, unknown
    berth not free, linked calls, anchorage summary vs point-in-polygon, layout bounds, zoom/degree round-trip,
    globe distance inverse, zoom clamps, default modes and `view` query, selection-keeping scope routes, antimeridian
    unwrap, pinned split, anchored/stale icons, anchorage ring closure, basemap config incl. `none`).
  - `npm run typecheck` → exit 0. `npm run build` → exit 0; MapLibre is a lazy chunk (1.05 MB / 285 kB gzip) not
    referenced from `index.html`.
- **Browser evidence (dev server, 1440×900):**
  - **Gate:** Earth → click "Southeast Asia" → click "Singapore" (opens 2D, `/port/PRT-SIN`) → queue row Pacific
    Horizon (`/vessel/VSL-0001?in=port:PRT-SIN`) → 3D (`&view=3d`) → 2D → breadcrumb Southeast Asia
    (`/vessel/VSL-0001?in=region:REG-SEA`, 3D) → 2D (`&view=2d`) → breadcrumb Earth (`/vessel/VSL-0001?in=earth`).
    The inspector shows MV Pacific Horizon (+18.0 h, $24,000) at every step; 2D → 3D keeps the map centre
    (103.891, 1.255).
  - Queue/inspector reconciliation: KPI "In berth queue 41" = 41 rows; "At anchor 41"; "Median known wait 23.0 h,
    37/41 known" = footnote; Pacific Horizon row "2.8 h waiting · Berth in 26.0 h" = berth card West Berth 1
    "Next scheduled MV Pacific Horizon 2026-11-10 14:00 UTC · 22:00 local"; East Berth 3 card "Unknown — not counted
    as free".
  - Tile failure: OpenFreeMap blocked → "Basemap unavailable" banner, plain water background, overlays/labels/queue
    intact; unblocking + "Retry tiles" restores the basemap and re-adds all overlays.
  - Region 2D: 22 cluster badges, 9 of 11 port labels placed (Laem Chabang and Tanjung Pelepas yield to Bangkok and
    Singapore), hazards and corridors drawn.
  - 2D pan/zoom (two 1.5 s eases, z 11 → 13.5 → 10): p50 8.3 ms, p95 9.2 ms, p99 9.3 ms, no frame > 50 ms.
  - Screenshots: `docs/screenshots/phase4-port-2d.png`, `phase4-port-2d-selection.png`,
    `phase4-port-3d-selection.png`, `phase4-region-2d.png`, `phase4-basemap-unavailable.png`.
  - Fixed during verification:
    - Cluster badges at z 11 came from retained lower-zoom tiles (`querySourceFeatures`) → read from a hidden rendered
      cluster layer on `idle`.
    - Terminal labels overlapped each other and hid under the shelf/inspector → candidate offsets with collision
      rectangles incl. the inset panels; port name prefix dropped from terminal labels.
    - Region 2D: the Singapore label was covered by its own cluster badge → labels placed first, badges step ±24 px.
    - Queue showed "Berth 14:00 UTC" for a slot on the next day → relative "in 26.0 h" with the full UTC on hover.
    - Breadcrumb navigation cleared the selection, failing the gate → D-012.
- **Known limitations:** the 3D globe offsets only for the right inspector, not for the left queue shelf; 3D cannot
  zoom as close as 2D, so 2D → 3D at high zoom lands at the port's minimum globe distance.
- **Blockers:** none.

## Phase 5 — Intelligence engines with provenance

- **Decisions:** provenance model and user-scenario rates (D-013), computed hazard exposure replaces the fixture list
  (D-014), KPI cohort follows scope with a URL drill (D-015).
- **Implemented:**
  - `src/engines/provenance.ts`: source class (simulated fixture / derived model / user scenario), evidence kind
    (observed / estimated / scenario / unknown), per-feed freshness bands (position 15/30 min, ETA and port wait
    6/24 h, berth 2/12 h, weather 6/12 h), `makeProvenance` (as-of, age, confidence, method, formula, sources,
    assumptions, warnings; stale inputs add a warning).
  - Engines now return provenance: `computeEta` (formula "Forecast ETA − planned ETA = +18.0 h", sources = planned
    record + `ETA_REVISED` events, warning when the voyage record disagrees with the applied revision),
    `computeExposure` (rewritten around a `RateAssumption`: fixture or user scenario; "18 h ÷ 24 × $32,000/day =
    $24,000"; missing rate → "Financial exposure unavailable", evidence unknown), `computePortCongestion` (weighted
    formula with renormalised missing inputs, quality warnings), `computeRouteHazards` (`unknown` band when no
    weather feed, rationale for outside-window / no-intersection).
  - `snapshot.ts`: `risks` computed per voyage whose corridor has an active or upcoming hazard; workflow overlay
    carries `dailyRates`, applied at every time including replay.
  - `kpis.ts` rewritten: cohort sets (global, or region by position / origin / destination), each KPI has a
    definition, provenance, denominator and worst-first `members`; at risk = open-incident voyages ∪ hazard-crossing
    voyages; exposure deduplicated per voyage, null only when every member is unavailable.
  - Shared read model `src/selectors/impact.ts` (`selectVoyageImpact`) drives the vessel inspector, voyage summary,
    incident summary and KPI drill rows, so one number appears everywhere.
  - UI: `ProvenanceButton` (teleported popover, Esc/outside close, focus return) + `ProvenanceDetails`; provenance
    buttons on inspector fields, ETA shift, exposure, route risk, port KPIs (queue, median wait, new Congestion tile).
    `VoyageImpactCard` replaces the inline ETA block. `KpiRow` rewritten: tile → detail panel (definition,
    provenance, members), "Show only these on map" (`?kpi=` via `router.replace`, map markers filtered to members +
    selection), "Metrics +N" flyout, drill chip with Clear; Delayed and At risk show their voyage denominators.
  - `ExposureRateEditor` + `src/stores/assumptions.ts` (`portos:assumptions:v1`): validated daily-rate override
    (strips `$`/commas, rejects empty, non-numeric, negative, > $5M), entering the fixture value resets, gated by
    `action.scenario.propose` (Viewer sees a disabled button with the reason).
  - Weather inspector: affected voyages computed from geometry × time with risk scores (fixture bootstrap list noted
    in provenance); hazard overlay count uses the same computation.
- **Tested:**
  - `npm run typecheck` → exit 0.
  - `npx vitest run` → exit 0, 103 tests (+17 in `tests/unit/intelligence.test.ts`: the $24,000 gate on engine,
    vessel inspector, voyage and incident summaries, KPI contribution, regional KPI member and drill row; formula
    consistency; $40,000/day override → $30,000 everywhere, labelled user scenario, KPI +$6,000; replay 08:30 →
    $10,667 fixture / $13,333 override; missing rate → "Unavailable" and excluded from the KPI; provenance on every
    metric, ETA traced to `ETA_REVISED`; freshness bands; at-risk union; hazard overlay count; unknown risk without a
    feed; Pacific Horizon "Hazard on corridor · not crossed"; KPI members = values; drill vessel IDs; determinism;
    rate validation). `tests/unit/engines.test.ts` updated to the new exposure input.
  - `npm run build` → exit 0.
- **Browser evidence (dev server, 1440×900):**
  - Port Singapore: provenance on In berth queue, Median known wait, Congestion (Critical 77/100, formula + "1 berth
    status unknown", "4 of 41 queue entries lack a waiting start"), and on VSL-0001's ETA shift, exposure, route risk
    and position.
  - Exposure popover: derived model · estimated · medium, "As of 09:00 UTC · 3.0 h old", `18 h ÷ 24 × $32,000/day =
    $24,000`, sources `eta:VYG-0001`, `EVT-0004 ETA_REVISED`, VYG-0001 rate.
  - Rate editor: "-500" → "The rate cannot be negative."; "40,000" → $30,000 in the vessel inspector, incident
    INC-0001 ("Voyage VYG-0001 impact") and the Earth Exposure KPI ($743.7K, user-scenario chip, "Includes
    user-scenario rates for VYG-0001."); Reset → $24,000 and focus returns to Edit rate. USR-004 (Viewer): Edit rate
    disabled with "Viewer role can view but not change scenario assumptions."
  - KPI drill: Exposure → "Show only these on map" → `/operations?kpi=exposureUsd`, 46 markers drawn.
  - Weather WX-0011: "Affected voyages 10 · Computed from geometry and time", links ranked VYG-0179 (85) … VYG-0011
    (60). Southeast Asia KPIs: Tracked 68/124 vessels, Delayed 80/134 voyages, At risk 66/134, Exposure $548.4K.
  - Screenshots: `docs/screenshots/phase5-vessel-user-scenario.png`, `phase5-kpi-exposure-drill.png`,
    `phase5-weather-computed-risk.png`, `phase5-port-congestion-provenance.png`.
  - Fixed during verification:
    - Region tiles read "Tracked 68 · Delayed 80" (vessels vs voyages) → Delayed and At risk show their voyage
      denominators.
    - Reset removed the focused button → focus moves to Edit rate.
- **Deferred:** alert deduplication window moves to Phase 6 with the incident workflow.
- **Blockers:** none.

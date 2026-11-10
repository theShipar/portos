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

## Phase 6 — Incident workflow, tasks, drafts, audit, persistence, resets

- **Decisions:** reducer-based local workflow with append-only audit (D-016), writes only at Now (D-017),
  explainable priority and 6 h forecast dedupe (D-018), honest comparison and no-send drafts (D-019).
- **Implemented:**
  - `src/workflows/`: `types.ts` (versioned `WorkflowState`), `incidentMachine.ts` (lifecycle open → acknowledged →
    investigating → mitigation planned → monitoring → resolved, step-backs, resolve/reopen rules, role guards with
    "`<Role>` role cannot …" reasons, assignee and due checks), `reducer.ts` (transition, assign, note, undo, task
    create/status with duplicate guard, draft create/ready/discard, scenario propose/accept; local IDs
    `LOC-AUD-0001`…), `validate.ts` (shape + duplicate-ID check), `handoff.ts` (audit per entity incl. vessel →
    voyages → incidents, handoff summary, audit export with the prototype caveat, prefilled draft templates).
  - Engines: `priority.ts` (score + rationale, needs-verification, deduped case queue), `scenario.ts` (option
    comparison, input limits, JSON export).
  - Stores: `workflow.ts` (load/validate/persist, `saved` flag, replay block, outstanding tasks, dispatch with
    success notice + Undo action, cross-tab notice); snapshot reads the workflow overlay; notices gained actions;
    session `resetPreferences`; view `incidentTab`, `incidentQueueOpen`, `comparing` (set from the route).
  - Screens: `IncidentInspector` (Summary with effect/cause callout, impact card, priority rationale, related
    alerts, facts, Copy handoff; Evidence with freshness and provenance; Timeline with UTC/local toggle; Actions),
    `IncidentActions` (stepper, transitions with reasons, resolve/reopen forms, assign with UTC due + escalation note,
    notes, tasks, drafts, Open comparison), `TaskPanel`, `DraftPanel` (Draft prepared locally, Mark ready, Copy, no
    Send), `ComparisonPanel` (editable inputs, three options, propose/accept, export), `IncidentQueue` (top 5 per
    scope, search, expandable "why ranked here", Show on map via the unresolved-incidents KPI drill),
    `ActivityHub` (header button with outstanding-task badge and "Not saved"; Tasks Mine/All + region, Drafts, Audit
    with actor/action/entity filters and Export audit JSON), `ResetDialog` (native modal dialog, three levels, exact
    clear list with counts, export-first link, focus return). Vessel Events tab shows local decisions and voyage
    tasks. The map draws the scenario corridor dashed while `/compare/:voyageId` is open.
- **Tested:**
  - `npm run typecheck` → exit 0.
  - `npx vitest run` → exit 0, 139 tests (`tests/unit/workflow.test.ts` 36: legal transitions, role guards, resolve
    and reopen rules, assign/due validation, undo limits, task duplicate guard, draft recipients, scenario
    propose/accept permissions, overlay at/after the anchor only, priority order and rationale, dedupe, comparison
    numbers and limits, audit for vessel, handoff text, draft "+18.0 h"/"Not sent", persistence validation, queue
    rows per region/search/owner, audit filters, hub task filter).
  - `npm run build` → exit 0.
- **Browser evidence (dev server, 1440×900, clean storage):**
  - Earth queue: 47 unresolved cases, top 5 by score; INC-0038 "Score 92 · Critical severity +45, $38,500 exposure
    +29, Open 8.1 h +8, Not yet acknowledged +10".
  - INC-0001 as Taylor Cruz (dispatcher): Resolve disabled with "Dispatcher role cannot resolve cases…";
    Acknowledge → Start investigating → assign Jordan Lee due 2026-11-09 18:00 UTC → note. Header chips
    "Investigating · Jordan Lee · Local decision"; four audit events stored.
  - Reload keeps status, owner and note. Vessel VSL-0001 → Events → "Local decisions" lists the same four events
    (acceptance: an INC-0001 action is visible in incident and vessel audit views).
  - Task LOC-TSK-0006 for Jordan Lee (activity badge 1); port-agent draft contains "+18.0 h" and "not sent"; the
    editor offers only Save draft / Cancel and no Send exists anywhere.
  - Mitigation planned → notice Undo → back to Investigating, `incident.undo` appended.
  - Sam Ellis (viewer): every action disabled, each with its reason.
  - Comparison: baseline +18.0 h $24,000, agent confirmation +18.0 h $24,000, Cape corridor +11.9 d $381,733;
    dispatcher proposes, Accept disabled for dispatcher, Avery Morgan (manager) accepts; follow-up task created.
    Earth view shows planned (solid) and candidate Cape (dashed) corridors.
  - Activity → Audit: 10 events; entity VSL-0001 → 8, + "Plan accepted" → 0; Esc closes the hub only and returns
    focus to its button.
  - Reset decisions: dialog lists "1 local case change, 2 tasks, 1 communication draft, 1 route proposal, 10 audit
    events, 0 edited daily delay rates" with Export audit JSON first; after confirm storage is empty, view kept, KPIs
    back to 330 / 118 / 85 / $737.7K, focus on Reset. Replay `?t=11:30` → INC-0001 Open, actions blocked with the
    Now message. Reset full demo → `/operations`, Now, Taylor Cruz.
  - Screenshots: `docs/screenshots/phase6-queue.png`, `phase6-incident-summary.png`, `phase6-incident-actions.png`,
    `phase6-vessel-audit.png`, `phase6-comparison.png`, `phase6-activity-audit.png`, `phase6-reset-dialog.png`.
- **Blockers:** none.

## Phase 7 — Deterministic replay (event fold, snapshots, timeline rail, staleness)

- **Decisions:** one event fold as the source of recorded history (D-020); 1×/10×/60× time-based playback,
  coalesced scrubbing, URL time sync and snap-with-notice (D-021); context markers, density bins and "Compared with
  Now" (D-022); historical notes as the only replay write (D-023).
- **Implemented:**
  - `src/engines/fold.ts`: `foldEvents`, `emptyFold`, `incidentFromFold`. `getSnapshotAt` folds once per instant
    and exposes `fold`; `incidentStatusAt(c, incident, t)` folds that incident's events.
  - `src/selectors/replay.ts`: event categories and labels, `railMarkers` (context-aware), `densityBins`,
    `stepMarker`, `currentMarker`, `compareWithNow`.
  - `src/features/replay/ReplayRail.vue`: play/pause, speed 1×/10×/60×, previous/next event, slider (one-minute
    steps, Shift+Arrow event jumps, `aria-valuetext`), coloured markers over a density histogram, hour ticks,
    "Historical"/"Now (simulated)" mode, UTC plus port-local time, last event in force, "Compared with Now" table,
    "Add note" form, Return to Now, close. Mounted at the bottom of the workspace; the inspector, left stack and map
    tools lift above it through CSS variables.
  - Entry points: Replay voyage (voyage inspector, vessel Voyage tab), Replay from detection (incident), Replay
    (port queue shelf); `/replay/:voyageId` opens the rail.
  - Clock: speeds `[1, 10, 60]`, frame delta cap 1 s. Route sync: `t` written while paused (300 ms debounce),
    removed at Now, out-of-window notice. Reset dialog and comparison route pause playback.
  - Workflow: `history.note` command and audit label "Historical note"; allowed in replay, all other writes blocked.
  - Vessel inspector: "Not yet tracked · first report HH:MM UTC" before the first sample.
- **Tested:**
  - `npm run typecheck` → exit 0.
  - `npx vitest run` → exit 0, 161 tests (`tests/unit/replay.test.ts` 22: fold equals the incident record rule at
    every event boundary ±1 ms and the previous port-wait scan; fold purity and order independence; same-timestamp
    order; identical snapshot fingerprints (position, ETA, exposure, incidents, hazards, risks, port wait, anchorage,
    berths) on repeat and after scrubbing away and back; VYG-0001 +8 h at 08:59 and +18 h at 09:00; INC-0001 hidden
    at 10:58 and open at 10:59; Singapore wait 14 h → 26 h at 11:22; no resolved case before detection; "Not yet
    tracked"; marker determinism, stepping and density totals; compare rows; history notes allowed and
    case-neutral, rejected empty or for viewers; out-of-range seek clamps; Europe/Amsterdam DST fall-back
    (00:30Z and 01:30Z both 02:30 local, UTC distinct) and the Singapore day boundary).
  - `getSnapshotAt` cost: 7.1–7.4 ms per call over 60 scrub positions (Node, full fixture set).
  - `npm run build` → exit 0.
- **Browser evidence (dev server, 1440×900):**
  - `/replay/VYG-0001` opens the rail with 9 context markers. Clicking the INC-0001 marker → 10:59 UTC,
    `?t=2026-11-09T10:59:00Z`; compare: position interpolated (4 min), ETA +18.0 h, $24,000, INC-0001 Open,
    INC-0050 "Not yet detected" (Open at Now), wait at Singapore 14 h vs 26 h, at anchorage yes (acceptance: vessel
    position, ETA and port conditions consistent).
  - Six scrub moves (02:00–11:30) then back to the marker → identical values; at 07:00 ETA +8.0 h, $10,667, cases not
    yet detected, no Singapore wait update yet. Shift+→ → 11:22 "Singapore wait estimate 14 → 26 h".
  - Reload with `?t=` keeps 10:59 and "Replay · paused" in the header. `?t=2026-11-08T05:00:00Z` → 00:00 UTC with
    "2026-11-08 05:00 UTC is outside the replay window; showing 2026-11-09 00:00 UTC instead." and the URL rewritten.
  - 60× playback advances ~3 min in ~4 s even in the automation view (which throttles animation frames to 1/s); the
    URL updates once paused. Add note → "Note saved locally. It references the historical time; no case was
    changed." Return to Now drops `t` and keeps the rail open in Now mode. Opening Reset pauses playback.
  - VSL-0003 at 00:10 → "Not yet tracked · first report 00:25 UTC"; compare "Not yet tracked" vs "Stale (35 min)".
  - Singapore port at 11:08 → 73 port markers, local 19:08 (Asia/Singapore), wait 14 h vs 26 h, open cases here
    22 vs 24. INC-0001 at 10:59 → Open, unassigned, banner "Replay shows the recorded case history…".
  - Screenshots: `docs/screenshots/phase7-replay-rail.png`, `phase7-compare-now.png`, `phase7-inc0001-marker.png`.
- **Blockers:** none.

## Phase 8 — QA: E2E matrix, visual baselines, accessibility, resilience, performance, release docs

- **Decisions:** responsive layout (D-024); test adapter in dev/e2e builds only (D-025); AA text roles derived from
  the kit palette (D-026); MapLibre GL JS 6 (D-027); weather hazards as an optional dataset (D-028).
- **Implemented:**
  - E2E (`tests/e2e/`, Playwright Chromium, SwiftShader WebGL, against `vite build --mode e2e`):
    - `journey.spec.ts` (9): Earth first paint (canvas + `renderer.info`), Earth → Southeast Asia → Singapore →
      queue vessel with browser Back to Earth, a real click on a 3D vessel marker at adapter coordinates, INC-0001
      evidence and the three-option comparison, acknowledge/investigate/assign surviving reload with the audit
      entry, replay stepping to the INC-0001 marker (10:59, +18.0 h, $24,000) and Return to Now, deep link
      reproduced in a second tab, `/` search focus, full demo reset.
    - `resilience.spec.ts` (15): no WebGL, WebGL context loss with recovery and kept selection, basemap tile failure,
      missing weather dataset, corrupted storage; reduced motion, accessible names and visible focus, keyboard walk
      without traps; incident/voyage/vessel exposure consistency, queue count equals its list, same `t` → identical
      inspector; 1024 bottom sheet, < 768 list mode, 200 % zoom, 1280 region journey.
    - `visual.spec.ts` (16): eight views at 1440 × 900 and 1920 × 1080 → `tests/visual/NN-name-{desktop,1920}.png`,
      compared at 1 % pixel tolerance; checklist in `docs/VISUAL_QA.md`.
    - `perf.spec.ts`: opt-in probe (`PERF=1`, `PERF_ANGLE`, `PERF_ROUND_TRIPS`) writing `docs/perf/*.json`;
      report in `docs/PERF_REPORT.md`.
    - `helpers.ts`: clean-start storage once per tab, globe/flight waits.
  - Test adapter (`PortosEarthView.vue`): `state`, `stats`, `flying`, `reducedMotion`, `pointOf`, `vesselPoint`,
    `vesselsNear`, `portPoint`, `loseContext`; `EarthScene` gained `flying`/`motionReduced` getters.
  - Responsive: `view.sheetLayout` (`matchMedia ≤ 1024px`) drives camera insets; bottom-sheet inspector, compact
    header labels (`.compact-label`), stacked replay rail ≤ 1100 px, smaller sheet with the rail open, map tools
    top-right in sheet layout, attribution wraps beside the inspector, narrow list mode hides map labels too.
  - Contrast: text-role tokens in `tokens.css`, text colours in 15 component/style files switched to them, primary/count fills on
    `--color-accent-fill`; `tests/unit/contrast.test.ts`.
  - Resilience: optional `weatherHazards` in `loader.ts`/`buildCatalog` (`missingDatasets`) with a persistent notice;
    `tests/unit/resilience.test.ts`.
  - Dependencies: `maplibre-gl` 5.24 → 6.17 with an ES-module worker (`?worker&url`, `setWorkerUrl`,
    `worker.format: 'es'`).
  - Docs: `README.md` (root; prototype vs production), `docs/KNOWN_LIMITATIONS.md`, `docs/VISUAL_QA.md`,
    `docs/PERF_REPORT.md`.
- **Tested:**
  - `python3 scripts/validate_data.py` → exit 0 ("Scenario: MV Pacific Horizon +18h, USD 24,000 … verified").
  - `npm ci` → exit 0. `npm audit --omit=dev` → 0 vulnerabilities (after D-027); dev-only advisories remain
    (vitest/tinypool, @vue/test-utils), listed in KNOWN_LIMITATIONS.
  - `npm run typecheck` → exit 0. `npm run build` → exit 0.
  - `npx vitest run` → exit 0, 183 tests in 11 files (new: contrast 18, resilience 4).
  - `npx playwright test` → exit 0, 43 passed, 1 skipped (perf probe). Visual baselines re-run in compare mode at 1 %
    tolerance: 16/16 stable.
  - Performance (`PERF=1 PERF_ANGLE=metal`, Apple M4 Pro): flight and orbit 59.9 fps p50 / 59.5 p5, first
    interactive 0.6–2.0 s, Earth → region 1.24 s, 34–40 draw calls, heap 17.2 → 24.2 MB after the first round trip
    and 25.2 MB after 60 switches, GPU geometries flat at 47. SwiftShader: 7.5 fps p50, first interactive 3.8 s.
- **Fixed during QA:**
  - Tablet replay: the sheet pushed map tools under the header; now 30 % sheet with the rail open and tools top-right.
  - 2D attribution overlapped the legend with the inspector open at 1440 px (caught in baseline 06).
  - Narrow list mode showed globe labels and cluster badges over the list (inline `visibility` won); now hidden.
  - MapLibre 6 "Worker failed to load" in the built app (caught by the tile-failure E2E).
- **Browser evidence:** `docs/screenshots/phase8-1280-port.png`, `phase8-tablet-1024-sheet.png`,
  `phase8-tablet-768-sheet.png`, `phase8-narrow-list.png`, `phase8-webgl-unavailable.png`, `phase8-context-lost.png`,
  `phase8-tiles-unavailable.png`; baselines in `tests/visual/`.
- **Blockers:** none. Playwright must run outside the editor sandbox (browser launch is blocked inside it).

## Phase V2-0 — Audit, before screenshots, fixture v2.0, `spatialV2` flag

- **Decisions:** fixture v2.0 (D-029, supersedes the D-006 Singapore narrative); `spatialV2` flag (D-030).
- **Implemented:**
  - `docs/PORTOS_V2_AUDIT.md`: subsystem audit with real paths, navigation diagram, LOD gap list, single-clock
    migration plan, performance baseline and V2 budgets, requirement-to-phase map, superseded decisions.
  - `tests/e2e/capture.spec.ts` (opt-in `CAPTURE=before|after`, Metal ANGLE) →
    `docs/screenshots/v2-before-{01-earth,02-region-sea,03-singapore-port,04-vessel-vsl0001,05-incident-replay}.png`
    captured on the v1.1 fixture before any data change.
  - Generator: Singapore case realigned to the kit, VSL-0047 kit fix restored, `PORT_QUEUE_JOINED` and
    `BERTH_ESTIMATE_UPDATED` events, `sample-data/v2/` module (scenario, 30 flagship tracks with 9,711 keyframes,
    3 port layouts, 122 berth bookings) and `manifest.scenarioVersion`/`v2Module`. Validator `validate_v2()`;
    `schemas/v2/*.schema.json`; berth schedule fields pinned as nullable in `build_schemas.py`.
  - App: `V2Module` types, loader for `sample-data/v2/*.json` (missing module → `missingDatasets: ['v2']`, app keeps
    v1 behaviour), catalog `V2Index` (bookings by port/vessel/berth, layouts, window) and keyframe merge outside
    the base samples; track state `modelled`; fold `queued` and `berthEstimates`; replay/vessel labels for the new
    events; fixed the port-wait event label (it read a non-existent `previousEstimateHours`).
  - `src/core/flags.ts` (`spatialV2`, env + query, read once).
  - Tests: `tests/unit/v2fixture.test.ts` (7), `modelled` track test, unit fixture loader reads `sample-data/v2`;
    v1.1-fact tests moved to v2.0 facts (Pacific Horizon at anchor all window, queue from 04:00, berth estimate
    unconfirmed and never linked, new marker IDs). E2E 3D click test now requests `view=3d`: port scope defaults to
    2D and the old test clicked a MapLibre canvas at globe coordinates, passing only because a 2D marker happened
    to sit there.
- **Tested:**
  - `python3 scripts/generate_demo_data.py` twice → identical SHA-1 over all `sample-data/**/*.json`
    (`a67dc98b…`).
  - `python3 scripts/validate_data.py` → exit 0 (500 vessels, 100 ports, 200 voyages, 12,788 positions, 261 port
    calls, 50 incidents, 352 events; "+18h, USD 24,000 … verified"; "V2 module: VSL-0001 holds at anchor, PCL-0001
    34 h queue / 26 h remaining, VSL-0047 follow demo keyframes — verified").
  - `npm run typecheck` → exit 0. `npm run build` → exit 0 (`flagshipTracks` chunk 394 kB, 80.6 kB gzip).
  - `npx vitest run` → exit 0, 191 tests in 12 files.
  - `npx playwright test` → first run 8 failed (7 visual diffs from the moved fixture data, 1 click test as
    above), 35 passed, 6 skipped. After the fix: `journey.spec.ts` 9/9 passed; visual baselines refreshed with
    `--update-snapshots=all` → 16 passed; reviewed `06-investigation-desktop.png` (26 h port wait, hold in the
    southern lobe, "Berth unconfirmed"). Full re-run → exit 0, 43 passed, 6 skipped (opt-in perf/capture).
- **Blockers:** none.


## Phase V2-1 — SpatialDirector, SceneCache, InputRouter, overlay projection, registry, `/ops` routes

- **Decisions:** D-031 (canonical `/ops/*` routes with legacy redirects, country/city scopes, spatial registry,
  director-owned loop and input).
- **Implemented:**
  - `src/spatial/`: `types.ts` (scene lifecycle contract), `SceneCache.ts`, `SpatialDirector.ts`, `InputRouter.ts`,
    `OverlayProjectionAdapter.ts`, `registry.ts`, `data/countries.json` (49 rows incl. the SGP city-state row) and
    `scenes/EarthGlobeScene.ts` (GPL header; adapts `EarthScene` to the lifecycle).
  - `scripts/build_geo.py registry`: country rows from the Natural Earth world file already shipped with the app
    (ISO fallbacks for France, Norway and Taiwan; bbox = largest polygon plus polygons within 2° of a port).
  - `EarthScene` managed mode: `tick(now)` holds the old loop body; pointer and visibility listeners are skipped and
    input arrives through `attachInput(router)`; `setActive` gates controls.
  - `PortosEarthView.vue` (spatialV2 on): creates the InputRouter, overlay adapter and director; scope changes call
    `director.navigate` with the preset/stack flight as the scene focus; labels and test probes project through
    the adapter; the director pauses in hidden tabs. Country and city scopes frame their registry bbox and light
    their country on the globe. With spatialV2 off, the v1 loop runs unchanged.
  - Routing: `opsLocation.ts`, `legacyRedirects.ts`, router table, `useRouteSync` (scene from path, selection
    validation, `/ops` auto scene, `panel=compare|replay`, clock writes `time=`), `useNavigation.openCompare/
    closeCompare`; breadcrumb shows registry labels ("Singapore port" under the Singapore city); incident queue
    filters by region for country and city scopes.
  - Bugs caught by the new unit tests: `SceneCache` evicted the scene it had just created when all others were
    pinned; `SpatialDirector.stop()` called `cancelAnimationFrame` with no frame scheduled.
- **Tested:**
  - `npm run typecheck` → exit 0.
  - `npx vitest run` → exit 0, 221 tests in 14 files (new `spatial.test.ts` 19 and `routing.test.ts` 13: cache
    LRU/pinning, director phases, cancel/Back mid-preload, error keeps scene, camera memory, planner hooks, one
    loop, bounded memory; input click/drag/long-press/hover coalescing/priority; projection margin and anchors;
    registry counts and parent/child consistency, flagship trails, views, illustrative bounds; ops round-trip for
    every level; all 10 legacy redirects). Updated route expectations in `shell`, `port`, `maritime` tests.
  - `npm run build` → exit 0.
  - `npx playwright test` → exit 0, 46 passed, 6 skipped (opt-in perf/capture). New `routes.spec.ts`: v1 links
    redirect (`/region?t=` → `/ops/region?time=`, `/compare` → `panel=compare`, `/incidents` → port scene),
    `/ops/country/CNT-NLD` and `/ops/city/CTY-SIN` breadcrumbs, unknown country → Earth with a notice, director
    state idle with `activeFocusId` following Earth → REG-SEA → Back, scene cache size 1, nothing disposed.
    Visual baselines unchanged (16/16 matched without regeneration).
- **Blockers:** none.


## Phase V2-2 — Natural Earth geometry, reversible projections, extruded Region3DScene

- **Decisions:** D-032 (extruded region / country / city scenes, shared `MapSurface` contract, projections,
  scene mapping and drilldown). TECHNICAL_DEVIATIONS gains rows for the extruded scene, projections and the
  planar hazard-fill deferral.
- **Implemented:**
  - `scripts/build_geo.py geo|all`: Natural Earth 50m/10m admin-0 → 62 scene files (11 regions, 48 countries,
    3 cities; 2,146 KiB, largest CNT-ITA 104 KiB; CTY-SIN from the 10m coastline), `public/geo/index.json`,
    `public/geo/PROVENANCE.md`.
  - `src/spatial/projection.ts` (LAEA + WGS84 ENU, reversible, grid convergence), `src/spatial/geoData.ts`
    (validated, cached, abort-safe loader + idle prefetch), `src/spatial/compass.ts` (scale bar).
  - `src/spatial/scenes/regionGeometry.ts` and `Region3DScene.ts` (GPL headers; terrain normal/roughness maps
    downscaled to 512 px from the skill template into `src/assets/textures/terrain/`).
  - `src/map/surface.ts` `MapSurface`; `EarthScene` implements it; `MaritimeOverlay` and `markerShader` accept
    planar surfaces (world-space anchors above land tops, +Y up, grid-convergence heading, dash lengths scaled by
    `globeUnitScale`, no depth test for lines over extruded land); `planarTheme` in `src/map/theme.ts`.
  - `InputRouter` emits `dblclick` (350 ms, 8 px). `PortosEarthView.vue`: director factory builds planar scenes
    sharing the globe renderer; active surface + per-surface overlays; double-click drilldown; north arrow, scale
    bar and illustrative-bounds chip. `MapWorkspace` hands the camera to 2D from the active surface.
- **Tested:**
  - `npm run typecheck` → exit 0.
  - `npx vitest run` → exit 0, 241 tests in 16 files. New `projection.test.ts` (12: round-trips, axes, distances
    within 1 %, antimeridian, built index vs registry, city frames, illustrative flags, file budget, provenance
    hashes) and `region3d.test.ts` (8: Singapore build with lit SGP contour, fit flight → pose, project/pick
    round-trip lands on SGP, north-up compass, hover lift = 0.6 % and settles back, dblclick only while active,
    dispose once, REG-MED illustrative, scale bar 1-2-5, distance conversion).
  - `npm run build` → exit 0.
  - `npx playwright test` → first run 5 failed: 4 visual baselines (region views now extruded — reviewed and
    regenerated: `02-selected-cluster` and `03-region` at 1440 and 1920) and the director test (expected the globe
    scene key). The new route test caught a scale-bar bug (screen distance measured between points at different
    heights → "10 km" across Southeast Asia); fixed. Second run: reduced-motion scope change took 1,884 ms
    (> 1,500 ms) on a cold region; fixed with idle prefetch of region/city geometry and terrain textures plus
    `compileAsync` (4/4 repeats pass). Final run: exit 0, 47 passed, 6 skipped (opt-in perf/capture); new
    route tests cover Earth → REG-SEA (`region3d:REG-SEA`, planar surface, north arrow, km scale) → Back (globe,
    cache size 2, nothing disposed), double-click Vietnam → `country3d:CNT-VNM`, `city3d:CTY-SIN` metre-scale
    compass, and the REG-MED illustrative chip.
- **Blockers:** none. Known gap: in port scope the queue shelf covers the bottom-left HUD (legend, scale bar);
  the Phase 8 layout moves both.

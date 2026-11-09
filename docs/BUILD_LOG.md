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

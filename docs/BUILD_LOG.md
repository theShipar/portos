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

# Known limitations

PORTOS is an offline portfolio prototype on synthetic data. It is **not** an AIS service, a nautical chart, a
routing advisory or a safety-critical system. Everything below is a known gap, not a hidden one.

## Data and domain

- All vessels, positions, voyages, port calls, berths, queues, weather hazards, incidents, evidence, users and money
  figures are synthetic (`scripts/generate_demo_data.py`, validated by `scripts/validate_data.py`). Nothing is live.
- The simulated clock spans 2026-11-09 00:00–12:00 UTC. "Now" is the fixture anchor (12:00 UTC), not wall-clock time.
- Exposure is a modelled estimate (forecast delay × daily delay rate), not an invoice, demurrage or laytime claim.
- Weather hazards are illustrative polygons with validity windows; "no hazard on corridor" is not a safety statement.
  If the hazard dataset fails to load, route risk reads "unknown" (never "clear") and a notice says so.
- Port geometry (terminals, berths, the Eastern Demo Anchorage) is invented for Singapore and labelled "not for
  navigation". Coastlines, roads and place names in 2D come from OpenFreeMap/OpenStreetMap.
- Scenario comparison is a client-side what-if; "Propose this plan" records a local proposal and changes nothing else.

## Workflow and identity

- Demo identity switching changes permissions in the UI only; there is no authentication or server-side authorisation.
- Decisions, tasks, drafts, notes and the audit log live in this browser's `localStorage`. They are not shared,
  backed up or tamper-evident. Clearing storage or "Reset full demo" removes them; corrupted storage resets with a notice.
- Drafts to customers and port agents are never sent.

## Map and rendering

- WebGL is required for the globe and the 2D port map. Without it the app explains the failure and keeps search,
  inspectors and case work available, but there is no non-WebGL map.
- One quality tier (`standard`, pixel ratio ≤ 1.5) is used; the `high`/`low` profiles exist in code but there is no
  runtime switch or automatic downgrade on slow GPUs.
- On a CPU-only renderer (SwiftShader) the globe runs at ~7 fps (see `docs/PERF_REPORT.md`); interaction stays
  correct because animation is time-based.
- 2D basemap tiles come from the public OpenFreeMap service (no key, no SLA). Offline or when tiles fail, the port
  overlays, queue and inspector keep working on a plain water background with a "Retry tiles" action.
- Singapore is the authored demo port (three terminals and the scenario anchorage). Rotterdam and Genoa get
  procedural 3D twins; every other port has one generic synthetic terminal and anchorage, so its view is a
  schematic 2D map.
- Extruded region, country and city scenes use Natural Earth coastlines at 1:50m and 1:10m scale and are labelled
  illustrative; small islands and harbour detail are simplified. Planar scenes draw hazard outlines only, not the
  globe's hazard fills.
- 3D ships are procedural models by category (container, tanker, gas, bulk, RoRo, tug, other), not class-accurate
  hulls.
- If a region or city scene fails to load, the previous surface frames the requested scope and offers Retry; there
  is no offline copy of the scene geometry.
- The Earth → region handoff takes about 2.8 s on a fast GPU because the cinematic transition is authored; reduced
  motion replaces it with a short crossfade.

## Layout and accessibility

- **The mobile version is not ready yet.** Use a desktop or laptop. Existing responsive fallbacks are experimental, not a supported mobile product.

- Supported desktop widths start at 1024 px; 768–1023 px uses a bottom-sheet inspector; below 768 px the map is
  hidden and the app runs as a list (queue, search, inspector).
- At tablet widths with both the replay rail and the inspector open, the visible map band is small; closing either
  restores it.
- Accessibility is verified by automated smoke tests (keyboard walk, focus visibility, accessible names, contrast
  tokens, reduced motion) and manual review, not by a full WCAG audit or screen-reader user testing.
- Map content is available to assistive technology through lists (exception queue, port queue, cluster picker,
  KPI drill rows, search), not through the canvas itself.

## Testing

- E2E and visual baselines run on Playwright Chromium only (SwiftShader WebGL). Firefox and Safari are untested.
- Visual baselines include public basemap tiles and can drift with upstream map data.
- The performance probe measured one machine (Apple M4 Pro); see `docs/PERF_REPORT.md` for what was not measured.
- Spec 19 acceptance rows are verified by automated browser tests only; no manual pass was performed. Pixel
  baselines exist at 1440×900 and 1920×1080 only, and clicking a ship during active playback is not automated
  (`docs/PORTOS_V2_QA_EVIDENCE.md`).

## Dependencies

- `npm audit --omit=dev` reports 0 vulnerabilities after upgrading MapLibre GL JS to 6.17 (D-027).
- Dev-only tooling still carries advisories (`vitest` 3 → `tinypool`, `@vue/test-utils` → `js-beautify`/`glob`).
  They do not ship in the build; fixing them needs a major Vitest upgrade, deferred.

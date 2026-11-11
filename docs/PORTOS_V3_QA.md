# PORTOS V3 QA record

One entry per gate (`PORTOS_V3_Design_Engineering_Upgrade/PHASES_AND_GATES.md`). Each entry records source paths
changed, acceptance pass/fail, known deviations and a rollback path. Screenshots live in `docs/qa/v3-gN/` at
1440×900 (`desktop-*`) and 390×844 (`mobile-*`), written by `V3CAPTURE=gN npx playwright test v3capture`.

Result vocabulary: **PASS** = asserted by a passing automated test or verified on a captured screenshot (named);
**PARTIAL** = part of the requirement is covered, the rest is listed; **FAIL** = blocks the next gate.

## P0 rubric (SCOPE_AND_ACCEPTANCE.md) — status by gate

| # | P0 requirement | Gate | Status |
|---|---|---|---|
| 1 | Visual: map ≥ 75 % at 1440×900, Urbanist, token spacing, quiet glass | G1 | PASS (G1) |
| 2 | Geographic: whole continent, no rectangular cutout, rotatable, country hover lifts top + sidewall, city/port drilldown | G2, G3 | PASS (G2 geometry; G3 lift, pins, presets, back) |
| 3 | Vessel: type-differentiated near and far LOD, no popping, heading/status match, no wake when moored | G4 | PASS (G4; instant band swap with hysteresis, no crossfade — D-044) |
| 4 | Inspection: 3D preview, origin → destination tracker, container/hold selection from fixture, correct shipment | G5 | PASS (G5; own workshop renderer, illustrative bay spacing — D-045) |
| 5 | Simulation: pause/play/scrub, 1×–100×, one clock for movement/ETA/cargo/berth/KPI | G6 | pending |
| 6 | Ports: container and bulk twins distinct, cranes/berths/yard tied to operations | G7 | pending |
| 7 | Analytics: charts filter/highlight the map; port call timeline and trade flows aggregate correctly | G8 | pending |
| 8 | Usability: P0 actions at 1440×900 and 390×844, 2D fallback, no overlaps, accessible alternatives | G9 | pending |
| 9 | Operational truth: SIMULATED labelling, no live AIS / navigation / slot claims | all | pending |
| 10 | Engineering: build/typecheck/E2E/perf, licence review | G10 | pending |

## Gate 0 — Audit and freeze

- **Source paths:** `src/core/flags.ts` (V3 flags), `src/map/PortosEarthView.vue` (adapter exposes `flags`),
  `tests/e2e/helpers.ts`, `tests/e2e/v3capture.spec.ts`, `docs/PORTOS_V3_AUDIT.md`, `docs/portos-v3/README.md`.
- **Acceptance:**
  - Routes, renderer ownership and data schema documented: PASS (`docs/PORTOS_V3_AUDIT.md` §1–3).
  - All 64 specs mapped to modules with status and target gate: PASS (§4).
  - Baseline screenshots at 1440×900 and 390×844: PASS, 16 images in `docs/qa/v3-g0/`.
  - Smoke tests green: see BUILD_LOG "Phase V3-0".
  - Flags for glass UI, region extrusion, ship preview, port twin, trade BI and mobile: PASS (`flags.ts`, `?v3=0`).
- **Known deviations:** the kit is referenced in place at the repo root instead of copied to `docs/portos-v3/`
  (D-040).
- **Rollback:** revert the gate commit; flags default on but gate nothing yet.

## Gate 1 — Design system and shell

- **Source paths:** `src/styles/tokens.v3.json`, `src/styles/tokens.css` (`data-theme="v3"` block, glass tiers,
  fallbacks), `src/styles/tokens.ts`, `src/styles/base.css`, `src/styles/layout.ts`, `src/main.ts` (Urbanist,
  theme switch), `src/map/theme.ts`, `src/map/port2d/basemapStyle.ts`, `src/components/ui/{SegmentedControl,
  GlassPanel,HudChip,DetailCard,ProgressTrack}.vue`, `src/map/ViewModeSwitch.vue`, `src/components/shell/*`,
  HUD components (KPI rail, breadcrumb, layer palette, peek, follow bar, replay rail, queue shelf, Gantt, ribbon),
  `src/components/shell/SearchCombobox.vue` (`/` before the catalog loads focuses once ready).
- **Acceptance:**
  - Map ≥ 75 % of the 1440×900 viewport with the KPI rail and inspector closed: PASS (`v3design.spec.ts`).
  - Urbanist loaded and applied; header 64 px desktop, 56 px phone: PASS (`v3design.spec.ts`, `v3tokens.test.ts`).
  - Glass tiers with an 18 px blur and opaque fallbacks: PASS (KPI rail computed `backdrop-filter` in e2e;
    fallback blocks asserted in `v3tokens.test.ts`).
  - Inspector `clamp(360px, 29vw, 464px)` → 418 px at 1440: PASS (unit and e2e).
  - AA text contrast on canvas, surfaces and glass over the lightest land tone; 3:1 for map graphics on the
    ocean; selection orange not reused for status: PASS (`v3tokens.test.ts`).
  - No raw hex / rgba in component styles: PASS (token lint in `v3tokens.test.ts`).
  - Keyboard: `/` focuses search, Escape returns; icon-only controls have names: PASS (`v3design.spec.ts`).
  - Phone 390×844: header fits without horizontal overflow; SIMULATED badge visible; search expands: PASS.
  - `?v3=0` restores the V2 look and flags: PASS (`v3design.spec.ts`).
  - Screenshots: 16 images in `docs/qa/v3-g1/` (`desktop-port-sin.png`, `desktop-earth.png` reviewed).
- **PARTIAL:** `HudChip`, `DetailCard` and `ProgressTrack` exist with tests through their consumers in later gates
  (vessel sidebar G5, port twin G7, analytics G8). The phone map is still covered by the "needs 768 px" note
  (Gate 9). The region still shows the rectangular cutout (Gate 2).
- **Known deviations:** `tokens.v3.json` added beside `tokens.json` / `tokens.v2.json`; derived colour roles
  (D-041, TECHNICAL_DEVIATIONS).
- **Rollback:** `?v3=0` or `VITE_V3_GLASS=0`; or revert the gate commit.

## Gate 2 — Region extrusion without the rectangle

- **Source paths:** `scripts/build_geo.py` (`build_entry`: whole focus polygons, `context`, `focusBounds`, wide-frame
  city clip, distance-scaled context simplification), `public/geo/**` (regenerated), `src/spatial/geoData.ts`
  (`GeoContextDoc`, `clip`, `focusBounds`), `src/spatial/scenes/Region3DScene.ts` (ghost context, `fitBounds`,
  sea/graticule extent, pan clamp), `src/map/PortosEarthView.vue` (fit presets, adapter `geometry()`),
  `src/spatial/EarthGeographyBridge.ts` (handoff 580 + settle 520 ms).
- **Acceptance:**
  - No region or country ring has an edge along the frame rectangle (62 files): PASS (`geoV3.test.ts`).
  - Holes and islands preserved (Lesotho in South Africa; more than 20 Indonesian islands): PASS (`geoV3.test.ts`).
  - Only focus land is extruded; neighbours are ghost context; every port country is extruded in its
    region: PASS (`geoV3.test.ts`).
  - Ghost context is non-pickable, line opacity 0.2 (spec 0.08–0.22): PASS (`region3d.test.ts`,
    `v3geometry.spec.ts` for REG-SEA, REG-NEU, CNT-NLD; a hover on Sweden in REG-NEU picks nothing, Germany picks
    DEU).
  - Camera fit from geometry (`focusBounds`, ≤ 25 % growth per side): PASS (`region3d.test.ts`).
  - Handoff reveal + settle 1,100 ms (850–1,400): PASS (`geoV3.test.ts`, `v3geometry.spec.ts`, `handoff.spec.ts`
    per-phase budgets).
  - Screenshots: `docs/qa/v3-g2/desktop-region-sea.png`, `desktop-region-neu.png` (whole Myanmar, Indonesia,
    Philippines, France, Norway; no cut edge), `desktop-country-nld.png` (isolated plate, ghost neighbours).
- **PARTIAL:** hover lift of top + sidewalls, keyboard emphasis and pins are Gate 3. Phone still shows the
  768 px note (Gate 9). Weather hazard zones are drawn as their fixture rectangles (data polygons, not geometry
  cuts); Gate 8 revisits hazard styling.
- **Known deviations:** city files clipped to a wide frame; no 20° tilt floor; director state names kept
  (D-042, TECHNICAL_DEVIATIONS).
- **Rollback:** `?v3RegionExtrusion=0` (scene behaviour) or revert the gate commit (also restores the clipped
  geometry files).

## Gate 3 — Country, city and port geographic UX

- **Source paths:** `src/spatial/scenes/Region3DScene.ts` (V3 lift by `scale.y`, per-feature rim, hit discs,
  `featureLabelPoint`, `applyViewPreset`, `liftProgress`, hover cleared on `deactivate`),
  `src/map/PortosEarthView.vue` (country pins, port-label focus emphasis, Fit / Iso / Top control, preset memory
  on back, adapter `lift()`), `tests/e2e/helpers.ts`, `tests/e2e/v3capture.spec.ts` (`region-sea-focus`,
  `region-sea-iso`).
- **Acceptance (spec 23, 24, 25):**
  - Hover lifts top + sidewalls by 16 % of the extrusion (spec 12–20 %) over 260 ms (spec 220–320), eased, with
    no top/wall gap because the group scales about the ground: PASS (`region3d.test.ts`: partial at 112 ms,
    complete by 272 ms, back to 0 on leave).
  - Rim strength rises on hover (0.32 / 0.55 → 0.95): PASS (code; visible in `desktop-region-sea-focus.png`).
  - Keyboard focus gives the same raised emphasis as hover: PASS (`v3countryux.spec.ts`: pin focus → VNM lift 1,
    blur → 0; pointer hover on the THA pin → 1, leave → 0).
  - Selected country keeps its lift in region scope; hover cleared on deactivate: PASS (`region3d.test.ts`).
  - No sticky hover after drilldown and back: PASS (`v3countryux.spec.ts`: Enter on the VNM pin opens
    `/ops/country/CNT-VNM`; back leaves VNM flat).
  - Small countries get an enlarged invisible hit area: PASS (`region3d.test.ts`: Singapore picks at its centre
    and 6 px off it in REG-SEA; the visible polygon is unchanged).
  - Country pins are anchored inside concave countries: PASS (`region3d.test.ts`: the Vietnam anchor picks VNM).
  - Port label focus raises its country without opening the port: PASS (`v3countryux.spec.ts`, PRT-HCM → VNM).
  - Isometric and top presets; Fit restores the scope framing: PASS (`v3countryux.spec.ts`: polar 50° at azimuth
    35°, 4°, then the fit polar).
  - Back returns the same orientation and preset (spec 24 C.02): PASS (`v3countryux.spec.ts`).
  - Earth → region → country → city → port forward and back without refresh: PASS (`acceptance.spec.ts`,
    `journey.spec.ts`, unchanged and green).
  - Screenshots: `docs/qa/v3-g3/desktop-region-sea-focus.png` (Vietnam raised, rim lit, pin focused),
    `desktop-region-sea-iso.png` (isometric preset with extruded walls), plus region, country and Earth at both
    sizes (12 images).
- **PARTIAL:** the phone map is still covered by the "needs 768 px" note, so the touch form of pins and presets
  is Gate 9. Pins cover drillable countries only (D-043).
- **Known deviations:** lift by scale, pins for drillable countries only, Top preset below 20° (D-043,
  TECHNICAL_DEVIATIONS).
- **Rollback:** `?v3RegionExtrusion=0` (V2 translate lift, no pins, no presets, no hit discs) or revert the gate
  commit.

## Gate 4 — Ship geometry and distant LOD

- **Source paths:** `src/map/earth/lod.ts` (`LOD_BANDS`, `bandFor`, `nextBand`, `selectedBand`, `allocateBands`,
  `BAND_CAPS`), `src/map/earth/MaritimeOverlay.ts` (V3 per-ship bands, projected length, dot / icon / inspection
  batches, ship budget in `stats()`), `src/map/vessels3d/library.ts` (LOD2 medium, LOD3 inspection, `general`
  hull, `buildShipIcon`, `shipDotGeometry`), `src/map/vessels3d/categories.ts` (`general` key and category),
  `src/components/ui/ShipSilhouette.vue` (general cargo profile), `src/qa/shipsPage.ts` (`?lod=3`, `?lod=icon`,
  band strip).
- **Acceptance (spec 04/04, 04/05):**
  - Container, tanker, LNG, bulk, Ro-Ro and general cargo are distinct at every level (icon, low-poly, detailed,
    inspection), each inside its triangle range: PASS (`vessels3d.test.ts`; `ships.spec.ts` grids at LOD0–3 and
    icons; `desktop-ships-icons.png`).
  - Bands by projected length < 4 / 4–16 / 16–55 / 55–160 / > 160 px with 15 % hysteresis; no flicker at a ±8 %
    oscillation: PASS (`maritime.test.ts`).
  - No band change across 1.5 s at a still camera; the selected ship's band only climbs while zooming in: PASS
    (`v3ships.spec.ts`).
  - Every drawn ship's band matches its projected length (within the hysteresis): PASS (`ships.spec.ts` region).
  - Selection one band up; close models capped (2 inspection, 12 detailed): PASS (`maritime.test.ts`,
    `ships.spec.ts`: VSL-0001 in PRT-SIN at band ≥ 3).
  - Heading matches COG underway; no wake when moored or anchored, and none on icons or dots: PASS
    (`ships.spec.ts`, `vessels3d.test.ts`).
  - Earth draws icons, not models, for distant ships, with no wakes: PASS (`v3ships.spec.ts`).
  - Perf budget with 500 vessels (draw calls / triangles): Earth 6 / 7.6k (budget 12 / 150k), REG-SEA 13 / 179k
    (18 / 400k), PRT-SIN 7 / 76k (24 / 900k): PASS (`v3ships.spec.ts`).
  - `?v3ShipPreview=0` restores the V2 overlay-wide LOD: PASS (`v3ships.spec.ts`).
  - Screenshots: `docs/qa/v3-g4/desktop-region-sea.png` (icons and low-poly models), `desktop-port-sin-close.png`
    (selected ship at inspection detail), `desktop-ships-icons.png` (icon grid and band strip), plus Earth, port
    and vessel at both sizes (12 images).
- **PARTIAL:** no 120–220 ms crossfade between bands; dots rare because of the 7 px marker floor; fixed caps
  instead of a device-quality tier (D-044, TECHNICAL_DEVIATIONS).
- **Rollback:** `?v3ShipPreview=0` or revert the gate commit.

## Gate 5 — Vessel inspection, cargo and the workshop

- **Source paths:**
  - Fixtures and validation: `scripts/generate_demo_data.py` (`gen_v3`, `iso6346_check`), `sample-data/v3/*.json`
    and `scripts/validate_data.py` (`validate_v3`).
  - Types, loading and store: `src/core/cargoTypes.ts`, `src/data/cargoLoader.ts`, `src/stores/cargo.ts`.
  - Engine: `src/engines/cargo.ts`, which is pure (location and occupancy at a time, stowage lookup, holds, delay
    exposure).
  - Selectors and IDs: `src/selectors/vesselCargo.ts` and `src/v3/idAdapter.ts`.
  - Scene: `src/spatial/scenes/VesselWorkshopScene.ts`, plus `shipHullProfile` and the bare hull in
    `src/map/vessels3d/library.ts`.
  - UI: `src/features/inspectors/{VesselWorkshop,CargoPanel}.vue`, `useVesselCargo.ts` and `VesselInspector.vue`.
- **Acceptance (spec 04/04, 05):**
  - Fixture integrity, all PASS (`validate_data.py`; `cargo.test.ts`):
    - 1,000 containers with valid ISO 6346 check digits;
    - an 800-slot plan for VSL-0001 with 620 boxes on arrival;
    - compartment plans for LNG, bulk, tanker, Ro-Ro and general cargo;
    - 500 transfer events with single occupancy, no box over an empty slot, one location per unit per instant,
      and crane exclusivity.
  - Delay exposure uses one formula in the engine and the validator (VYG-0001: 18 h → USD 24,000): PASS
    (`cargo.test.ts`, `validate_data.py`).
  - Sidebar order is identity (3D preview and Follow), then cruise progress (ATD/ETD → ETA), cargo summary and the
    slot picker: PASS (`v3cargo.spec.ts`).
  - Bay grid → slot → manifest card with the correct container number and shipment:
    - the selection is mirrored in 3D and kept in the URL across a reload;
    - the grid is a single tab stop with arrow-key navigation;
    - PASS (`v3cargo.spec.ts`).
  - Picking a box in the 3D preview opens the same manifest: PASS (`v3cargo.spec.ts`, via
    `__portosWorkshop.project`).
  - Camera rigs:
    - Chase sits 1.3 ship lengths astern; Above, Orbit and Deck each work;
    - any drag switches to Free and clears `cam`;
    - PASS (`v3cargo.spec.ts`, `cargo.test.ts`).
  - Hold filter and exploded view: the hull ghosts below 30 % opacity and the tween completes on the wall clock,
    PASS (`v3cargo.spec.ts`).
  - Restricted cargo hides the commodity, shipper and consignee: PASS (`v3cargo.spec.ts`).
  - A time scrub to 15:10Z on 2026-11-10 empties the discharged slot and lowers the count of boxes on board:
    PASS (`v3cargo.spec.ts`).
  - VSL-0047 shows 4 LNG tanks. A container slot in its URL is refused with a notice: PASS (`v3cargo.spec.ts`).
  - Kit records go through `idAdapter`. A kit container record on a non-container vessel is refused: PASS
    (`cargo.test.ts`).
  - `?v3ShipPreview=0` and `?v3=0` restore the V2 overview without loading cargo: PASS (`v3cargo.spec.ts`).
  - Screenshots in `docs/qa/v3-g5/`, at both sizes (10 images):
    - `desktop-vessel-cargo.png` (workshop and stowage summary)
    - `desktop-vessel-manifest.png` (restricted manifest)
    - `desktop-vessel-cargo-exploded.png` (hold 3 exploded)
    - `desktop-vessel-chase.png`
    - `desktop-vessel-lng-tanks.png`
    - Phones still show the < 768 px notice until Gate 9.
- **PARTIAL:**
  - The workshop has its own WebGL context rather than the shared map renderer.
  - Bay spacing is illustrative ("not to scale").
  - Map Follow keeps the V2 rigs; the five camera modes live in the workshop.
  - Transfer events are not yet animated on cranes (Gate 7).
  - See D-045 and TECHNICAL_DEVIATIONS.
- **Rollback:** `?v3ShipPreview=0` or revert the gate commit.

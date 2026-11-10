# PORTOS V2 — Repository audit and redesign delta

Audit of the PORTOS v1 release (Phases 0–8, fixture v1.1) against `PORTOS_V2_MASTER_UPGRADE_PLAN.md` (spec 01).
All paths are real files in this repository at the start of V2. Everything remains synthetic and is labelled
`Simulated`; nothing here is live AIS.

## Before screenshots

Captured with `CAPTURE=before npx playwright test tests/e2e/capture.spec.ts` (Metal ANGLE, 1440 × 900), on the v1.1
fixture before any V2 change:

| View | File |
|---|---|
| Earth | `docs/screenshots/v2-before-01-earth.png` |
| Southeast Asia region (globe zoom) | `docs/screenshots/v2-before-02-region-sea.png` |
| Singapore port (2D default) | `docs/screenshots/v2-before-03-singapore-port.png` |
| MV Pacific Horizon inspector | `docs/screenshots/v2-before-04-vessel-vsl0001.png` |
| INC-0001 replay | `docs/screenshots/v2-before-05-incident-replay.png` |

The same spec with `CAPTURE=after` produces the matching `v2-after-*` set in Phase 9.

## Subsystem audit

### Globe
- **Renderer ownership:** `src/map/earth/EarthScene.ts` owns one `WebGLRenderer`, the RAF loop, `OrbitControls`,
  resize and context-loss handling. `src/map/PortosEarthView.vue` mounts it and exposes the test adapter
  (`window.__portos`, dev/e2e only, D-025).
- **Camera:** `src/map/earth/camera.ts` (`CameraTransitionController`, GSAP flights, insets for drawers);
  presets in `src/map/regions.ts`; screen insets in `src/map/viewport.ts`.
- **Textures and outlines:** day/night/normal/specular maps and the atmosphere rim follow the skill technique
  (`src/map/earth/shaders.ts`, GPL notice kept); coastlines and country borders are batched `LineSegments` from
  `src/map/earth/worldGeo.ts` over a Natural Earth-derived `world.earth-render.json`.
- **From the skill:** sphere shader approach, atmosphere, starfield, batched outlines, two-phase handoff idea, GSAP
  flights (`TECHNICAL_DEVIATIONS.md`). Files carrying GPL-3.0-or-later notices: `EarthScene.ts`, `shaders.ts`,
  `PortosEarthView.vue`, `MapWorkspace.vue`.

### Region navigation
- **Router/store:** `src/router/index.ts` (routes `/operations`, `/region/:regionId`, `/port/:portId`,
  `/vessel/:vesselId`, `/voyage/:voyageId`, `/incidents/:incidentId`, `/corridors/:routeId`, `/weather/:hazardId`,
  `/compare/:voyageId`, `/replay/:voyageId`), `src/router/useRouteSync.ts` (URL ⇄ store), `src/router/navigation.ts`,
  `src/stores/view.ts`, `src/core/scope.ts` (`Scope = earth | region | port`, `in=` encoding).
- **Current behaviour:** every scope is the same sphere; a region click flies the globe camera closer.
- **Missing scene mode (the V2 gap):** no independent `region3d`, `country3d`, `city3d` or `port3d` scene, no
  country or city level in the scope model, no geographic registry beyond `src/map/regions.ts`.

```text
current:  earth ──fly──▶ region (same sphere) ──fly──▶ port (same sphere | MapLibre 2D)
V2:       earth3d ─handoff─▶ region3d ─▶ country3d ─▶ city3d ─▶ port3d ⇄ port2d
                    ▲ back / breadcrumb at every level (URL is the source of truth)
```

### 2D map
- `src/map/port2d/PortMap2D.vue` (MapLibre GL JS 6.17, D-027), `basemapStyle.ts` (OpenFreeMap tiles, attribution
  "OpenFreeMap © OpenMapTiles Data © OpenStreetMap contributors", D-011), `features.ts`, `icons.ts`.
- Switching: `src/map/ViewModeSwitch.vue` and `view.viewMode`; port scope defaults to 2D (`core/scope.ts`),
  region scope can switch. V2 keeps this adapter and adds `port3d` as the 3D side of the switch.

### 3D vessels
- `src/map/earth/vesselGeometry.ts`: one low-poly hull, instanced, plus `markerShader.ts` billboards.
- `src/map/earth/lod.ts`: marker vs hull switch by camera distance; `MaritimeOverlay.ts`: routes, wakes, labels,
  clusters on the globe.
- **LOD gap list:** a single generic hull for every vessel type; no per-category silhouette; no LOD1/LOD2; no
  explicit forward/up convention or heading helper with tests; wakes not gated by navigation status; no
  anchor sway. Phase 4 adds the procedural library (`src/spatial/ships/`).

### Clock and replay
- **Date source:** `src/stores/clock.ts` (`anchorMs` = fixture Now, `REPLAY_SPEEDS = [1, 10, 60]`, window
  `replayStartMs..anchorMs`, frame-time playback, D-021).
- **Animation loops:** `EarthScene` RAF (render only) and `ReplayRail.vue` playback driving `clock.frameTimeMs`.
  No component owns a private speed timer.
- **Historical samples:** `positions.json` (12 h), `src/engines/tracks.ts` interpolation (≤ 30 min, never
  extrapolates).
- **Single-clock migration plan (Phase 6):** replace the clock store with a canonical
  `ClockState { mode, scenarioNowUTC, playbackRate ∈ {1,5,10,25,50,100}, minUTC, maxUTC }` over the V2 7-day window,
  a pure `deriveWorldSnapshot(t)`, loop ranges, follow modes; v1 speeds 1/10/60 are retired (D-008 Now pin is
  superseded).

### Data
- Loader `src/data/loader.ts`, catalog `src/data/catalog.ts` (ID maps, tracks, events by entity), fold
  `src/engines/fold.ts`, snapshot `src/engines/snapshot.ts`, selectors in `src/selectors/*`.
- Fixture generator `scripts/generate_demo_data.py`, validator `scripts/validate_data.py`, schemas
  `scripts/build_schemas.py` → `schemas/`.
- **Findings fixed in Phase 0 (fixture v2.0, D-029):** the v1.1 Singapore case had drifted from the kit
  (MV Pacific Horizon sailed in and anchored at 09:15 with a confirmed berth; the kit says it waits at anchor with an
  unconfirmed berth). VSL-0047 lost its kit fix. There was no history before 00:00 or forecast after 12:00, so a
  7-day 100× replay had nothing to show.

### Operations
- Engines: `eta.ts`, `exposure.ts`, `congestion.ts`, `weatherRisk.ts`, `priority.ts`, `scenario.ts`, `kpis.ts`,
  `provenance.ts`. Workflow: `src/workflows/{reducer,incidentMachine,validate,handoff}.ts`, `src/stores/workflow.ts`
  (`portos:workflow:v1`).
- **Missing causality / copy:** no ETA-variance distribution, no JIT arrival window, no berth-conflict detection,
  no service-chain view; lifecycle `open → acknowledged → … → resolved` (D-004) lacks `detected/untriaged` and an
  explicit "approved for simulation" step. "0 unresolved" shown next to delayed counts without explaining case
  eligibility (spec 01 debt #2). Phase 7 covers these.

### UI
- Shell: `App.vue`, `components/shell/*` (header, KPI row, breadcrumb, search, notices, inspector drawer),
  `features/*` (queue, inspectors, incident, replay rail, compare, workflow hub).
- **Reuse:** search combobox, breadcrumb, provenance button/details, status chips, notices, reset dialog.
- **Refine:** KPI row (→ `MapKpiRail`, ≤ 4 with scope and denominator), inspectors (→ `EntityPeek`,
  `VesselInspector`, `PortInspector` with mini-Gantt), layer menu (→ `LayerPalette`), replay rail
  (→ `ReplayTimeline`, 54–66 px collapsed).
- **Retire:** the large floating left queue as the default (→ collapsible `IncidentRibbon`, ≤ 3 items).
- Layout today: header 64 px, inspector 408 px (D-003), so the map is ~70 % of 1440 × 900 with the queue open;
  V2 target ≥ 80 %.

### Performance baseline (v1 release, `docs/PERF_REPORT.md`)
Apple M4 Pro, Metal ANGLE: 59.9 fps p50 / 59.5 p5 during flight and orbit, first interactive 0.6–2.0 s,
Earth → region 1.24 s, 34–40 draw calls, heap 17.2 → 24.2 MB after a round trip, 25.2 MB after 60 switches, GPU
geometries flat at 47. SwiftShader: 7.5 fps p50. **V2 budgets:** ≥ 55 fps p50 on Metal in region3d/port3d,
≤ 120 draw calls in port3d, handoff ≤ 3.25 s worst case, no geometry growth across 20 scene round trips
(SceneCache disposes on eviction).

## Requirement map (V2 → current code → phase)

| V2 requirement | Current state | Phase |
|---|---|---|
| Single scene controller, `sceneKind` orthogonal to selection | View store + one sphere scene | 1 (`SpatialDirector`) |
| Separate extruded region/country/city scenes | Missing | 2 |
| Earth → region cinematic handoff, cancel/Back, reduced motion | Camera flight only | 3 |
| Ship library, LOD0–2, heading helper | One generic hull | 4 |
| Port 3D twin, DCSA milestones, berth Gantt | 2D port + 3D sphere markers | 5 |
| Canonical clock 1–100×, 7-day window | 1/10/60× over 12 h | 0 (data) + 6 |
| ETA variance, JIT, berth conflicts, service chain | Partial (ETA, exposure, congestion, weather) | 7 |
| V2 lifecycle + `workflow:v2` storage | v1 lifecycle (D-004) | 7 |
| V2 palette, ≥ 80 % map, premium components | v1 palette (D-002), 408 px inspector (D-003) | 8 |
| `/ops/*` routes with legacy redirects | v1 routes | 1 |
| `spatialV2` feature flag | Added in Phase 0 (`src/core/flags.ts`) | 0 |

## Decisions superseded by V2

| v1 decision | Superseded by | Phase |
|---|---|---|
| D-002 palette from `tokens.json` | V2 palette (app #F6F6F3 … uncertain #A6A9B4) | 8 |
| D-003 inspector 408 px | Map ≥ 80 % at 1440 × 900, peek + inspector | 8 |
| D-004 incident lifecycle | `detected → untriaged → investigating → optionProposed → approvedForSimulation → monitoring → resolved/closed` | 7 |
| D-006 fixture v1.1 Singapore narrative | Fixture v2.0 (D-029) | 0 |
| D-008 Now pin / D-021 replay speeds | Canonical clock 1–100× over 7 days | 6 |

## Feature flag
`src/core/flags.ts` reads `VITE_SPATIAL_V2` (build) and `?spatialV2=0|1` (first URL, kept in `sessionStorage`)
once at startup. Default on. With the flag off, every scope renders through the v1 sphere scene so the original
app stays usable while V2 scenes land.

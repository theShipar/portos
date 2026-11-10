# Decisions

Resolutions for conflicts inside the PORTOS kit and choices the kit left open. The kit in
`PORTOS_Codex_Master_Kit/` is the read-only reference; everything here overrides it where stated.

## D-001 Design authority: PORTOS spec over the skill's one-to-one look
The Three Scope Map skill mandates its neon HUD (`#E8FF4F` side walls, chase light, SVG HUD labels, China-first
scope). PORTOS mandates a restrained white/orange maritime UI over a global Earth. PORTOS wins. The skill is used as a
technique source: Earth sphere + day/night/normal/specular shader approach, atmosphere rim, starfield, batched
`LineSegments` coastlines, two-phase render handoff, GSAP camera flights. See `TECHNICAL_DEVIATIONS.md`.

## D-002 Palette source of truth: `assets/tokens.json`
`tokens.json` + `START_HERE.md` win over `instructions/02-design-system/02_color_and_semantic_tokens.md`.

| Role | Used | Overridden spec value |
|---|---|---|
| App canvas | `#F6F7F8` | `#F7F8F6` |
| Ink primary | `#111827` | `#141B22` |
| Accent | `#E96722` (hover `#C65117`, subtle `#FFF2E9`) | `#E25B23` / `#C84B16` |
| Ocean | `#061A28` | `#081723` |
| Land | `#1F3B48` | `#1B3441` |
| Critical / warning / healthy | `#B42318` / `#B96516` / `#18784E` | `#B43732` / `#B46E14` / `#23724D` |

Spec-only roles absent from tokens are kept: information `#2E658B`, route base `#82B8C9`, selected route `#FF905B`,
land outline `#4D6974`, ocean mid `#102837`.

## D-003 Layout geometry
Header 64px; right inspector 408px (expandable to 420px, min remaining map 680px); replay rail 60px;
radius 6px inputs / 10px panels / 4px dense chips; 8px spacing unit. (Specs variously said 56px header, 344–420px
inspector, 52–64px rail, 8/12px radius.)

## D-004 Incident lifecycle
`open -> acknowledged -> investigating -> mitigation_planned -> monitoring -> resolved`, reopen via explicit audited
action. Fixture status `open` is the entry state. (Screen spec 07/05 listed `mitigated`; workflow spec 09/01 listed
`new`.)

## D-005 Workspace layout
App lives at the workspace root. Kit `sample-data/`, `schemas/` and `scripts/` were copied to the root; only the
root copies are edited. The kit folder is not modified.

## D-006 Fixture v1.1 (generator changes, seed 92026 retained)
*The Singapore case narrative below is superseded by D-029 (fixture v2.0); the other items still apply.*
- Replay window `2026-11-09T00:00Z` → `12:00Z` (`manifest.replayRange`). Samples: VSL-0001 every 5 min, Singapore
  anchorage vessels every 15 min, others every 30 min, so interpolation never spans more than 30 min. Vessels whose last
  report is older than 30 min are intentionally stale.
- MV Pacific Horizon approaches from the South China Sea (underway 12 kn) and anchors at 09:15 inside `ANC-SIN`.
- `VYG-0001`: `currentStage=awaiting_berth`, `departedAtUtc=null`, planned departure `2026-11-10T14:00Z`, estimated
  departure `2026-11-11T08:00Z` (+18h, matching the ETA shift). +18h × $32,000/day = $24,000 unchanged.
- Singapore case timeline (EVT-0001..0009): AIS approach, WX-0001 issued, wait 9→14h, ETA +8→+18h, anchorage enter,
  INC-0001 opened, wait 14→26h, berth BRH-SIN-W-1 scheduled, AIS at anchor.
- Regions: 11 operational regions with `countryIso3[]`, `portIds[]`, `cameraPreset`. REG-PAC (no ports) removed; the
  Atlantic catch-all split into North America Pacific/Atlantic, Latin America, West & Southern Africa, Oceania.
- Corridors re-drawn so waypoints stay in water (Malacca, Red Sea, Gulf of Oman, Sri Lanka, Japan, Australia fixes).
  Added scenario-only alternative `RTE-SIN-RTM-CAPE`.
- Singapore showcase: 3 demo terminals / 10 berths with positions and occupants, Eastern demo anchorage in open water,
  12 inbound arrivals within 24h, waits with unknown start (excluded from medians).
- Events: added ANCHORAGE_EXIT, BERTH_SCHEDULED, BERTH_OCCUPIED, INCIDENT_ACKNOWLEDGED, ACTION_ASSIGNED,
  INCIDENT_RESOLVED, `quality` field, ETA_REVISED payloads with previous/new ETA (latest equals voyage estimate).
- Weather: `affectedVoyageIds` computed by geometry + validity time with the same progress model the app uses.
- Incidents: `entityRefs`, `detectedAtUtc`, `acknowledgedAtUtc`, `resolvedAtUtc`, `actionIds`, `title`; mixed
  lifecycle states; named scenarios (Indian Ocean weather, Rotterdam berth, North Sea transit); INC-0050 shares
  VYG-0001 to exercise exposure de-duplication.
- Users: `title`, `defaultWorkspace`, `permissionFlags` (`action.{resource}.{verb}`), `locale`, `timeZone`.

## D-008 Simulation clock: "Now" pinned to the anchor
The clock spec says "Now (simulated)" advances from session start, but the fixture has no samples after
`2026-11-09T12:00Z`; advancing would make every vessel stale after 30 minutes and invent unknowns. "Now (simulated)" is
therefore fixed at the anchor, and motion is shown only in replay (`00:00–12:00Z`, 1×/10×/60×/600×). The clock store
commits reactive time at most every 100 ms; render loops read `frameTimeMs()` per frame. Local workflow decisions
apply only at "Now"; replay shows fixture history.

## D-009 Map marker colours lifted from status tokens
Token status colours (`critical #B42318`, `warning #B96516`, `unknown #687482`) are designed for white panels; at
marker size on the `#061A28` ocean they fall below 3:1. Map glyphs therefore use the same hues mixed toward white
(`src/map/theme.ts` `markerColors`: incident = critical +34 %, at risk = warning +22 %, late forecast = warning +55 %,
stale = unknown +10 %). Managed on-plan vessels are a light neutral `#D3DDE3`; non-managed traffic is a dim `#7D93A1`
so it never reads as managed. Panels, chips and the stack picker keep the unmodified token colours. Status is never
colour-only: incident vessels carry a dashed ring, late forecast uses a dashed cluster border, and every tooltip and
list row names the state.

## D-010 Dense-spot handling: paint-order hit test, stacks with a picker
At region scope the Singapore anchorage puts ~50 vessels within 2 px of each other, so "nearest centre wins" picked
an effectively random hull. Two rules (spec 05/01 interaction priority, spec 10/03 "cluster before visual
overcrowding and expose item list"):
- Hit testing walks markers in paint order and returns the topmost glyph whose core is under the pointer (selected >
  hovered > incident > at risk > late > managed > other), falling back to nearest-within-radius. The tooltip states
  how many other vessels share the spot.
- Earth scope keeps grid clusters (6°/3° bands) whose click zooms to bounds. Region and port scopes collapse only
  genuine pile-ups: a power-of-two geographic cell sized to half a marker's ground length (hysteresis 0.4–1.15×), at
  least 6 vessels, pinned vessels (selection, open incidents) never absorbed. Clicking a stack opens a picker (worst
  state first, 8 rows, "Zoom to area"), because vessels moored metres apart cannot be separated by zooming.

## D-011 2D basemap: OpenFreeMap vector tiles in the PORTOS palette
Chosen at Phase 4 (user decision). MapLibre GL 5 renders OpenFreeMap's OpenMapTiles-schema `planet` tiles (free, no
key, OSM data under ODbL) through a PORTOS-owned style (`src/map/port2d/basemapStyle.ts`): ocean `#061A28`, land
`#1F3B48`, port/industrial landuse a lighter neutral so terminals read, roads and buildings muted, English labels in
Noto Sans. The basemap is reference only; every operational element (vessels, berths, anchorage, corridors, hazards,
queue) is a PORTOS overlay from the fixture.
- Config: `VITE_PORT_BASEMAP_STYLE_URL` (full style, used as-is), `VITE_PORT_BASEMAP_TILES_URL` (TileJSON for the
  PORTOS style; default OpenFreeMap), `VITE_PORT_BASEMAP_GLYPHS_URL`; `none` disables tiles.
- Attribution: "OpenFreeMap · © OpenMapTiles · Data © OpenStreetMap contributors · Port layout, vessels & queues
  synthetic · not for navigation" in the map footer whenever 2D is shown.
- Failure: a basemap source error, or no tile within 12 s, shows "Basemap unavailable" with a retry; the background
  switches to plain water so land is never implied. Overlays, the queue and the inspector keep working.
- Vessel and berth icons are canvas-drawn (`icons.ts`) and labels are DOM, so nothing operational depends on the tile
  or glyph server.
- 2D exists at region and port scope only (Earth has no 2D). Port opens in 2D by default, region in 3D; the URL
  carries `view=` only when the mode differs from the default. Switching hands the camera across by matching ground
  resolution at the view centre (`src/map/viewport.ts`), clamped to each mode's zoom range; the first 2D visit to a
  port fits the port layout. The 3D render loop is stopped while 2D is shown.

## D-012 Selection survives scope changes
The acceptance path "Earth → Southeast Asia → Singapore → 2D → 3D region → Earth retains the selected vessel" needs
scope navigation that does not clear the inspector. `openScope` now keeps the open entity and moves the scope into
`in=` (`/vessel/VSL-0001?in=region:REG-SEA`, explicit `in=earth` at Earth). Clicking the current scope's breadcrumb,
Esc, or the back button closes the selection; the PORTOS brand link goes home with nothing selected.

## D-013 Provenance on every metric; user-scenario rates apply in replay
Every computed value carries a `Provenance` record: source class (simulated fixture, derived model, user scenario),
evidence kind (observed, estimated, scenario, unknown), as-of time and age, freshness band per feed, confidence,
method, formula with the actual numbers, sources (events, records, engines, assumptions), assumptions and warnings.
The UI shows it through one popover component, so a reader can always answer "where does this number come from?".
- A daily-rate override is a user scenario, not data: it is stored per voyage in `portos:assumptions:v1` with who
  set it and when (simulation time), labelled "User scenario" wherever the exposure appears, and flips the
  provenance to user-scenario / scenario evidence. Entering the fixture value removes the override.
- Overrides apply at every simulation time, including replay, because they describe the user's assumption rather
  than an event in the timeline. Replay of fixture events stays deterministic for a given override set.
- Editing requires `action.scenario.propose`; the Viewer role sees the value and the reason it cannot edit.

## D-014 At risk is computed from geometry × time
The fixture's `affectedVoyageIds` on hazards is a bootstrap list, not evidence. A voyage is "at risk" when it has an
unresolved incident or when `computeRouteHazards` finds its expected traversal intersecting an issued hazard while
the hazard is valid. The KPI, the hazard overlay count and the weather inspector share that computation. Without a
weather feed the band is `unknown`, never `low`. A hazard near a corridor that the voyage does not cross is shown as
"Hazard on corridor · not crossed" and is not counted.

## D-015 KPI cohort follows scope; drill-down lives in the URL
KPIs are computed for the current scope: the whole simulated fleet at Earth, the region (vessels positioned inside,
plus voyages starting or ending there) at region scope. Port scope keeps its own port KPIs. Each KPI lists its
members worst first; "Show only these on map" writes `?kpi=<key>` with `router.replace` (no history entry), filters
map markers to the members plus the selection, and survives reload. Opening entities and moving between Earth and
regions keep the drill; entering a port drops it (port KPIs have no members); the drill chip's Clear removes it. Count tiles show their denominator so vessel and voyage counts are not compared
by mistake.

## D-016 Local workflow is a reducer over fixtures, never a fixture edit
Incident lifecycle changes, owners, due times, notes, tasks, drafts and route proposals live in one versioned
`WorkflowState` (`portos:workflow:v1`), changed only through `reduceWorkflow(state, command, context)`. The reducer
checks role permissions and transition rules, returns a new state plus one append-only audit event, and never touches
fixture data. The snapshot applies the incident part as an overlay. Consequences:
- Every action has an audit event (actor, role, wall-clock click time, simulation time, entity refs incl. vessel,
  voyage and port, previous/next state, notes, `source: local-demo`), so a vessel's Events tab and the activity hub
  read the same trail as the incident timeline.
- Undo is a new `incident.undo` event that restores the previous status/owner, allowed only for the latest
  state-changing event on that case; resolve cannot be undone (reopen instead, with a reason).
- Unreadable or duplicate-ID saved state is discarded with a notice; blocked storage keeps working in memory with a
  "Not saved" indicator.
- Three resets with a dialog that lists exactly what is cleared: view (scope, selection, layers, KPI filter, time),
  decisions (workflow + rate overrides, with "Export audit JSON first"), full demo (both + identity/preferences).

## D-017 Decisions are taken at Now (simulated)
Writes are blocked while replaying: "Decisions are recorded at Now (simulated). Return to now to act." The overlay
applies only at times ≥ the anchor, and local audit rows are hidden in replay, so history stays exactly what the
fixtures say and replay stays deterministic.

## D-018 Explainable priority and alert dedupe
Queue order is a points sum, and every term is shown: severity (critical 45 / high 30 / medium 15), exposure
(linear to 30 points at $40,000), age (1 point per hour, max 15), status (open +10, acknowledged +5), low or unknown
confidence −5. The label is "priority score", not "dispatch order". Forecast alerts (schedule variance, port delay,
port congestion) on the same voyage and category within a 6 h bucket collapse into one case; other alerts on the
same voyage stay separate but cross-linked, and exposure is counted once per voyage. The queue shows the top five
for the current Earth/region scope, with search and "Show all".

## D-019 Comparison is a what-if, honestly labelled
Options are computed from the same ETA and exposure engines as the inspector: maintain plan (baseline), port-agent
confirmation (same delay, confidence one level up), and the scenario corridor when the dataset has one for the same
origin/destination (extra distance at the assumed speed, low confidence, manager approval). Inputs are validated
with stated limits. Proposing records a decision and a follow-up task; only a manager can accept, and acceptance
never changes the route, ETA or any external system. While comparing, the map also draws the candidate corridor in
the dashed "proposed" style. Drafts are prepared locally and have no Send action.

## D-020 One event fold is the source of recorded history
`foldEvents(base, events, t)` (`src/engines/fold.ts`) is a pure reducer over fixture events sorted by
(occurredAt, eventId). Incident visibility, status and owner, port wait estimates, anchorage membership, berth
occupancy, berth windows, warnings, latest position reports and ETA revisions all come from it, and
`getSnapshotAt` folds once per instant. The fixture's "investigating"-type statuses have no event of their own, so
they apply at the recorded ACTION_ASSIGNED event (one minute after acknowledgement); the acknowledging user owns
the case from acknowledgement. A unit test checks the fold against the incident record timestamps at every event
boundary (±1 ms), so the two descriptions cannot drift apart. Local decisions stay a separate overlay (D-016).

## D-021 Replay speeds, scrubbing and URL time
Speeds are 1×, 10× and 60× (simulated seconds per wall second); the 12 h window takes 12 min at 60×. Playback is
time-based, not frame-based (frame delta capped at 1 s, hidden tabs pause), so slow frames never slow the
simulation. Scrubbing commits at most once per animation frame and pauses playback; the clock rounds to whole
seconds. Arrow keys step one minute, Shift+Arrow jumps to the previous/next event marker in context, Page keys and
Home/End use the native slider steps. While paused the URL carries `t=` (debounced 300 ms) and drops it at Now;
links with `t` outside the window snap to the nearest edge with a notice. Opening a review dialog (reset, response
comparison) pauses playback.

## D-022 Replay rail content
Markers follow context: a selection shows its own events plus linked records (vessel ↔ voyages ↔ cases, case →
port); port scope shows that port's events; with nothing selected the rail shows case openings and storm warnings.
A 30-minute density histogram of all events sits behind the markers. Clicking a marker seeks to it and, with
nothing selected, opens the linked entity. "Compared with Now" uses the same snapshot function for both columns
(position state and age, ETA shift and confidence, exposure, each case's status or "Not yet detected", the port
wait and anchorage); with no context it compares the global KPIs. Before a vessel's first report it reads
"Not yet tracked · first report HH:MM UTC". UTC is always shown; the port's local time is added when a port is in
context, with the date only when the local date differs.

## D-023 Historical notes are the only write allowed in replay
"Add note" records a `history.note` audit event at the user's current time that references the historical instant
and the selection. It needs the add-notes permission, changes no case state and cannot be undone; every other
command stays blocked in replay (D-017).

## D-024 Responsive layout
Desktop (> 1024 px) keeps the right inspector and insets the map camera by its width. At ≤ 1024 px the inspector
becomes a bottom sheet (46 % of the workspace, 30 % while the replay rail is open), the camera inset drops to zero,
map tools move to the top-right and the legend hides. The header compacts to icons with visually hidden labels at
≤ 1200 px and drops the brand name at ≤ 900 px. The replay rail stacks its "Compared with Now" panel below the
track at ≤ 1100 px. Below 768 px the map is hidden (kept mounted, `visibility: hidden` on the map and every label)
and a note explains that cases, search and the inspector still work; the left stack becomes a full-width list.

## D-025 Test adapter in dev and e2e builds only
`window.__portos` (scene state, `renderer.info` stats, flight state, reduced-motion flag, page coordinates for
vessels and ports, vessels near a point, forced context loss) and `window.__portos2d` (the MapLibre map) exist only
when `import.meta.env.DEV` or `MODE === 'e2e'`. Playwright builds with `vite build --mode e2e`; the production build
does not expose them. E2E clicks real map hit targets at adapter-provided coordinates rather than calling handlers.

## D-026 AA text roles derived from the kit palette
Several kit hues fail WCAG AA as small text (`ink.muted` 3.9:1 on white, accent 3.3:1, warning 3.8:1 on its
chip fill, unknown 4.2:1). `tokens.json` stays byte-identical to the kit and drives fills, markers and the map;
`tokens.css` adds text roles darkened along the same hue until they reach ≥ 4.5:1 on panel, app and subtle fills:
`--color-ink-muted` #646F78 (raw value kept as `--color-ink-muted-token`), `--color-accent-ink` #B94C12,
`--color-warning-ink` #A45A14, `--color-unknown-ink` #616C7A. Filled primary controls use the kit's
`accent-hover` #C65117 (4.6:1 with white) and darken to `accent-ink` on hover. `tests/unit/contrast.test.ts`
enforces the pairs and fails if any source uses a raw accent/warning/unknown hue as a text colour.

## D-027 MapLibre GL JS 6
5.24 carried a critical advisory (GHSA-jrc7-96c5-q579, `DOM.sanitize()` bypass). PORTOS does not use popups or
`setHTML`, but the release ships with 6.17 (`npm audit --omit=dev`: 0). Version 6 loads its worker as a separate
ES module, so `PortMap2D` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and calls `setWorkerUrl`;
Vite builds workers as ES modules (`worker.format: 'es'`).

## D-028 Weather hazards are an optional dataset
If `weatherHazards.json` fails to load, the catalog loads without it (`missingDatasets`), event references to
hazards are not treated as dangling, `weatherFeedLoaded` is false, route risk reads "Route risk unknown" with a
provenance warning ("unknown, not clear"), and a persistent notice explains it. ETA and exposure are unaffected.
Every other dataset remains required: a missing vessel or incident file is a load error, not a partial view.

## D-007 Port 2D basemap
Superseded by D-011 (OpenFreeMap, decided at Phase 4).

## D-029 Fixture v2.0 (V2 Phase 0; supersedes the Singapore narrative of D-006)
Seed 92026 and every v1 entity ID are kept. Random draws run in the same order; kit facts are applied as overrides
after the draws, so unrelated records are byte-stable apart from derived fields.
- **Singapore case realigned to the kit:** MV Pacific Horizon (VSL-0001) holds at 103.91E 1.18N at anchor for the
  whole base window (0.1 kn, 5-min samples, no wake). `PCL-0001` arrives and waits from 04:00Z with no berth: 34 h
  total wait, 26 h remaining at Now. The published `ANC-SIN` polygon gains a southern lobe that contains the hold;
  in-polygon sampling still uses the core polygon so the RNG sequence is unchanged. `BRH-SIN-W-1` is no longer
  scheduled for it.
- **Case events:** `ETA_REVISED` 09:00 (EVT-0001), `ANCHORAGE_ENTER` 09:15 as the formal anchorage assignment
  (EVT-0002), `INCIDENT_OPENED` 10:59 (EVT-0003), new `PORT_QUEUE_JOINED` 04:00 (EVT-0004), WX-0001 warning 06:00,
  wait 9 → 14 h at 07:30 and 14 → 26 h at 11:22, new `BERTH_ESTIMATE_UPDATED` 11:40 (berth estimated
  2026-11-10 14:00Z, `confirmed: false`), AIS at the hold 11:55. The fold keeps `queued` and `berthEstimates`;
  an estimate never creates a berth link.
- **VSL-0047 restored as the follow demo:** LNG carrier on `RTE-SIN-MNL`, fix 108.056644E 3.501864N at 11:15Z,
  13.5 kn. Flagship voyages have ETAs recomputed from kinematics (planned shifted by the same amount).
- **V2 module `sample-data/v2/`** (schemas in `schemas/v2/`, `manifest.v2Module`, `scenarioVersion: "2.0"`):
  `scenario.json` (7-day window 2026-11-05T12Z → 2026-11-12T12Z, precedence, disclosure), `flagshipTracks.json`
  (30 vessels; VSL-0047 at 15 min, others at 30 min; reconstructed history before and forecast after the base
  samples, compact tuples), `portLayouts.json` (Singapore flagship layout of 3 terminals, 10 berths and 2
  anchorages; Rotterdam and Genoa procedural; every berth `constraintsValidated: false`), `berthSchedule.json`
  (122 DCSA-style bookings with REQ/EST/PLN/ACT milestones and one deliberate berth conflict; VSL-0001 is
  estimate-only with a null berth).
- **Track merge:** the catalog keeps base samples as the observed truth and appends keyframes only outside them.
  Positions from keyframes carry track state `modelled` (label "Modelled (scenario keyframes)"), with age measured
  from the last observed sample, or none for reconstructed history. Non-flagship vessels stay unavailable or stale
  outside the 12 h base window. Consequence: a flagship vessel that was stale at Now reads as modelled forecast
  instead, which is the honest description of what the app draws.
- **Validator:** checks the realigned case, the VSL-0047 fix, the window, flagship bounds (10–30, includes 0047,
  excludes 0001), keyframe joins ≤ 30 min from base samples, no stationary keyframe with speed, Singapore layout
  minimums, booking references and DCSA classifiers, and no ACT milestone after Now.

## D-030 `spatialV2` feature flag
`src/core/flags.ts` reads `VITE_SPATIAL_V2` at build time and `?spatialV2=0|1` from the first URL (kept in
`sessionStorage`), once at startup. Default on. With it off, all scopes render through the v1 sphere scene and
v1 routes, so the release keeps a working fallback while V2 scenes are introduced.

## D-031 Canonical `/ops/*` routes, spatial registry and SpatialDirector
Supersedes the v1 route table (`/operations`, `/region/:id`, `/port/:id`, `/vessel/:id`, `/voyage/:id`,
`/incidents/:id`, `/corridors/:id`, `/weather/:id`, `/compare/:id`, `/replay/:id` with `in=` and `t=`).
- **Routes:** the scene is the path (`/ops/earth`, `/ops/region/:regionId`, `/ops/country/:countryId`,
  `/ops/city/:cityId`, `/ops/port/:portId`); the selection, panel and time are query keys (`vessel`, `voyage`,
  `incident`, `route`, `hazard`, `panel=compare|replay`, `time`, `speed`, `mode`, `view`, `layers`, `kpi`). Other keys
  (e.g. `case`) pass through. `/ops` with only a selection resolves the scene (incidents open at their port) and
  replaces itself with the canonical URL. Every v1 route is kept as a `legacy-*` redirect (`t` → `time`, `in` →
  scene path) so old links and bookmarks keep working.
- **Scope model:** `Scope` gains `country` and `city`; ports carry optional `countryId`/`cityId`. The breadcrumb is
  Earth → region → country → city → port. 2D stays limited to region and port scopes.
- **Registry:** `src/spatial/registry.ts` builds one entry per Earth, region (11), port-bearing country (48,
  `CNT-<ISO3>`, from `scripts/build_geo.py registry` → `src/spatial/data/countries.json`), flagship city (`CTY-SIN`,
  `CTY-RTM`, `CTY-GOA`) and port (100), with parent/child links, bbox, view list and provenance. Singapore is a
  city-state: `REG-SEA → CTY-SIN → PRT-SIN` with no country level. REG-MED and REG-WAF are flagged
  `illustrativeBounds`.
- **Director:** with `spatialV2` on, `SpatialDirector` owns the single frame loop and every camera flight
  (phases preparing → flying → handoff → settling → idle, or error which keeps the previous scene). A new
  navigation aborts the in-flight one, which is how Back works mid-flight. `SceneCache` (LRU 3, pinned active and
  destination) disposes evicted scenes. `InputRouter` owns pointer input (5 px drag threshold, 600 ms click limit,
  one rAF-coalesced hover hit test, priority testers). `OverlayProjectionAdapter` is the only path from the active
  camera to DOM labels. In Phase 1 every globe target shares the `earth` scene; Phase 2 adds extruded scenes.

## D-032 Extruded region / country / city scenes on a shared map-surface contract
Supersedes the Phase 1 note in D-031 that every scope is a camera goal on the globe.
- **Geometry:** `scripts/build_geo.py geo` builds `public/geo/{region,country,city}/<id>.json` (62 files, 2.1 MiB)
  from Natural Earth admin-0 (50m; 10m for countries narrower than 12° and for every city frame, so Singapore uses
  the 10m coastline). Rings are clipped to the padded frame (Sutherland–Hodgman), simplified (Douglas–Peucker, per
  level budget) and shifted across the antimeridian for REG-OCE. `public/geo/index.json` and `PROVENANCE.md` record
  dataset, SHA-256 of each source and per-file SHA-1. Downloads are cached in `.cache/` (git-ignored).
- **Projection:** `src/spatial/projection.ts`, world unit 1 km, +x east, +y up, −z north. Regions and countries use
  spherical Lambert azimuthal equal-area about the frame origin; cities use WGS84 local ENU. Both are reversible
  (round-trip < 1e-9°) and unit-tested; vessel headings add the projection's grid convergence.
- **Scene:** `src/spatial/scenes/Region3DScene.ts` (GPL-3.0-or-later, derived from the skill's
  `ZhejiangThreeMap.vue` / `mapTerrainMaterial.ts`) implements both `SpatialScene` and `MapSurface`. Land height =
  1.2 % of the frame span; hover lift = 0.6 % (≤ 2 % budget, tested); the orange contour is lit only on the selected
  feature (the scope's country in country/city scenes, a clicked country in a region). Orbit, pan (target clamped to
  the frame) and dolly; tilt 33°/38°/45° for region/country/city, north up after every framing flight. V2 palette,
  no neon, no chase light.
- **Surface contract:** `src/map/surface.ts` (`MapSurface`) is implemented by `EarthScene` (`surfaceKind: 'globe'`)
  and `Region3DScene` (`'planar'`). `MaritimeOverlay`, the marker shader (`uPlanar`), DOM labels, clustering, the
  stack picker and camera presets talk only to this contract. Presets and poses stay in globe units (centre +
  distance, R = 2); planar scenes convert distance to an equivalent altitude, so the scope stack, LOD thresholds
  and the 3D ↔ 2D camera hand-off work unchanged on every surface.
- **Scene mapping:** Earth → globe; region → `region3d:<REG>`; country → `country3d:<CNT>`; city → `city3d:<CTY>`;
  port → its city scene, else its region scene (until the port twin in Phase 5). All scenes share the globe's one
  `WebGLRenderer`, canvas and `InputRouter`; each gets its own `MaritimeOverlay` fed by the same selectors. The
  director's cache keeps up to three scenes; region and city geometry is prefetched in idle time and shaders are
  compiled with `compileAsync`.
- **Interaction:** click selects a country (region scenes) or switches region; double-click drills region →
  country (city-states → city), country → city, city → nearest port. A DOM north arrow and 1-2-5 scale bar show on
  planar scenes; REG-MED and REG-WAF show "Illustrative operational bounds · not a border" with a dashed frame.

## D-033 Earth ↔ geography handoff on one renderer (snapshot bridge)

- **Context:** spec 05 and the master plan's Phase 3 ask for the skill's `EarthChinaMap.vue` cinematic (globe
  focus → dive → cloud reveal → settle) between the globe and every extruded scene, gated by readiness, with
  cancel / Back / Escape and a ≤ 150 ms reduced-motion crossfade. The skill runs two live DOM stages (two renderers);
  D-032 keeps every scene on the globe's single `WebGLRenderer`.
- **Decision:** `src/spatial/EarthGeographyBridge.ts` (GPL-3.0-or-later, derived from `EarthChinaMap.vue`) plans each
  director transition; `src/spatial/HandoffStage.ts` holds a snapshot canvas and an atmosphere veil above the map.
  - *Down* (Earth → region → country → city): after preload the destination is put at its entry camera
    (distance × 1.4, flatter tilt, small azimuth offset), drawn once, copied into the stage canvas, and the source
    is redrawn in the same task, so no frame of the wrong scene reaches the screen. The globe flies to the region
    (focus 650–1200 ms by angular distance and zoom), dives 620 ms under a 0.92 veil, then the stage plays the
    skill's cloud reveal (opacity .06 → .24 → .78 → 1, scale .78 → 1, 520 ms) while the veil clears; planar sources
    dive geographically (620 ms) into a scale-and-fade reveal. The director then swaps scenes behind the opaque
    frame and the destination settles (440 ms) while the frame fades (160 ms).
  - *Rise* (Back / shallower / sibling): the current frame is captured, the destination jumps to the source pose
    and flies to its goal while the frame fades (420 ms).
  - *Reduced motion:* exact entry camera, 120 ms fade, no camera flight.
  - *Cancel:* new navigation, Back, or Escape (only while flying and when no selection, menu or dialog claims
    Escape) aborts the plan; the stage clears and overlays return on the restored scene. Input is disabled while
    the director is preparing or flying; a "Preparing …" chip appears after 300 ms of preload.
  - The bridge records each step's planned and measured duration (`__portos.bridge().timeline`); tests assert
    the plan against the spec budgets and treat wall-clock time only as a lower bound and a stall check.
- **Also:** city-states and child cities get a drill chip in region / country scope (`city-label-CTY-SIN`):
  Singapore is a few pixels wide at region scale and sits under port and vessel markers, so double-click could
  not reach it. DOM labels hide during the handoff (inline `visibility: visible` no longer overrides the hidden
  container). Storage-reset warnings are persistent notices.
- **Consequences:** one WebGL context, no second renderer to warm; the reveal shows a still frame of the destination
  rather than a live render for ≤ 520 ms, which is invisible at the destination's entry camera.

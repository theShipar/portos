# Decisions

Resolutions for conflicts inside the PORTOS kit and choices the kit left open. The kit in
`PORTOS_Codex_Master_Kit/` is the read-only reference; everything here overrides it where stated.

## D-001 Design authority: PORTOS spec over the skill's one-to-one look
The Three Scope Map skill mandates its neon HUD (`#E8FF4F` side walls, chase light, SVG HUD labels, China-first
scope). PORTOS mandates a restrained white/orange maritime UI over a global Earth. PORTOS wins. The skill is used as a
technique source: Earth sphere + day/night/normal/specular shader approach, atmosphere rim, starfield, batched
`LineSegments` coastlines, two-phase render handoff, GSAP camera flights. See `TECHNICAL_DEVIATIONS.md`.

## D-002 Palette source of truth: `assets/tokens.json`
*Colours superseded by D-038 (V2 palette, `src/styles/tokens.v2.json`); `src/styles/tokens.json` stays as the kit
copy for provenance.*
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
*Inspector width and replay heights superseded by D-038 (`min(400px, 34vw)`, replay 60 / 116 px).*
Header 64px; right inspector 408px (expandable to 420px, min remaining map 680px); replay rail 60px;
radius 6px inputs / 10px panels / 4px dense chips; 8px spacing unit. (Specs variously said 56px header, 344–420px
inspector, 52–64px rail, 8/12px radius.)

## D-004 Incident lifecycle
*Superseded by D-037 (V2 case lifecycle); the fixture still records these statuses and maps them to stages.*
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
*Superseded by D-036 (V2 canonical scenario clock); kept for history.*
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

## D-034 Procedural 3D ship library with LOD0–2 (no glTF assets)

- **Context:** the master plan's Phase 4 asks for 3D ships by category (container, tanker / gas, bulk, RoRo,
  tug / pilot, other) at three detail levels (LOD0 instanced, LOD1 1k–5k triangles, LOD2 10k–60k for the
  selected ship only), a tested heading → yaw contract, wakes only when underway, sway at anchor, fixed moored
  ships, and a silhouette / cardinal-heading test page. Spec 08 prefers licensed glTF models; none ship with the kit.
- **Decision:** `src/map/vessels3d/` builds every model procedurally at runtime (no binary assets, no licences).
  - *Contract* (`contract.ts`): bow −Z, up +Y, starboard +X, length 1, waterline y = 0;
    `headingToYaw(h) = wrap(−h·π/180)` (unit-tested against `Object3D` at N / E / S / W). The marker shader places
    vertices with the same basis on the globe and planar surfaces.
  - *Library* (`library.ts`, `geometry.ts`): lofted superellipse hulls (bow flare, transom, boot-top) plus
    per-type superstructure — seeded container stacks, tanker pipe rack and manifold, Moss-type LNG domes, bulk
    hatches and four cranes, RoRo enclosed hull and stern ramp, tug wheelhouse and fender band. LOD1 is 1,066–1,998
    triangles, LOD2 10,322–19,718; LOD0 is one 128-triangle glyph shared by every type. Geometry is merged,
    indexed (`mergeVertices`) and cached per model × LOD.
  - *Overlay*: LOD0 = one instanced glyph draw; LOD1 = one instanced draw per model type; LOD2 adds a separate
    batch (capacity 4) only for pinned (selected / focused) ships, so at most 7 + 1 model draws plus one wake draw.
    LOD switches use the existing px hysteresis (up 13 / 26, down 11 / 23); there is no material crossfade.
    Models and wakes are only instanced for ships inside the viewport plus a 15 % margin (re-checked at 5 Hz while
    the camera moves); glyphs stay for the whole fleet. Ship programs are compiled when an overlay is bound so the
    first LOD switch never compiles mid-flight.
  - *Scale:* ships keep a minimum screen size, grow to true length when that is larger (`aLength × uMetre`), and get
    a beam boost (LOD0 1.8, LOD1 1.35, LOD2 1.0) that fades out as true scale takes over.
  - *Motion* (`motion.ts`): state from nav status and SOG; wakes from 2 kn (0.25–1.4 ship lengths, full at 22 kn);
    anchored ships sway ±4° about their COG with a 9-minute scenario-time period, phase hashed from the vessel ID;
    moored ships hold the berth heading when known, otherwise a deterministic resting heading from the ID (until
    Phase 5 gives berth poses). No pitch or roll.
  - *QA page:* `qa/ships.html` (second Vite entry) renders every model from front, port, starboard, top and
    three-quarter views at `?lod=0|1|2`, plus four cardinal headings with wakes against a north bar.
- **Also:** the old per-type glyph geometry (`vesselGeometry.ts`) is removed, leaving no fallback or dev toggle;
  `markerGeometry.ts` keeps only ring and port glyphs. Tugs exist in the library but not in the fixture fleet.
  On deep links, `init()` no longer replaces the overlay of an extruded scene that activated while the world
  texture loaded, and an Escape that closes the inspector is marked handled so the flight-cancel handler cannot
  also fire `router.back()`.
- **Consequences:** illustrative silhouettes, not authentic vessel models, labelled as the spec 08 fallback tier on
  the QA page. Playwright runs at most 4 workers, and the wall-clock handoff gate runs as a dependent
  `chromium-timing` project after the rest of the suite, because SwiftShader renders on the CPU and parallel
  browsers starve its frame loop.

## D-035 Port twin as a Region3DScene variant, DCSA berth timeline, berth Gantt

- **Context:** spec 07 asks for a Singapore port twin with berths, cranes, yard, anchorage and a berth schedule that
  keeps actual, planned and forecast apart, plus procedural twins for Genoa and Rotterdam and a 3D ↔ 2D switch that
  keeps time and selection.
- **Decision:**
  - *Scene:* `port3d` is a `Region3DScene` variant (`opts.port`) on the port's city GeoDoc, not a separate scene
    class. Land is extruded to a true 3 m, the ocean sits at −1.5 m, ships ride at 0.2 m and are depth-tested
    against land (`shipsDepthTested`, so the overlay skips its depth-reset mesh), the camera tilts to 0.95 rad, and
    the default frame covers the terminals within 6 km plus the waiting-anchorage vertices (margin 25 % of the
    extent, clamped to 600–1,500 m). The scene exposes `geoToWorld`, `addLayer` / `removeLayer` (a
    `PlanarSceneLayer` with optional `pick` and `update`), `landHeightM` and `setBottomInset`.
  - *Twin layer* (`src/spatial/scenes/portTwin/`): quay decks, apron, berth strips coloured by status, ship-to-shore
    cranes, and yard blocks filled 7 rows × 18 bays at a typical 2.5 tiers (max 5) up to the terminal's declared
    `yardContainers`. Berths are picked through invisible proxy boxes. Cranes are static.
  - *Which ports:* any port with a `portLayouts` entry opens in 3D by default (`defaultViewMode(scope, hasTwin)` with
    `twinPredicate(catalog)`); ports without one keep 2D. Singapore is the authored twin; Genoa and Rotterdam use
    the procedural layout from the fixture.
  - *Berth timeline engine* (`src/engines/berthTimeline.ts`, pure): DCSA-style milestones count only once recorded
    (`recordedAtUtc ≤ t`), and actuals only once they happened, so replay never leaks later plans. Bars are actual
    (solid), planned (hatched) and forecast (dashed), never merged; requested arrivals are marks. Conflicts are
    computed per basis: two planned windows overlapping within the larger buffer (`planned`), or an estimate running
    into the next window (`forecast`). Every conflict carries `validated: false` and the UI says "not yet validated",
    because draft, tide, services and berth policy are not modelled.
  - *Moored poses:* a ship alongside a twin berth is drawn parallel to the quay, offset seaward by half its beam
    (`mooredPosesAt`), on both the 3D twin and the 2D map.
  - *UI:* `BerthGantt` (24 / 48 / 72 h windows, now line, conflict count) and `BerthCard` (3D only). Berth focus
    lives in `view.berthId` and syncs the 3D strips and labels, the card, the 2D map card and the Gantt row. The
    Gantt reports its height as `view.bottomInsetPx` and the port camera shifts by it. While an inspector is open
    on desktop the Gantt folds to its header (overlap count still visible); the user can reopen it, and it reopens
    when the inspector closes.
  - *Fixture:* each layout terminal declares `yardContainers` (Singapore West 2,400, Central 2,000, East 1,600). The
    validator rejects a terminal without one; the box count is declared, never inferred from capacity.
- **Consequences:** coarse city coastline under true-scale terminals means the twin is illustrative only (caption
  "Illustrative terminal configuration · Simulated · not for navigation"). The incident investigation view at a
  twin port now opens in 3D, so the 06-investigation and 04-singapore-port baselines were re-recorded. The
  journey test's 3D click now targets the ship alongside East Berth 1, since VSL-0001's anchorage lies outside the
  twin's default frame.

## D-036 Canonical scenario clock 1–100×, world snapshot, follow camera

- **Context:** specs 09 and 10 ask for one scenario clock driving every scene and panel at 1, 5, 10, 25, 50 and
  100× (1 real second at 100× = 100 scenario seconds), loop ranges, step controls, a pure world snapshot, follow
  modes for a selected ship, and an honest picture of reporting gaps. D-008 pinned "Now" at the anchor with replay
  speeds 1/10/60/600× over 00:00–12:00Z only.
- **Decision:**
  - *Clock* (`src/core/scenarioClock.ts`, pure; `src/stores/clock.ts`): `ClockState {mode playing|paused|scrubbing,
    scenarioNowUTC, playbackRate, minUTC, maxUTC, rangeStartUTC, rangeEndUTC, loop}`. The window is the V2 scenario
    window (2026-11-05T12:00Z → 2026-11-12T12:00Z); the anchor 2026-11-09T12:00Z stays "Now (simulated)". `phase`
    is `history` before the anchor, `now` at it and `simulation` after it (labelled "Simulated ahead"). One rAF
    loop; a frame delta is capped at 1 s so a resumed tab never jumps; the clock pauses when the tab is hidden or
    the WebGL context is lost. Reactive time commits at 10 Hz in whole seconds; scenes read `frameTimeMs()`.
  - *Ranges and stepping:* 6 h / 24 h / 72 h / 7 d (default 24 h), centred on whole hours around the current time
    and shifted to stay inside the window; playback pauses on the last instant of the range unless loop is on (off
    by default), and wraps to the range start when it is. Step ±5 min, Shift ±1 h; step and scrub pause.
  - *No skipped events:* each commit records `lastSpan {fromMs, toMs}`; `eventsBetween(c, from, to)` returns the
    events in `(from, to]`, so the rail's "events passed this run" count sees every event however large the step.
  - *World snapshot* (`src/engines/world.ts`, pure): `deriveWorldSnapshot(c, t)` folds vessels, incidents (the
    existing event fold), berth occupancy per layout port, active and upcoming weather, event count and global KPIs
    at one instant. It reads only the catalog and `t`, so forward and backward seeks give identical output.
  - *Follow camera* (`src/core/follow.ts`; `followStep` on each surface): modes chase, above, orbit and course-up.
    The camera eases toward the ship with τ = 90 ms (95 % in ≈ 270 ms) and on entry zooms in to 14 ship lengths.
    Chase and course-up also steer azimuth to sit behind the course (with grid convergence); orbit keeps the user's
    azimuth. The followed ship's position and heading are computed every frame from `frameTimeMs()` and written
    into its instance slots only (`MaritimeOverlay.setLivePose`), so the ship and camera move smoothly between
    10 Hz commits. A drag that moves the view centre by more than 8 % of the camera distance is a pan: follow holds
    (`view.followHold = 'panned'`) and the "Resume following" chip appears. A rotate does not release. A ship
    outside the scene's bounds shows "Vessel has left this map area". Selecting another vessel retargets follow;
    clearing the selection, changing scope or resetting the view stops it.
  - *Track honesty* (`trackRunsUntil`): the trail is split into runs; gaps between reports longer than 30 minutes
    become an `unverified` run drawn as a long grey dash between the last and next known positions, and the vessel
    is held at its last report (stale), never interpolated across the gap. Modelled keyframes stay dotted.
  - *Fixture:* VSL-0059 has a declared reporting outage 05:15–08:15Z on 2026-11-09
    (`scenario.positionGapDemo`); the validator requires it to be bounded by samples, longer than 30 minutes and
    empty, and exempts it from the generic gap check.
- **Consequences:** vessels without V2 keyframes become stale after the anchor while the 30 flagship vessels keep
  their modelled forecast, which is the intended contrast. Workflow actions remain available only at "Now"
  (`phase === 'now'`). `?time=` deep links work anywhere in the window.

## D-037 V2 case lifecycle, decision branches, value engines

- **Context:** spec 12 asks for pure value engines (ETA variance like with like, congestion, JIT, exposure,
  route and weather feasibility, berth conflicts, service chain) attached to the physical object the user selected,
  and a case lifecycle `detected → untriaged → investigating → optionProposed → approvedForSimulation → monitoring →
  resolved / closed`, with local decisions kept as branches and storage moved from `portos:workflow:v1` to `v2`.
  D-004's six fixture statuses did not distinguish a proposed option from an approved one and had no closed state.
- **Decision:**
  - *Stages* (`src/core/caseStage.ts`): fixture `IncidentStatus` stays as recorded vocabulary and maps through
    `STAGE_FROM_FIXTURE` (open → untriaged, acknowledged and investigating → investigating, mitigation_planned →
    optionProposed, monitoring, resolved). `detected` is the instant between detection and opening; it is never a
    local state. Folded and snapshot incidents carry `CaseStage`; closed stages are resolved and closed.
  - *Transitions* (`incidentMachine.ts`): triage (untriaged → investigating), monitor (approved → monitoring),
    back to investigating, resolve (any active stage, with a reason and evidence), close (resolved → closed, manager),
    reopen (resolved or closed → investigating). Propose and approve are not buttons: they happen only through
    decision branches.
  - *Escalation:* `incident.escalate` raises severity one or more steps (never lowers), needs a reason and is
    audited; the snapshot shows the local severity with an "escalated" flag and priority scoring uses it.
  - *Decision branches* (`DecisionBranch`): proposing an option forks a branch at the current simulation time with
    its inputs and a recorded outcome (baseline vs branch ETA delta and exposure, confidence, formula), creates a
    follow-up task and moves the case to optionProposed. A manager approves one branch per voyage for simulation
    (any previously approved branch returns to proposed) and the case moves to approvedForSimulation; discarding
    the last live branch steps the case back. Nothing is sent anywhere: branches are local, simulated decisions.
  - *Storage:* `portos:workflow:v2` (`WORKFLOW_VERSION = 2`). On first load a valid V1 state is migrated
    (statuses through `STAGE_FROM_FIXTURE`, decisions → branches with outcome null, IDs, tasks, drafts and audit
    kept), saved as V2 and V1 is removed, with the notice "Saved demo decisions were upgraded to the V2 case
    lifecycle." Invalid or unparseable V1 data falls back to the clean demo with the reset notice.
  - *Value engines* (all pure, in `src/engines`):
    - `etaVariance.portCallVariance`: per milestone (pilot boarding, berth arrival, berth departure), actual or
      estimate against planned (else requested) of the same milestone; ±0.5 h is on time; a missing baseline is
      "no baseline", never compared with another milestone.
    - `jit.jitOpportunity`: forecast arrival alongside (berth estimate, or pilot-boarding estimate + a 1 h pilotage
      allowance stated as an assumption) earlier than the planned or requested berth by ≥ 2 h is an opportunity.
      The options are "coordinate slot timing" and "assess a voyage speed change, subject to approval"; it is never
      a speed order and no fuel or emissions saving is claimed. No slot gives "Unconfirmed slot".
    - `serviceChain`: pilot boarding, towage, mooring, berth arrival, cargo operations, departure from the DCSA
      milestones; a planned time that passed without an actual is "Missed plan"; towage and mooring are "Not in
      dataset".
    - `routeFeasibility.compareRoutes`: base corridor and curated alternatives with geodesic distance, sailing time
      at 16 kn, detour and hazard exposure along each candidate's own traversal (reusing `computeRouteHazards`,
      tested geometrically on every candidate); severe exposure is "avoid", any exposure "caution", no weather feed
      "unknown". Labelled as a planning illustration, not approved routing.
    - Existing engines kept: congestion, exposure `max(0, h) × rate / 24`, berth conflicts ("not yet validated").
  - *Port-call value* (`selectors/portCall.ts`, shown as a card in the vessel inspector): queue since and anchorage
    since from the recorded events (the fold now keeps `anchoredSince`), estimated berth with "unconfirmed",
    waiting total / elapsed / remaining, destination ETA and exposure from the shared impact model, variance, JIT
    and service chain, each with its source IDs and "Simulated · as of" time.
  - *JIT demo fixture:* the earliest scheduled Singapore call arriving 12–36 h after the anchor (PCL-0046,
    VSL-0245, BKG-0040) gets requested and planned berth times 9 h after its pilot-boarding estimate
    (`scenario.jitDemo`); fixed offsets, no extra random draws, validator check.
- **Consequences:** the Phase 7 gate reads straight from the selector: VSL-0001 / PCL-0001 in queue since 04:00,
  at anchorage since 09:15, estimated berth 2026-11-10 14:00 UTC unconfirmed, 34 h in queue with 26 h remaining,
  destination ETA +18 h and $32,000/day × 18/24 = $24,000, sources PCL-0001, EVT-0004, EVT-0002, EVT-0008.

## D-038 V2 palette, map-first layout and premium UI components

- **Context:** spec 13 replaces the V1 palette (D-002) with a calmer light-chrome / deep-ocean system, asks for the
  map to keep at least 80% of the workspace at 1440×900 with the inspector closed, and lists the components that
  carry the experience: incident ribbon (≤ 3 cases), map KPI rail (≤ 4 values), on-map entity peek, vessel and port
  inspectors, layer palette, replay timeline (54–66 px collapsed, 90–130 px expanded) and decision compare. V1 had a
  148 px replay rail, a five-case queue, six KPI tiles, an always-open berth schedule and a port queue shelf that
  covered the bottom-left HUD.
- **Decision:**
  - *Palette:* `src/styles/tokens.v2.json` holds the spec 13 values verbatim (surface, text, line, map, accent, state
    and data roles plus layout numbers). `tokens.css` and `tokens.ts` read from it; `tokens.json` remains the kit copy
    and is not edited. `--color-focus`, `--color-text-muted` and the observed / planned / uncertain data roles are
    now defined. Every text role passes WCAG AA on its surface; route and data roles pass 3:1 on the ocean
    (`contrast.test.ts`). The critical chip fill is `#FDF1F0` so critical text clears AA.
  - *Layout:* inspector `min(400px, 34vw)` from one helper (`styles/layout.ts`) used by both map surfaces; replay
    60 px collapsed / 116 px expanded (`--replay-collapsed-h`, `--replay-expanded-h`).
  - *Components:*
    - `IncidentRibbon` (was `IncidentQueue`) shows the top 3 cases, heading "N actionable cases · scope", the empty
      chip "No actionable cases in this scope", and "Show all" opens the filterable tray.
    - `MapKpiRail` (was `KpiRow`) shows 4 values with context ("33 tracked · 50 in scope", "of N voyages",
      "modelled"); the rest sit behind an icon-only "More metrics". The port rail has 4 cells: queue, arrivals 24 h,
      median wait, congestion.
    - `EntityPeek` replaces the plain vessel tooltip. It is a two-line popover anchored to the hovered vessel (name
      and one or two deltas) with Follow and Inspect, stays open 260 ms so the pointer can reach it, and flips at
      the viewport edges.
    - `VesselInspector` overview leads with a schematic ship silhouette (same categories as the 3D library), route
      progress (projected position, else fixture progress, else "not yet departed"), at most 3 priorities (case,
      ETA / exposure, port call, route weather) with actions, the latest 3 events with a jump-to-time action, and
      collapsed specifications.
    - `PortInspector` (was `BerthCard`) adds the port's anchored and queue counts and a one-berth 24 h mini-Gantt
      with actual, planned and forecast on separate lanes (the ETA-versus-actual visual) plus requested marks and
      overlaps.
    - `LayerPalette` (was `LayerMenu`) has five group toggles (Traffic, Ports, Weather, Risk, Plans) that are
      disabled with a reason when nothing in the group applies at the scope, plus a details panel with per-layer
      switches, a tiny legend and "Simulated · as of" time.
    - `ReplayTimeline` (was `ReplayRail`):
      - Collapsed (60 px): play, "Simulation ×N", event steps, a mini track with markers and bookmarks, the last
        event, phase, UTC and Now.
      - Expanded (116 px): adds 5-minute steps, the event histogram, ticks, ranges, loop, follow, note and the
        compare-with-Now table.
      - Bookmarks are the user's local notes and decision actions placed at the simulation time they were taken.
    - `DecisionCompare` sits at the top of the comparison panel: the original plan and up to two feasible proposals
      side by side, delta bars against the baseline, shared assumptions and the fixed footnote "Simulated outcomes,
      not confirmed."
  - *Port scope density:*
    - The queue shelf shows a compact header and the top 3 rows, and reserves map inset only when its tray is open.
    - The berth schedule starts folded with a "N berths · M occupied" summary and unfolds when a berth is focused.
    - The planar HUD (caption, north arrow, scale) sits above the schedule's reported inset, so nothing covers it.
- **Consequences:**
  - Measured map share at 1440×900 with the inspector closed: Earth 85.7%, region 84.9%, Singapore port 83.5%
    (union of opaque chrome, 8 px grid, `layout.spec.ts`).
  - E2E tests that read ranges, loop or compare first expand the timeline; port tests unfold the schedule with
    `openGantt`.
  - All Phase 8 rules are pure selectors (`kpiRail`, `queue`, `vesselBrief`, `decisionCompare`,
    `berthMiniGantt`, `railBookmarks`, `groupState`), so templates only render.


## D-039 Phase 9 acceptance: flagship journey, spec 19 evidence, failed-scene fallback

- **Context:**
  - Spec 19 asks for browser evidence for M01–M20 in `docs/PORTOS_V2_QA_EVIDENCE.md`, with unverified outcomes
    marked `NOT RUN`.
  - The phase gate is "all acceptance tests pass or are explicitly marked blockers, and no unverified live claims".
  - Earlier specs covered most rows. M03 (orbit / tilt / wheel), M07 (moving-ship click), M15 (Forward), M19
    (cross-scope search) and parts of M11, M16, M17 and M20 had no automated browser test.
  - A scene whose geometry failed to load left the URL on the new scope while the old surface kept its framing,
    with no message.
- **Decision:**
  - *Flagship journey:* `tests/e2e/flagship.spec.ts` runs the whole spec 00 journey in one session and writes the
    evidence frames.
  - *Acceptance rows:* `tests/e2e/acceptance.spec.ts` holds one test per missing row. These read real scene state
    through the e2e-only adapter (`orbit()`, `vesselScreen()`, `director()`, `bridge()`) rather than guessing from
    pixels.
    - M03 drags in small steps until the camera has turned 40–90°. Damping on SwiftShader under four workers lands
      a single drag short.
    - M03 checks georeferencing two ways: the 3D marker stays within 4 px of its WGS84 projection, and the DOM
      label stays within 12 px of its starting offset (frame-level placement under load measured up to 6.6 px).
  - *Results vocabulary:* `PASS` means the expected result was asserted by a passing browser test. `PARTIAL` and
    `NOT RUN` are used where only part of a requirement, or none of it, is automated: visual sizes, input latency,
    Firefox and Safari, and a click during active playback. No manual pass is claimed.
  - *Failed scene load:*
    - The director already keeps the previous surface active when `preload` throws.
    - The view now frames the requested scope on that surface (the V1 globe-region behaviour) and shows an alert,
      "… could not be loaded. Showing the last stable view.", with Retry and Back.
    - Retry calls `applyScope` again. Both the scene and the GeoDoc loader drop rejected promises, so the download
      really retries.
  - *Replay compare:* stage values use `STAGE_LABEL`.
  - *Perf:* Metal runs at 10 and 30 round trips replace the V1 figures. SwiftShader stays the V1 run, labelled as
    such.
  - *Skill checks:* `verify_template_integrity.py` passes (31 files). `check_three_map_project.py --strict` exits 1
    with the expected China-template blockers (D-001). Both outputs are kept in
    `docs/qa/v2-phase9/skill-checks.txt`.
- **Consequences:**
  - The full Playwright suite runs the flagship journey and the eight acceptance tests.
  - All M01–M20 rows are PASS. The QA evidence doc lists what each row does not cover.
  - The scope switch on Metal is about 2.8 s because of the cinematic handoff. This is documented in
    `PERF_REPORT.md` and is not a regression in frame time.

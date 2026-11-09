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

## D-007 Port 2D basemap
Superseded by D-011 (OpenFreeMap, decided at Phase 4).

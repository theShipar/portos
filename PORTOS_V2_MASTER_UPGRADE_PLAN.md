# PORTOS V2 — Master Spatial Maritime Upgrade Plan

> Consolidated version of all V2 instructions. For engineering implementation prefer the separate numbered files and `CODEX_UPDATE_PROMPT.md`.

**Existing project upgrade.** First inspect the actual PORTOS repo before editing. Preserve earlier 55-file kit contracts and original Three Scope Map licensing.

---


---

<!-- 00_START_HERE.md -->

# PORTOS V2 — Spatial Maritime Operations Upgrade
**Status:** engineering and product-design implementation contract, v2.0, 2026-11-11. **Target:** upgrade the EXISTING PORTOS Vue application shown in the provided screenshots. **Not** a greenfield recreation and **not** a static design mockup.

## One-sentence outcome
From a live-looking but sparse globe/map viewer to a navigable **maritime digital twin** where a user can move from **Earth → independent 3D region → rotatable 3D country/coastal city → detailed port → track or follow an individual 3D vessel → assess delay/port-call evidence → compare action options → replay 1×–100×**.

## Why this package exists
Current screenshot deficiencies: regional routes often remain on the same spherical globe; maps feel dark/empty; generic contextual panels read like data dumps; vessels are visually indistinct; selection does not lead to meaningful local port intelligence; unresolved cases, delays, and at-risk counts are visually ambiguous; simulated speed/time doesn't express spatial causality. The provided Energy Campus reference shows a true renderer handoff into a separate extruded geographic scene, then interactive deeper geographic drilldown. We must reproduce **the interaction grammar and rendering quality**, not its unrelated energy business panels, brand, country-specific data, or red sci-fi dashboard aesthetic.

## Non-negotiables
1. Preserve the existing PORTOS project/router/data where it works; audit before changing. Keep deep links, existing business entities, the current synthetic-data labeling and original renderer credit.
2. Real runtime 3D and real coordinates (not screenshots, CSS tilt, 2D GeoJSON pretending to be extrusion). Earth and independent extruded maps are separate interactive camera environments.
3. Every map level has a business purpose. Never drill into inland locations with no operational maritime activity merely for appearance.
4. 3D ships have correct type silhouettes, rotations, waterline orientation, selection, LOD and deterministic temporal behavior.
5. **Simulated** remains visibly labeled. 100× speeds up a deterministic scenario clock, not reality or AIS freshness. Do not label simulated data as live AIS.
6. Readable information through visual hierarchy, layers, sparklines, synchronized mini-timelines and direct highlighting. The map occupies ≥80% of usable desktop workspace when overlays are collapsed.
7. All KPIs derive from linked fixture records at a shared timestamp; measurements have units, timestamps, confidence, and lineage.
8. Operational actions are local proposed/draft decisions, not navigational orders; never imply a route or chart is certified for navigation.
9. Maintain original three-scope-map copyright/SPDX/GPL attribution; inspect license compatibility before proprietary distribution.
10. Every phase ends with a browser-verified screenshot/video and test outcome. Build passing does not prove animation or UX is working.

## What to read first
1. `AGENTS_UPDATE.md` (precedence, prohibitions, integration rules).
2. `specs/01_CURRENT_AUDIT_AND_REDESIGN_DELTA.md` and `specs/02_PRODUCT_SCOPE_VALUE_AND_KPIS.md`, `specs/21_EXISTING_FIXTURE_RECONCILIATION.md`.
3. `specs/03_NAVIGATION_JOURNEYS_AND_SCENE_STATES.md` and `specs/04_THREE_SCOPE_SKILL_INTEGRATION.md`.
4. Relevant component specs in numerical order; consult `specs/18_PHASED_BUILD_PLAN.md`, `specs/19_BROWSER_QA_ACCEPTANCE.md` during each phase.
5. `CODEX_UPDATE_PROMPT.md` for the exact working instruction to paste in Codex.

## Files and precedence
This is a V2 **ADD-ON** to the prior 55-file `PORTOS_Codex_Master_Kit`. Do not discard its useful JSON dataset, validations, domain logic or tests. This update supersedes prior visual/navigation and playback descriptions **where they conflict**, but existing schemas and data integrity remain the source of truth until a documented migration is completed. **The existing codebase is always inspected before modification.**

## What is included / what is not
Includes precise specifications and example configuration contracts for spatial states, 3D assets, camera/motion, port intelligence, rendering, data and test plans. Does NOT include a completed WebGL application, licensed AIS feeds, exact nautical charts, verified real-time berth schedules, or verified 3D port geometry. The requirements are intentionally achievable with Codex + browser QA but require implementation and iteration.

## Required first functioning vertical slice
Global Earth → click Southeast Asia → real handoff into 3D extruded regional scene → rotate/pan → click Singapore → 3D city-state/coastal operations scene → inspect Singapore port → see berth/anchorage queues and the anchored VSL-0001 incident → follow *underway* VSL-0047 at 1×, 10×, 100× → open timeline and compare berth/ETA coordination options → save decision → replay history. If any link breaks, don't work on optional features.

## Completion = evidence, not screenshots alone
Run the original skill's integrity checks where its authoritative files are used, application typecheck/build, data validator, unit calculations, interaction E2E, 3D frame capture at different levels, and 100× scrubbing test. Maintain `docs/PORTOS_V2_CHANGELOG.md` and `docs/PORTOS_V2_QA_EVIDENCE.md` in the target project.


---

<!-- AGENTS_UPDATE.md -->

# AGENTS V2 ADDENDUM — read after existing `AGENTS.md`

## This is an upgrade, not a replacement
1. Inspect the existing repository: `package.json`, app/router/stores, Three.js globe, MapLibre integration, original three-scope-map copies, vessel layers, selection, time model, selectors, fixture generator, tests and license notices. Produce an audit with **actual file paths**; do not presume paths from this spec exist.
2. Do NOT wholesale replace working PORTOS components with the China template. The original skill is China-specific and carries no ready-made international maritime 3D regional system; extend it with new adapters and data/scene components. Copy/reuse complete approved rendering elements where feasible instead of describing a similar look.
3. Keep the original app usable at every stage. Introduce a feature flag `spatialV2` for safe progressive rollout; preserve deep links or migrate them with compatibility redirects.
4. Never delete the existing 55-file instruction kit or change CSV/JSON fixture IDs without a migration. Keep stable identities: vessel, voyage, route, port, berth, incident, country, region, scene and timestamp.
5. A **single scene controller**, **single selection store**, **single canonical simulation clock**, and **single entity/data-selector layer** own state. No component may start its own fake speed timer, offset its own vessel position, or hardcode KPI values.
6. Navigation state is orthogonal to selected entity: `sceneKind: earth | region3d | country3d | city3d | port3d | port2d`, `selectionKind: none | vessel | port | berth | incident | route | hazard` and `timeMode: liveSim | paused | replay`. Avoid routing all selections to a new full-page screen.
7. Use sea-route waypoint geometry for ship motion, not straight lines through land. Planned vs observed vs simulated paths must look different and be labeled. Clearly disclose uncertainty and stale/missing data.
8. All maritime decisions are proposals. Never command a vessel, change real berth reservations, or send real notices from synthetic data. For pilot, tug, bunkering and berth availability, only assert values provided by scenario records and label them simulated.
9. Preserve `LICENSE`, `NOTICE`, `CITATION.cff`, attribution comments, SPDX where the third-party map code is reused. Audit third-party texture/GeoJSON/model rights. GPL-3.0-or-later has reciprocal obligations for distributed derivatives; legal review needed before proprietary commercialization.
10. Keep density high but visual clutter low. Prefer single-selection emphasis, concise 3–5 KPI strip, explicit timeline and meaningfully layered map; avoid red HUD frame, giant charts and endless generic right rail.
11. Use browser rendering and interaction evidence: Earth first paint, handoff frames, region rotation, city drilldown, vessel follow, 3D→2D return, timeline seek at 100×, decision replay. No acceptance from TypeScript build alone.
12. Use an implementation/verification log after each phase: changed paths, tests run, actual results, screenshots, blockers, fallback behavior, remaining work.

## Precedence
Safety/licensing > actual verified data > V2 source-of-truth contracts (`specs/15` and `specs/16`) > V2 journey and integration > existing 55-file instructions > decorative example screenshots. If V2 conflicts with existing code, document migration before editing. Do not silently invent missing data.

## Exact quality gates
- Globe selection does not merely zoom the sphere for a region; renders a **separate perspective-extruded geometry scene** with orbitable camera and coherent ship overlays.
- Country and city can drill deeper with real/georeferenced approved geometry. Unsupported scope gives meaningful port/corridor navigation rather than fake map content.
- 100× replay advances scene clock, vessel positions, port statuses, incident states and KPI aggregates consistently; pause freezes all; scrubbing reconstructs prior state; view mode/selection remain stable.
- Vessel models and labels remain legible at 1440×900 and are geographically accurate within the synthetic dataset's declared resolution.
- Three visual pathways use the same normalized data: click vessel marker, search for vessel ID, select from incident or port queue.
- More map, less text. Keyboard and reduced-motion alternatives are functional.


---

<!-- specs/01_CURRENT_AUDIT_AND_REDESIGN_DELTA.md -->

# 01 — Existing application audit and redesign delta

## Objective
Adapt the currently running PORTOS project seen at routes such as `/region/REG-WAF`, `/region/REG-MED`, `/vessel/VSL-0363?in=region:REG-MED`, `/corridors/RTE-HAM-SIN`, `/weather/WX-0001`, and `/vessel/VSL-0107?...&view=2d`. Do not assume this exact route set remains unchanged; identify actual router definitions first.

## What the screenshots already prove
- An Earth-like globe and marine basemap exists, showing outlines, routes, some markers and regional presets.
- Breadcrumb navigation, region names, viewport KPIs, exception queue, global search, simulated timestamp, 3D/2D toggle, detail drawers and a vessel time/risk view exist.
- Vessel, weather, corridor entities and incident IDs are represented in the UI.
- Existing data may display scoped counts such as `Tracked 33/50`, `Delayed 12/22`; define numerator/denominator in UI rather than showing unexplained fractions.
- The map lacks the source reference's independent extruded country/region stage; the data often feels thin because selection changes geography but does not produce a distinct actionable maritime scene.
- Blank/empty exception queue shown alongside delay or at-risk totals is potentially correct if no case meets eligibility, but must be explained (not simply `0 unresolved`).

## Mandatory repository audit (deliver `docs/PORTOS_V2_AUDIT.md`)
| Subsystem | Investigate | Expected artifact |
|---|---|---|
| Globe | renderer ownership, camera, texture imports, country outlines | actual code paths, which pieces originate from skill |
| Region navigation | router/store, camera fly-to, current data registry | navigation state diagram + missing scene mode |
| 2D map | MapLibre or other mapping engine, tile attribution | source/licensing + switching adapter |
| 3D vessels | mesh classes, 2D markers, coordinate conversion, animation | LOD gap list and geometry correction |
| Clock/replay | date source, animation loops, speed state, historical samples | single-clock migration plan |
| Data | JSON structure, ID links, position history, provenance | canonical selectors/data audit |
| Operations | incidence/case/work orders/ETA calculations | missing causality, inaccurate/ambiguous copy |
| UI | overlay density, typography, gaps, responsive states | inventory of components to reuse/refine/retire |
| Performance | draw calls, FPS, loading, large GeoJSON, shader timing | baseline measurements and target budgets |

## Gap-to-upgrade decisions
**Preserve:** app branding, route lookup, existing fixture structure, filters if functional, ability to inspect existing vessels, explicit synthetic mode, select/follow concept, simple white shell.
**Refactor:** giant floating left queue (make collapsible bottom-left incident tray), disconnected KPI fractions, excessive text in inspectors, deep links that change page instead of map scene, camera focus when drawer opens, muted/hard-to-read line system.
**Introduce:** independent region3d/country3d/city3d/port3d, glass/metal-like dark terrain + orange focus outline, map-mode breadcrumbs, true animated ship silhouettes, port scene model, 100× deterministic replay, objective risk and port-call timeline, contextual mini-visuals.

## Existing assets and data must be honored
Create an adapter over current vessel/port/incident JSON rather than rewrite records wholesale. All new components consume normalized view models. Do not use placeholder locations if the record has valid coordinates. If a city or port polygon is unavailable, use a licensed geospatial source or clearly illustrative mapped facility layout, not a fabricated authentic port.

## Prioritized product debt checks
1. Disconnected KPIs: each metric has scope and denominator.
2. `0 unresolved cases` while delayed voyages >0: investigate case eligibility; display distinct `delayed voyages` vs `actionable exceptions` with explanation.
3. Region click remains a sphere: repair with a scene handoff, not a bigger sphere.
4. Camera/effects often obscure selection: adjust framing for drawers and accessibility.
5. Vessel names and IMO synthetic identity: keep synthetic indicators in detail views; avoid fake IMO numbers that look real.
6. Real-time labels: never use `Live AIS` until actual licensed integration exists.

## Acceptance
Deliver before/after view and code audit; no major data loss; original routes remain functional; if any original ability breaks, log as blocker. Source screenshots are **visual reference**, not proof the current implementation code has been read.


---

<!-- specs/02_PRODUCT_SCOPE_VALUE_AND_KPIS.md -->

# 02 — Product value, customer workflows, and KPI definitions

## Buyer and jobs-to-be-done
Primary: Fleet operations manager / voyage manager at a 20–300-vessel shipping operator. Secondary: Port-call coordinator; marine superintendent; terminal operations observer. PORTOS is **exception management and port-call decision support**, not vessel command/control, navigation certification, or generic tracking.

**Jobs:** (1) detect unexpected ETA/port-call deviations early, (2) see affected voyages geographically, (3) coordinate port-call windows, (4) evaluate delays/weather exposure and feasible actions, (5) reconstruct incidents for after-action review.

## Why each map level exists
| Level | Owner question | Decisions / actions | Visual evidence |
|---|---|---|---|
| Earth | Which parts of the fleet need my attention? | Select region, prioritize critical exceptions | Route traffic, clusters, severe incidents |
| 3D region | Which shipping corridor, port cluster, country is creating risk? | Choose coastal country/strait/port; prioritize area | Port density, incident clusters, vessel movement trails |
| 3D country / coastal city | Which local services/arrivals contribute to the delay? | Select port and review available windows | Harbor access, berth bottlenecks, affected arrivals |
| Port 3D | What physically occupies capacity? | Inspect berths, queues, service constraints | Visual berth timeline, occupied berths, anchorages |
| Vessel | Is this voyage likely to be early/late, and why? | Investigate evidence, create proposed response | Actual/current vs planned ETA, port-call timeline |
| Replay | How did this situation evolve? | Validate change / handoff | Timestamped movements and event changes |

## KPI rules — all require scope & time
**Global:** managed/tracked vessels, voyages with meaningful ETA shift, actionable incidents by severity, aggregate estimated exposure *only for mutually exclusive incidents*, median data age. Show 3–5 only by default.
**Region:** vessels in bounded area, arrivals within 24/48h, vessels with stale positions, impacted routes/corridors, actionable incidents.
**Coastal city/port:** vessels at anchor, scheduled arrivals (next 24h), median wait for completed calls, projected berth occupancy from known schedules, berth conflicts, service readiness.
**Vessel:** current/report age, speed (kn), course (°), ETA shift (hours), confidence band, route progress (%), waiting window (hours), exposure estimate with assumption summary.
**Incident:** affected voyages, impact duration, estimated daily cost, response status, time since event, confidence/evidence freshness.

## Concrete formulas / denominator discipline
- `ETA shift h = forecastETAUTC − plannedETAUTC` (hours); label positive as late, negative as early; comparisons use same port-call milestone.
- `Tracked / total`: tracked = records with valid position as of time and max accepted age; total = eligible in scope. Show `33 tracked · 50 in scope` instead of `33/50` without label.
- `Delay exposure USD = max(0, actionableDelayHours) × dailyCostUSD/24` for simple case; costs that depend on vessel charter, port, berth, fuel or liability must be modeled separately and not stacked without checking overlap.
- `Berth occupancy % = reserved berth-hours / available berth-hours` over chosen interval; do not use anchored vessels as occupancy proxy.
- `Median port wait` from completed port calls only; `projected wait` separate.
- `Open incident` means user action/lifecycle case; a delayed voyage doesn't automatically become a case. Show an action to create case when rule triggers.
- `Affected voyages` unique by voyage ID, not one count per overlapping hazard polygon.
- `JIT opportunity` = ETA earlier than berth planned/requested time by a configurable threshold; this suggests coordination, not a speed command.
- `Route progress` from traveled vs remaining route arc length, excluding route legs already completed; geographic interpolation needs a route history, not linear city-to-city headings.

## Premium high-value feature set
1. Port Call Pulse: berth/anchorage traffic and appointment uncertainty visualized around the actual location.
2. Just-in-Time Arrival Lab: compare arrival scheduling scenarios with fuel/cost **assumptions**, never promise savings.
3. Impact Radius: select a hazard, see linked voyages and port calls, with evidence and uncertainty.
4. Voyage Story: replay vessel track + event ribbon to explain delays without reading a wall of text.
5. Port Comparator: compare two feasible ports on waiting hours, availability, costs, route detour and cargo restrictions (only if supplied).
6. Readiness Map: pilotage, towage, bunkering, mooring dependencies by actual port-call event/status.
7. Handoff: downloadable/demo-local incident summary showing evidence, timestamps, decisions and who reviewed.

## Definition of product value
At the end of the flagship flow, user must have completed a measurable task: find a delay, explain evidence, identify impact, compare at least two legitimate options, save a proposed decision and verify the changed simulated forecast. The system should communicate this visually in ≤3 main actions after selection. Data labels are not prose substitutes for visual state.

## Standard alignment
Model estimated, requested, planned and actual berth timestamps as distinct values; see DCSA Port Call Standard 2.0 (`https://reference.dcsa.org/content/standards/releases/port-call/v2/pc-v2-purpose-and-scope`). Do not confuse berth ETA with arrival at pilot boarding place. Use IMO/IHO standards as conceptual references for provenance and port-call terminology, not a claim of chart certification.


---

<!-- specs/03_NAVIGATION_JOURNEYS_AND_SCENE_STATES.md -->

# 03 — Scene hierarchy, navigation state machine and use cases

## Exact desired user journey
**Earth → independent 3D region → rotatable, extruded country/city → 3D port → selected vessel (in-map) → 1×–100× follow/replay → operational decision.** The reference shows a hard spatial scene shift: globe fades/pushes out, prebuilt extruded map fades/lifts in with same geographic region centered. Reproduce that grammar, not generic camera zoom-only.

## Distinguish route, scene and selection
- Route represents shareable state: `/ops/earth`, `/ops/region/:regionId`, `/ops/country/:countryId`, `/ops/city/:cityId`, `/ops/port/:portId`, optional `?vessel=:id&time=:utc&speed=10&mode=3d`.
- Scene owns projection/camera/world: Earth spherical, regional and country/city planar 3D extrusion, port 3D local ENU coordinates; 2D chart is a separate precise mode.
- Selection adds inspector/highlight without always replacing scene. Clicking vessel in region should keep region camera except on explicit **Follow**.
- Breadcrumb includes actual scope and selected context; preserve selection on 3D↔2D switch.

## Required scene state machine
```ts
type SceneKind = 'earth'|'region3d'|'country3d'|'city3d'|'port3d'|'port2d';
type FlightPhase = 'idle'|'preparing'|'flying'|'handoff'|'settling'|'error';
type Selection = { type:'vessel'|'port'|'berth'|'incident'|'route'|'hazard'; id:string } | null;
type SpatialContext = { kind:SceneKind; regionId?:string; countryId?:string; cityId?:string; portId?:string; cameraPreset?:string };
```
- `SELECT_GEOGRAPHY(id)` resolves a valid next-level registry target, fetches geometry/textures, warms destination, then performs handoff. Disable repeat clicks while flying; Esc/back cancels safely or returns to previous stable state.
- `SELECT_ENTITY(...)` focuses/highlights; popover shows one-line action and 2–3 operational KPIs. `OPEN_INSPECTOR` draws full contextual panel.
- `FOLLOW_VESSEL(id)` takes camera ownership from OrbitControls but allows smooth exit, pauses user orbit input unless explicit toggle.
- `SET_TIME(utc)` reconstructs all entity states; scene selection is preserved.
- `SWITCH_2D_3D` swaps representation while preserving center, scale, selected object and timestamp.

## Deep-link/reload contract
Browser back restores previous scene/selection/camera and history; direct URL to a vessel resolves its region/viewport without loading an unrelated globe first. Unknown region/port IDs show a recoverable location-missing message and Earth fallback, not a blank canvas.

## Geographic registry behavior
Not every selectable item has the same hierarchy. A city-state like Singapore may be `region3d -> country3d/city3d -> port3d`; Genoa can use `region3d -> Italy country3d -> Genoa city3d -> port3d`. Oceans have corridor and strait nodes: `earth -> Indian Ocean operational region -> Malacca Strait -> Singapore Port`. Avoid country-only drilldown for ships on open ocean.

## Interaction examples
**A. Executive triage**: click orange disruption hotspot on Earth -> 3D Southeast Asia -> see 9 at-risk voyages highlighted -> choose Singapore -> port wait timeline -> anchored vessel -> berth coordination and waiting-cost options.
**B. Marine superintendent**: select specific ship in search -> globe auto-centers -> route is highlighted end-to-end -> click Follow -> rotate close inspection -> scrub historical route -> open anomaly incident.
**C. Port coordinator**: click Rotterdam city -> port3d -> berth C-4 -> see ETA–berth mismatch and pilotage dependencies -> compare arrival windows -> record proposal.
**D. Rewind**: select last 72h -> speed 100× -> ships glide on trajectories, chronological incident pins appear, KPI values update -> select a specific timestamp -> export summary.

## Camera state persistence
Store camera presets per scene and user-adjusted views only when scope is stable; save quaternion, position, target and projection parameters; on back restore cached stable camera. Model bounds govern initial framing. A pan/zoom after selection should not reset when inspector opens.

## Acceptance
At least 5 scene changes without blank frame, click on real region geometry, hover previews, country and city rotation, port and vessel selection; back/forward and direct URL work; no phantom city locations over water; drag never triggers click.


---

<!-- specs/04_THREE_SCOPE_SKILL_INTEGRATION.md -->

# 04 — Exact Three Scope Map skill integration strategy

## Source and trust contract
Original source: `https://github.com/songsummer920-dazzle/three-scope-map-skill`. Read its current README, `three-scope-map/SKILL.md`, `references/earth-view.md`, `references/map-drilldown.md`, `references/one-to-one-template.md`, `references/performance-pipeline.md`, and actual template source. Do not treat screenshots or prompts as the implementation. This skill is **China-first**, not a ready-made all-country/city/port maritime engine; it owns a validated Globe→China 3D destination and China region drilldowns.

## Map source components and reuse
| Reference asset | Reuse / adapt | Restriction |
|---|---|---|
| `EarthView.vue` | globe textures, spherical GeoJSON projection, grid intersections, atmosphere, lighting, raycast input, intro gate | retain original source attribution; international interactions require a new geographic registry and country hit meshes |
| `EarthChinaMap.vue` | dual renderer phase orchestration (warm destination scene, static destination frame, handoff) | genericize as `EarthGeographyBridge` without blindly copying China IDs |
| `ChinaMap.vue` | thin async scene adapter | abstract to `Region3DScene.vue` and `Country3DScene.vue`, do not hardcode China |
| `ZhejiangThreeMap.vue` | extruded shape, terrain material, side walls, contours, chase glow, hovered lift, ring, camera controls | data/projection rules must be reworked for geographic region and coastal scenes |
| `mapTheme.ts` | semantic derivation of theme colors | PORTOS has independent UI tokens and map tokens; neutral space + ocean must remain readable; don't blindly recolor everything |
| `mapDataAdapter.ts` | prefetch/cache/in-flight request dedup by scope | extend registry to regions/countries/coastal cities/ports and license-aware data provenance |
| geographic datasets/textures | world geometry, neutral source world textures when licensed | replace China country-specific relief for international regions; do not stretch China texture across Singapore, Italy, etc |

## Hard technical split
Do not try to render a full 3D country map by radically distorting the spherical globe mesh. Keep a `WebGLRenderer` globe scene or compositing model separate from an **extruded region scene** with its own camera, projection, local scene origin, labels, overlays, lighting and raycasting. The bridge owns one active animation loop. During handoff destination prebuilds one static opaque frame, Earth remains active until fade complete, then destination starts RAF. Implement one scene lifecycle manager owning context creation/disposal and texture reuse; context caps are browser-dependent.

## Projection adapter
- Globe: source latitude/longitude in WGS84 decimal degrees; map to sphere radius `R` with consistent axis orientation; project great-circle paths to elevated arcs only if those arcs mean a path overlay rather than vessel physical location (ships stay on sea surface).
- Regional 3D: GeoJSON Polygon/MultiPolygon -> consistent planar projected geometry; use local azimuthal equidistant / suitable conformal projection for regional bounds; for large/polar/multi-continent regions, split into geographic tiles and avoid one distortion-heavy canvas projection.
- Country/city: project to local metric coordinate system (e.g., suitable UTM for compact areas, local tangent ENU for ports). Keep features labeled with original WGS84 point geometry; provide reversible `lonLatToWorld` and `worldToLonLat` adapters.
- Port: georeference scene origin to lat/lon, use local east-north-up in meters, scale mesh assets consistently.
- Handle antimeridian wrapping, MultiPolygon islands, interior holes, border artifacts, coastline/water masks, and polygon holes.

## Data registry example
```ts
interface SpatialRegistryEntry {
 id:string;
 type:'maritimeRegion'|'country'|'coastalCity'|'port';
 label:string;
 parentId?:string;
 bbox:[number,number,number,number]; // minLon,minLat,maxLon,maxLat
 center:{lon:number;lat:number};
 geometryPath?:string; // licensed GeoJSON
 maritimePortIds:string[];
 cameraPresetId:string;
 childIds:string[];
 availableViews:('extruded3d'|'port3d'|'port2d')[];
 provenance:{source:string; license:string; vintage:string};
}
```
Render valid clicking targets only. Support open-sea corridors via geometry overlays or route segment hitboxes, not country polygons.

## Source fidelity guidance
The reference's hallmark is: distinct surface and side depth, textured relief, fine interior boundaries, animated outer contour, slow orbitable camera, selective hover lift, ambient dynamic light, and seamless Earth→planar transition. Reuse actual source implementation/parameter hierarchy; adapt geographic materials with strict bounds, correctly scoped textures, and color tokens. Do NOT add generic red glowing borders to every landmass or clone decorative HUD components.

## Validation instructions
1. Run original `scripts/verify_template_integrity.py` before source copy/adaptation.
2. Run original `scripts/check_three_map_project.py <target> --strict` if structure still matches the template; where it doesn't, document legitimate incompatible assumptions and test feature-equivalent guarantees rather than misleadingly declaring full check passed.
3. Verify existing globe and new region stage separately in real browser; capture render, click, handoff, first interaction.
4. Check global external geographic and texture assets are approved and attributed.
5. Check no extra copy of renderer/RAF running unbounded after leaving a scene.

## Failure policy
If a region dataset cannot be legally sourced or is missing, load a **clearly identified fallback geographic overview** with accurate outline and disabled deep drilldown, not an invented city polygon. If WebGL is genuinely unavailable, explain concrete issue; do not substitute screenshot and claim 3D success.


---

<!-- specs/05_EARTH_TO_REGION_CINEMATIC_HANDOFF.md -->

# 05 — Earth → independent extruded region cinematic handoff

## The signature experience
At start show a substantial Earth with atmosphere, subtle detailed relief and current vessel/route activity. Click Southeast Asia (from country/region pick, search or a pin) -> smoothly orient Earth -> zoom/fly toward target -> dissolve through atmospheric/cloud depth -> reveal a **SEPARATE 3D extruded region** already rendered, not a flat WebGL canvas of the same Earth and not a CSS image. After settling, mouse can **orbit the new map 360° around its center**, tilt within constraints, pan, hover regions and drill to Singapore.

## Rendering pipeline / ownership
`SpatialDirector` orchestrates scene `earth`, `region3d`, `country3d`, `city3d`, `port3d`, `port2d` transitions; `SceneCache` warms next meshes and textures on demand; `InputRouter` sends gestures only to active scene; `OverlayProjectionAdapter` positions HTML labels over selected 3D points; one active RAF, no competing renderer continuously animating.

## Transition phases (default timings, adjustable by performance)
1. **Intent, 0–90ms:** pointer press enters selected shape state; show target label and mini-summary. Debounce double requests; emit telemetry.
2. **Prepare, before visible flight:** async load/cached geometry, texture, labels, selected vessel set; build destination scene in hidden frame budget; do shader compile/upload; render one complete static destination frame. Show unobtrusive progress if >300ms; do not begin flight while destination isn't minimally ready.
3. **Globe focus, ~650–1,200ms:** interpolate Earth camera heading/orientation to selected bounds, slerp quaternion using easing, keep route/selected hotspot subtly emphasized. Stop pointer orbit during active camera flight.
4. **Dive / atmosphere, ~450–850ms:** forward move, subtle atmospheric glow/scan transition consistent with source reference; screen-space crossfade mask to hide topological mismatch between sphere and projected flat scene; do not animate giant geometry rebuild in view.
5. **Handoff, ~350–650ms:** reveal destination pre-rendered opaque frame under Earth; first scene is faded out; source renderer loop stops; destination loop starts only after handoff.
6. **Settle, ~300–550ms:** reveal outer contour and maritime overlays, enable orbit/hover controls, show region breadcrumb and 3–4 contextual KPIs.

Never assert the transition completes in a fixed duration under slow devices: gate by readiness with cancellation, and avoid blank frames. Motion target ~1.5–2.8s from click after readiness, shorter for repeat navigation and `prefers-reduced-motion`.

## Camera contract
- Use camera paths defined in normalized scene world units, not hardcoded global XYZ that breaks other regions.
- End framing by projected `bbox` and visible map viewport, accommodating right inspector if open; target ~75% screen width coverage with padding; no over-zoom and clipping.
- Earth motion: interpolate globe orientation around target lon/lat; avoid roll flips and crossing antimeridian the long way.
- Destination camera: FOV ~28–40°, azimuth default ~−25 to 30° relative to vertical geographic axes, tilt 40–65° from horizontal for embossed coast, configurable per scene.
- Pan constraint: keep map's focus within 1.2× projected bounds; zoom min/max scene-relative, prevent sea surface clipping; allow compass reset and saved view.
- Avoid auto-spins at region level. Users can explicitly rotate; idle motion only gentle and disable on selection.

## Transitions into city, port, and back
`region3d -> country3d -> city3d` uses a subtler *geographic dive*: highlight clicked polygon, lift/brighten it, zoom towards its centroid, obscure old scene via ocean/terrain fade, reveal child scene's preloaded detailed geometry, then settle and enable controls. Preserve selected maritime layer settings and time. On parent back reverse context from a stored camera preset; not necessarily exact reverse flight, but spatial continuity and no pop.

## Hover/click definition
- Hover: instantaneous region outline increase and soft fill, label + `N ports · M active voyages`; no geographic navigation.
- Click: only after pointer-up with <5px movement; begin transition; brief activated state then disable selection until scene stable.
- Small islands/ports: implement larger raycast hit footprint (pick proxy), without visually enlarging geography.
- Keyboard: arrow/list focus, Enter activates, Escape cancels inspector/back. Focus indicator must not depend solely on hue.

## Camera follow interaction during scene flight
If a vessel is selected, preserve semantic selection and highlight it in destination via WGS84 projection. After region transition, camera should initially frame region, not aggressively follow ship. A distinct `Follow` command activates follow camera.

## Error and latency states
- Missing GeoJSON: mark destination unavailable, remain on current scene, show retry and source issue.
- WebGL context loss: pause clock, restore renderer/resources when possible; don't create infinite render retries.
- User hits browser Back during flight: cancel in-flight task via token/AbortController, restore last stable scene and breadcrumb.
- Reduced motion: crossfade ≤150ms, no zoom spin, same data and interactivity.

## Acceptance storyboard
Capture frames (a) Earth calm, (b) target hover, (c) camera halfway, (d) cloud/scene blend, (e) extruded region fully visible with sidewalls, (f) region rotated 40° and labels still anchored, (g) return Earth. Verify the underlying renderer is actually changing scene and click targets remain spatially correct.


---

<!-- specs/06_EXTRUDED_REGION_COUNTRY_CITY_SCENES.md -->

# 06 — Exact independent regional, country and city 3D map behavior

## Why this exists
This is the feature missing in current screenshots. A globe enlarged over a country is not equivalent to the reference. Build region, country and city as **full-screen orthographic/perspective map stages with real extrusion depth**, terrain textures, sidewalls, coastline shape, hover lift, boundary levels and mouse orbit, using original skill's geometries/material discipline.

## Geometry and visual specification
- Input GeoJSON polygons with holes, MultiPolygons and disconnected islands; preserve scale/true shape of coastlines; fix ring winding; triangulate robustly; project to locally reasonable map units.
- Top surface: matte graphite/blue-black detailed terrain, subtle normal and roughness, diffuse limited contrast. Emboss relief can be normal/displacement only if legally sourced and geographically correct; otherwise make visual relief illustrative and label it as such.
- Extrude sidewalls down a visual thickness scaled to bbox (e.g., 2–4% of region width for a stylized profile), with dark-to-lighter transition. Side thickness is visualization metaphor, not actual terrain elevation.
- Outer coast contour gets a narrow refined orange/neutral light, animated **only on selected or highlighted** region; internal boundaries use softer strokes. No whole map perpetually burning orange.
- Ring/compass guides: subtle optional GIS reference ring; avoid pointless dense HUD. Add accurate north arrow, legend, scale bar recomputed from projected geometry.
- Ocean base is an independent dark plane/shader below landmass, with understated gradient/grain; ship markers align to water-plane surface rather than land extrusion base.
- Country/region subdivision labels appear based on zoom level, declutter and importance. Coast cities/ports prioritized over inland provinces for maritime use.
- Geo-feature hover lift ≤1–2% of map width and only when coherent shape under pointer; sidewall and top must move together. Selection should not alter a polygon's long-term geospatial coordinate transforms.

## Maritime overlays (spatially anchored)
Every 3D scene can draw ports, coast cities, anchorage polygons, chokepoints, vessels and route trajectories using normalized WGS84 inputs. Cache projection per scene. Assign symbol LOD by zoom and density; show clusters only when necessary. Port city label includes a compressed traffic indicator and actionable exceptions, not a full paragraph.

## Interaction controls
- Drag empty ocean to orbit camera (primary button); Shift+drag or right-drag to pan; wheel to dolly; double-click on country/city feature to drill down; single-click to select with transient preview. Make gestures discoverable with a concise first-use hint, not a permanent instruction panel.
- `3D/2D` toggle accessible at city and port level. On switching preserve selected object, center, zoom equivalent, time, filtering and route. 2D uses licensed map tiles (e.g. MapLibre) for precise locations; 3D uses geographic extrusion.
- `Fit region`, `North`, `Reset tilt`, `Save view` are separate actions; do not reset camera whenever panel changes.
- When city has multiple ports, show concise port pins or port clusters; clicking city polygon provides a city operations overlay, then one click opens selected port.
- Empty sea areas can be tapped to inspect shipping traffic/sea zones; avoid arbitrary country-only hit logic.

## Examples
**Southeast Asia:** polygon group of relevant countries/islands; visualizes Malacca Strait and Singapore, route corridors, live simulation points. Clicking Singapore region pin enters city-state/coastal view; port pin navigates to Port of Singapore 3D.
**Mediterranean:** regional scene with Genoa, Marseille, Barcelona, Piraeus and Algeciras port pins; click Italy -> country3d; click Genoa -> city3d/port.
**West Africa:** coastal-country borders and ports, with only supported cities active. No pointless inland drilldown.

## Reprojection and selection continuity
- `worldToLonLat()` and `lonLatToScene()` must be unit tested at reference points; input order is `(lon,lat)`, not `(lat,lon)`.
- At each level recompute projection origin, geo bounds, distance scale, ship positions, route overlays and label occlusion. Do not reuse entire country's map texture for tiny city geometry.
- Selected vessel has same id across Earth, region, city, port and 2D; only its visual representation changes.
- Extruded country ring should be visually continuous around islands and coastline but may be broken where geometry has MultiPolygon gaps; do not create phantom land bridges.

## Do-not-ship conditions
A flat GeoJSON fill, CSS transform, image plane, generic map tile in 3D frame, or endless sphere zoom presented as region 3D is a blocker. A correct country silhouette with wrong globe rotation, mislabeled port, markers floating above land, ship routed across desert, flickering sidewalls, and polluted label overlays are also blockers.

## Quality acceptance
Document screenshots from 4 azimuths and 2 elevations for each flagship region/city; verify bounds and labels; compare overall shape/profile with original source reference; test hovering islands, long coastlines and mixed polygon holes; verify 2D/3D switching returns same focus within reasonable pixel and geospatial tolerance.


---

<!-- specs/07_3D_PORT_TERMINAL_AND_BERTH_DIGITAL_TWIN.md -->

# 07 — Port 3D scene: terminals, berths, anchorage, cranes, services

## Goal
Create a useful **interactive port twin** that feels like a physical environment. The selected port must reveal operational constraints, vessel queues, berth assignments, expected arrivals and service events. Model visual fidelity only as far as underlying geometry/data can support. Use a georeferenced site canvas, not randomly scattered 3D buildings.

## Coordinate layers
1. `PortOrigin` from port WGS84 reference. Local ENU meters (east x, north z, height y) for equipment and vessel poses; declare origin/projection metadata.
2. `HarborBathymetryOrWater` dark water with subtle non-navigational current/wake cues. Never invent bathymetric depths and describe them as authoritative.
3. `TerminalFootprints` per terminal and container yard geometry (approved footprint or clearly synthetic), roads, storage grids and critical facilities.
4. `Berths` anchored to quay edge with orientation, physical length, availability/status timeline; berth symbols clickable with hit proxies.
5. `Equipment` cranes, gantries, reefer stacks, tug/supply vessels, pilot positions. Animations only correspond to simulated service records.
6. `Traffic` vessel meshes (3 quality tiers), anchored vessel icons or detailed hulls, speed/wake/heading and planned approach trails.
7. `OpsHeatmaps` waiting zones, queue order, conflicts, congestion forecast, service readiness, severe weather overlays.

## Port scene defaults
- At port view, prioritize roughly 1–4km around active berth/anchorage, with mini-map for large harbors. Provide orbit and top-down view; optional walk-through is not needed for V2.
- 3D ocean remains primary; land and quays are matte low-poly realistic. Orange used for selected berth, vessel or alert; health green and warning amber reserved for semantic status.
- Cranes are low-poly but recognizable: tower/gantry, outreach boom, rails, spreader. Use shared geometry/material, instancing for repeating cranes/containers. For a detailed selected crane, animate within allowed physical travel envelope and don't imply lifting cargo unless event says underway.
- Containers scale 20ft/40ft equivalents only where known; stacks are procedurally generated with declared scenario counts, not silently inferred from TEU capacity.
- Vessels alongside quay aligned to berth direction, along the quay; anchorages contain anchored ships pointed to consistent heading/current with no wake. Ships must not overlap berth geometry and cannot use ocean-level height from country-extrusion scale.

## Interactive entities and what they return
| Click | Immediate visual state | Contextual info | Action |
|---|---|---|---|
| Berth | dock edge highlighted; projected occupancy band | length, depth if reliable, status, current/next vessel, planned/actual window | inspect conflicts, propose slot update |
| Terminal | yard polygon and relevant cranes highlighted | throughput trend, forecast moves, dwell, available services | inspect terminal traffic |
| Anchorage zone | subtle zone outline and waiting vessels emphasized | waiting count, median completed wait, predicted queue range | inspect queue order |
| Vessel | hull selected, camera smooth frame | identity, port-call times, reason for waiting, berth | follow, view ETA, create case |
| Weather/service risk | spatial affected zone | evidence, validity period, affected port calls | assess options |

## Timeline geometry / port-call event language
Implement berth service visualization with separate `estimated`, `requested`, `planned`, `actual` times (DCSA Port Call convention). These distinctions are essential: a berth shown as "occupied" requires an actual or active reservation state; a projected conflict is not confirmed occupancy. Draw current occupancy solid, scheduled reservations hatched/dashed, uncertain predictions translucent. Time should be UTC internally.

## Berth-slot conflict modeling
For each berth at timestamp T, display availability and next reservations over an operator-selected interval (e.g. 24/48/72h). Conflict if planned booking intervals overlap (consider preparation/turnaround buffer and vessel fit/compatibility). Never assert berth feasibility from length alone; also requires draft, depth/underkeel, cargo, tide restrictions, services and policy—if unknown, label `not yet validated`.

## Port layout data strategy
- Real distribution: obtain licensed port facility geospatial footprints or operator-provided CAD/GIS. Model provenance per layer.
- Portfolio prototype: build **one carefully designed fictionalized Singapore-area demo harbor** with plausible geometry and explicit "Illustrative terminal configuration" caption. Place it near grounded Singapore coordinates but don't assert proprietary berth topology is authentic.
- Additional ports use lightweight procedural simplified scenes from JSON; no misleading named-real-world exact quay shapes.

## Performance
Use GLB with meshopt/Draco compression if rights allow; one representative detailed vessel in selected view, low-poly repeated hulls for others; instanced containers and cranes, frustum/occlusion culling; no hundreds of particle wakes. GPU monitor passes on average desktop; degrade shadows, SSAO, waves first. Cap labels and heavy postprocessing by view.

## Acceptance
At least two terminals, 6+ berths, 2 anchorages, 15+ visually represented port vessels (synthetic), a set of timed port calls, visible berth conflict and queue scenario. Click a berth updates map, inspector and timeline consistently. Speed 100× changes port call states/occupancy when events occur, but not when merely zooming. Check vessel positions not on land, no fake official navigational accuracy.


---

<!-- specs/08_VESSEL_MODELING_MATERIALS_AND_LOD.md -->

# 08 — 3D vessel library, shape fidelity, material and LOD

## Objective
Correct the low-effort ship representation: every visible vessel must have a recognizable, coherent 3D silhouette with correct scale, draft/waterline, heading and interaction. Vessel is not a 2D triangle with a random animated glow.

## Supported types
- **Container:** elongated hull, raised aft accommodation, container bay grids and stacks, bridge, exhaust, aft wake when underway.
- **Tanker:** wide hull, flat tank deck, piping/manifolds, bridge superstructure, meaningful low-profile deck layout.
- **Bulk carrier:** large cargo hold hatch grid, hatches, crane booms where geared, elevated bridge aft.
- **RoRo:** high-sided continuous enclosed superstructure and stern ramp, no fake container stacks.
- **Tug / pilot:** compact high-maneuverability hull, wheelhouse and towing/wake behavior.
- **Other:** use neutral simplified hull, never mislabel type-specific features.

## Asset approach
Preferred: licensed hand-made `.glb` models with consistent origin/orientation, sanitized PBR materials and shared texture atlases. Fallback: procedural Three.js vessel primitives designed to **recognizably represent each type**, not dozens of rectangles; maintain asset quality check screenshot grid. No downloading random commercial models without license.

## Model coordinate contract
- One canonical coordinate system for imported ship: forward = `-Z` (or a documented alternative, consistent across assets), up = +Y, port/starboard consistent. Convert degrees true heading from north to Three.js yaw once with a unit-tested helper.
- Origin at vessel center near calm waterline; length/beam/draft meters scale to scene metric units and port relative size. Cargo stack positions may be randomized only deterministically from an asset seed and within vessel geometry constraints.
- On globe use geographic surface tangent orientation, with bow pointing along true course; on extruded 3D map use local ENU heading; at ports align hull to berth angle when moored.
- Wake attaches aft of stern, only when speed through water > threshold, length/intensity proportional with speed and scale; at anchor or alongside, wake is absent.

## Three quality tiers
| Tier | Context | Rendering implementation | Selection behavior |
|---|---|---|---|
| LOD0 | Global Earth, >150km from camera | instanced oriented glyphs (ship-form icon or small model with ~100–500 triangles), clusters if needed | raycast proxy → highlight and fly-to |
| LOD1 | Regional / city | low-poly recognizable hull, bridge and type-specific profile (~1k–5k tris), restrained nav lighting | hover outline, selected scale/emission slight |
| LOD2 | Port / vessel inspection | detailed PBR GLB (~10k–60k triangles per *selected* ship, tunable budget), full dimensions and deck details | turntable/orbit/follow, event-linked animation |

Avoid having 500 detailed GLBs actively render at once. Implement LOD transitions around distance thresholds with hysteresis and short material crossfade; do not flicker when camera hovers near threshold. When speed/time move quickly keep geometry static and update transforms only.

## Materials and lighting
Hull uses physically-based steel with roughness; ship paint color from vessel type/operator scenario, not all neon orange. Container stacks subdued varied colors; bridge windows matte/translucent dark; safety/nav lights small and visible mainly in local scenes. Environment illumination neutral; sea reflections restrained; shadows only within port and selected-vessel views. Orange appears as thin selection ring/outline and route/attention, not painted hull surfaces.

## State animations
- Underway: position interpolation + very subtle pitch/roll from a bounded sea state **only if configured**; no dramatic bobbing.
- At anchor: gentle constrained sway around swing circle when scenario includes anchor status; position not sliding along route.
- Moored: boat held fixed to berth pose; optional subtle fender/water vertical movement, no propeller wake.
- Starting/stopping: interpolate speed over plausible interval based on events; no teleport except a labeled snapshot/seek operation.
- Selected: focus easing 250–400ms, hull edge accent, wake/emphasis adjusts; selection effects obey reduced motion.

## Geometry tests
Render a grid of all six types with front, port, starboard, top views. Test scale lengths 70–400m, beam ratios, cabin orientation, camera heading: 0° north, 90° east, 180° south, 270° west in Earth and port stages. Test pick proxy, bounding boxes, labels and wake. Ensure no geometry intersects ocean or floats at wrong scale after scene transitions.

## Ship identity and metadata
Inspect vessel with: name (synthetic), type, flag (if stored), ID, dimensions, speed/COG, last report age, route, current status, port-call milestone, ETA shift, environmental exposure and data trust. Don't use real IMO IDs without a licensed/verified feed; synthetic identity must be marked `demo identifier`.


---

<!-- specs/09_VESSEL_TRACKING_FOLLOW_AND_VOYAGE_PATHS.md -->

# 09 — Track, select, follow, inspect and compare vessels

## Target behavior
User can click any visible vessel, search by name/demo ID, select from port queue, hazard/incident list or route corridor, and obtain the same correct vessel. The map focuses on its location at the current unified clock time, draws its origin→current→destination journey, and offers deliberate **Follow** mode with vessel-centric camera. Every shown motion must derive from a timed position series or explicitly labeled simulated prediction.

## Required vessel tracking modes
1. `Browse`: all visible vessels summarized with spatially accurate moving markers; dynamic clusters at global scale.
2. `Selected`: one hull highlighted, route path and destination/ETA markers appear; minimal card shows status, speed, heading and ETA shift.
3. `Follow`: camera tracks selected ship with damping and configurable offset; selected 3D ship loads appropriate LOD and keeps orientation; user can orbit camera around target while following; exit returns to saved geographic camera.
4. `Voyage overview`: camera frames origin, current position, waypoints, destination. `Fit voyage` works in globe and 2D; geographic discontinuities require separated segments.
5. `Compare`: optionally select a second vessel/related voyage and compare ETA, speed, risk and proximity using data table + dual color path, without conflating overlapping route geometry.
6. `History`: actual/simulated historical point trail, event markers and deterministic cursor; distinguish recorded positions from modeled path between samples.

## Position and route contract
- WGS84 `(lat, lon)` in persisted data with explicit types; normalize to internal geometry order `(lon, lat)` at projection boundary.
- `PositionSample`: `vesselId`, UTC `timestamp`, `lat`, `lon`, `speedKnots`, `courseDeg`, `headingDeg?`, `navStatus`, `quality`, `sourceKind`.
- Route: ordered navigable sea waypoints with `seq`, geo coordinates, speed constraints, optional route legs/flags, declared estimated distances and provenance. Ship positions interpolate between timestamped samples (short segment geodesic or local projection); planned path and observed track are different arrays.
- If gap between observations >configured max (e.g., 2h for scenario), display dashed `position unverified` segments, increased error radius, and do **not** smoothly imply exact continuous historical motion.
- Cross dateline/polar handling; use shortest longitude wrap; smooth heading wrap 359°→1° by angular interpolation.
- For real AIS future integration, latency/coverage/privacy/permission matter. The prototype currently has deterministic synthetic tracks; no fabricated direct AIS provider claim.

## Camera follow details
- On entry `follow = true`, calculate an offset based on ship length and scene scale, damp position target at ~200–350ms response without jitter; option `Chase`, `Above`, `Orbit`, `Course-up`. In port, allow `Overhead` and `Bridge side`; do not simulate actual bridge-camera visual unless model exists.
- `Follow` persists during zoom and timeline playback. Manually panning far disables follow with a small `Resume following` chip. Click another vessel updates target smoothly, retaining time and filters.
- If following ship leaves region bounds, offer `Follow to adjacent region` and transition scene intentionally, or keep regional camera and show edge indicator. Never silently move region camera across continents.
- `Fit Voyage` uses spatial bounding arc and route extent without zooming so far that 3D vessel becomes subpixel. Provide explicit route overview mode.

## Route visual hierarchy
- Observed track: thin solid/cyan or neutral line, time gradient optional.
- Planned voyage: broken gray/blue-white path with waypoint dots; predicted continuation: dashed or translucently glowing orange if at risk.
- Selected path: higher contrast with clear start/end labels, localized pulses only at active progress point.
- Corridor/hazard: colored overlay for actual incident impact, not decoration. No giant neon fly lines implying real airborne movement.
- Current vessel heading arrow/ship bow is authoritative display of orientation.

## Info density and inspector
At map marker: vessel name + `+18h ETA` + `risk: high`, not full descriptive paragraph. Expanded inspector uses (a) 3D ship preview/identity, (b) horizontal route progress with start and destination, (c) ETA milestone visual, (d) evidence/provenance, (e) actions. Technical details like dimensions/draft go in `Specifications` accordion.

## Data edge cases
- Stale vessel (>threshold): marker muted and ring indicating data age; still selectable with last-known timestamp; do not extrapolate indefinitely.
- No voyage assigned: can view last known position and specs, but hide destination/ETA and route forecasting; display `No active voyage assigned` rather than `0 hours delay`.
- At anchor/moored: speed near zero, no wake; recorded port-call status and anchored queue association shown.
- Conflicting position reports: apply quality priority, detect jump speed outlier, exclude invalid segment, surface data-quality badge.
- Off-chart vessel: 2D map can pan to it; hover/selection unchanged by CRS transformation.

## Acceptance
Select same vessel from three entry points. At 1×, 10×, 100× the route progress advances consistently; pause freezes the hull and timeline; 3D↔2D preserves selected ship; follow camera avoids jitter on turns and antimeridian; start and destination displayed as stored waypoints/port IDs. No ship ever crosses land on a route designed to avoid it.


---

<!-- specs/10_CANONICAL_CLOCK_1X_100X_AND_REPLAY.md -->

# 10 — Unified deterministic simulation clock, 1×–100× time acceleration and replay

## Purpose
User wants to watch the fleet **move** and accelerate from 1× to 100×, follow a vessel and reconstruct voyages. This is the highest-value interactive showcase after 3D drilldown. It must **not** create separate fake animations divorced from ETA, berth queues and incident status.

## UX control surface
Bottom timeline collapsed height ~54–66px in playback mode; expanded 90–130px shows event histogram and selected voyage milestones. Controls: `Play/Pause`, `Step ±5m`, speed segmented dropdown `1× / 5× / 10× / 25× / 50× / 100×`, `Now (simulation)`, UTC timestamp, loop range selection `6h / 24h / 72h / 7d`, scrub track, event bookmarks and `Follow selected vessel` toggle. Speed dropdown displays `Simulation ×100` explicitly.

## Clock model (single source of truth)
```ts
type ClockState = {
 mode: 'playing'|'paused'|'scrubbing';
 scenarioNowUTC: number;      // epoch ms, determines ALL data snapshots
 playbackRate: 1|5|10|25|50|100;
 realLastFrameMs: number;     // monotonic animation timestamp, never persisted
 minUTC: number; maxUTC: number;
};
// Every RAF frame uses clamped real elapsed time, and derives scenario time:
// scenarioNowUTC += deltaRealMs * playbackRate;
```
- Use `performance.now()` only for elapsed frame time in browser; persisted time is UTC epoch. Cap pathological background-tab deltas (e.g., on focus restore) and explicitly decide whether to catch up or keep paused, avoiding a 48-hour jump when tab resumes.
- At 100×, 1 real second represents 100 scenario seconds. Never set ship speed to 100 physical knots or mutate actual vessel `speedKnots`; use clock factor solely to choose position/time.
- `deriveWorldSnapshot(t)` is pure deterministic function returning vessel positions/headings, voyage progress/ETA, port calls, berth occupancy, incidents, weather validity, displayed KPIs and event history at **same t**. Cache time buckets for large datasets; use interpolation for continuous position, exact timestamp boundaries for discrete events.
- Display `Simulated data · time acceleration` and the active UTC timestamp wherever playback is accessible. No `Live AIS` for synthetic scenario.

## Replay input datasets
- `positions[]` timestamped snapshots or planned route/kinematic records; enough samples to reconstruct movement, not just two points per voyage.
- `events[]` discrete changes (incident opened, AIS stale, ETA revision, berth requested, berth planned, pilot arrived, actual berthing, departed, etc.).
- `weatherHazards[]` with `validFrom`, `validTo`, severity and polygon; `portCalls[]` with timestamp type and berth link.
- `decisions[]` are timeline annotations; original baseline must remain reproducible. Use scenario branches or override separate from history, not destructive mutation.

## Seek and time travel behavior
- On scrub start: pause simulation, show timestamp preview, produce debounced renders; on release choose exact t and render full dependent snapshot. Keyboard arrows step 5m and Shift+arrows step 1h.
- At 100× with many short port events, position frames can visually skip time but events must not be lost. Accumulate events between previous and next scenario time, index by timestamp; show event flash/event trail on timeline without blocking RAF.
- If selecting a prior time, show incident/case status **as of that time**, not latest status. When returning to Now (demo), restore known scenario snapshot; avoid jumping to wall-clock date if fixture baseline is historical.
- `Follow` camera should remain smooth even at accelerated time, using interpolation lookahead and clamping; when vessel moves too fast across many kilometers per rendered frame, animate between derived positions but don't falsify timeline.
- At end range, explicit `Pause at end` default; optional replay loop toggle (off by default). Never silently wrap a voyage while showing later timestamps.

## Replay highlights
Design colored ticks for weather advisory, ETA revision, port queue change, incident acknowledged, berth reassignment and arrival. Clicking tick jumps to event time and selects relevant object in same scene. Hover event popover is concise: `07:45 UTC · ETA revised +3h · Confidence medium`.

## Performance contract
- RAF renders scene at ~60fps where available, but data/selector recomputation can be throttled to 5–15Hz and per-vessel transforms every render; never skip event edges due to throttle.
- Use time-indexed position arrays and binary search for t interval; cache route lengths and spherical interpolation per leg. Avoid O(N×M) scanning thousands of positions on each frame.
- Hidden/inactive scene does not run its own clock or render loop. Pause simulation on context loss, restore last stable t on recovery.

## Truthfulness and safety
This is a visualization/simulation, not real position prediction. At 100× the visual movement can be convincing but isn't a sailing instruction. If real AIS integration later exists, offer separate `Observed history` and `Scenario forecast` lanes; do not mix them without badges.

## Acceptance tests
A sample ship moves from timestamp t0 at 1× to same location at t0+100s after 1 real second at 100× (allow frame timing tolerance). Pause holds position and KPI values; forward and backward seek reconstruct identical snapshots; event counts and expense estimates match timestamp; 3D and 2D views align at same time; full voyage doesn't teleport across land. Replay loop off by default and no timer duplication when changing routes.


---

<!-- specs/11_ROUTING_OCEAN_WEATHER_AND_SPATIAL_INTELLIGENCE.md -->

# 11 — Shipping corridors, ocean environment and hazard overlays

## Guiding principle
A line on a map should communicate a meaningful relationship: planned maritime waypoint route, observed vessel track, localized port approach, weather/hazard interaction, queue circulation, alternative itinerary or service movement. The original Three Scope Map's decorative fly lines must be adapted to an **operational line language**.

## Route geometry
- Each route is a set of ordered maritime waypoints; interpolate with geodesic segments on globe, projected polyline at region level. Preserve channel routing, Panama/Suez chokepoints and avoidance of land using curated waypoints. Do not draw direct great-circle from Singapore to Rotterdam that crosses dry land.
- Colors: selected active route orange, unselected planned neutral gray/cyan, observed past light blue, alternative dashed/muted, high-risk interval salmon/red + hazard hatch only where risk is present. Avoid visual ambiguity with conflict statuses.
- Direction shown by small periodic arrowhead(s) or moving point derived from actual simulation clock; don't run arbitrary path particles that contradict ship direction.
- Render densely in GPU lines/instanced curves with stroke width / antialiasing independent from camera. Use segment batching and frustum culling.
- Clicking route selects corridor ID, not an arbitrary random nearby vessel; selected routes show affected voyages and risk evidence.

## Hazard and sea-layer contract
Types: high wind/wave forecast polygons, tropical cyclone track (forecast cone explicitly uncertainty), restricted access (if license), chokepoint congestion, navigational advisory (informational only), berth approach condition, currents (licensed provider when integrated). Synthetic hazards include validity time and confidence.
- Polygons are geographic, not detached rectangular decals. Render translucent fill and crisp boundary; prevent geometry depth fights and drape onto globe/region water plane.
- On hover label risk, valid time, data source and affected count; click highlights intersecting **voyage segments**, not all vessels in broadly overlapping region.
- Vessel hazard exposure compute time overlap *and* spatial intersection between predicted route segment and hazard polygons. Don't count vessel merely because same region. Mark conservative uncertainty.
- Weather replay events are tied to scenario UTC; expired hazards disappear or fade to historical mode.

## Ocean motion aesthetics
- Earth ocean: restrained specular reflections and deep-blue/charcoal gradient, atmospheric rim. Avoid moving wave mesh that breaks globe texture or creates visual noise at planet scale.
- Regional ocean: fine grid or subtle current flow visible only close up; ships have local wakes according to speed, directional buoy indicators only when a data layer is enabled.
- Port water: low-amplitude shader/normal ripple if performance allows, with attenuation near quays and no unrealistic giant displacement. Time acceleration does not multiply physical wave height.
- Coastlines use measured geography, no infinitely glowing borders; emphasis is contextual.

## Important real-world constraints
This is not ECDIS and must not be used for actual navigation. Official electronic chart datasets and hydrographic products use IHO S-100/S-101 with licensing and authority requirements. A visually accurate nautical dashboard is not an approved navigation system. `https://iho.int/en/enc-ecdis`.

## Acceptance
Toggle vessel, route, observed trail, hazards, ports and port queue layers independently; selected route remains in focus across regional/city changes; hazard affects only intersecting voyage with overlapping times; route never crosses dry land within approved demo corridors; switching to 2D retains projection and hazards; ocean shader stable at 100× and low quality.


---

<!-- specs/12_MARITIME_DECISION_ENGINES_AND_EVIDENCE.md -->

# 12 — Maritime operational intelligence and explainable decisions

## Product purpose
Turn a detailed map into a decision instrument rather than a high-cost visual wrapper. Every alert must answer: what changed, where, which object is affected, evidence and freshness, cost/time implications, feasible actions, owner and post-action state.

## Decision engine 1: ETA variance
Compare **same milestone** timestamps: ETA berth vs planned berth, ETA pilot boarding vs planned pilot boarding. `ETA shift = forecast − baseline`, with `+` late, `−` early; event transition derives from input forecast records. Explain why change occurred (port wait, weather, speed reduction, schedule update) only when evidence provides causal link. Show confidence and snapshot time.

## Decision engine 2: Port congestion
Counts: vessels in anchored zone (position AND navigation status), expected arrivals in window, known occupied berth hours, queue median/estimated wait. Distinguish `now observed/simulated`, `planned berth`, `forecast queue`. Region KPI aggregates must de-duplicate vessels across overlapping polygons. A zero unresolved incident queue is not evidence of zero delays.

## Decision engine 3: Just-in-Time arrival opportunities
If forecast pilot/berth ETA is significantly earlier than approved requested/planned service window, calculate indicative waiting and present an option to coordinate slot timing or assess voyage speed change **subject to ship/charter/security/regulatory approval**. Evaluate only provided candidate options; ship speed is never changed by a casual UI click. Require confidence band and data assumptions. Preview delta vs baseline with two-column comparison plus optional graph.

## Decision engine 4: Delay cost exposure
```ts
costExposureUSD = max(0, relevantDelayHours) * agreedDailyRateUSD / 24
```
For demo, assume rate is synthetic/contract-specific; show source. Add optional port/berth fees, service costs and fuel adjustments only when each has independent valid input. Don't double-count overlapping voyage/incidents; show range if uncertainty is material. Currency conversion must use source rate + timestamp if used.

## Decision engine 5: route and weather feasibility
Compare **candidate curated maritime routes**, not arbitrary line drawn by user. Calculate geodesic leg distance (nautical miles), estimated time given nominal speeds/constraints, exposure periods to relevant hazard polygons, detour and missing-data warnings. All routing outcomes are planning illustrations, not approved routing. Weather uncertainty confidence bands and no-go areas should prevent overconfident recommendation.

## Decision engine 6: berth timeline and service chain
Use DCSA E/R/P/A timestamp classes on berth/pilotage/towage/mooring/cargo services as available. A line of event cards along bottom of port view shows current, planned and missed milestones. Hover service state -> highlight relevant berth/crane/vessel physically. Missing requested/planned times produce `Unconfirmed slot` rather than false availability. `Berth Conflict` requires actual overlapping booking intervals in data.

## Presentation pattern (visual first)
1. **Map location and active affected asset**, one orange halo.
2. **Change strip**: expected vs actual/forecast, with a ±hours delta and confidence icon.
3. **Evidence strip**: 2–4 icons and tiny timestamps, expandable for data provenance.
4. **Options**: baseline vs alternate with time/cost/risk deltas and feasibility caveats.
5. **Propose action**: opens review step with author, rationale and saved timeline event.
6. **After**: visual replay of projected state vs baseline (scenario fork), never present simulated outcome as realized success.

## Incident lifecycle
`detected -> untriaged -> investigating -> optionProposed -> approvedForSimulation -> monitoring -> resolved/closed`, with reopen and severity escalation when facts change. This is product/demo state, not a real external incident command. Distinguish observed facts, forecast, operator proposal, and simulated effect with labels/icons.

## Evidence examples
- Port: `Planned berth 18:00 UTC; forecast arrival 05:00 UTC` supports early-arrival window, but not automatic fuel savings claim.
- Weather: `Scenario hazard intersects 160km of route from 08:00–15:00 UTC`, supports exposure; does not independently prove delay cause.
- Vessel: `Position last updated 18m ago; no fresh report` supports tracking uncertainty, not vessel stopping.

## Metric contracts / acceptance
Every number must link to input IDs, formula, time range, confidence; selecting event on map and event list shows same value. At 100× event status and KPI values follow timeline. Option comparison has at least two independently computed scenarios and cannot produce a negative exposure without explanation. Provide unit tests and reproducible fixture calculations.


---

<!-- specs/13_VISUAL_FIRST_ENTERPRISE_UI_DESIGN_SYSTEM.md -->

# 13 — Serious maritime visual design system: precision, not text-heavy dashboard

## Design intent
The app should feel like an expensive operational workstation. *Aggressive* means uncompromising alignment, clear hierarchy, confidently restrained motion and crisp technical presentation—not gaming glow, childish rounded cards, or saturated orange everywhere. The map is foreground and data is presented through physically meaningful visual overlays, concise numeric evidence, graphlets, event ticks and selected-state emphasis.

## Core palette, use and contrast
| Token | Value | Use |
|---|---|---|
| `surface.app` | `#F6F6F3` | warm neutral top chrome, contextual shell |
| `surface.panel` | `#FFFFFF` | drawers, popovers and functional sheets |
| `surface.muted` | `#F0F1EF` | secondary controls |
| `text.primary` | `#13191E` | headings, values |
| `text.secondary` | `#52606A` | labels, context |
| `line.default` | `#DCE2E4` | 1px clean separators |
| `map.ocean` | `#071A27` | globe/map ocean |
| `map.land` | `#243A42` | natural textured land geometry |
| `accent.focus` | `#E66A2D` | selected item, CTA, active route (not severity) |
| `state.critical` | `#C63B3B` | severe confirmed exceptions only |
| `state.warning` | `#B67B17` | forecast concern |
| `state.success` | `#147A66` | healthy/confirmed outcomes |
| `data.observed` | `#5AADB7` | observed tracking / actual |
| `data.planned` | `#7F8B94` | plan/baseline |
| `data.uncertain` | `#A6A9B4` | unverified / forecast band |

All text/controls meet WCAG AA contrast; orange-only information is insufficient. Color-blind and monochrome legends use shape/stroke/dash/label. Avoid glowing orange coastlines by default; concentrate orange on selected region, ship, berth and meaningful route segments.

## Typography
Primary UI: `Inter` or well-rendered system sans if no bundled license; technical numerals: `IBM Plex Mono` for coordinates, IMO/demo IDs, timestamps, knots, nautical miles, currency precision. Numeric characters tabular. H1/scene title 22–28px/600; section 14–16px/600; body 12–14px/400–500; metadata 10–11px; KPI primary 22–32px/600; tooltip min 12px on desktop; don't render unreadable 8px text for aesthetics. `UTC` next to every ambiguous absolute timestamp.

## Layout system
Base unit 4px; default components 8px multiples: 8/12/16/24/32, 1px border, radius 6–10px, 40px click target minimum and ≥44px touch. Header 56–64px. Sidebar: no persistent left rail on main map by default; compact icon toolbar 48–56px, collapsible. Bottom player 52–66px collapsed/90–130px expanded. Top scene chips/4 KPI compact strip may float but never occlude critical geometry. Inspector width min(400px, 34vw), collapses, dock right with map camera framing shift rather than clipping selected area. At 1440×900 with closed inspector, map uses ≥80% of usable area. On small laptop collapse KPI detail and labels; mobile port view uses 2D-first if WebGL space too constrained.

## Core visual component language
- `MapSceneHeader`: breadcrumb in one row, UTC/simulated status, 3D/2D switch, search.
- `MapKpiRail`: at most 4 compact values; clicking a metric highlights underlying related geographies and vessels.
- `EntityPeek`: 2-line contextual on-map popover with object title, 1–2 deltas, quick Follow/Inspect; anchor to object and reflow at map edges.
- `VesselInspector`: ship silhouette/3D model above route progress timeline, 3 priorities and an actionable event list; specs collapsed.
- `PortInspector`: berth occupancy mini-Gantt with one selected berth, anchored-vessel count and ETA/actual visual.
- `IncidentRibbon`: simple priority queue tray, maximum 3 top cases visible; opening tray doesn't cover map center.
- `LayerPalette`: compact icons with visibility toggles and tiny legend; group into Traffic / Ports / Weather / Risk / Plans.
- `ReplayTimeline`: event ticks mapped to real scenario timestamps; speed and current UTC always visible.
- `DecisionCompare`: two to three columns/cards with original vs proposed condition, delta chart and assumptions; must never fake a confirmed outcome.

## Visual data before paragraphs
Prefer: port queue ring over queue paragraph; vessel path with colored observed/planned segments over route text; berth Gantt band over full-size table; tiny ETA shift arrow from planned to forecast milestone over repeated timestamp descriptions; compact weather polygon with impacted segment over generic weather card; exposure sparkline with confidence shading over paragraphs of assumptions. Text is still available via detail disclosure and accessible description.

## Five screen layouts
**Earth:** full-bleed globe, 4 KPI corner strip, tiny case stack, floating selected vessel route peek, bottom conditional timeline.
**Region3D:** extruded coastline dominates; port pins + congestion halos; right contextual KPI mini-panel appears only for selection.
**Country/city3D:** selected city region, city/port selector, city maritime operations footprint; no dashboard wall.
**Port3D:** berth/anchorage scene, compact berth slots Gantt, visible traffic, inspector; gear icon opens asset layers.
**Vessel Follow:** camera follows hull, mini-voyage ribbon and ETA comparison, one contextual incident panel; 100× player visible.

## Density / attention hierarchy
One hero geography, one selected focus, one primary recommended *review* action. Controls layered in order: (1) scene navigation (2) selection (3) evidence (4) decision. Dim non-selected overlay traffic 30–50%, don't hide it. Disable busy animation when full inspector opens. If no incident selected, don't force empty '0 unresolved' card; collapse tray with explanatory `No actionable cases in this scope` chip.

## Interaction/motion language
150ms hover, 220ms panel open, 280ms entity focus, 600–2500ms spatial dives (readiness-gated), 100–180ms tooltip, subdued focus ring; easing cubic-bezier(0.2,0.8,0.2,1). `prefers-reduced-motion` removes camera spins and object choreography but retains state change and time updates. All visual state change has a user-facing semantic outcome.

## Acceptance
At 1440×900 and 1280×800, check no tooltip/text overflow, map unobscured, selected 3D hull distinct, no overlapping UI at port, keyboard visible focus, meaningful graphs, fast scanning: in 3 seconds user can identify current scope, most important issue, and next useful action.


---

<!-- specs/14_INTERACTION_MICROANIMATIONS_AND_FEEDBACK.md -->

# 14 — Every interaction and its feedback specification

## Interaction system design
One event router for map/DOM, one hover priority, one current selection and one camera owner. Any pointer event should either orbit/pan, select geo-feature, select 3D entity, drag timeline or manipulate a panel—never trigger multiple unrelated actions. Use drag threshold ≥5 screen pixels, hover delay ~60–100ms for dense maps, keyboard fallback, and a standardized focus/selected visual language.

## Interaction → visual & business state matrix
| User action | Visual micro-motion | Real state change |
|---|---|---|
| Hover geography | narrow coast outline and tooltip fade 120ms | preview target, no route change |
| Click region | highlight outline, Earth camera flight, planar scene reveal | `sceneKind=region3d` with resolved registry ID |
| Hover city/port | accurate hotspot pulse, small label with `arrivals/alerts` | preview related port summary |
| Click city | 3D map feature lifts then child scene builds | `sceneKind=city3d`, child registry loaded |
| Rotate map | immediate inertial orbit, horizon/grid remains stable | camera quaternion/target updated |
| Double-click map | smooth zoom around raycast point | camera zoom, avoid accidental drill without target |
| Click ship | thin selected hull edge + route trail reveal | selectionStore vessel ID, peek/inspector sync |
| Follow ship | camera eases behind/above hull with look-ahead | followCamera target & mode, manual user override possible |
| Hover berth | selected quay edge and slot timeline preview | berth metadata preview |
| Click berth | highlight occupied vs planned segments | berth selection and port-call data selector |
| Play 100× | speed chip immediate update, temporal trail moves | canonical clock factor changes to 100 |
| Scrub | time lens / event tick preview | reconstruct all entities at chosen time |
| Open incident | related segment/ship/hazard fades others | incident selected, evidence timeline visible |
| Compare options | baseline/alternate path and ETA bars animate | local hypothetical scenario branch |
| Save proposal | subtle confirmed state and timeline annotation | demo-local append-only action record |
| Switch 3D↔2D | crossfade with saved center and selection | new scene renderer, same coordinates/time |

## Microanimation rules by artifact
- Globe: atmospheric rim and subtle idle drift, not constant distracting rotation when user examines vessel.
- Region coast: selected contour has low-amplitude time progression, not pulsing full borders; hovered region rises ~1% of stage scale.
- Vessel: speed-based wake, slight ship model inertia, short selection scale pulse ≤1.03, 3D orientation synced to time.
- Ports: anchor queue ring appears only when layer enabled, animates to count; berth occupancy chips update on timeline event, not every render frame.
- Incidents: map attention ring pulses twice at detection then rests. No nonstop red blinking except true operational critical status where user can disable.
- Timeline: thumb and event ticks move smoothly, but timestamp is exact; predicted future band distinct from observed past.
- Inspector: enter 220ms transform+opacity without relayout camera jumps; camera recenters within panel-aware safe region over 280ms if selected object clipped.

## Focus and discoverability
Use pointer cursor and exact hit areas; selected object can be found with keyboard search and focus list. Short on-first-use hint: `Drag to rotate · Scroll to zoom · Click ports or vessels to inspect`. Tooltip on `3D` explains realistic limitation and 2D precision mode. Layer toggles have visible on/off state and data age.

## Negative and partial states
- Empty port: `No managed vessels here at selected time` with `Show surrounding traffic`, not an empty white block.
- Unavailable layer: disabled control with provenance reason and `Retry`, not inert icon.
- Stale vessel: ring + timestamp + disable unsupported ETA recommendations.
- No active voyage: model/identity can still be explored, route/time controls de-emphasize.
- Loading: preserve last rendered scene, nonblocking progress; avoid full-screen spinner and black flash.
- Errors: toast with actionable retry, camera remains stable; cancel transition properly.
- Conflicting location data: flag questionable sample, don't snap ship between incompatible locations.

## Audit of existing controls
Inspect current `3D/2D`, `layers`, `reset`, `activity`, search, breadcrumb, exception queue, details and `follow` behavior. Every button must have a verified state change. If original search returns IDs without stable camera focus, correct it. If different views display contradictory timestamps, force common clock. If activity tray expands but hides map, fold into bottom-left palette.

## Accessibility/performance
All controls >=40px desktop, focus visible, descriptive labels, escape closes popover, non-pointer actions available from lists. No low-contrast technical numbers. Limit 3D raycast and animated layer work to active view; use `prefers-reduced-motion` state without losing playback determinism.


---

<!-- specs/15_JSON_DATA_CONTRACTS_AND_GEOGRAPHIC_MAPPING.md -->

# 15 — Data contracts for an integrated global→port maritime experience

## Data reality and contract
Reuse earlier kit's JSON fixture IDs, entity relationships and validator. Add V2 registry and time-indexed geometry contract. Do not generate unrelated random values in component templates. All displayed KPIs must trace to source entity IDs and a scenario UTC timestamp. If actual shipped JSON differs, write explicit adapter and migration.

## Required normalized entities
| Entity | Mandatory identity/relation | Geographic fields | Time/status fields |
|---|---|---|---|
| MaritimeRegion | regionId, parent, childCountryIds, portIds | `bbox`, center, GeoJSON/geometry URL | snapshot availability |
| Country/CoastalCity | id, parentId, availablePorts, regionId | Polygon/MultiPolygon + center WGS84 | scope notes |
| Port | portId, UN/LOCODE if verified or demo ID, cityId | coordinates, footprint, operating zone | status/arrival window |
| Terminal | terminalId, portId | polygon, berths, crane refs | operational state/forecast |
| Berth | berthId, terminalId, dimensions if known | local ENU polyline & heading | reservations, occupancy |
| Anchorage | anchorageId, portId | WGS84 polygon | queue/current vessels |
| Vessel | vesselId, category, dimensions, managed flag | current and historical sampled positions | navStatus, update age |
| Voyage | voyageId, vesselId, port pairs, routeId | waypoints/leg IDs | ETAs, planned windows |
| Position | vesselId, timestamp, quality | lon/lat, heading/course | speed, source type |
| PortCall | callId, vesselId, voyageId, portId, berth? | location/berth refs | E/R/P/A events, service stage |
| Hazard | hazardId, type, severity, source, confidence | GeoJSON polygon/track | validity start/end |
| Incident | incidentId, cause/evidence refs, owner | affected entity IDs and spatial scope | lifecycle event timestamps |
| Option/Decision | decisionId, incidentId, baseline option, proposal | affected voyage/port/route refs | createdAt, scenario branch |

## Canonical formats
- Timestamps: ISO 8601 UTC string in JSON (`2026-11-09T12:00:00Z`); convert to epoch once for sorting. No local timezone ambiguity.
- Position JSON objects store `{lat,lon}`, rendering functions demand `[lon,lat]`; add runtime guards to detect swapped coordinates and out-of-range values.
- Distances in SI meters internally, presentation `nm` for maritime route, `km` for local geography, `m` for berth; speed in knots. Money in base `USD` with `currency`/`assumptions` explicitly stored.
- `sourceKind`: `synthetic_observed`, `synthetic_forecast`, `derived`, `imported_verified`; fields `observedAt`, `validUntil`, `confidence`, `scenarioVersion` where appropriate.
- IDs remain stable. Never create random IDs during component mount. Generate synthetic datasets with seeded random source.
- Each geospatial geometry has source/attribution/license/precision. Harbor geometry in sample is illustrative if not sourced from approved precise GIS.

## Illustrative contract (not the whole fixture)
```json
{
 "sceneId":"scene-SEA", "kind":"region3d", "regionId":"REG-SEA",
 "center":{"lat":3.4,"lon":107.0}, "bbox":[94,-12,142,24],
 "geometryRef":"/geo/approved/sea.geojson", "children":["SG","MY","ID"],
 "portIds":["PRT-SIN"],
 "cameraPreset":{"azimuthDeg":-28,"elevationDeg":48,"paddingPx":64},
 "provenance":{"source":"approved source or simulation","license":"verified before shipping","geometricAccuracy":"illustrative"}
}
```
```json
{
 "vesselId":"VSL-0001","voyageId":"VYG-0001","type":"container",
 "lengthM":229,"beamM":50,"modelAssetId":"container-mid",
 "sample":{"at":"2026-11-09T12:00:00Z","lat":1.18,"lon":103.91,"speedKnots":0.1,"courseDeg":null,"navStatus":"at_anchor"},
 "sourceKind":"synthetic_observed","dataQuality":"demo; normalized from original PORTOS fixture"
}
```
```json
{
 "portCallId":"PCL-0001","portId":"PRT-SIN","vesselId":"VSL-0001",
 "waitingSinceUTC":"2026-11-09T04:00:00Z",
 "milestones":{
  "estimatedBerthUTC":"2026-11-10T14:00:00Z",
  "requestedBerthUTC":null,
  "plannedBerthUTC":null,
  "actualBerthUTC":null
 },
 "status":"awaiting_berth", "sourceKind":"synthetic_port_event"
}
```

## Derivation contracts
`selectFleetSnapshot(t,scope)`, `selectVesselPosition(id,t)`, `selectVoyage(id,t)`, `selectPortTimeline(id,t)`, `selectIncident(id,t)`, `selectApplicableHazards(geom,t)`, `selectKPIs(scope,t)`, `selectOptions(incidentId,t,assumptions)` must be pure, memoizable and independently unit-tested. No React/Vue presentation logic knows domain formulas. V2 registry references may coexist with old `/region/REG-MED` routes.

## Base fixture compatibility
Read `specs/21_EXISTING_FIXTURE_RECONCILIATION.md` before applying the illustrative contracts. In the original kit, `VSL-0001` is anchored and `VYG-0001` begins in Singapore; `VSL-0047` is underway and is the 100× movement showcase. Do not turn the anchored ship into an approaching vessel to satisfy an animation requirement.

## Minimum demo data qualities
Existing kit: 500 vessels, 100 ports, 200 voyages, 50 incidents, 6,500 position samples are present in previous package. **Caution:** 6,500 points across 500 vessels are only ~13 time samples per vessel; the existing VSL-0001 is anchored, and its voyage is from Singapore to Rotterdam. Use VSL-0047 (underway Singapore→Manila) for 100× motion; generate a coherent 15-minute/30-minute synthetic time series for 10–30 flagship underway vessels without overwriting original history. Preserve IDs and mark any extension as a new scenario version. Do not manufacture millions of JSON records if dynamic deterministic segments can produce smooth intermediate motion.

## Geometry compatibility
- Regions are polygons/feature collections not longitude rectangles, unless labeled illustrative.
- Coastal city is a polygon or a bounded georeferenced local site grid; port is point + terminal polygon(s) + berths/anchorages.
- A ship in regional scene uses same WGS84 sample as port scene transformed locally. Port berth poses are local coordinates georeferenced to an origin.
- Route legs use ocean-safe curated waypoints; `routeLegId`, `distanceNm`, `maxAllowedSpeedKn?`, and `hazardIntervalRefs`.

## Validation checklist
Unique IDs; every foreign key resolves; all `at` timestamps sorted per vessel; speed/coordinate bounds sane; voyage origin/destination ports exist; plan/actual milestone chronology logical; corridor waypoint list not empty; port berth anchor is within correct site bounds; numeric KPIs rederived; 100× clock test snapshot reproducible; source labels present.


---

<!-- specs/16_FLAGSHIP_DEMO_SCENARIOS_AND_EXACT_VALUE.md -->

# 16 — Three complete maritime demonstration scenarios, aligned with EXISTING PORTOS fixtures

## Source-of-truth warning
The previous PORTOS 55-file kit already contains: `VSL-0001` MV Pacific Horizon **at_anchor** near Singapore (103.91E, 1.18N, speed ~0.1 kn); `VYG-0001` Singapore→Rotterdam; `PCL-0001` at Singapore waiting since `2026-11-09T04:00:00Z`, estimated berth `2026-11-10T14:00:00Z`; `INC-0001` open port congestion; `VYG-0001` planned arrival Rotterdam Nov 28 08:00Z vs estimated Nov 29 02:00Z = +18h, daily delay cost $32k → **$24k indicative voyage delay exposure**. Preserve these IDs. An earlier conceptual JIT example that portrayed VSL-0001 approaching Singapore would contradict the shipped kit; do not implement it.

## Scenario A — Singapore berth queue + delayed onward voyage (PRIMARY)
**Discovery:** Earth attention hotspot → Southeast Asia independent 3D regional map → Singapore country/city view → Singapore illustrative port 3D (quays, 6+ berths, two anchorages) → click anchored `VSL-0001` / MV Pacific Horizon and incident `INC-0001`.

**Data reality:** PCL-0001 waiting since Nov 9 04:00Z (34 hours to estimated berth Nov 10 14:00Z), current scenario time Nov 9 12:00Z = 8h elapsed and **26h projected remaining**. Berth remains unassigned; estimated berth time is *not* a planned or confirmed slot. The history also has an `ANCHORAGE_ENTER` event at 09:15Z, so keep 'port queue since 04:00' separate from 'at anchorage after 09:15'. VYG-0001 destination ETA +18h → $24k *indicative delay-cost exposure* at $32k/day. Do NOT infer that the entire 18h Rotterdam variance is caused by this specific Singapore queue without evidence.

**Interactions:** see physically anchored stationary vessel (no wake); click queue/berth and show forecast occupancy; compare investigate terminal slot, request berth update, prepare onward-voyage schedule communication; save proposal locally; replay past incident and revised ETA events. Show a mini-route starting at Singapore to Rotterdam, not a fictitious voyage into Singapore.

**Value:** evidence-based prioritization, queue coordination, known vs unconfirmed milestones, causal separation. Show red/amber only on actionable events, not entire port.

## Scenario B — 100× visual vessel-follow demonstration (SEA)
**Source:** `VSL-0047` MV Emerald Star 047, underway near Southeast Asia in existing fixture, assigned `VYG-0047`, Singapore→Manila via route `RTE-SIN-MNL`. Preserve last-known position, route IDs, dimensions and speed from base kit. Generate a *separate clearly versioned synthetic future tracking series* that follows approved demo sea waypoints at plausible speed; don't simply extrapolate straight through land or alter historical AIS-like samples.

**Experience:** On SEA region3d, search `VSL-0047`, select, load low-poly container/tanker model based on its actual category, click Follow, orient camera to course, 1×→10×→100×. Observe hull, wake, trail, route progression and timestamp advancing consistently. Pause, scrub backward, switch 3D↔2D, and return to selected vessel at same simulation UTC. Detail screen visualizes route Singapore origin → current position → Manila destination.

**Value:** fleet movement awareness, uncertainty of track, journey monitoring; demonstrates 3D rendering and clock architecture without falsifying VSL-0001 movement.

## Scenario C — Mediterranean / Rotterdam operational alternatives
Mediterranean: Earth → REG-MED extruded 3D region; hover Genoa/Marseille, rotate 40°, select a coastal city/port, inspect local vessel/hazard evidence with actual scenario references. Rotterdam: Europe→Netherlands→Rotterdam port 3D, select illustrative berth conflict with independently timed port-call schedules, compare schedule options and record draft. Only create a conflict if overlapping booked/planned intervals truly exist in fixture branch; do not invent actual real-world port berth data.

## Demonstration sequence (4–5 minutes)
- 00:00 Earth opens; global fleet, shipping routes and actionable incidents; show sim UTC and region hotspot.
- 00:25 click Southeast Asia; camera dive then **actual extruded regional map**, rotate and inspect geographic/coastal detail.
- 00:55 click Singapore → city/country extruded map → selected port3d with cranes, berths, anchorage queues.
- 01:35 click anchored MV Pacific Horizon; observe no wake, waiting/berth timing and +18h onward voyage ETA shift, click INC-0001.
- 02:15 compare operational response options, save proposed coordination action; replay event changes.
- 02:55 return SEA region view, select *underway* MV Emerald Star 047 and Follow at 1×→10×→100×; inspect smooth movement and waypoint route.
- 03:50 pause and scrub backward; switch 2D while keeping vessel/time; return to region/earth.
- 04:20 optionally jump Mediterranean or Rotterdam to showcase generality.

## Optional secondary JIT-arrival demo
Create a **NEW** vessel/port-call with its own unique IDs and explicit E/R/P/A timestamps to showcase an early-arrival vessel approaching an unconfirmed berth window. Do NOT overwrite VSL-0001 or PCL-0001. Any waiting/fuel exposure is conditional on assumptions and operator approval; never a vessel speed order.


---

<!-- specs/17_COMPONENT_ARCHITECTURE_PERFORMANCE_AND_LIFECYCLE.md -->

# 17 — Target architecture, scene lifecycles, performance and source boundaries

## Core principle
PORTOS is **one app** with one data model and several appropriate spatial renderers, not disconnected hero animations and dashboard pages. Keep existing Vue 3, Vite, TypeScript and the original Three.js globe adaptation; use a central `SpatialDirector` for navigation and RAF ownership. Use MapLibre GL JS or existing 2D implementation for detailed basemap if already present and properly licensed.

## Suggested component tree (adapt to actual existing paths)
```txt
src/
  app/                     # existing router/app shell, don't wipe
  spatial/
    SpatialDirector.ts     # routing, scene state machine, ownership, handoffs
    SpatialRegistry.ts     # region/country/city/port GeoJSON sources & camera presets
    GeoProjection.ts       # WGS84 sphere, region projection, port ENU transforms
    SceneCache.ts          # promise dedup, texture/geodata preload, disposal
    transitions/SceneHandoff.ts
    earth/EarthStage.vue   # adapted original skill source with attribution
    region/ExtrudedGeoStage.vue # country/city/region generator & OrbitControls
    port/Port3DStage.vue   # georeferenced terminals/quays and vessels
    port/Port2DStage.vue   # accurate 2D map, optional MapLibre integration
    layers/VesselLayer3D.ts
    layers/RouteLayer3D.ts
    layers/WeatherLayer3D.ts
    layers/PortLayer3D.ts
    assets/VesselAssetLibrary.ts
    cameras/OrbitRig.ts
    cameras/FollowRig.ts
  domain/
    entities.ts            # normalized interfaces
    selectors.ts           # at-time KPIs/incident evidence
    routeGeometry.ts       # maritime waypoints, distance/interpolation
    portCallEngine.ts
    decisionEngine.ts
  simulation/
    ScenarioClock.ts       # only time source
    SnapshotEngine.ts      # deterministic at-time world model
    ScenarioBranches.ts    # decisions are local hypothetical forks
  ui/
    MapShell.vue, KpiRail.vue, LayerPalette.vue, SceneBreadcrumb.vue
    EntityPeek.vue, VesselInspector.vue, PortInspector.vue
    IncidentTray.vue, PlaybackTimeline.vue, DecisionCompare.vue
  data/
    adapters/LegacyPortosAdapter.ts
    generated/ or public/fixtures/ # existing JSON mounted; keep IDs
```

The listed structure is **suggested**, not permission to introduce duplicate components where equivalent existing code already works. `SpatialDirector` must be the only place that switches scene ownership. Avoid circular dependencies between UI and renderer. Vue stores use Pinia or existing store consistently; don't add state management solely for novelty.

## Data/render boundaries
- Domain layer has no Three.js imports; accepts normalized JSON and UTC.
- Geospatial adapter translates domain geo -> Three.js/map tile coordinates and handles projection math, source/license details.
- UI selectors read domain view models, never traverse raw fixture arrays or parse route data themselves.
- Renderer objects are pooled/cached; no React/Vue state writes every RAF frame. RAF read snapshot/animation transform updates only; UI update throttled / event-driven.
- A scene transition has cancellable token; stale async geometry can't overwrite later route selection.

## Scene lifecycle API
```ts
interface SpatialScene {
 id:string;
 preload(signal:AbortSignal):Promise<void>;
 createOrReuse():Promise<void>;
 renderStaticFrame(tUTC:number):Promise<void>;
 activate(tUTC:number):void;
 updateFrame(tUTC:number,deltaRealMs:number):void;
 setSelection(selection:Selection|null):void;
 deactivate():void;
 dispose():void;
 getCameraState():unknown;
 restoreCameraState(saved:unknown):void;
}
```
Avoid direct `setInterval` per vessel; everything derives from central scenario time. Ensure only one continuous scene render loop. If multiple WebGL canvases are necessary for compositing, explicitly manage context count and memory. Shared textures and geometries must dispose only when reference count zero.

## Rendering budgets (targets, refine by measured hardware)
- Desktop target 60fps @1440×900 for typical region/port; acceptable 30fps fallback on weaker GPUs with lowered pixel ratio/effects; input latency ideally <100ms except cinematic transitions.
- Pixel ratio cap ~1.5–2, dynamic scaling on sustained low FPS; monitor actual FPS/long tasks/texture memory and draw calls, don't rely on arbitrary hardware claims.
- Cluster/instanced LOD0 for 500 vessels; LOD1 for hundreds at regional scale where visible; LOD2 selected vessel only / handful in port. Expose per-scene model/mesh counts and performance diagnostics in dev mode.
- Batch coast outlines (`THREE.LineSegments`) and instanced labels where possible; avoid one draw call per border ring. Simplify large GeoJSON into render cache with source retained, prefetch on hover, async dynamic chunks.
- GIS assets: local Vite chunk for demo, network optional; avoid first paint raw multi-megabyte GeoJSON. Use original `world.earth-render.json` cache when integrated. Cache geometry by region+detail+sourceVersion and only rebuild after need.
- Don't run heavy weather particle systems at city+global simultaneously. Procedural waves/shadows optional, degrade before input responsiveness.

## Errors and resilience
Support WebGL context lost/restored, absent geodata, malformed geojson, tile attribution issues, slow resource loads, browser back during transition, empty selection, canceled route, stale positions. Default: keep stable last frame, show recovery action, don't silently show wrong chart/geometry.

## Security and privacy
Fixtures are synthetic. If production expanded, AIS and commercial port integrations have usage restrictions; do not scrape proprietary sources or expose internal operations to unauthorized accounts. Avoid personal crew data in public demos. Treat user-created decisions as local drafts with audit metadata and future permissions gates.

## Deliverable
Component-level migration mapping from old to new names, architectural dependency graph, performance measurements and resource disposal tests. Browser screenshots for same vessel in Earth, region3d, port3d and port2d.


---

<!-- specs/18_PHASED_BUILD_PLAN.md -->

# 18 — Codex implementation phases, exact order and stop gates

## Rule
No one-shot prompt hoping 20 components become correct. Build as **vertical slices** against existing repository. For each phase: inspect existing code, list impacted paths, implement small cohesive change, run tests/build, validate browser/real WebGL, record screenshot/video, mark pass/fail, then progress. `AGENTS_UPDATE.md` governs all phases.

### Phase 0 — Audit and baseline (no feature changes)
**Read:** specs 01, 02, 03, 04, 15, 17. Inventory renderer, state, routing, fixtures, attribution, current deep links. Capture five before screenshots: Earth, West Africa, Mediterranean, vessel, 2D. Run existing test/build/data validator. Draft `docs/PORTOS_V2_AUDIT.md` and migration table. **Gate:** can open current app and explain the existing architecture; no sources destroyed.

### Phase 1 — Scene state and data registry
Build `SpatialDirector`, state machine, normalized registry and adapter over existing IDs. Implement load/error/breadcrumb/back + selection separated from scene. Add feature flag. **Gate:** direct route to region/city/port resolves correct geo/data even with placeholder geometry; no duplicate clock and existing deep links work.

### Phase 2 — Real region3d / country3d / city3d renderer
Integrate original skill’s extrusion/terrain/contour/orbit technique with license. Build geospatial projection, cache and fixtures. Test Southeast Asia and Mediterranean, drill Singapore/Genoa, rotate/tilt. **Gate:** distinct planar 3D scene, visible sidewalls, hover lift, correct geography, no screenshot/2D CSS cheat.

### Phase 3 — Cinematic globe-to-region handoff
Preload destination and render static frame; orient globe, dive, crossfade/reveal destination. Scene ownership one RAF; back restores prior camera. **Gate:** Earth → Southeast Asia without blank frames; 4 screenshots capturing flight/handoff; reduced-motion fallback; browser history correct.

### Phase 4 — 3D ship library and motion
Build LOD library for container/tanker/bulk/RoRo/tug, WGS84-to-scene transform, heading, wake and selection. Replace generic ship markers gradually, keep old layer as fallback only in dev. **Gate:** silhouette grid, cardinal heading tests, selected vessel in region and port at correct coords; no strange movement or excessive draw calls.

### Phase 5 — Port digital twin / city → port
Implement georeferenced illustrative Singapore port scene and lighter Genoa/Rotterdam layouts, terminals, 6+ berths, 2+ anchorages, crane/yard instancing, vessel berth poses and click behavior. Add 2D map switch preserving selection. **Gate:** city click opens port, berth and vessel inspection supported, no authentic official-port claims.

### Phase 6 — Canonical clock and 1×–100× replay
Audit old simulation. Consolidate single `ScenarioClock`, snapshot selectors, keyed position samples and exact event clock. Build player, pause, stepping, scrubbing, speed, follow 3D. Extend flagship vessel sample density where needed. **Gate:** determinism tests, correct 100× ratio, UI + 3D consistent; no independent timers or current-vs-historical mismatch.

### Phase 7 — Maritime value engine
Implement ETA variance, DCSA port-call E/R/P/A timeline, berth conflicts, hazard route intersections, JIT option evaluation and delay exposure. Attach to physical selected objects. **Gate:** existing Singapore case VSL-0001: anchorage/berth wait forecast from PCL-0001 and destination ETA shift +18h; $32k/day × 18h/24 = $24k indicative exposure, with source IDs and time; cases and delay counts clear.

### Phase 8 — Premium visual-first UI
Use spec 13/14. Replace fat left queue with tray, collapse generic inspector data into composed visual components (route progress, berth occupancy mini-Gantt, voyage event ribbon, risk evidence). Polish white chrome, map lighting, orange focus, motion. **Gate:** 3-second scan test across Earth/region/port/vessel; map ≥80% available closed; no dead controls.

### Phase 9 — Complete scenario and release QA
Build full Singapore demo path plus one Mediterranean and Rotterdam variant. Run unit, e2e, visual, performance, reduced-motion and license tests. Export demo walkthrough and changelog. **Gate:** all acceptance tests pass or explicitly marked blockers; no unverified `live` claims.

## Suggested delivery slices
**Slice A** (Phases 0–3): geographic wow and navigation without data regression.
**Slice B** (Phases 4–6): tracked 3D vessels, port visuals and replay.
**Slice C** (Phases 7–9): credible decision workflows and premium UX.

## Stage handoff template
```md
### Phase N result
- Actual files changed:
- Existing functions reused:
- Data sources and migrations:
- Commands run and results:
- Browser flow verified:
- Screenshot/video evidence paths:
- Performance observations:
- Accessibility check:
- Outstanding failures:
- Next phase prerequisites:
```

## No silent shortcuts
If phase can't verify real 3D, stop and report exact blockers—not `done` because Vite built. If data missing, use correct demo label + synthetic explicit fixture; don't replace visible render with concept image. If ship model unknown, use proper procedurally built type rather than generic triangles and mark that tier lower fidelity. If expensive optional polish degrades 100× replay, performance and stable data win.


---

<!-- specs/19_BROWSER_QA_ACCEPTANCE.md -->

# 19 — Browser-level acceptance and regression matrix

## Definition of done
Not a Figma recreation and not a textual report. Deliver functional browser running PORTOS with real WebGL, clickable/rotatable 3D geography, recognizable animated ships, deterministic 100× playback, meaningful port intelligence, comprehensible visual design and no lost existing app functions. Keep QA evidence linked in `docs/PORTOS_V2_QA_EVIDENCE.md`.

## Interaction acceptance matrix
| ID | Test | Expected result |
|---|---|---|
| M01 | Open `/ops/earth` | Earth renders with vessel/port/route overlays and simulated label; no black/blank scene |
| M02 | Click Southeast Asia | Warm handoff, new **extruded regional** 3D scene with islands/coast, not same sphere zoom |
| M03 | Orbit 45°, tilt, wheel | geo scene rotates with side-wall visibility; labels and vessel markers remain georeferenced |
| M04 | Click Singapore feature/city | load independent city scene; active map layers match region scoped data |
| M05 | Click Port of Singapore | port3d opens with terminals, berths, anchorages, physical vessels and contextual port KPIs |
| M06 | Click berth | highlight accurate quay, queue/call Gantt updates, no random panel |
| M07 | Click moving ship | same vessel ID selected in map, inspector, route and clock |
| M08 | Follow vessel | camera follows hull smoothly; stop, manual pan and resume work |
| M09 | Choose 100× | time advances ~100 scenario seconds/real second; hull, events, KPIs advance coherently |
| M10 | Pause → scrub backwards | exact prior frame reconstructed and historical event/incident state restored |
| M11 | Switch 3D ↔ 2D | center, selected vessel, timestamp, visibility filters consistent |
| M12 | Open ETA exception | show evidence, relevant timestamp types, cost assumption and linked map object |
| M13 | Compare 2 scenarios | visually different option paths/timelines, feasible caveat, sensible cost/time figures |
| M14 | Save proposed action | draft record stored in demo-local audit and visible on timeline; no external dispatch claim |
| M15 | Browser Back/Forward/deep link | scene/selection restored; no blank frame, duplicate renderer or lost time |
| M16 | Original region/corridor/weather URLs | old public project views still navigate through compatible adapter or redirect |
| M17 | Flight canceled mid-load | fallback to last stable scene, retry available, no zombie overlay |
| M18 | Context loss / missing asset | clear recovery state and stable app controls |
| M19 | Search same vessel from Earth and region | resolves same ID, data and history, same 3D model category |
| M20 | Reduced motion + keyboard | usable transitions, Escape, focus, 100× deterministic playback |

## Specific math/data assertions
- `VSL-0001` (MV Pacific Horizon) is **at anchor** near Singapore at fixture baseline; speed ~0.1 kn, no wake and NO false moving track. The **100× Follow demo uses VSL-0047** (MV Emerald Star 047), whose time-indexed underway samples must be extended/validated before claiming multi-hour smooth playback. 100× 1 real second ~100 scenario seconds.
- Singapore baseline: `PCL-0001` arrival/wait record `2026-11-09T04:00:00Z`, estimated berth `2026-11-10T14:00:00Z` (34h elapsed+projected interval, not a confirmed berth slot). At scenario time 12:00Z, projected 26h remaining. Separate destination voyage VYG-0001 estimated Rotterdam ETA +18h; indicative exposure `$32k/day × 18/24 = $24k`. Do not assert all 18h is causally due to Singapore without supporting event/evidence.
- Time range scrub by 72h should never leave latest incident opened if its event begins later; duplicate counting not permitted.
- A vessel without an assigned voyage doesn't render destination ETA or cost values.
- `tracked`, `delayed`, `at-risk` counts labeled by denominator/scope with clear interpretation.
- Geo test: known WGS84 port point remains in correct water/coast after globe/region/city/2D conversion; don't swap lon/lat.

## Visual regression screenshots (minimum)
At 1440×900, 1280×800 and one smaller desktop size: initial Earth, region overview, region rotated, city, port overhead, port tilted, selected container vessel LOD2, 100× replay with timestamp, hazard and route comparison, case action state, 2D. Generate before/after diff where possible; check for cut-off labels, broken rings, low-contrast panels, misplaced tooltip and UI occlusion.

## Performance and accessibility
- Measure representative FPS, input latency, draw calls and memory while 500 vessel markers visible on global scene; sustained responsiveness matters more than effects.
- Scene change should keep a rendered backdrop and respond to cancel; no indefinite spinner; GPU resources reclaimed on route changes.
- `prefers-reduced-motion`, keyboard navigation, high-contrast focus, semantic component labels, contrast AA, safe graphic alternatives.
- Device pixel ratio fallbacks, maplabel declutter, port scene complexity reduction; verify 100× does not create runaway event backlog.

## Licensing/provenance and realism
- Original skill GPL attribution remains in code/package and generated public showcase credit as required.
- World/topo, terrain, base tiles, ship GLBs, port/terminal layout all have provenance/usage rights.
- All sample data clearly synthetic, no real AIS assertion. No maritime navigation instruction or certified nautical data claim.

## Evidence artifact format
For each test store: test ID, commit, environment, route, viewport, source time/record, screenshot/video path, result, tester, issue link and performance notes. Unverified outcomes explicitly `NOT RUN`, not `PASS`. In final implementation summary distinguish confirmed working flows from deferred behavior.


---

<!-- specs/20_REAL_DATA_INTEGRATIONS_SAFETY_AND_SOURCES.md -->

# 20 — Production evolution, extra capabilities, legality and reliable source guidance

## Scope boundary
V2 is a **synthetic-data frontend prototype**. A real sellable maritime product needs validated AIS/licensed position feed, port/terminal event access, authentication/roles, durable backend/event storage, alert distribution/approval workflow, audit logging, data freshness policies, uptime and security controls. The visually rich 3D map is a presentation and investigation tool, not an approved ECDIS/navigation instrument.

## Practical integration stages
**Stage 1 — demo:** all data local JSON/generated deterministic events, clearly SIMULATED, no network needed. Use geospatial data with compliant licenses and synthetic port geometry where authentic GIS unavailable.
**Stage 2 — pilot:** one authorized ship fleet's tracking feed, one consenting terminal operator's port-call milestone data, read-only API ingest with normalizing adapters, SLA data quality checks. Measure ETA/port wait explanations and saved operator review outcomes.
**Stage 3 — commercial:** multi-tenant access, per-source permissions, event ledger, encrypted integrations, data retention/audit, monitoring, calibrated ETA model, sector/licensing compliance and human approval; no automated vessel routing control.

## Additional high-value ideas beyond current scope
- `Port Call Choreographer`: visually arrange dependencies among pilot, tugs, berth, mooring and cargo ops with DCSA timestamp semantics.
- `Fleet Time Capsule`: 72h spatial replay with exportable incident narrative—great for portfolio and actual post-mortem operations.
- `Shared Situation Room`: two named operators annotate same incident and handoff state (backend required).
- `Data Confidence Map`: overlay freshness and uncertainty, prevents false confidence in missing AIS.
- `Port Compare`: side-by-side 2 candidate ports with constraints and data completeness; missing data blocks easy recommendation.
- `Turnaround Opportunity Finder`: visualize actual vs predicted waiting and departures for comparable port calls.
- `Weather Exposure Story`: show a hazard footprint across time and which voyages intersected it at a particular UTC.
- `Carbon/Fuel Scenario`: only after documented vessel-specific fuel-rate model and energy input; no unsupported precision.

## External reference documents (use when implementing)
1. Original skill README, source code, SKILL: `https://github.com/songsummer920-dazzle/three-scope-map-skill` — China-first Earth + extruded GeoJSON reference, GPL license. Preserve original authorship.
2. DCSA Port Call Standard purpose: `https://dcsa.org/standards/port-call` — coordination and standardized port-call services.
3. DCSA Port Call 2.0 purpose/scope: `https://reference.dcsa.org/content/standards/releases/port-call/v2/pc-v2-purpose-and-scope` — Estimated/Requested/Planned/Actual event taxonomy.
4. DCSA Port Call use cases: `https://reference.dcsa.org/content/standards/releases/port-call/v2/pc-v2-use-cases` — berth/pilotage/mooring/bunkering events.
5. IHO ENC & ECDIS: `https://iho.int/en/enc-ecdis` — distinguish navigation charts from illustrative operations maps; standards S-100/S-101.
6. IHO product spec list: `https://iho.int/en/s-100-based-product-specifications` — availability and purpose of hydrographic datasets, licensing still must be determined.

## What we cannot honestly promise from the skill alone
No built-in global independent extruded country map, no complete global city hierarchy, no real accurate port CAD model, no licensed AIS, no fully functioning ocean-route planner, no fleet-wide ETA optimizer, no universal live port berth feed. Build these as explicit V2 modules, validate sources and calculations. Original validated globe can seed visual quality, not guarantee all maritime features.

## Source licensing rules
Keep `LICENSE`, `NOTICE`, `CITATION.cff`, SPDX and source author attribution from original project and required third-party notices. Check app distribution obligations with counsel before proprietary distribution. Avoid redistributing third-party textures/GLB assets where licensing is unknown. For maps, ensure attribution of OSM/OpenMapTiles/other tile/data providers as required, including 2D zoom. Synthetic fixture models can't substitute for verified navigational data.


---

<!-- specs/21_EXISTING_FIXTURE_RECONCILIATION.md -->

# 21 — Existing PORTOS demo-kit fixture reconciliation (important)

## Verified from earlier kit provided in this conversation
Read original `PORTOS_Codex_Master_Kit.zip/sample-data/*.json` before changing scenario records. Concrete known facts:

| ID | Known record | Product treatment |
|---|---|---|
| `VSL-0001` | MV Pacific Horizon, container, Singapore anchorage, lat 1.18 lon 103.91, speed ~0.1 kn, `at_anchor` | detailed stationary ship model, **no wake**, port congestion incident |
| `VYG-0001` | Singapore→Rotterdam, `RTE-SIN-RTM`, planned destination Nov 28 08:00 UTC, estimated Nov 29 02:00 UTC | +18h destination ETA shift, don't mislabel as arrival to Singapore |
| `PCL-0001` | Singapore port call, queue since Nov 9 04:00 UTC, estimated berth Nov 10 14:00 UTC, no confirmed berth | 34h projected queue period, 26h remaining as of Nov 9 12:00, show **estimated** not confirmed |
| `INC-0001` | Singapore port congestion, open/high, event opened Nov 9 10:59 UTC | show active case in relevant region/port scope |
| `EVT-0001` | ETA revised +8h→+18h at Nov 9 09:00 | time replay event tick, evidence linked |
| `EVT-0002` | Anchored entry at Nov 9 09:15 | separate from port waiting since 04:00; do not conflate |
| `VSL-0047` | MV Emerald Star 047, underway near 108.056644E 3.501864N, 13.5 kn | 100× moving hull demo, not anchored vessel |
| `VYG-0047` | Singapore→Manila, route `RTE-SIN-MNL` | origin/current/destination progress and waypoint track |
| `RTE-SIN-MNL` | conceptual sea waypoints Singapore→Manila | preserve waypoint chain and synthetic-not-navigation label |

## Semantic inconsistencies to explicitly audit
1. `PCL-0001.waitingSinceUtc` equals 04:00 but `EVT-0002.ANCHORAGE_ENTER` is 09:15; reconcile as queue/port-waiting vs entry into anchorage, not a single arrival event.
2. Voyage origin Singapore while departure record is dated before current at-anchor status; do not invent a coherent realized sailing timeline. Treat `departedAtUtc` data quality as suspect for VYG-0001 and review with generator before displaying event chronology.
3. Existing positions have only 13 samples per vessel (1h); 100× multi-hour playback needs dedicated newly generated synthetic series. Never extrapolate actual observations as verified historical movement.
4. Voyage planned/estimated ETA date durations may differ from naive distance/speed estimate; maintain source schedule and mark uncertainty; do not recompute as physically certain without validating route distance, port-call delays and speed assumptions.
5. The geographic `REG-MED`/`REG-WAF` boundaries in original JSON may be conceptual rectangular areas; never render them as true country borders. Acquire proper country/coastal geometry and link to region registry.
6. Many simulated `IMO` identifiers are demo IDs; avoid calling them registered IMO numbers.

## Migration
Extend fixture data in a **separate V2 scenario module**. Use normalized adapter to combine: `baseFixtureRecords + v2IllustrativeLayouts + versionedFutureMovementSamples + scenarioBranchEvents`. Preserve historic original arrays; don't overwrite IDs, edit old event timestamps or edit VSL-0001 to make it move. Define `scenarioVersion` and source-of-truth precedence, and rerun original validator plus V2 consistency tests.

## Acceptance
Before claiming coherent demo, tests verify VSL-0001 is anchored until a new time-valid berth/departure event, movement Follow uses VSL-0047 and route Singapore→Manila, and `$32,000/day ×18/24=$24,000` is displayed as an indicative ETA-delay exposure rather than a confirmed port charge. User should never be shown mutually incompatible sailing and anchoring states at same timestamp.


---

<!-- CODEX_UPDATE_PROMPT.md -->

# Paste into Codex: PORTOS V2 Spatial Upgrade — EXISTING PROJECT

You are the principal Vue 3 / Three.js engineer, maritime product designer and technical QA owner. **UPGRADE MY EXISTING PORTOS APPLICATION** to meet the attached `PORTOS_V2_Spatial_Upgrade` specifications; do not scaffold an unrelated replacement product, erase existing fixture data, or ship decorative static mockups.

## First actions, in order
1. Locate current PORTOS repository and inspect app/router/renderer/stores/fixtures/build/test commands. Read existing `AGENTS.md`, then `PORTOS_V2_Spatial_Upgrade/AGENTS_UPDATE.md`, `00_START_HERE.md`, `specs/21_EXISTING_FIXTURE_RECONCILIATION.md`, and all V2 specs related to the phase. Review the earlier 55-file PORTOS kit if present. Write `docs/PORTOS_V2_AUDIT.md` with exact found file paths before modifying.
2. Read actual source of `https://github.com/songsummer920-dazzle/three-scope-map-skill` and required attribution/licensing notices. Reuse its validated globe/extruded shader/sidewall/contour/camera principles with minimal reconstruction; do **not** pretend its China-specific Earth→China template natively supports arbitrary maritime region/city/port hierarchies.
3. Create a phased migration plan using `specs/18_PHASED_BUILD_PLAN.md`. Implement one phase at a time, run build, data checks and actual browser visual QA. Keep old routes working and use a feature flag.

## Exact desired outcome
`Earth globe → click Southeast Asia → world sphere camera flies → HANDOFF into independent extruded 3D regional map → orbit/rotate/tilt/hover → click Singapore → detailed 3D city/coastal region → click Singapore Port → 3D terminal/crane/berth/anchorage twin → inspect anchored VSL-0001 and its delay/berth evidence → separately Follow underway VSL-0047 on its Singapore→Manila route → accelerate **simulation** 1× / 5× / 10× / 25× / 50× / 100× → pause/rewind/scrub as incidents, berth and ETA statuses synchronize → compare valid port-call response options → save a demo-local decision → replay.`

## Critical corrections to current UI
- Current region navigation largely enlarges/reframes the globe. Implement truly **separate planar extruded region/country/city WebGL scenes** with sidewalls, accurate geographic boundaries, texture/material hierarchy, orbit and hover lift, source-inspired transition quality. Do not substitute 2D tiles/screenshots/CSS transforms.
- Make ship models real type-specific 3D assets with LOD, heading, speed-based wake and selection/follow camera. At global scale instanced symbols allowed; at port/vessel close-up use detailed hulls.
- White/near-white enterprise shell; deep navy map; restrained focus orange; technical typography and exact spacing; map-first ~80% available; minimal inspector; replace walls of text with informative berth Gantt, ETA delta diagram, route progress, sparkline, event timeline and geographic highlighting.
- All KPIs derive from one normalized JSON data model and one UTC simulation clock, never unrelated hardcoded counts. Preserve the `SIMULATED` status (not fake `live AIS`). Data/time and visuals must agree at 100×.
- Distinguish early arrival vs late delay, estimated/requested/planned/actual berth timestamps. Option comparisons are hypothetical operator decisions, not navigation commands or confirmed berth changes.

## Phases and stop gates
Execute phases 0–9 in `specs/18_PHASED_BUILD_PLAN.md`: audit → state/registry → extruded geo scenes → cinematics → 3D vessel library → port twin → replay → business intelligence → UI polish → browser QA. At each phase log actual changed paths and commands/results, capture browser screenshots/video and report remaining blockers. Inability to verify must be explicit; never claim a visual passes from TypeScript build alone.

## Quality benchmark
Use the user's Energy Campus screenshot as behavioral reference: globe first, click a country/region, new rotatable extruded scene appears, click deeper into subregion/city, consistent camera and material fidelity. Our PORTOS imagery and UI must be original maritime-focused and much less dashboard-heavy. Deliver working source with clear instructions for local run and full Singapore primary demo. Use `specs/19_BROWSER_QA_ACCEPTANCE.md` as acceptance matrix.

## Restrictions
Preserve existing app/project/URL functionality; preserve GPL/attribution and third-party licenses; no unauthorised real vessel data, no claimed real-time feeds, no navigation-certified chart claims; do not fabricate operational outcomes. Don't use image screenshots in place of WebGL rendering.

# PORTOS V2 — browser QA evidence (spec 19)

Every row below was run in a real browser with WebGL; nothing here is accepted from a TypeScript build. All data is
synthetic and every screen is labelled **Simulated**. Results are `PASS` (the expected result was asserted by an
automated browser test that passed in the run below), `PARTIAL` (part of the expectation is asserted, the rest is
listed as not run) or `NOT RUN`.

## Run record

| Field | Value |
|---|---|
| Commit | `__COMMIT__` (Phase 9, on top of `0ed82b0`) |
| Date | 2026-11-11 |
| Tester | agent (Playwright, automated); no manual pass was performed |
| Environment (functional) | Playwright 1.x Chromium 158.0.8127.18 headless, ANGLE SwiftShader (CPU WebGL), macOS 27.2 (Darwin), Apple M4 Pro; production build `vite build --mode e2e` served by `vite preview` |
| Environment (performance) | Same Chromium with ANGLE Metal (Apple M4 Pro GPU), `PERF=1 PERF_ANGLE=metal` |
| Default viewport | 1440 × 900, DPR 1 (other sizes noted per row) |
| Source data | `sample-data/` fixture v2.0 (2026-11-09 00:00–12:00 UTC window, Now = 12:00 UTC) plus `sample-data/v2/` |
| Full suite | `npx playwright test` → 84 passed, 6 skipped (opt-in perf and capture specs), 4.4 min |
| Unit | `npx vitest run` → 329 passed in 22 files |
| Issue links | none open; defects found in this phase were fixed in the same commit (see "Defects found and fixed") |

Evidence images: `docs/qa/v2-phase3/` (handoff frames), `v2-phase4/` (ships), `v2-phase5/` (port twin), `v2-phase6/`
(follow, track gaps), `v2-phase7/` (port call, decision branch), `v2-phase9/` (flagship journey and acceptance rows).
Regenerate with `PORTOS_EVIDENCE=1 npx playwright test flagship acceptance`.

## Flagship journey (spec 00 "one journey")

`tests/e2e/flagship.spec.ts`, one browser session, 1440 × 900, PASS (43 s on SwiftShader).

| Step | Route | Asserted | Evidence |
|---|---|---|---|
| 1 Earth | `/ops/earth` | globe ready, "Simulated" stamp, KPI rail "tracked · N in scope" | `v2-phase9/01-earth.png` |
| 2 Southeast Asia | `/ops/region/REG-SEA` | director active scene `region3d:REG-SEA`, surface is not the globe | `v2-phase9/02-region-sea.png` |
| 3 Singapore | `/ops/city/CTY-SIN` | `city3d:CTY-SIN` idle | `v2-phase9/03-city-singapore.png` |
| 4 Port twin | `/ops/port/PRT-SIN` | twin for PRT-SIN, KPI rail "Berth queue", compact queue, caption "Simulated" | `v2-phase9/04-port-twin.png` |
| 5 VSL-0001 | search | MV Pacific Horizon, ETA +18.0 h, exposure $24,000, berth "unconfirmed", INC-0001 first priority | `v2-phase9/05-vessel-vsl0001.png` |
| 6 INC-0001 | priority "Investigate" | case heading, URL carries INC-0001 | `v2-phase9/06-incident-inc0001.png` |
| 7 Follow VSL-0047 | `/ops/region/REG-SEA?vessel=VSL-0047` | follow bar, ship centred (< 40 px), sim/real ratio within ±15% at ×1, ×10, ×100 | `v2-phase9/07-follow-vsl0047-x100.png` |
| 8 Compare | `/incidents/INC-0001` → Actions | decision compare ≥ 2 columns, "not confirmed" footnote, $24,000 | `v2-phase9/08-compare-vyg0001.png` |
| 9 Save decision | propose | local branch "Proposed" with a simulated outcome; no dispatch | `v2-phase9/09-decision-branch.png` |
| 10 Replay | `/replay/VYG-0001` | decision bookmark on the timeline, step back to "INC-0001 opened" 10:59 UTC, compare with Now: +18.0 h, Untriaged → Option proposed | `v2-phase9/10-replay-inc0001.png` |

## Interaction acceptance matrix (M01–M20)

Source time is the fixture clock unless a row names another; route is the entry URL of the covering test.

| ID | Test | Route · viewport | Result | Covering browser tests | Evidence | Notes |
|---|---|---|---|---|---|---|
| M01 | Open `/ops/earth` | `/ops/earth` · 1440×900 | PASS | `journey` "Earth first paint renders the globe through WebGL"; `flagship` step 1; visual `01-earth` (1440×900, 1920×1080) | `v2-phase9/01-earth.png`, `tests/visual/01-earth-desktop.png` | Vessels, ports, routes and the Simulated stamp asserted; blank-frame guard is a byte-size check on the screenshot |
| M02 | Click Southeast Asia | `/ops/earth` → `/ops/region/REG-SEA` · 1440×900 | PASS | `handoff` "Earth → SEA → Singapore city → back, without blank frames" (timing project, sampled frames never blank); `routes` "the spatial director hands the globe to extruded scenes"; `flagship` step 2 | `v2-phase3/00-earth.png` … `05-region.png`, `v2-phase9/02-region-sea.png` | Destination is the extruded `region3d` scene, not a sphere zoom (surface kind `planar`) |
| M03 | Orbit 45°, tilt, wheel | `/ops/region/REG-SEA` · 1440×900 | PASS | `acceptance` "M03 · orbit 45°, tilt and wheel…" | `v2-phase9/11-region-orbit-tilt.png` | Azimuth change ≥ 40° (< 90°), polar +8° or more, wheel zoom > 8%; VSL-0001's 3D marker within 4 px of its WGS84 projection; Singapore port label drift < 12 px. Side walls visible in the evidence image. Stable over 8 repeats under 4-worker load |
| M04 | Click Singapore | `/ops/region/REG-SEA` → `/ops/city/CTY-SIN` · 1440×900 | PASS | `handoff` (city leg); `routes` "country and city scenes resolve from the registry and keep their breadcrumb"; `flagship` step 3; unit `v2ui.test.ts` (layer groups and scope availability) | `v2-phase3/06-city-dive.png`, `07-city.png`, `v2-phase9/03-city-singapore.png` | Independent `city3d` scene; KPI rail and ribbon re-scope ("· Singapore"). Layer scoping is asserted at unit level |
| M05 | Click Port of Singapore | `/ops/city/CTY-SIN` → `/ops/port/PRT-SIN` · 1440×900 | PASS | `port3d` "city → Singapore port twin: terminals, berths, anchorages, port vessels and the caption"; `flagship` step 4 | `v2-phase5/01-singapore-port-twin.png`, `v2-phase9/04-port-twin.png` | Port KPIs: queue, arrivals 24 h, median wait, congestion |
| M06 | Click berth | `/ops/port/PRT-SIN` · 1440×900 | PASS | `port3d` "a berth click updates the scene, the berth card and the schedule together"; `port3d` "berth schedule keeps actual, planned and forecast apart" | `v2-phase5/02-berth-focus.png` | Twin selection, berth card and Gantt row agree |
| M07 | Click moving ship | `/ops/region/REG-SEA` · 1440×900 | PASS | `acceptance` "M07 · clicking an underway ship…"; `journey` "a click on a vessel marker in the 3D scene selects the vessel under the pointer" (port twin) | — | An isolated vessel whose state is `underway` is clicked on the canvas; URL, inspector and track runs show the same ID and the clock time is unchanged. The click is made with the clock paused; clicking during active playback is not automated |
| M08 | Follow vessel | `/ops/region/REG-SEA?vessel=VSL-0047` · 1440×900 | PASS | `follow` "follow VSL-0047 at 1×, 10× and 100×: centred while it moves, ratio holds, pan releases"; `flagship` step 7 | `v2-phase6/follow-vsl0047-x100.png`, `v2-phase9/07-follow-vsl0047-x100.png` | Four follow modes, manual right-drag pan releases follow, "Resume" restores it, Stop ends it |
| M09 | Choose 100× | same as M08 | PASS | `follow` and `flagship` ratio checks (±15% at ×1, ×10, ×100); unit `clock.test.ts` (clock, world snapshot and ratio determinism) | `v2-phase9/07-follow-vsl0047-x100.png` | Speed is a clock factor; vessel `speedKnots` is never changed |
| M10 | Pause → scrub backwards | `/replay/VYG-0001` · 1440×900 | PASS | `flagship` step 10; `resilience` "the same timestamp always reproduces the same vessel state"; `journey` "replay marker for INC-0001 shows the event-time values"; `gate` "replay deep link shows the pre-revision estimate"; unit `replay.test.ts` | `v2-phase9/10-replay-inc0001.png` | At 10:59 the case is Untriaged while Now shows Option proposed; scrubbing back never shows a later event |
| M11 | Switch 3D ↔ 2D | `/ops/port/PRT-SIN?vessel=VSL-0001&time=…10:00Z` · 1440×900 | PASS | `acceptance` "M11 · 3D ↔ 2D keeps the selected vessel, time, layer filters and centre"; `port3d` "3D ↔ 2D keeps the focused berth and the replay time" | `v2-phase9/12-port-2d-vsl0001.png` | 2D centre within 0.3° of the port; the weather group stays off in both views |
| M12 | Open ETA exception | `/ops/port/PRT-SIN` · 1440×900 | PASS | `journey` "VSL-0001 port call shows the wait forecast with its sources, never a confirmed slot"; `journey` "incident evidence and the scenario comparison for INC-0001"; `gate` "search VSL-0001…+18 h and $24,000"; `flagship` step 5 | `v2-phase7/port-call-vsl0001.png`, `v2-phase9/05-vessel-vsl0001.png` | Shows estimated vs requested berth time types, $32,000/day × 18/24 = $24,000 and the linked map object |
| M13 | Compare 2 scenarios | `/incidents/INC-0001` · 1440×900 | PASS | `flagship` step 8; `journey` "incident evidence and the scenario comparison"; visual `07-route-comparison` | `v2-phase9/08-compare-vyg0001.png`, `tests/visual/07-route-comparison-desktop.png` | Original plan plus up to two proposals side by side with delta bars; footnote "Simulated outcomes, not confirmed." |
| M14 | Save proposed action | `/incidents/INC-0001` → `/replay/VYG-0001` · 1440×900 | PASS | `journey` "proposing an option creates a decision branch…"; `journey` "triage and assign INC-0001; the decision survives reload"; `flagship` steps 9–10 | `v2-phase7/decision-branch.png`, `v2-phase9/09-decision-branch.png`, `10-replay-inc0001.png` | Stored in demo-local storage and shown as a timeline bookmark; nothing is sent |
| M15 | Back / Forward / deep link | `/ops/earth?time=…08:00Z` · 1440×900 | PASS | `acceptance` "M15 · Back and Forward restore the scene and time with one renderer"; `journey` "Earth → Southeast Asia → Singapore → queue vessel, then browser back"; `journey` "deep link with time, layers and view reproduces the selection"; `gate` "invalid deep link returns to the nearest valid parent"; `handoff` back legs | — | One WebGL canvas after Back/Forward, no handoff frame left visible, clock time identical |
| M16 | Original URLs | `/region/…`, `/compare/…`, `/incidents/…`, `/corridors/RTE-SIN-RTM`, `/weather/WX-0001` | PASS | `routes` "v1 links redirect to their /ops equivalent"; `acceptance` "M16 · v1 corridor and weather links open their selection under /ops" | — | `t` becomes `time`; corridor → `route=`, weather → `hazard=` with the inspector open |
| M17 | Flight cancelled mid-load | `/ops/earth` · 1440×900 | PASS | `handoff` "Back mid-flight cancels the handoff and restores Earth"; `handoff` "Escape during a flight returns to the previous scene"; `acceptance` "M17 · a scene that fails to load keeps the last stable view, explains itself and retries" | `v2-phase9/13-scene-failure-retry.png` | Region geometry forced to HTTP 503: the globe stays active and frames the region, the alert offers Retry and Back, no handoff frame or hidden labels remain; Retry loads the extruded scene |
| M18 | Context loss / missing asset | `/ops/earth`, `/ops/port/PRT-SIN?view=2d` · 1440×900 | PASS | `resilience` "WebGL context loss shows a recovery banner and keeps the selection"; "without WebGL the map explains itself and search still works"; "basemap tile failure keeps the 2D port overlays and says why"; "a missing weather hazard dataset leaves route risk unknown, not clear"; "corrupted local storage falls back to the clean demo with a notice"; `acceptance` M17 (missing geometry) | — | Context loss is forced with `WEBGL_lose_context`; Retry 3D map restores the scene |
| M19 | Same vessel from Earth and region | `/ops/earth`, `/ops/region/REG-SEA` · 1440×900 | PASS | `acceptance` "M19 · searching VSL-0047 from Earth and from the region…" | — | Same ID, heading, silhouette model category, route progress, recent events and 3D pose model from both scopes |
| M20 | Reduced motion + keyboard | `/ops/region/REG-SEA?vessel=VSL-0047&panel=replay` · 1440×900 | PASS | `acceptance` "M20 · with reduced motion, keyboard drives 100× playback…"; `resilience` "reduced motion makes scope changes instant", "every button has an accessible name and focus is visible", "keyboard can walk the workspace without getting trapped"; `handoff` "reduced motion swaps scenes with a short crossfade", "Escape during a flight…"; `journey` "search and Escape keep focus management intact" | — | 100× ratio within ±15% with reduced motion, played and paused from the keyboard; Escape closes the inspector |

## Specific math and data assertions (spec 19)

| Assertion | Result | Where |
|---|---|---|
| VSL-0001 at anchor near Singapore, ~0.1 kn, no wake, no false moving track | PASS | `scripts/validate_data.py` (V2 module check), `ships` "region view draws per-type models with wakes only underway", unit `vessels3d.test.ts` and `clock.test.ts` |
| 100× follow demo uses VSL-0047 with validated underway keyframes | PASS | `validate_data.py` ("VSL-0047 follow demo keyframes — verified"), `follow`, `flagship` |
| PCL-0001 arrival 2026-11-09T04:00Z, estimated berth 2026-11-10T14:00Z (34 h), 26 h remaining at 12:00Z, not a confirmed slot | PASS | `validate_data.py`, `journey` port-call test, unit `value.test.ts` |
| VYG-0001 +18 h and $32k/day × 18/24 = $24,000; not attributed wholly to Singapore | PASS | `validate_data.py`, `gate`, `resilience` "incident exposure equals the voyage exposure for VYG-0001", `flagship` |
| Scrubbing never shows an incident opened later; no double counting | PASS | unit `replay.test.ts`, `flagship` step 10 |
| A vessel without a voyage renders no destination ETA or cost | PASS | unit `v2ui.test.ts` "a vessel without an assigned voyage shows no destination ETA, exposure or ETA peek" (added in Phase 9) |
| tracked / delayed / at-risk counts labelled with denominator and scope | PASS | unit `v2ui.test.ts` (rail "tracked · N in scope", "of N voyages"), `layout` density test |
| Known WGS84 port point stays in water/coast across globe/region/city/2D, no lon/lat swap | PASS | unit `projection.test.ts` round trips (Phase 2), `acceptance` M03 (marker vs projection), M11 (2D centre) |

## Visual regression

| Requirement | Result | Notes |
|---|---|---|
| Baselines at 1440×900 | PASS | 8 views in `tests/visual/*-desktop.png`, regenerated in Phase 9 with `--update-snapshots=all` |
| Baselines at 1920×1080 | PASS | 8 views in `tests/visual/*-1920.png` |
| 1280×800 | PARTIAL | Functional check only (`resilience` "1280 × 800 keeps the region journey working"); no pixel baselines |
| Smaller desktop size | NOT RUN | No pixel baselines; 200% zoom (720 px CSS) and tablet/list modes are covered functionally in `resilience` |
| Region rotated, port tilted, selected LOD2 vessel, 100× replay, hazard + route comparison, case action, 2D | PARTIAL | Evidence images exist (`v2-phase9/11`, `v2-phase4/port-sin-selected-vsl-0001.png`, `v2-phase9/07`, `08`, `09`, `12`) but they are not pixel baselines |

## Performance (spec 19)

Measured with `tests/e2e/perf.spec.ts` on Metal, 1440 × 900, 500 vessels on the global scene. Full figures:
`docs/PERF_REPORT.md`, raw JSON in `docs/perf/`.

| Metric | Value |
|---|---|
| First interactive | 0.64 s |
| FPS during Earth → region flight, p50 / p5 | 59.9 / 59.5 |
| FPS during orbit drag, p50 / p5 | 59.9 / 59.9 |
| Scope switch Earth → Southeast Asia (click → camera at rest, includes the cinematic handoff) | 2.77 s |
| Repeated switches, p50 / max | 2.86 s / 3.23 s |
| Draw calls: Earth / region / port twin | 34 / 246 / 55 |
| JS heap after warm-up → after 20 switches → after 60 switches | 25.7 → 26.6 → 26.9 MB |
| Input latency | NOT RUN (no automated measurement of pointer-to-frame latency) |
| Firefox / Safari | NOT RUN |

## Licensing, provenance and realism

| Check | Result | Notes |
|---|---|---|
| GPL-3.0-or-later attribution for code derived from the Three Scope Map skill | PASS | `package.json` `license`, `third_party/three-scope-map/` (LICENSE, NOTICE, CITATION.cff), SPDX file headers, on-map credit "Earth textures & country outlines via three-scope-map (GPL-3.0)" |
| Skill template integrity (`verify_template_integrity.py`) | PASS | "Bundled template integrity check passed: 31 files" (`docs/qa/v2-phase9/skill-checks.txt`) |
| Skill project check (`check_three_map_project.py --strict`) | Expected blockers | Exit 1: China one-to-one template files and effects are absent by design (D-001, TECHNICAL_DEVIATIONS); all privacy/scope checks pass |
| Geometry provenance | PASS | `public/geo/PROVENANCE.md` (Natural Earth, public domain) |
| Synthetic labelling, no live AIS claim | PASS | "Simulated" stamp, twin caption, legend footer "All vessel data synthetic"; `rg -i "\blive\b" src` finds no user-facing live claim |

## Defects found and fixed in Phase 9

- The replay compare table showed the raw stage key `OptionProposed`; it now uses the stage labels ("Option proposed").
- With the compare side panel open, the expanded replay bar wrapped and pushed content out of the rail. Follow and
  Note moved to the meta row, and `layout.spec.ts` covers this state.
- A region or city scene that failed to load left the URL on the new scope while the globe kept the old framing, with
  no message. The globe now frames the requested scope, an alert explains the failure, and Retry and Back are
  offered (M17).

## Deferred or not verified

- No manual (human) pass was performed. All results come from automated browser runs.
- Clicking a ship while playback is running (M07 is asserted with the clock paused).
- Pixel baselines at 1280×800 and a smaller desktop size, and baselines for rotated, tilted and LOD2 views.
- Input latency, Firefox and Safari, high-DPR displays.

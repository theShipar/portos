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

## D-007 Port 2D basemap
Deferred to Phase 4 (see BUILD_LOG). MapLibre style URL is configurable; without tiles the port view shows an honest
"basemap unavailable" state and still renders fixture geometry on a plain background.

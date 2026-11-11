# Multi-distance LOD and distant-ship aesthetics

**PORTOS V3 instruction 04-vessel-modeling-and-interaction/05**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Make distant ships recognizable and crisp without paying detailed-mesh cost everywhere.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Use screen-space projected vessel length thresholds: <4px cluster/dot; 4–16px oriented icon; 16–55px low-poly silhouette; 55–160px medium vessel; >160px near detailed model.
- **02.** Instanced 2D/3D icons cluster by zoom and vessel type; label priority for selected/important only.
- **03.** Fade/crossfade between LOD layers over 120–220ms with heading continuity and stable screen position.
- **04.** At low zoom, selected vessel gets readable halo and small forward-direction wedge, not a huge marker obscuring others.
- **05.** Global >500 vessels must render with batched draw calls and icon atlas; close LOD count capped by device quality.

## C. User-visible interactions and state transitions
- **01.** Zoom from Earth into port without popping from dot to giant plastic ship.
- **02.** Selected vessel stays visually tracked through LOD switches.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Crisp high-contrast silhouettes, type-aware outline, no white noisy sprites.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** ProjectedLengthPx, LODTier, GeometryCache, SelectedPriority, MarkerAtlas, DeviceBudget.

- Read canonical IDs and relationships from existing JSON/fixtures where available. Add a typed adapter and validation before introducing new fields.
- Every visual number includes metric meaning, unit, UTC time basis, and actual vs estimated vs simulated provenance.
- 3D mesh positions and hit targets derive from the same entity transform/ID as sidebar selection. Do not create a second fake map-only entity layer.
- If new data is required, add a deterministic synthetic fixture with referential integrity plus a migration note; do not silently overwrite existing fixture truth.
- Maintain URL/deep-link compatibility, role restrictions, localization-safe time formatting and logical keyboard access.

## F. Suggested engineering execution
1. Audit existing source paths and choose a non-destructive integration point; record exact component/route touched.
2. Define or extend typed props, domain entities, state selector(s), and view model(s) before writing shaders/UI.
3. Implement underlying behavior against seeded data; add unit tests for derived state and edge conditions.
4. Implement visual state and interactions; isolate Three.js GPU resources in owned lifecycles and dispose on unmount.
5. Wire camera, timeline, inspector and visual highlights through shared selected IDs/time, not independent local clocks.
6. Confirm desktop and mobile responsive forms and appropriate low-quality/2D fallback.
7. Run format/typecheck/build, browser interaction test, visual captures and benchmark. Log affected files and evidence.

## G. Specific acceptance criteria
- **01.** 500 vessel prototype at desktop stays interactive.
- **02.** No large flicker or reorientation during LOD transitions.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### Screen-space LOD table
| Projected length | Visual | Target |
|---|---|---|
| <4 px | Cluster/type dot | 1 draw-call batch |
| 4–16 px | Directional type-specific vector/icon | Stable, contrast-aware |
| 16–55 px | Top-down 3D low-poly silhouette | Heading + hull shape |
| 55–160 px | Medium-detail model | Cargo + bridge readable |
| >160 px | High-detail PBR model | Up-close orbit/inspection |

Hysteresis: enter detailed level only 10–20% above threshold; exit 10–20% below threshold to prevent rapid flicker. Selected vessel may stay one LOD above neighbors. Preserve same canonical origin/heading across all visual versions.

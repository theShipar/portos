# Position replay, vessels and route-follow synchronization

**PORTOS V3 instruction 07-simulation-control-and-workflows/03**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Demonstrate noticeable ship motion at accelerated time without teleporting or losing tracking.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Calculate time samples along route polyline, heading smoothly; sample buffers support lookahead rendering.
- **02.** A camera-follow mode operates in render time but target advances by simulation time; clamp smoothing to prevent 100x camera lag.
- **03.** For selected vessel show breadcrumb track of previous 6h/24h, traveled vs remaining route visually differentiated.
- **04.** Paused vessel and wake motion freeze; timeline resumes with no phase discontinuity.
- **05.** Stale/anchored ships do not move simply because speed is 100x.

## C. User-visible interactions and state transitions
- **01.** Selected VSL-0047 underway advances noticeably at 100x.
- **02.** Anchored VSL-0001 stays anchored unless scenario event changes state.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Trailing wake shortened and softened at far zoom; no repetitive pink squiggles.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** VesselTrackSample, InterpolationMode, CameraFollowTarget, StaleState, SegmentId.

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
- **01.** Position and event state deterministic at arbitrary seek time.
- **02.** No follow camera lag burst after seek.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.

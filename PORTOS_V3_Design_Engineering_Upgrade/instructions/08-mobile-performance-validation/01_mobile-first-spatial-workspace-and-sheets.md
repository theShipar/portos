# Mobile-first spatial workspace and sheets

**PORTOS V3 instruction 08-mobile-performance-validation/01**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Build genuine responsive behavior for a map-heavy simulation.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** At 390px portrait: top 56px command header, map full bleed, compact left/bottom utility, playbar and single bottom sheet with 3 snap points 20/55/92%.
- **02.** At tablet: optional split with 280px left rail and 360px inspect panel; at desktop drawer floats over map.
- **03.** Mobile follows vessel with ship reframed to safe top half, camera controls single finger pan/orbit and two-finger pinch.
- **04.** Long graphs become swipeable mini charts without requiring horizontal page scroll.
- **05.** On portrait switch 3D port complexity to quality preset mobile, keep actionable 2D alternative.

## C. User-visible interactions and state transitions
- **01.** Open vessel -> bottom sheet with mini model, route tracker, overview/cargo tabs.
- **02.** Scrub and follow usable with one hand; keyboard avoidance maintained.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Dark glass mobile sheet with modest blur and legible contrast; no tiny desktop panels squeezed.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** MobileViewportInsets, BottomSheetSnap, TouchAction, MobileQualityPreset, SafeCameraRect.

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
- **01.** 390x844 and 320x720 end-to-end demo works.
- **02.** No accidental page horizontal scrolling or obscured playback controls.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### Snap specification
`peek=20vh`, `half=55vh`, `full=92vh`; respect iOS safe-area insets. When a sheet opens, offset camera target so selected ship is in top ~45% of unobstructed canvas. Use one continuous docked sheet, not nested scrollable popovers. Drag handle gesture doesn't steal map pinch when pointer is outside sheet.

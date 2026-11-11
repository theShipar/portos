# Functional data, interaction and visual regression

**PORTOS V3 instruction 08-mobile-performance-validation/04**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Prove it works across all states rather than accepting static screenshots.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Unit test coordinate transforms, ETA math, cost rates, manifest relationships, berth occupancy, time replay invariance.
- **02.** E2E scripts Earth -> continent -> country -> city -> port -> ship -> cargo -> back with camera snapshots.
- **03.** Use seeded synthetic data; assert exact IDs and known event outcomes.
- **04.** Visual screenshots capture multiple orientations/viewport breakpoints, object hover/selection, scene handoff frames and 100x playback.
- **05.** Compare to reference intent and previous working routes; document defects as acceptance blockers.

## C. User-visible interactions and state transitions
- **01.** Deep link vessel from Earth and from port yields same canonical record.
- **02.** Playback 1x->100x->seek->pause->replay deterministic.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Check typography/spacing contrast after camera moves under glass panels.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** TestScenario, ScreenshotEvidence, EventAssertion, SchemaValidator, PerformanceTrace.

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
- **01.** All P0 E2E cases pass; no missing map after scope change.
- **02.** No KPI/cargo contradictions; report usable mobile.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.

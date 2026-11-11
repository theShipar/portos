# Art direction and visual hierarchy

**PORTOS V3 instruction 02-design-system/01**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Reach a restrained, elite industrial interface consistent with the supplied map, traffic, port and ship references.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Adopt near-black graphite (#0B1418), deep teal (#10252A), softened olive terrain, off-white (#EDF3F0) text, and sparse warm orange (#F29B57) for selected actions.
- **02.** Large cinematic map/3D ship owns 75–85% of desktop view when inspection drawers closed; no border-heavy dashboard grids.
- **03.** Hierarchy by surface depth: terrain/map behind -> edge washes -> floating HUD -> active inspector -> modal.
- **04.** Keep illustrations/data meaningful: shipping corridors, terminal activity, cargo slots, visual metrics; never decoration masquerading as signal.
- **05.** Use subtle grain only if legible; no aggressive bloom/glowing neon or gaming HUD corners.

## C. User-visible interactions and state transitions
- **01.** Idle state minimal, select state richer, incident state targeted.
- **02.** Dense monitoring is optional mode, not default.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Flat readable app against dynamic environmental image; preserve enough local contrast for labels.
- **02.** Distinct calm/attention/critical presentation.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** VisualTone, SurfaceLayer, SemanticStatus, MapContrastPreset, ReducedEffectsPreset.

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
- **01.** Compare pixel-aligned desktop screenshots against references without copying brand or misleading metrics.
- **02.** A new viewer can locate search, back, layers, follow, playback in under 5s.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.

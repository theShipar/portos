# Complete continent polygons and clean geometry

**PORTOS V3 instruction 03-earth-geographic-3d/03**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Fix current rectangular clipped land tiles by using full continent/coastal polygons and actual polygon extrusion.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Source continent from complete and validated multi-polygons; derive actual outer rings, holes, islands; do NOT crop GeoJSON to screen rectangle for the region surface.
- **02.** Project to local ENU/azimuthal projection suitable for selected region and triangulate holes; generate top faces, sidewalls and bevel highlights from boundaries.
- **03.** Normalize geometry origin to center and set scale to fit camera safe rectangle; calculate bounds from geometry, not bbox image/texture dimensions.
- **04.** Create full globe-to-continent level for Africa/Asia/Europe/Oceania/Americas; prioritize well-validated Southeast Asia region.
- **05.** World beyond selected landmass is either sea plane or sparse geographic context with no square clipping.

## C. User-visible interactions and state transitions
- **01.** Hover any country with mesh hit-testing; no cut border at data-tile edge.
- **02.** Rotate 360° around parent region; country boundaries remain correct from all angles.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Selection boundary slightly elevated and directional light catches side walls; avoid giant orange outline over every country.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** ContinentGeoCollection, PolygonWithHoles, ExtrudedRegionMesh, LocalProjection, CameraFitBounds.

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
- **01.** No visible rectangular plane or clipped continent corners.
- **02.** GeoJSON holes, islands and antimeridian regions validated.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### No-square-cutout acceptance geometry
Build extruded mesh from each validated Polygon/MultiPolygon ring, preserve island pieces, triangulate interior holes and build sidewalls only on actual coastline/boundary loops. A rectangular raster elevation texture may support **material shading only**; it may not define visible geometry silhouette. When projection bounds exceed the viewport, fit camera to mesh geometry, not crop it. Test Africa, Southeast Asia, Bangladesh, Singapore, Indonesia, Mediterranean, dateline-crossing island groups. Maintain mesh bounding boxes and screen-space clipped-pixel test screenshot.

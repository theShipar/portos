# Earth-to-independent-scene transition

**PORTOS V3 instruction 03-earth-geographic-3d/02**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Recreate reference: click a geographic scope and reveal a separate rotatable extruded landmass, not a zoomed piece of the same globe.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** World and regional scenes have separate renderer scene ownership but shared simulation and entity selection state.
- **02.** Preload target geometry/materials at low priority, render one complete hidden static frame, then reveal under Earth during camera dive.
- **03.** Animate camera toward selected footprint; blend globe into independent regional scene with composited mask, no empty frame.
- **04.** Release previous scene render-loop only when handoff completes; support back path to prior camera and preloaded globe.
- **05.** Guard rapid multi-click, back during transition, slow GeoJSON load and WebGL context loss.

## C. User-visible interactions and state transitions
- **01.** Click Southeast Asia -> prewarm -> camera dives -> isolated extruded region -> controls unlock.
- **02.** Back restores globe with same selected port and simulation timestamp.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Keep global context as faint perimeter edges or horizon; never show rectangular image tile.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** SceneTransitionState {idle,preparing,flight,handoff,active,returning,error}; SceneHandle, CameraBookmark.

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
- **01.** Video capture shows zero blank frames and full landmass during handoff.
- **02.** Interaction disabled only during narrowly defined transition phase.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### State transition pseudocode
```ts
async function enterRegion(regionId: string) {
  if (transition.phase !== 'idle') return;
  transition.phase = 'preparing';
  const sourceCamera = globeCamera.snapshot();
  const target = await sceneCache.prepareRegion(regionId); // validated complete GeoJSON
  await target.compileAndRenderStaticFrame();
  transition.phase = 'flight';
  await globeCamera.flyTo(target.anchor, { durationMs: 1100 });
  transition.phase = 'handoff';
  target.revealUnderGlobe();
  await crossfadeEarthToRegion({ durationMs: 280 });
  globeRenderer.pauseContinuousFrames();
  target.activateControls();
  nav.push({ scope: 'region', id: regionId, returnCamera: sourceCamera });
  transition.phase = 'active';
}
```
Use actual production source components and test existing emitted lifecycle events before applying this illustrative interface.

# Frosted glass panels and backdrop compositing

**PORTOS V3 instruction 02-design-system/05**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Build low-opacity blurred overlays that stay legible on moving 3D content and degrade gracefully.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Panel material: background rgba(14,26,29,.72–.88) + backdrop-filter blur(18px) saturate(110%); border rgba(255,255,255,.10); 1px bevel optional.
- **02.** Avoid blurring WebGL itself: blur only HUD backplates using composited CSS behind each card; do not use expensive fullscreen backdrop filter.
- **03.** Introduce 4 material tiers: HUD compact, inspector opaque, popover menu, modal blocking; more opaque for text density.
- **04.** When backdrop filter unsupported, use solid #182629 at >=95% opacity; when prefers-reduced-transparency, avoid glass.
- **05.** Contrast adaptive scrim uses sampled design regions/overlay presets, not frequent pixel reads from WebGL.

## C. User-visible interactions and state transitions
- **01.** Hover never makes the text harder to read.
- **02.** Panels transition opacity and translate only; do not animate expensive blur radius.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Avoid bright frosted white surfaces over dark maritime scene; reference is mostly graphite glass.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** surface.glass, surface.opaque, stroke.glass, shadow.panel, backdrop.blurPreset.

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
- **01.** GPU profiling shows no major compositor regressions with multiple panels.
- **02.** Text passes contrast over land/ocean/bright incident layer.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### CSS starting point
```css
.portos-glass {
  color: var(--text-primary);
  background: rgba(14, 26, 29, .82);
  border: 1px solid rgba(231, 242, 237, .10);
  border-radius: var(--radius-panel);
  backdrop-filter: blur(18px) saturate(110%);
  box-shadow: 0 12px 38px rgba(0,0,0,.20);
}
@supports not ((backdrop-filter: blur(1px))) {
  .portos-glass { background: #182629; }
}
@media (prefers-reduced-transparency: reduce) {
  .portos-glass { backdrop-filter: none; background: #182629; }
}
```
Avoid animated `backdrop-filter` blur. Opacity of info-heavy inspectors should be more solid than tiny map HUD chips.

# Urbanist typography and numeric typography

**PORTOS V3 instruction 02-design-system/03**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Make high-density operational information approachable, elegant and scan-friendly.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Use Urbanist via the application dependency/webfont route; do not bundle unlicensed font files into instructions. Font stack Urbanist, Inter, system-ui, sans-serif.
- **02.** Type sizes desktop: display 40/44 semibold; H1 28/34 semibold; H2 22/28 semibold; title 16/22 semibold; body 14/21; meta 12/17; technical label 11/14 uppercase only rarely.
- **03.** Font weights: 400 body, 500 metadata, 600 headings, 700 only exceptional KPIs; tracking -0.02em large headings, normal metadata.
- **04.** Use font-variant-numeric: tabular-nums for ETA, lat/lon, container counts, costs, dimensions and charts; use monospaced fallback for canonical IDs.
- **05.** All units and timestamps remain attached to values; format ISO UTC vs local clearly and maintain consistent rounding.

## C. User-visible interactions and state transitions
- **01.** Numbers visually animate without shifting width.
- **02.** Long vessel names ellipsize with full name on accessible tooltip.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Large KPI never overwhelms vessel or port visual; tight width caps.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** font.family, font.size.*, font.weight.*, lineHeight.*, tracking.*, numberFormat.*.

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
- **01.** All text fits at 200% zoom and 320px viewport.
- **02.** No text smaller than 12px for important mobile controls.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### CSS starting point
```css
:root { --font-ui: 'Urbanist', Inter, system-ui, sans-serif; }
body { font-family: var(--font-ui); font-size: 14px; line-height: 1.5; }
.kpi, .timestamp, .coordinates { font-variant-numeric: tabular-nums; }
.kpi { font-size: clamp(24px, 2.1vw, 36px); font-weight: 600; letter-spacing: -.02em; }
```
Load Urbanist through a legitimate dependency such as `@fontsource/urbanist` or approved project font service; retain fallback. Do not package font binaries with this kit.

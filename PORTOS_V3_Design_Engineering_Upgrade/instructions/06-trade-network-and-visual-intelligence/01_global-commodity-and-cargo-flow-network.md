# Global commodity and cargo flow network

**PORTOS V3 instruction 06-trade-network-and-visual-intelligence/01**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Make the shipping network an understandable map of where products physically move.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Represent port-to-port links from actual fixture shipment records and voyage assignments, not random decorative fly lines.
- **02.** Aggregate cargo volume by origin/destination, commodity group, TEU, tonnes or shipments; never sum incompatible units.
- **03.** Filter by commodity, region, cargo category, customer (if authorized), time range and operational state.
- **04.** Great-circle or route-polyline arcs with soft animated beads; line thickness = volume with legend and selected focus.
- **05.** Allow clicking route to list contributing voyages and shipments, then drilling down to vessel and container.

## C. User-visible interactions and state transitions
- **01.** Earth shows links only at aggregated density; region refines to ports; port shows actual shipments.
- **02.** Click route highlights both endpoint ports and current vessels.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Muted global network with orange selected flow, not a tangled neon spiderweb.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** FlowEdge {sourcePortId,targetPortId,commodityId,quantity,unit,period}, VoyageId, ShipmentIds.

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
- **01.** Every displayed line backed by shipment/voyage relationship.
- **02.** Totals consistent with selected filters.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### Unit correctness
Never add a shipment count to TEU or tonnes. `FlowEdge` groups by `commodity + unit + timeWindow` and port-pair; line-width normalization maps selected unit domain across displayed edges. When a port has two kinds of cargo, expose a segmented legend instead of a single misleading combined magnitude.

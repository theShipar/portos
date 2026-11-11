# Container vessel stack and stowage modeling

**PORTOS V3 instruction 04-vessel-modeling-and-interaction/03**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Create convincing large container ships with physical container stacks linked to cargo slot data.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** Model 20ft and 40ft ISO containers at scale using instanced geometry with correct row/bay/tier positions, gaps and corner castings stylized at high LOD.
- **02.** Generate believable variation in colors from subdued industrial palette; never random colors representing cargo status.
- **03.** Cargo manifest drives actual filled slots, mass/weight group and warnings; absence of manifest means generic anonymous stacks.
- **04.** Bridge/rear machinery and deck crane arrangements differ by vessel template; preserve max safe-stack height.
- **05.** Expose selected slot per bay-row-tier with outline and exploded gap animation only in detailed inspection mode.

## C. User-visible interactions and state transitions
- **01.** Click visible container -> material highlight -> linked cargo/shipment details.
- **02.** Filter cargo group makes other stacks translucent instead of deleting context.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Distinct ships carry different stack patterns and deck layouts.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** ContainerSlot {bay,row,tier,size,containerId}, StowagePlan, InstancedMeshIdMap, CargoGroup.

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
- **01.** Repeated containers remain pickable without one mesh per container.
- **02.** Cargo count/visual layout reconciles exactly with stowage records.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### Instanced picking contract
```ts
type SlotRef = { bay: number; row: number; tier: number; containerId: string };
const slotByInstanceId: SlotRef[] = [];
// At instancing time, map every valid stowage slot to the mesh instance index.
// On raycast result, use intersection.instanceId to look up the exact SlotRef.
// Never infer container ID by instance position after sorting/LOD changes.
```
Global LOD uses a texture/merged stack and disables single-container picking; switch into close-up/cargo-inspect tier before claiming selection. Highlight a selected instance with per-instance emissive/color data or an independent outline proxy.

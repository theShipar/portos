# One deterministic simulation clock

**PORTOS V3 instruction 07-simulation-control-and-workflows/01**  
**Priority:** P0 unless this feature is explicitly staged behind an already green gate.  
**Implementation mode:** Modify the existing PORTOS Vue + Three.js codebase; do **not** create a disconnected prototype or replace functional modules without regression evidence.

## A. Purpose and operational value
Ensure ships, routes, cranes, port queues, ETAs and KPIs all advance together.

**Definition of done:** A real browser interaction demonstrates the stated value with a valid selected entity, synchronized simulation time and existing application navigation preserved. Screenshots/mock data alone do not satisfy this instruction.

## B. Required implementation contract
- **01.** One global simulation clock stores baseUtc, elapsedRealSec, speedMultiplier, paused, seekTarget and scenario seed.
- **02.** Playback speed options 0.25,1,2,5,10,25,50,100x; 100x means 100 simulation seconds per wall second, not 100 WebGL frames.
- **03.** Derive positions and operational status from timestamped fixtures and pure functions; renderer never mutates canonical source state.
- **04.** Pause, seek, rewind and replay produce same outcome regardless of browser framerate; interpolate between fixed samples.
- **05.** Separate simulated mode from real data connectors; never present it as live AIS.

## C. User-visible interactions and state transitions
- **01.** At 100x every moving entity and port event advances coherently.
- **02.** Seek backward replays crane, queue and cargo states deterministically.

Provide idle, hover/focus, selected, loading, empty, stale, failed, disabled and restored state variants where applicable. The UI must not conceal absence of underlying data; show a reason and a recovery route. Click targets and hover preview must be separate.

## D. Visual and motion direction
- **01.** Large visible speed chip, animated timeline playhead and concise SIMULATED indicator.

**Global visual invariants:** Urbanist; deep graphite/teal background; refined dark low-opacity glass panels; orange reserved for active selection/action; calm nonselected geography; consistent 4px spacing tokens; no arbitrary font sizes or hard-coded cards. Aim for precise, sober industrial software consistent with `02-design-system` instructions and provided visual references—not neon sci-fi or playful SaaS design.

## E. Data and component contract
**Concepts:** SimulationClock, SpeedMultiplier, ScenarioSeed, EvalAtTime<T>, SnapshotState.

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
- **01.** Snapshot t0/t1 repeated renders are identical.
- **02.** No state desynchronization between 3D ship location and inspector timestamp.

**Mandatory regression checks:** Original Earth, regions, vessels, incident routes, role gating, 3D/2D mode, location search, simulation reset and back navigation still work. 100× playback must remain explicitly **simulated**. Build pass alone is not sufficient; verify rendered frame and pointer behavior.

## H. Dependencies and review
Read `AGENTS.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, and the related specs in this module before implementation. Where this V3 spec conflicts with older PORTOS V1/V2 UI styling, **V3 styling and visual behavior supersede**, but older validated datasets, business calculations, licensing requirements and working routes survive unless migrated with tests. Document any unsupported source datasets rather than fabricate readiness.


### Reference time arithmetic
```ts
type Clock = { baseUtcMs: number; startedRealMs: number; pausedAtMs?: number; speed: number };
const atRealTime = (clock: Clock, realMs: number) =>
  clock.pausedAtMs ?? clock.baseUtcMs + (realMs - clock.startedRealMs) * clock.speed;
// On speed change: snapshot current simulated UTC, reset baseUtcMs, startedRealMs, then set speed.
// Never multiply geometry velocity independently from entity simulation position.
```
Use a pure `stateAt(t)` evaluator for vessel position, crane phase, port queue occupancy, cargo custody, incident state and KPI. Ensure any scenario overrides are applied through stable event ordering and never mutate source fixtures.

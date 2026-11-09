# Codex Implementation Order and Gates

**Phase 0 — Inspect/verify.** Read all instructions, inspect Three Scope Map repo `SKILL.md`, README and template. Run Python validator and record GPL/data license constraints. Gate: all fixture keys valid and build environment understood.

**Phase 1 — Foundation.** Scaffold Vue 3/TS/Vite with router, central catalog/state, clock, design tokens, mapshell and mocked inspectable entities. Gate: typecheck/build + search opens a vessel inspector on a placeholder canvas (temporary placeholder allowed only in this internal phase).

**Phase 2 — Real globe.** Copy/integrate original Three.js skill components and texture hierarchy, adapt world/region geodata with proper coordinates. Gate: real WebGL visible in browser, no static image substitute, camera/region mode and back operate.

**Phase 3 — Spatial maritime layer.** Add ship LOD/instancing, port symbols, route geometry, selection and clustering. Gate: 500 entities render interactively; click Pacific Horizon and highlight a linked route.

**Phase 4 — Port detail.** Integrate MapLibre or equivalent 2D accurate port geo stage with licensed basemap, anchorage demo polygons, terminal/berth states and queue. Gate: Singapore queue and vessel inspectors reconcile, 3D/2D mode retains selection.

**Phase 5 — Operational math.** Implement shared ETA, congestion, cost and hazard calculations with provenance. Gate: +18h -> $24k calculation verified and global KPI deduplicates voyages.

**Phase 6 — Case workflow.** Implement incident lifecycle, actions and role guards with local persistence. Gate: INC-0001 transitions, reload maintains state, no fake message sent.

**Phase 7 — Replay.** Deterministic UTC clock, track interpolation, event timeline and historical port states. Gate: seeking to same time reproduces identical values and proper staleness.

**Phase 8 — QA and refine.** Build, typecheck, unit tests, browser E2E, 8 visual baselines, reduced motion, context-loss/missing-tile states and performance diagnostics. Gate: full demo works.

## Deliverable format after every phase

Provide concise status in `docs/BUILD_LOG.md`: implemented paths, tests run and exit codes, screenshots from real browser, blockers, workaround/limitations and next phase. Do not report 'completed' if the app does not render.

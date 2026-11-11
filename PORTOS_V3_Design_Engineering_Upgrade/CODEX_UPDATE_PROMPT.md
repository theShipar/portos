# Copy-paste prompt for Codex — PORTOS V3

You are updating the EXISTING PORTOS Vue + Three.js maritime app. Read `docs/portos-v3/AGENTS.md`, `README.md`, `PHASES_AND_GATES.md`, `DESIGN_TOKENS.md`, `REFERENCE_MAPPING.md`, `manifest.json`, and **all 64 files** in `instructions/`. Compare existing app and source to user screenshots in references. Also read the earlier `PORTOS_V2_Spatial_Upgrade` and the original 55-file `PORTOS_Codex_Master_Kit` specs if available. Do NOT rebuild from scratch.

## First task, before edits
1. Inventory components, scripts, actual three-scope-map usage, renderer scene graph, data schemas, routes, UI tokens and simulation implementation.
2. Identify current bugs visible in screenshots: giant rectangle clipped region terrain, weak country lift, sparse vessel LOD, primitive ships, map/inspector mismatch, heavy text panels, weak port models, route/camera continuity, mobile layout.
3. Produce a conflict-aware change manifest and executable gate plan. Preserve source, source licenses, route behavior and fixture IDs. Implement gate 0 audit tests.

## Implement one gate at a time
Follow `PHASES_AND_GATES.md`. Each gate: plan exact touched files -> code -> unit and interaction tests -> real browser render screenshot and short replay -> QA evidence -> fix failures before next gate. Use real mesh geometries, new dark glass visual system, Urbanist, consistent 4px spacing. Avoid substituting static images for functioning Three.js models.

## Core guaranteed acceptance
Earth -> **full** extruded Southeast Asia (not a rectangular cutout) -> hover lifts country clearly -> click Singapore -> port twin -> select a detailed container ship -> inspector 3D mini model + origin/destination tracker -> choose Follow Chase/Orbit/Above -> 100x visually advances underway vessels + cranes + cargo + events + timeline -> click container slot and show linked shipment -> show route/trade flow and interactive port performance report -> responsive mobile sheet.

Keep **SIMULATED** visible for synthetic data. Keep original data and incident workflows, prevent impossible motion, preserve 2D and report fallback. Tell me exactly what passed in browser; do not claim it works just because build succeeds.

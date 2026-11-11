# PORTOS V3 — Agent integration rules

1. Work in the EXISTING PORTOS repository. First inspect source, tests, routing, renderer, fixtures. Do not generate a new greenfield app.
2. Precedence for new visual work: `PORTOS V3` > `PORTOS V2` > original 55-file kit. Preserve tested business/data and licensing contracts unless changed via explicit migration.
3. Respect original `three-scope-map` source; **reuse**, do not re-create Earth from a screenshot or silently swap to Cesium/Globe.gl. The original template is China-oriented; international scenes require validated geometry, not fake square crops.
4. V3 design: Urbanist, dark graphite/teal, strong map, restrained orange semantic accent, dark glass, exact spacing and responsive behaviors. Do not use old white/orange styling as default.
5. Real geometry and physics-plausible motion: full-geometry region/country, near-correct scale, no fake rectangle, no teleporting vessel, no wake at anchor, no cargo manifests derived from 3D color.
6. Use one canonical simulation clock, even at 100×. Every vessel, crane, yard, port call, report and KPI derives state from same time.
7. Preserve original app controls: search, role, 2D view, incidents, weather, corridors, vessel inspection, pricing/calculations, event logs, simulated attribution.
8. Implement per gate in `PHASES_AND_GATES.md`. Show screenshots/visual QA evidence and ask for no broad confirmations; log design decisions in project. Failing P0 gate blocks next gate.
9. Performance: quality-tiered GPU assets, LOD/instancing, hidden RAF pause, disposal, 2D fallback. Distant ships must still read as ships.
10. Accessibility: keyboard, screen-reader alternate list, reduced motion, touch/mobile, legible contrast. No hover-only core workflow.
11. Simulated data is permanently labeled as such. Operational actions are local proposals and not navigation commands or live port slot requests.
12. Before claiming completion: typecheck, build, data validation, E2E, browser screenshots/videos across 1440x900/390x844, GPU/performance trace, license audit.
13. Avoid copying exact branding/copyright-protected reference design assets; reference design *principles*, not a 1:1 clone.
14. Never include downloadable font binaries. Obtain Urbanist from legitimate package/font source in target app.

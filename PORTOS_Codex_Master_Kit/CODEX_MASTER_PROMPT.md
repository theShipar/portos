# Paste this into Codex — PORTOS Build Master Prompt

You are the lead Vue/Three.js frontend engineer implementing PORTOS, a serious map-first maritime exception-management product. **This folder is the complete normative instruction kit.** Do not implement a generic dashboard or a static globe.

**First read in this order:** `AGENTS.md`, `START_HERE.md`, `instructions/INDEX.md`, `04_DATA_CONTRACTS.md`, `docs/IMPLEMENTATION_ORDER.md`, then the 55 specs for the current phase. Check `sample-data/manifest.json` and validate using `python3 scripts/validate_data.py`.

**Original 3D skill:** inspect and integrate https://github.com/songsummer920-dazzle/three-scope-map-skill and its `three-scope-map/SKILL.md`, README, Vue 3 components, texture assets, and validation scripts. Preserve attribution and GPL-3.0-or-later code notices. It is China-first, so adapt global region/camera behavior explicitly. Do not simply claim it supports ports and vessels out of the box; implement those systems.

**Target UX:** Near-white shell, dark navy maritime globe, restrained orange, Inter/IBM Plex Mono, 8px grid, precise spacing, floating controls and a ≤420px contextual inspector. The map is the interface; no card-grid dashboard. Earth -> regional corridor -> Singapore port (2D when needed) -> vessel -> incident -> comparison -> proposed action -> replay. Every control works.

**Data:** JSON fixtures are synthetic and deterministic. 500 vessels, 100 ports, 200 voyages, at least 50 linked incidents and multiple coherent risk cases. Never imply live AIS or certified navigation data. Shared selectors compute ETA shift, queue status, delay cost, KPI aggregates and timeline snapshots; don't hardcode numbers into UI.

**Do the following autonomously in phases and stop at each build gate:**
1. Audit workspace, license/data sources, scaffold Vue/Vite app and validate JSON.
2. Integrate real Three.js globe with global context and regional transitions.
3. Render vessel markers/low-poly hulls, ports, routes, selection, overlays and performance LOD.
4. Add port 2D spatial view, terminal/anchorage details and linked queue.
5. Implement ETA/port congestion/exposure/weather risk and screen view models.
6. Build six screen states, floating UI, details, incident workflow, local state and replay.
7. Run build/types/tests/browser visual QA; refine with screenshot evidence and performance report.

**Expected final result:** runnable frontend source with dev/build commands, honest validation results, screenshots, and a working end-to-end Singapore scenario with VSL-0001, VYG-0001, INC-0001, PRT-SIN. Track progress in `docs/BUILD_LOG.md` and clearly list blocked/incomplete work. Do not promise third-party integrations without credentials or licensing.

# START HERE — PORTOS Frontend Prototype

## Objective

Create a **functional, data-rich, map-first maritime command center** using the original Three Scope Map skill as the Three.js geographic foundation. White/off-white shell, deep navy map, restrained orange focus, technical compact typography and consistent 8px spacing. Every control behaves logically; operational values derive from JSON or explicit scenario rules. The deliverable is a runnable Vue application, not a Figma rendering.

## Deliverables Codex should produce

1. A functioning Vue 3 + Vite + TypeScript project with an actual Three.js spherical Earth and regional geographic drilldown.
2. 2D port-level map with vessel and port data, queues, terminals/anchorage demo overlays, contextual inspectors, search, filters and layer controls.
3. Six cohesive interface states: Earth, region, port, vessel/voyage, incident, route comparison and replay; implement all 55 specs.
4. JSON-backed 500-vessel/100-port/200-voyage world with deterministic synthetic history, selected Singapore scenario and calculations for ETA, congestion and exposure.
5. Browser-interactive action assignment and persistent local demo log; no real API calls required for baseline.
6. Unit/E2E/browser visual verification, setup instructions, screenshot evidence and honest limitations.

## What the original skill provides / does not

The repo provides a **China-first** Earth-to-China Vue template with textures, geographic extrusion, shaders, camera and 3D map effects. Do not assume it offers global maritime drilldown, ship/port models, nautical mapping, AIS services, or business workflows. Inspect original sources and adopt reusable methods rather than claiming a completely generic earth renderer exists. Never silently replace it with static concept art.

## Non-negotiable design

- Full-bleed global map is primary. No permanently visible sidebar of 30 cards.
- App base `#F6F7F8`, surfaces `#FFFFFF`, ink `#111827`, map ocean `#061A28`, accent `#E96722`; severity remains separate.
- Typographic system: Inter for UI and IBM Plex Mono for IDs, times, coordinates, knots and currency.
- At 1440x900, closed inspector leaves at least 80% central map area; open inspector target 380–420px right.
- Panels use 8px spacing unit, restrained 6–10px radius, 1px borders, clear focus rings, no glow-heavy game HUD.

## How to start

1. Copy this folder into an empty coding workspace.
2. Read and install (or access) the original Three Scope Map skill: https://github.com/songsummer920-dazzle/three-scope-map-skill . Respect attribution and GPL.
3. Open Codex in the folder and paste `CODEX_MASTER_PROMPT.md`.
4. Ask Codex to work phases in `docs/IMPLEMENTATION_ORDER.md`, maintain a build log, and demonstrate browser checkpoints after every phase.
5. Use JSON files as truth; run `python3 scripts/validate_data.py` before UI work and after changes.

## Definition of done

A real app starts on Earth. Search/select Singapore, dive to maritime region, enter detailed port map, select Pacific Horizon, inspect 18h forecast ETA shift and $24,000 estimated exposure, assign a draft follow-up, replay historical change, return to Earth. All values/positions in sync. Build, tests, performance diagnostics and browser QA documented, even if some noncritical cinematic polish remains pending.

**Not included:** actual live AIS, licensed navigation charts, operational routing authority, certified weather routing, payments, messaging or production authentication.

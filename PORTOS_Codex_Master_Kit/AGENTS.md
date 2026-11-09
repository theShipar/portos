# Codex rules — PORTOS

You are implementing a serious, production-inspired, **synthetic-data frontend prototype**. **Read the entire `START_HERE.md`, `instructions/INDEX.md`, `04_DATA_CONTRACTS.md`, and the files for your current build phase before coding.**

## Source of truth and precedence

1. Safety, legality and verifiable reality take precedence. Preserve GPL notices from the original Third-party Three Scope Map implementation.
2. Data contracts / schema / fixture relationships take precedence over UI copy.
3. Specific instruction files take precedence over general visual descriptions.
4. Keep core canvas 80–85% visible when inspectors are closed, with sane mobile fallback.
5. Never use generated screenshot art as a substitute for runtime WebGL.

## Engineering behavior

- Inspect https://github.com/songsummer920-dazzle/three-scope-map-skill and its `three-scope-map/SKILL.md` before integration. Copy the original complete Vue reference template when feasible; modify only with explicit functional reason. Acknowledge it is China-first and does NOT natively implement global maritime scenes.
- Use Vue 3, TypeScript, Vite, Three.js; MapLibre GL is permitted for local 2D port views with licensed basemaps. Maintain one selection store and one UTC simulation clock.
- Build modules sequentially. Each phase: list changed files, run relevant tests, open the app in a real browser and inspect rendering, update build log. Do not falsely claim tests were executed.
- Avoid unnecessary questions where defaults exist. If missing commercial API keys, proceed with synthetic data and say so.
- Do not embed arbitrary company/brand logos, copyrighted imagery, real ship AIS identities or fabricated navigationally correct charts.
- Each interaction (selection, zoom, layer, search, filter, replay, case state, draft action, comparison) must have real state change, visual result and validation.
- Route planned/observed/scenario overlays are distinct, labeled and selected from coherent data. Orange means focused/attention, red only severe risk.
- Use `sample-data/*.json` with stable IDs, `scripts/validate_data.py` checks and shared selectors. Do not fake disconnected KPI strings in Vue markup.
- Expose `Simulated` prominently near time/source, and confidence/data age on estimates. No 'live' badges unless connected to genuine production source.
- Business actions are demo-local drafts and proposed decisions. Never claim to notify a port agent or command a ship.

## Hard checkpoints

```txt
[ ] JSON validator passes
[ ] TypeScript typecheck passes
[ ] Vite production build passes
[ ] Camera, route, vessel, port, incident interactions seen in actual browser
[ ] Timeline scrubbing changes positions/KPIs consistently
[ ] Main viewport not displaced by cards
[ ] Missing/stale data communicated truthfully
[ ] No photo/SVG/CSS substitute for Three.js geographic scene
[ ] License and attribution preserved
[ ] Logs / screenshots report actual testing, not assumptions
```

If a checkpoint cannot pass, document concrete blocker rather than generating false success.

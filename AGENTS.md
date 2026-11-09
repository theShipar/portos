# PORTOS — agent rules

The normative instruction kit lives in `PORTOS_Codex_Master_Kit/` (read-only). Read its `AGENTS.md`,
`START_HERE.md`, `instructions/INDEX.md` and `04_DATA_CONTRACTS.md` before changing behaviour.

Overrides and resolved conflicts: `docs/DECISIONS.md` and `docs/TECHNICAL_DEVIATIONS.md`.

- Fixtures: edit `scripts/generate_demo_data.py`, regenerate into `sample-data/`, then run
  `python3 scripts/validate_data.py`. Never hand-edit `sample-data/*.json`.
- Engines (`src/engines`) are pure and never import from `src/map` or `src/components`.
- No KPI arithmetic in Vue templates or Three scenes; use selectors.
- Everything is synthetic: label it `Simulated`, never "live".
- Preserve GPL-3.0-or-later notices on code derived from the Three Scope Map skill.
- Log every phase in `docs/BUILD_LOG.md` with real command results.

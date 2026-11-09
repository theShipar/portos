# Build Log

Each entry records what was implemented, the commands actually run with exit codes, browser evidence and
blockers. Status values: implemented / tested / blocked.

## Phase 0 — Inspect and data repair

- **Implemented:** copied kit `scripts/`, `schemas/` to root; rewrote `scripts/generate_demo_data.py` (fixture v1.1,
  see DECISIONS D-006); extended `scripts/validate_data.py`; regenerated `sample-data/` and `schemas/`;
  `docs/DECISIONS.md`, `docs/TECHNICAL_DEVIATIONS.md`, root `AGENTS.md`.
- **Tested:**
  - `python3 ~/.cursor/skills/three-scope-map/scripts/verify_template_integrity.py` → exit 0 (31 files).
  - `python3 scripts/generate_demo_data.py` twice, SHA-1 of all fixtures identical (`d49fc5d4…`) → deterministic.
  - `python3 scripts/validate_data.py` → exit 0, PASS (500 vessels, 100 ports, 200 voyages, 12,789 positions,
    261 port calls, 50 incidents, 352 events; +18h / $24,000 verified).
  - `python3 scripts/build_schemas.py` → 16 schemas.
- **Browser evidence:** n/a (no UI in this phase).
- **Licensing:** skill is GPL-3.0-or-later; derived map code will carry SPDX + attribution. Port centroids are
  approximate; all operational data synthetic.
- **Blockers:** none. Basemap provider deferred to Phase 4 (D-007).

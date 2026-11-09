# PORTOS — Map-first Maritime Exception Management

A **complete 55-file Codex instruction kit** for a serious white/orange maritime operations frontend. It includes realistic linked **synthetic** JSON data, schemas, a deterministic demonstration engine, map/3D specifications, business logic, acceptance criteria and execution instructions.

The design must treat the map as a working spatial interface, **not a dense KPI dashboard**. Start at a global Three.js Earth, fly into Southeast Asia, focus Singapore, investigate a vessel, evaluate incident evidence, create a proposed action, and replay the scenario.

## Read in this order

1. `START_HERE.md` — boundaries, outcomes, installation and execution.
2. `AGENTS.md` — Codex rules in every phase.
3. `CODEX_MASTER_PROMPT.md` — initial Codex prompt.
4. `instructions/INDEX.md` — all 55 specifications by module.
5. `04_DATA_CONTRACTS.md` — entity schemas and numerical truths.
6. `docs/IMPLEMENTATION_ORDER.md` / `docs/DEMO_RUNBOOK.md` — phased build and end-to-end demonstration.

## Package scope

- 55 normative `.md` files in 10 modules, plus the master prompt, data contracts, runnable scripts and schema files.
- 500 simulated vessels, 100 ports, 200 voyages, at least 50 incidents, geographic areas, routes, synthetic track samples, port calls, weather hazards and action/event fixtures.
- All operational examples are illustrative, not live AIS or authoritative navigational data.

## Quick verification

```bash
python3 scripts/validate_data.py
python3 scripts/generate_demo_data.py --seed 92026 --output sample-data/
python3 scripts/validate_data.py
```

This ZIP **does not include a compiled Vue application** or the original third-party globe skill. Codex must install/review the linked original and implement in stages. The README and specs are a construction contract, not a guarantee of autonomous one-shot completion.

## Original map skill / licensing

Original skill: https://github.com/songsummer920-dazzle/three-scope-map-skill
Author: 宋夏天Dazzle. License: GPL-3.0-or-later. Preserve license/attribution in any copied code. Consult an IP lawyer before including its code in a proprietary commercial distribution. Review data, image, terrain and basemap license separately.

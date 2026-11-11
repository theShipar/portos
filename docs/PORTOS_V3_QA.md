# PORTOS V3 QA record

One entry per gate (`PORTOS_V3_Design_Engineering_Upgrade/PHASES_AND_GATES.md`). Each entry records source paths
changed, acceptance pass/fail, known deviations and a rollback path. Screenshots live in `docs/qa/v3-gN/` at
1440×900 (`desktop-*`) and 390×844 (`mobile-*`), written by `V3CAPTURE=gN npx playwright test v3capture`.

Result vocabulary: **PASS** = asserted by a passing automated test or verified on a captured screenshot (named);
**PARTIAL** = part of the requirement is covered, the rest is listed; **FAIL** = blocks the next gate.

## P0 rubric (SCOPE_AND_ACCEPTANCE.md) — status by gate

| # | P0 requirement | Gate | Status |
|---|---|---|---|
| 1 | Visual: map ≥ 75 % at 1440×900, Urbanist, token spacing, quiet glass | G1 | pending |
| 2 | Geographic: whole continent, no rectangular cutout, rotatable, country hover lifts top + sidewall, city/port drilldown | G2, G3 | pending |
| 3 | Vessel: type-differentiated near and far LOD, no popping, heading/status match, no wake when moored | G4 | pending |
| 4 | Inspection: 3D preview, origin → destination tracker, container/hold selection from fixture, correct shipment | G5 | pending |
| 5 | Simulation: pause/play/scrub, 1×–100×, one clock for movement/ETA/cargo/berth/KPI | G6 | pending |
| 6 | Ports: container and bulk twins distinct, cranes/berths/yard tied to operations | G7 | pending |
| 7 | Analytics: charts filter/highlight the map; port call timeline and trade flows aggregate correctly | G8 | pending |
| 8 | Usability: P0 actions at 1440×900 and 390×844, 2D fallback, no overlaps, accessible alternatives | G9 | pending |
| 9 | Operational truth: SIMULATED labelling, no live AIS / navigation / slot claims | all | pending |
| 10 | Engineering: build/typecheck/E2E/perf, licence review | G10 | pending |

## Gate 0 — Audit and freeze

- **Source paths:** `src/core/flags.ts` (V3 flags), `src/map/PortosEarthView.vue` (adapter exposes `flags`),
  `tests/e2e/helpers.ts`, `tests/e2e/v3capture.spec.ts`, `docs/PORTOS_V3_AUDIT.md`, `docs/portos-v3/README.md`.
- **Acceptance:**
  - Routes, renderer ownership and data schema documented: PASS (`docs/PORTOS_V3_AUDIT.md` §1–3).
  - All 64 specs mapped to modules with status and target gate: PASS (§4).
  - Baseline screenshots at 1440×900 and 390×844: PASS, 16 images in `docs/qa/v3-g0/`.
  - Smoke tests green: see BUILD_LOG "Phase V3-0".
  - Flags for glass UI, region extrusion, ship preview, port twin, trade BI and mobile: PASS (`flags.ts`, `?v3=0`).
- **Known deviations:** the kit is referenced in place at the repo root instead of copied to `docs/portos-v3/`
  (D-040).
- **Rollback:** revert the gate commit; flags default on but gate nothing yet.

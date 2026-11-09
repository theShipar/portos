# Codex Phase 03 — 03 Ships Ports Routes 3D

## Work request

Read module 04 and 05. Procedurally build 3D hulls in LOD and instanced markers. Bind 500 ships and 100 port positions; route waypoints, alert glyphs and weather overlays. Keep selected object and Earth > region nav stable.

## Required workflow

1. Confirm files/modules read and dependencies available, including original map skill for geographic phases.
2. Implement only this phase's scope; modify coherent source files, not unrelated modules.
3. Run tests/typecheck/build appropriate to phase and inspect the app in a real browser.
4. Write `docs/BUILD_LOG.md` entry: exact paths, actual test results, screenshots if applicable, remaining blockers.
5. Report not only what was coded but **what user-visible interaction now works**.

## Pass condition

500 simulated ships render; VSL-0001 selectable; no land-crossing fallback chords; performance reported.

Never call the product live AIS or operational navigation guidance. This is a synthetic scenario-based prototype.

# Codex Phase 07 — 07 History And Replay

## Work request

Read module 05 replay and module 08 simulation. Implement one UTC clock, 13 samples per vessel, events, time scrubbing, high-density event rail, confidence/stale states and comparison with now.

## Required workflow

1. Confirm files/modules read and dependencies available, including original map skill for geographic phases.
2. Implement only this phase's scope; modify coherent source files, not unrelated modules.
3. Run tests/typecheck/build appropriate to phase and inspect the app in a real browser.
4. Write `docs/BUILD_LOG.md` entry: exact paths, actual test results, screenshots if applicable, remaining blockers.
5. Report not only what was coded but **what user-visible interaction now works**.

## Pass condition

Scrubbing backwards/forwards restores deterministic position, ETA, queue, weather and incidents.

Never call the product live AIS or operational navigation guidance. This is a synthetic scenario-based prototype.

# Codex Phase 02 — 02 Globe And Geography

## Work request

Read module 03 and original GitHub Three Scope Map SKILL.md; preserve GPL attribution. Integrate the real 3D globe and Earth rendering; adapt global maritime region selection, coordinate transforms, East/Southeast Asia, global port markers, camera and back navigation.

## Required workflow

1. Confirm files/modules read and dependencies available, including original map skill for geographic phases.
2. Implement only this phase's scope; modify coherent source files, not unrelated modules.
3. Run tests/typecheck/build appropriate to phase and inspect the app in a real browser.
4. Write `docs/BUILD_LOG.md` entry: exact paths, actual test results, screenshots if applicable, remaining blockers.
5. Report not only what was coded but **what user-visible interaction now works**.

## Pass condition

WebGL canvas verified in actual browser; navigate Earth -> Southeast Asia -> Earth; no fake globe.

Never call the product live AIS or operational navigation guidance. This is a synthetic scenario-based prototype.

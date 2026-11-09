# Codex Phase 04 — 04 Port 2D Ux

## Work request

Read modules 03/04/05/07 port screen. Implement MapLibre 2D port detail with licensed basemap, Singapore anchored vessel positions, conceptual terminal/anchorage overlays, queue list, berth states and selection. Retain state between 3D and 2D.

## Required workflow

1. Confirm files/modules read and dependencies available, including original map skill for geographic phases.
2. Implement only this phase's scope; modify coherent source files, not unrelated modules.
3. Run tests/typecheck/build appropriate to phase and inspect the app in a real browser.
4. Write `docs/BUILD_LOG.md` entry: exact paths, actual test results, screenshots if applicable, remaining blockers.
5. Report not only what was coded but **what user-visible interaction now works**.

## Pass condition

Singapore waiting vessel positions line up with queue; select VSL-0001 from port map, same info as globe.

Never call the product live AIS or operational navigation guidance. This is a synthetic scenario-based prototype.

# Scope and binary acceptance rubric

**P0 must pass (do not claim complete without):**
1. Visual: 1440x900 screenshot shows map >=75% of usable area, Urbanist, correct token spacing, quiet glass, no unreadable overlaid text.
2. Geographic: whole continent geometry, no rectangular cutout; rotatable scene; country hover lifts entire top+sidewall; city and port drilldown works.
3. Vessel: type-differentiated recognizable ship at near and far LOD; no geometry popping; selected vessel heading and status match record; no wake on moored ships.
4. Inspection: 3D preview, origin→destination tracker, container/hold selection from actual fixture, correct associated shipment.
5. Simulation: bottom control can pause/play/scrub and run 1x–100x; movement/ETA/cargo/berth and KPI synchronize from one clock.
6. Ports: digital twin with at least container and bulk types distinct, cranes/berths/yard tied to operations, not arbitrary looping animations.
7. Analytics: report charts filter/highlight map geometry; port call timeline and trade-flow network aggregate correctly.
8. Usability: all P0 actions work at desktop 1440x900 and mobile 390x844; 2D fallback available; no overlapping controls; accessibility alternatives.
9. Operational truth: synthetic data labeled SIMULATED; no false live AIS, certified navigation, or real slot confirmation claim.
10. Engineering: source preserved, proper attribution/license reviewed, build/typecheck/E2E and performance passes.

**Out of scope unless later requested:** actual maritime navigation software, paid AIS account, port authority integration, commercial cargo documents, real dispatch, operational berth booking, certified hydrographic charts.

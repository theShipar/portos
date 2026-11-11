# PORTOS V3 — Delivery gates

## Gate 0 — Audit & freeze
**Required outcome:** Document routes, renderer ownership, data schema & screenshots; smoke tests green.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 1 — Design primitives
**Required outcome:** Urbanist, tokens, glass, grid, navbar, controls; 1440/390 screenshots.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 2 — Earth & clean continent handoff
**Required outcome:** Whole region extrusion, no rectangle, back stack, cinematic unblanked transition.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 3 — Country/city/port geographic UX
**Required outcome:** Aggressive country hover, contextual ghost lines, city/port navigation.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 4 — Ship geometry and distant LOD
**Required outcome:** Container/tanker/bulk/LNG recognizable; stable type-specific LOD.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 5 — Ship inspection/follow
**Required outcome:** Vessel panel 3D preview, camera modes, cargo interaction, URL state.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 6 — Unified clock & 100×
**Required outcome:** Accurate 100x move, full sync, seek/pause, cases consistent.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 7 — Port digital twins
**Required outcome:** Port type-specific models, cranes, operations, berth state + cargo.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 8 — Trade + visual BI
**Required outcome:** Data-backed routes, map-linked reports, interactive port/vessel charts.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 9 — Operations and mobile
**Required outcome:** Workflows, role gating, touch, safe sheets, keyboard fallbacks.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

## Gate 10 — Hardening and release
**Required outcome:** E2E/VRAM, source licenses, screenshots/video and changes recorded.
**Blocker examples:** non-working selected scope; data mismatch; blank canvas; inaccessible control; no screenshot evidence.
**Proof:** build/typecheck, specific spec acceptance, 1440×900 and 390×844 screenshots, event/timing notes, before/after from browser.

**Sequence contract:** do not advance merely because tests compile. Mark source paths changed, acceptance pass/fail, known deviations and a rollback path in `docs/PORTOS_V3_QA.md`.

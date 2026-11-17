# Desktop preview release — 17 November 2026

**Mobile is not ready yet.** This release is a desktop portfolio preview, not a production maritime service.

## Included

- Global fleet, regional/country/city geography, and illustrative port twins.
- Vessel and voyage investigation, case workflows, comparison, and replay.
- Synthetic terminal operations and expanded cargo inspection.
- Layer toolbar spacing improvements, 40%-width desktop inspector, and shared styled dropdowns.
- Expanded 3D viewer with blurred backdrop, compartment/slot selection, complete annotations, and Fit vessel.
- Updated README, seven-state screenshot gallery, setup guide, deployment guide, and explicit mobile limitations.

## Verification performed for this release

| Check | Result |
| --- | --- |
| Unit/component suite | 421 tests passed across 27 files |
| Synthetic fixture validator | Passed, including cargo/terminal invariants and flagship ETA/exposure scenario |
| Production build | TypeScript + Vite build checked by Vercel deployment |
| Manual desktop browser review | Globe, regional view, Singapore port, vessel inspector, cargo popup, incident investigation, container stowage |
| Recent interaction checks | 40% inspector width; compartment annotation updates; Escape dismissal; identity and cargo dropdown state updates |
| Full Playwright suite / visual-baseline refresh | Not run for this release |
| Mobile readiness | Not ready; not claimed as supported |

Historical reports remain in `docs/qa/` and the V2/V3 evidence documents. Their results belong to those builds. Screenshots under `docs/screenshots/` were captured from this release's local application and verified production deployment.

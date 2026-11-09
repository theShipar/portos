# Technical Deviations from the Three Scope Map Skill

Original skill: https://github.com/songsummer920-dazzle/three-scope-map-skill — author 宋夏天Dazzle,
GPL-3.0-or-later. Installed at `~/.cursor/skills/three-scope-map`. `verify_template_integrity.py` passed (31 files)
before any reuse.

PORTOS reuses techniques, not the one-to-one template (decision D-001). Code derived from the template carries
`SPDX-License-Identifier: GPL-3.0-or-later` and the non-visual attribution comment required by the skill.

| Skill rule | PORTOS behaviour | Reason |
|---|---|---|
| Copy `EarthView.vue` / `EarthChinaMap.vue` / `ChinaMap.vue` as one unit | New `PortosEarthView` built from the same techniques | Template is hard-wired to China (≈225 references); spec 03/01 forbids relabelling China or redirecting clicks to it |
| `#E8FF4F` side walls, `#D4F56A` contour, chase light, SVG HUD labels | Not used; token palette (`#061A28` ocean, `#E96722` focus) | PORTOS visual direction forbids neon HUD (02/01) |
| Earth → China cloud-dive handoff | Earth → region camera flight; region and port scopes driven by `regions.json` | Operational, not administrative, drilldown |
| Province/city/district drilldown | Earth → maritime region → port (2D) → vessel | Spec 03/03 |
| South China Sea inset | Not rendered | Not applicable to a global maritime scope |
| `check_three_map_project.py --strict` | Expected to report missing one-to-one effects | Intentional; reported in BUILD_LOG rather than "fixed" |

Kept from the skill: `world.earth-render.json` render cache for the globe (raw `world.json` not in the first-paint
bundle), Earth day/normal/specular/lights textures, batched `THREE.LineSegments` outlines, single active render loop
per scene, neutral black starfield backdrop, GSAP for camera orchestration.

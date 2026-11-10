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
| Globe rotates under a fixed camera | Globe fixed; camera orbits the centre (`OrbitControls` target = origin), pose = `{lat, lon, distance}` | Scope stack can save/restore one serialisable pose; picking, labels and overlays share world coordinates |
| Bloom / `EffectComposer`, ACES tone mapping | `NoToneMapping`, sRGB output, shaders end in `colorspace_fragment`; no post-processing | Token colours must render as specified (contrast), and one render pass keeps the 60 fps budget with 500 vessels |
| Country names as join keys | `ISO3166-1-Alpha-3` with an explicit fallback table (Natural Earth ships `-99` for France, Norway, Kosovo…) | Region membership must use stable IDs (FRA/NOR are in `REG-NEU`/`REG-MED`) |
| Fixed per-region camera distances | `regionPreset` fits region bounds to the live aspect, clamped to 0.75–1.35× of `regions.json` `cameraPreset.distance` (Earth radius 100 → 2) | Inspector, viewport and aspect changes keep the region framed without drifting far from the authored framing |
| Fly lines / chase-light paths for routes | `Line2` fat lines (pixel widths) on densified short-arc corridors; selected corridor `#FF905B` 3 px, others 1.25 px at 48 % | Spec 04/03: routes are evidence, not decoration; no animated flow |
| Scatter points for entities | Instanced, screen-sized vessel glyphs (LOD0 chevron → LOD1 class silhouette → LOD2 procedural hull) with back-hemisphere culling in the vertex shader; ports as instanced diamonds | 500 vessels in ≤ 8 vessel draw calls (one per visible class + two ring meshes); heading and class readable at every zoom |
| Port drilldown stays on the 3D map | Port (and optionally region) scope also renders as a 2D MapLibre map over OpenFreeMap tiles; the globe stays mounted with its loop stopped and the camera is handed across | Spec 03/03 port scope is a 2D working view (berths, anchorage, queue) where a sphere adds nothing; D-011 |
| Separate scene per drill level | V2 (D-032): globe for Earth; `Region3DScene` per region / country / city, cached LRU(3) by the `SpatialDirector`; all scenes share the globe's one `WebGLRenderer`, canvas and `InputRouter` | One WebGL context; the director cancels and restarts flights from the actual camera pose |
| Extruded province map (`ZhejiangThreeMap.vue`): `#E8FF4F` walls, neon contour, chase light, labels as sprites | `Region3DScene` keeps the structure (extruded `ShapeGeometry` tops with the skill's terrain normal/roughness maps, gradient side walls, hover lift, lit contour on the selected feature, orbit camera) in the V2 palette: land `#243A42`, scope `#2F4A54`, walls `#3A5560 → #0B1E28`, contour `#E66A2D`, no chase light, DOM labels | Spec 02/01 forbids neon HUD; labels share the overlay projection adapter with the globe |
| Map projection from the GeoJSON's own coordinates (`d3-geo` Mercator per province) | Per-scene projections in metres: spherical Lambert azimuthal equal-area for regions and countries, WGS84 local ENU for cities; both reversible (`lonLatToWorld` / `worldToLonLat`), world unit = 1 km, +x east, −z north | Equal-area frames keep berth/anchorage distances and areas honest across 3,000 km regions; ENU is metre-exact at city scale |
| Hazard and density fills painted on the surface | Planar scenes draw hazard outlines (fat lines) only; filled hazard hatching and traffic density stay on the globe's equirectangular overlay texture | The fill canvas is a whole-Earth equirectangular texture; reprojecting it per planar scene is deferred (outlines carry the same IDs and tooltips) |

Kept from the skill: `world.earth-render.json` render cache for the globe (raw `world.json` not in the first-paint
bundle), Earth day/normal/specular/lights textures, batched `THREE.LineSegments` outlines, single active render loop
per scene, neutral black starfield backdrop, GSAP for camera orchestration.

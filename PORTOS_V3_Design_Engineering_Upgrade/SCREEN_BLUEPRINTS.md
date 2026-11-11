# PORTOS V3 — Exact screen blueprints

**Intent:** Designers and Codex must build these as states of **one** map-first application, not disconnected product screenshots. The globe, extruded scenes, vessel preview, port scene and 2D map share one selection, UTC timeline and business logic. Default aesthetic: Urbanist; dark slate/teal environmental canvas; low-opacity local glass; restrained orange selected/focus state.

## Universal workstation frame (1440×900 reference)
- Main application header: 64px high. Logo/section at left, command search centered, SIMULATED UTC clock and Activity at right; no browser chrome painted by app.
- Map/scene stage: below header, full viewport to the bottom; no additional page scroll. Floating HUD overlays are positioned inside `safeRect` and not permanently docked in giant opaque columns.
- Breadcrumb: top-left aligned to 24px left / 20px below map top. Shows geographic path and selected object in one compact line; parent nodes clickable.
- Compact KPI rail: 3–4 metrics just below breadcrumb (or folded into top-right when selected object occupies that space). KPI rail max width ~560px and never competes with 3D silhouette.
- Tool stacks: right edge, away from open inspector; Scene 3D/2D, Layers, Compass/fit, Quality. Icon optical size 18–20px, target 40–44px.
- Active inspector: glass panel width 416px on desktop (range 360–464), aligned right 20px and bottom over timeline; its contents may scroll internally once; the map camera must reframe object in unobstructed region.
- Playback: centered bottom 64px above safe area; play/pause, speed selector, timeline, event markers and now; overlaps resolved by UI overlay manager.
- **Map visual share:** when no inspector, map remains visually dominant with overlays occupying under ~20% of usable area.

## 01. Global Earth
**Question:** Where are the fleet and high-impact disruptions?
- Physically believable Earth with subdued night lighting/atmosphere, subtle port points and aggregate shipping corridors; no fake continent grid crop.
- Default selection can be region with 3 strong floating visual KPIs, and ≤3 prioritized case previews, not permanent cards full of paragraphs.
- Hover region: coastline/area highlight and one compact card with vessels, delayed arrivals, most affected port. Click region enters staged Earth → independent scene transition.
- Global density: vessel type points / regional clusters and directional flow lines, never full glTF ship mesh for hundreds of objects.
- Primary actions: search vessel, select area, filter network, change timeline, open ranked incident.

## 02. Continent or maritime region — full extrusion
**Question:** Which corridor, country or port is experiencing the problem?
- Show **entire** target continent/region mesh free of rectangular texture/crop boundary; multi-island shapes and holes preserved.
- Foreground geographic plate: shaded graphite/terrain with meaningful subtle extruded sidewalls. Nonselected neighbor regions: low-alpha wireframe outlines; selected features rise visibly.
- On hover a country rises 12–20% of extrusion height and gets thin warm rim; moving pointer away reverses smoothly. Click country starts nested independent-scene zoom.
- Region-specific flow arcs, current vessel clusters, port locations and hazard zones are georeferenced and controlled by Layers.
- Rotation and pitch always available. All labels are collision-aware.

## 03. Country
**Question:** Which coastal city or port should I inspect?
- Selected country alone prominently framed; adjacent countries context as low-contrast outlines; coast is geographic silhouette, not a filled rectangle.
- Maritime cities/ports show impact markers whose size represents selected KPI (port waiting, cargo flow, delays); legend explicit.
- Hover city: anchor point, short visual KPI card, low-alpha catchment outline; click opens city/port gateway context.
- Sparse country without maritime ports: show gateway network links instead of fabricating a port.

## 04. Coastal city and port cluster
**Question:** How do the city's terminals and vessel flows interact?
- Rotatable 3D shoreline and water. Harbors/approaches, terminals and anchorages are clickable. 2D inspection mode enables precise map planning.
- At a glance: labeled terminal footprints with a mini berth utilization bar, 12–24h arrivals sparkline, waiting vessel count and port-specific exception.
- Click a port/terminal to fly into a detailed industrial site scene.
- Avoid filling city with decorative skyscrapers that don't matter to maritime operations.

## 05. Port Digital Twin
**Question:** What is happening at this port and what is likely to delay a voyage?
- Full stage becomes coherent port environment: cranes, quays, berths, container stacks, yard roads, tank/stockpile assets by port type and correctly scaled vessels.
- Left compact operations selector can switch Overview / Berths / Cargo / Congestion / Assets / Performance. Each mode changes physical overlays, not the entire application layout.
- Top-left only a short summary. Click berth -> occupancy/Gantt strip; click crane -> transfer phase/progress; click vessel -> ship inspector; click cargo stack -> yard/custody state.
- Visual cues: active equipment subtle motion, concern annotated, nonselected assets muted, no gratuitous glowing or continuous activity.

## 06. Vessel Intelligence
**Question:** Where is the vessel, what's it carrying, what is its voyage consequence?
- The vessel stays large and clearly visible on the 3D stage, with a glass inspector at right.
- Inspector top: vessel name, type, flag/status, source age; a **true interactive 3D mini-model** directly below (180–230px), with rotate and expand. No schematic-only placeholder.
- A clear linear **origin → current → destination** visual tracks progress using canonical route segments and exact ETA, not fake percentages.
- Four small metrics: speed (kn), distance to destination (nm), ETA shift (h), cost exposure (currency) or cargo load (TEU/tonnes) depending vessel archetype.
- Tabs Overview, Voyage, Cargo, Events, Documents; scroll only content below sticky tabs. Elevated alert is one annotated timeline event, not 3 warnings repeating same text.
- Follow modes: Chase, Above, Orbit, Deck, Free; camera transitions smooth and keep vessel centered in visible frame.

## 07. Cargo and vessel workshop
**Question:** Which cargo item or compartment is affected and where does it go?
- Fullscreen model workshop or expanded panel. 3D container ship with realistic stack pattern and physically selectable stowage slots; panel shows visual bay-row-tier grid.
- Click container: highlight mesh instance; dim surrounding stacks; show origin/destination, linked shipment, status, category/weight only for authorized role, and transfer event trail.
- `Explode` lifts cargo stacks/ship subassemblies solely for inspection, smoothly reversible. A tanker shows tank/hold compartments, not container placeholders.
- Side-by-side 3D vessel + route chain; camera focus uses selected stowage slot bounds. Cargo detail updates direct graph and filtered map network.

## 08. Trade network and spatial BI
**Question:** Where are products moving and what is the impact of disruption?
- Geographic directed port-to-port flows, thickness = selected consistent unit (TEU or tonnes, not both). Click links to expose contributing shipments/voyages.
- Visual charts: arrivals vs expected; port congestion timeline; berth Gantt; cargo throughput by commodity; cost exposure and uncertainty bands.
- Brushing an interval or selecting a bar highlights physical locations and vessels on the map. Map and charts use same UTC selection.
- Let operator pivot from port to route to a single shipment; never open a disconnected static report page by default.

## 09. Simulation control center
**Question:** What changed, what is likely next, and what happens at accelerated time?
- Persistent bottom time console. Play, Pause, relative skip, speed up to 100×, event tick selectors, UTC current time and reset.
- 100× visibly moves underway ships while anchored ships remain stationary; cranes, transfer events, berth occupancy, events and KPIs advance from same deterministic clock.
- Expose a compact mode chooser for Investigation / Replay / Forecast (where data supports); don't imply simulated future is live prediction.
- Decision comparison is a visual before/after overlay, no real vessel-control capability.

## 10. Mobile responsive (390×844)
- 56px header with name, search icon, simulation badge and menu. No cramped desktop nav tabs.
- Full-bleed 3D map in body. Contextual bottom sheet snaps at peek 20vh / half 55vh / full 92vh.
- Timeline minimized at bottom; expanding it takes over a bounded pane. Map camera reframes selected vessel into safe visible top 45% when sheet opens.
- Vessel preview can occupy sheet top, origin/destination row beneath, then metric tiles. Swipe tabs; no nested scroll labyrinth.
- Touch target ≥44px. Pinch/rotate vs tap discrimination; accessible list view for object selection; 2D fallback when device performance inadequate.

## Visual QA outputs required per state
Capture at 1440×900 and 390×844: idle, hover/selected, drawer opened, camera rotated, timeline moving, at 100×, no-data case, reduced-motion mode. Record whether the underlying user journey works, not just whether an image looks attractive.

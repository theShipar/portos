# PORTOS V3 — 3D asset standards, material/LOD and camera matrix

## Scene hierarchy
- `EarthScene`: WGS84 ellipsoid, atmosphere, land/albedo, ports, aggregated routes/vessels.
- `RegionScene`: **full polygon** top/sidewall extrusion (not square clipped), ghost surrounding world, thin geographic outlines, global vessels at local projection.
- `Country/CityScene`: smaller detail projection, clickable coast and coastal city markers; selected geography lifted and contextual neighbors subdued.
- `PortScene`: georeferenced local ENU industrial twin with quays/cranes/berths/ships/yards/roads and timed movement.
- `VesselWorkshopScene`: dedicated high-detail vessel inspection with slot picking and exploded view; shared canonical ship state.
- Ownership: exactly one active expensive continuous renderer. Preloaded inactive static frame permitted during handoff; dispose unused geometry/materials.

## Models by vessel class
| Type | Required recognizable structure | Relevant cargo interaction | Detailed mesh goal |
|---|---|---|---|
| Container | tapered bow, hull, aft bridge, multiple bay stacks | bay-row-tier instances and manifest | distinct stack pattern per vessel |
| Bulk | deep hull, hatch covers, own cranes optional | holds / tonnage | no fake containers |
| Oil/chemical tanker | pipes, manifold, vent/funnel, low deck | tanks / volume flow | meaningful berth jetty |
| LNG | characteristic containment system/domelike tank forms | cargo tanks and phase | no container props |
| Ro-Ro | tall car decks, loading ramp | deck/vehicle zones | ramp and terminal alignment |
| Ferry | passenger decks, open/closed passenger spaces | occupancy/vehicle zones | passenger-level data not present |
| Tug/pilot | small hull, working deck, heavy wheelhouse | support events | visible even near main ship |

## LOD selection
- <4px projected ship length: batched dot/cluster, maintain type/count semantics.
- 4–16px: directional type-specific icon; count constrained; one geometry atlas.
- 16–55px: low-poly hull/bridge silhouette, continuous heading and canonical waterline.
- 55–160px: instanced/deck/stack major details and subtle PBR materials.
- >160px: detailed inspection ship and cargo picking; focus one main asset, limited neighbors.
- Threshold hysteresis 10–20% to avoid sudden flicker. LOD swapping must never change reported coordinates/heading.

## Camera states
| Mode | Relative target | Behavior | User value |
|---|---|---|---|
| Earth Orbit | globe center/selected point | rotate, friction, fitted bounds | portfolio/location context |
| Region Isometric | geographic center | perspective 30–55° pitch, 360° orbit | strong extruded regional view |
| Country/City | footprint center or port cluster | camera fit safe rectangle | coastline and port identification |
| Port Survey | local scene extent | oblique or top-down, rotate | equipment and queue operations |
| Vessel Chase | aft at 1.3 ship lengths | damped follow + heading | cinematic progress inspection |
| Vessel Above | top-oblique ship center | high angle, retain waterline | stowage and route orientation |
| Vessel Orbit | ship origin | independent bounded orbit | detailed vessel model |
| Deck | safe configured visual anchor | non-interactive viewpoint, view only | immersive ship inspection |
| Free Camera | user position | pan/tilt/zoom; return-to-ship | port/vessel comparison |

## Procedural geometry and materials
- Hull cross-section loft with normals and believable silhouette; +Y up, +Z vessel forward; WGS84 heading conversion unit-tested.
- Deck PBR metal, roughness 0.45–0.9 depending asset; subtle contact ambient occlusion. No plastic neon ships.
- Cargo containers 20/40ft ratio, textured panel grooves optional at near LOD, instanced meshes with `instanceId -> slot` map.
- Port cranes use subassemblies with animated joints; event-driven transforms only. Rail/truck components use simplified meshes/instances.
- Ocean uses modest shader displacement near port and non-destructive reflection; no massive polygon count from decorative foam.
- World lines should be map-scale antialiased; route and ship movement overlays distinct from land outlines.

## Performance and behavior tests
- Budget target 60fps desktop on representative 1440px hardware, 30fps mobile mid-tier; adaptive pixel ratio and quality.
- When switching port scenes repeatedly, GPU memory and active render loop count remain bounded.
- Screenshot tests distant ships at each projected LOD scale; a user should distinguish a cargo vessel vs tanker without opening its sidebar at medium zoom.
- 100x playback follows actual deterministic path and freezes wake correctly on pause. No selected object drifts away from marker.

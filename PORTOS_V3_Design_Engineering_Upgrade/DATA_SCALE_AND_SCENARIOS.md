# PORTOS V3 — Connected synthetic dataset scale and flagship scenarios

The goal is **rich interaction with referential integrity**, not big arbitrary counters. Existing PORTOS seed data from earlier kit is the starting point; do not corrupt its 500 vessels / 100 ports / 200 voyages and current incident identity. Larger dataset targets below are optional expansion stages and must be generated deterministically from validated schemas.

## Suggested staged scale (prototype, not a claim of real AIS)
| Entity | First demonstrable slice | Large presentation dataset | Validation constraints |
|---|---:|---:|---|
| Vessels | 50 (from existing sample) | 1,500 | recognizable type; at least one position record per visualized vessel |
| Ports | 25 | 250 | geographic coordinates and country/port type |
| Terminals | 10 | 600 | each belongs to exactly one port |
| Berths | 40 | 2,400 | valid terminal/capacity/geometric anchoring |
| Cranes/equipment | 60 | 8,000 | port/terminal references; movement bound to events |
| Active voyages | 80 | 2,500 | valid origin/destination ports and vessel assignments |
| Historical position samples | 10,000 | 300,000 (chunked) | ordered UTC and plausible speed/course |
| Cargo units/containers | 1,000 | 40,000 | unique location at each simulated timestamp |
| Transfer events | 2,000 | 120,000 | valid container/port/vessel/yard linkages |
| Trade flows | 80 | 3,000 | source/destination ports and unit-specific quantity |
| Incident/event records | 60 | 3,500 | entity/time association and status transitions |
| Hazard snapshots | 30 | 1,000 | valid forecast time windows / sources |

## File partitioning and runtime
- JSON files divided by entity domain and region/month. Do not import 300k position samples into the first paint bundle. Use Vite dynamic imports/worker-managed chunks and indexed in-memory caches for simulation.
- `shipModels.json`: archetype/asset URL/dimension/LOD manifest; actual geometry loaded on demand.
- `worldRegions.json`, `regions/<regionId>.geojson`, `country/<code>.geojson`: preserve full complex coastal geometry; preprocessed render caches separate from raw source.
- `ports.json`, `terminals.json`, `berths.json`, `portAssets.json`: spatial layers.
- `vessels.json`, `voyages.json`, `positions/<vessel>/<window>.json`, `routeSegments.json`: tracking.
- `cargoUnits.json`, `stowagePlans.json`, `shipments.json`, `transferEvents.json`, `yardSlots.json`: cargo traceability.
- `incidents.json`, `weatherHazards.json`, `decisions.json`, `kpiSnapshots.json`: operational logic.

## Single shared entity graph
`region -> country -> city -> port -> terminal -> berth` and `vessel -> voyage -> portCall -> berth`; `vessel -> stowagePlan -> containerSlot -> container -> shipment -> originPort/destinationPort`; `incident -> vessel/port/route/weather` with stable IDs. Any node selected on 3D map resolves to one canonical entity; UI does not duplicate disconnected identity rows.

## Flagship scenarios
1. **Earth to Singapore port:** select Southeast Asia, hover country with unmistakable lift, enter Singapore, port 3D environment, inspect berth/arrival queue (validated geospatial and physical models).
2. **Detailed underway ship at 100×:** select underway demo ship (prefer previously designated VSL-0047 if it remains valid in current data), follow Chase and Above, show correct heading/wake and distance/ETA, simulate one day without ship crossing land.
3. **Anchored ship exception:** keep existing anchored fixture (earlier VSL-0001 where applicable) stationary, highlight berth wait; show the difference between a predicted wait, confirmed slot and source age.
4. **Interactive cargo loading:** a container ship with 800 visible synthetic container slots, show only filled slots from stowagePlan; select a container, trace shipment, animate crane unloading into yard at scheduled timestamp.
5. **Bulk vs LNG port types:** switch facility and show different quay geometry, cargo unit and throughput KPI; no shared container illustrations.
6. **Global trade network:** hover Singapore → Rotterdam flow, filter TEU, show visually linked route and underlying shipment count; drill into one vessel and container.
7. **Weather event:** highlight bounded hazard and intersecting voyage segment, review ETA impact with confidence; no navigation claim.
8. **Mobile dispatcher:** open vessel bottom sheet, timeline speed 100x and cargo preview on 390×844 with correct camera reframing.

## Numeric correctness and deterministic time
- All calculations use `atTimeUtc(t)` and one central scenario seed; no UI-generated random numbers at runtime.
- `remainingDistanceNm` follows route polyline projected position, not direct straight-line if corridor passes chokepoints.
- `delayExposureUsd = max(0, etaShiftHours) / 24 * dailyDelayRateUsd`; distinguish delay cost model vs confirmed invoiced cost.
- `berthOccupiedAt(t)` depends on intervals and actual selected scenario override; exact same calculation drives map status and reports.
- `containerLocationAt(t)` resolves exactly one location: vessel slot, crane transfer, yard slot, truck, gate, or unknown; never two simultaneously.
- AIS freshness: `lastReportUtc`; simulated playback may extrapolate only where scenario explicitly provides future samples.
- For 100x, animation rendering interpolates between deterministic samples; FPS change does not affect simulation positions.

## Validator invariants
- No orphan IDs, duplicate canonical IDs, impossible voyage after cancellation, cargo in two locations, backdated container scan, or incompatible cost currencies.
- No land-crossing route segment except explicitly recognized canal/dock traversal. No vessels assigned as moored to two different berths at the same UTC instant.
- All geometries share WGS84 anchor conventions. Every time-dependent KPI/annotation is recomputed after seek rather than carried from prior frame.
- Clearly identify synthetic fixtures in application and exported reports. Do not imply presence of paid data connectors without verifying access.

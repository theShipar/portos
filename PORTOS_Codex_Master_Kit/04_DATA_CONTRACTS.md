# PORTOS Shared Data Contracts

## Rules

All operational JSON is **synthetic**, **not live AIS**, and **not appropriate for navigation**. Every entity has immutable unique ID. Coordinates WGS84 `{lon,lat}`; timestamps ISO 8601 UTC `Z`; speed knots; route distance nautical miles; financial estimates USD. `null` means unavailable and is never silently coerced to 0. IDs resolve before the renderer initializes.

## Entity references

- Vessel `VSL-*`: position samples, class, IMO/MMSI demo identifiers if provided, nav status, source age, voyage link.
- Port `PRT-*`: name, country, approximate longitude/latitude, port timezone, terminals/anchorages and operational state.
- Voyage `VYG-*`: vessel/origin/destination/route link, departure, planned ETA, estimated ETA, scenario delay cost assumption, current stage.
- Route `RTE-*`: corridor, origin/destination port IDs and water-oriented conceptual waypoints; do not assert nautical safety.
- Port call `PCL-*`: port, vessel, voyage, waitingSinceUtc?, estimatedBerthUtc?, terminal/berth? and status.
- Positions `POS-*`: vessel ID, timestamp, lon, lat, sogKn, cogDeg, navStatus, source type.
- Incident `INC-*`: entity references, severity, status, openedAtUtc, evidenceIds[] and scenario origin.
- Weather `WX-*`: issued/valid UTC timestamps, polygon, severity, affected routes and quality.
- Event `EVT-*`: occurred/ingested UTC, event type, entity references, payload and provenance.
- User `USR-*`: role and synthetic identity used only for local demo decisions.

## Primary scenario

At simulation time `2026-11-09T12:00:00Z`, `VSL-0001` **MV Pacific Horizon** is associated with voyage `VYG-0001` and Singapore port `PRT-SIN`, with incident `INC-0001`. Planned ETA Rotterdam vs forecast ETA differ by **+18 hours**. With `dailyDelayCostUsd = 32000`, demo formula `18/24 * 32000 = USD 24000`. This is estimated exposure, not contractual demurrage or invoice. Keep all views mathematically synchronized.

## Required selectors

```ts
type GeoPoint = {lon:number; lat:number};
type EntityRef = {kind:'vessel'|'port'|'voyage'|'incident'|'route'|'weather'; id:string};
type Quality = 'synthetic'|'derived'|'unknown'|'stale';
interface SelectedObject {kind:EntityRef['kind']; id:string; selectedAtUtc:string}
interface EtaResult {plannedArrivalUtc:string|null; estimatedArrivalUtc:string|null; etaShiftMinutes:number|null; confidence:'high'|'medium'|'low'|'unknown'; sourceType:string; asOfUtc:string}
interface ExposureEstimate {voyageId:string; hours:number|null; dailyDelayCostUsd:number|null; estimatedUsd:number|null; confidence:string; explanation:string}
interface UiView {mode:'earth'|'region3d'|'port2d'; selected:SelectedObject|null; activeLayers:string[]; simulationTimeUtc:string}
```

All selectors accept catalog and simulation time explicitly. They must produce same answer across global KPI, vessel, incident and export. No component-specific arithmetic.

## Basemap and scope boundaries

The original Earth-to-China skill is reusable technology, not universal geographic data. Regional geometry must be loaded/validated for every new scope. Port microgeometry/terminal schematic is demonstrative unless supported by licensed source; no navigation claims.

export type GeoPoint = { lon: number; lat: number };
export type Bounds = { west: number; south: number; east: number; north: number };
export type IsoUtc = string;

export type EntityKind = 'vessel' | 'port' | 'voyage' | 'incident' | 'route' | 'weather' | 'region';
export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export type Quality = 'synthetic' | 'derived' | 'unknown' | 'stale' | 'assumption';
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
export type NavStatus = 'underway' | 'at_anchor' | 'moored' | 'not_under_command' | 'unknown';
export type Severity = 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'acknowledged' | 'investigating' | 'mitigation_planned' | 'monitoring' | 'resolved';
export type BerthStatus = 'occupied' | 'scheduled' | 'unavailable' | 'free' | 'unknown';
export type Role = 'viewer' | 'analyst' | 'dispatcher' | 'manager';

export interface CameraPresetData {
  distance: number;
  headingDeg: number;
  pitchDeg: number;
}

export interface Region {
  regionId: string;
  name: string;
  kind: 'maritime-region';
  bounds: Bounds;
  center: GeoPoint;
  countryIso3: string[];
  portIds: string[];
  cameraPreset: CameraPresetData;
  sourceType: string;
}

export interface Port {
  portId: string;
  name: string;
  countryIso2: string;
  location: GeoPoint;
  timeZone: string;
  regionId: string;
  terminalIds: string[];
  sourceType: string;
  syntheticOperationalData: boolean;
  lastUpdatedUtc: IsoUtc;
}

export interface Terminal {
  terminalId: string;
  portId: string;
  name: string;
  location: GeoPoint;
  berthIds: string[];
  sourceType: string;
}

export interface Berth {
  berthId: string;
  portId: string;
  terminalId: string;
  name: string;
  location: GeoPoint;
  status: BerthStatus;
  occupiedByVesselId: string | null;
  scheduledVesselId: string | null;
  scheduledWindowStartUtc: IsoUtc | null;
  scheduledWindowEndUtc: IsoUtc | null;
  lastUpdatedUtc: IsoUtc;
  sourceType: string;
}

export interface Anchorage {
  anchorageId: string;
  portId: string;
  name: string;
  polygon: GeoPoint[];
  capacityEstimate: number | null;
  sourceType: string;
}

export interface Route {
  routeId: string;
  originPortId: string;
  destinationPortId: string;
  corridorId: string;
  corridorName: string;
  waypoints: GeoPoint[];
  distanceNmEstimate: number;
  isScenarioAlternative: boolean;
  provenance: 'synthetic';
  sourceType: string;
}

export interface Vessel {
  vesselId: string;
  name: string;
  vesselType: string;
  imoDemo: string;
  flagCountryIso2: string;
  lengthMeters: number;
  beamMeters: number;
  draughtMeters: number;
  navStatus: NavStatus;
  currentVoyageId: string | null;
  lastKnownPosition: GeoPoint;
  sogKn: number | null;
  cogDeg: number | null;
  lastReportedAtUtc: IsoUtc;
  fleet: 'own' | 'ambient';
  sourceType: string;
}

export interface Voyage {
  voyageId: string;
  vesselId: string;
  originPortId: string;
  destinationPortId: string;
  routeId: string;
  plannedDepartureUtc: IsoUtc;
  estimatedDepartureUtc: IsoUtc;
  departedAtUtc: IsoUtc | null;
  plannedArrivalUtc: IsoUtc | null;
  estimatedArrivalUtc: IsoUtc | null;
  estimatedAsOfUtc: IsoUtc;
  etaConfidence: Confidence;
  dailyDelayCostUsd: number | null;
  routeProgressAsOf: number;
  remainingNmAsOf: number;
  currentStage: 'in_transit' | 'awaiting_berth' | 'awaiting_departure' | 'arrived';
  sourceType: string;
}

export interface PositionSample {
  positionId: string;
  vesselId: string;
  timestampUtc: IsoUtc;
  location: GeoPoint;
  sogKn: number | null;
  cogDeg: number | null;
  navStatus: NavStatus;
  sourceType: string;
}

export interface PortCall {
  portCallId: string;
  portId: string;
  vesselId: string;
  voyageId: string | null;
  arrivalAtUtc: IsoUtc;
  waitingSinceUtc: IsoUtc | null;
  estimatedBerthUtc: IsoUtc | null;
  status: 'awaiting_berth' | 'scheduled' | 'at_berth';
  terminalId: string | null;
  berthId: string | null;
  sourceType: string;
}

export interface Incident {
  incidentId: string;
  title: string;
  vesselId: string;
  voyageId: string;
  portId: string;
  entityRefs: EntityRef[];
  category: string;
  severity: Severity;
  status: IncidentStatus;
  openedAtUtc: IsoUtc;
  detectedAtUtc: IsoUtc;
  acknowledgedAtUtc: IsoUtc | null;
  resolvedAtUtc: IsoUtc | null;
  ownerUserId: string | null;
  evidenceIds: string[];
  actionIds: string[];
  scenarioId: string;
  sourceType: string;
}

export interface Evidence {
  evidenceId: string;
  sourceType: string;
  sourceId: string;
  observedAtUtc: IsoUtc;
  receivedAtUtc: IsoUtc;
  entityRef: EntityRef;
  field: string;
  value: unknown;
  unit: string | null;
  quality: Quality;
}

export interface WeatherHazard {
  hazardId: string;
  type: string;
  severity: 'moderate' | 'high' | 'severe';
  polygon: GeoPoint[];
  issuedAtUtc: IsoUtc;
  validFromUtc: IsoUtc;
  validToUtc: IsoUtc;
  affectedRouteIds: string[];
  affectedVoyageIds: string[];
  sourceType: string;
  confidence: Confidence;
}

export type EventType =
  | 'AIS_REPORT'
  | 'ETA_REVISED'
  | 'ANCHORAGE_ENTER'
  | 'ANCHORAGE_EXIT'
  | 'BERTH_SCHEDULED'
  | 'BERTH_OCCUPIED'
  | 'WEATHER_WARNING_ISSUED'
  | 'INCIDENT_OPENED'
  | 'INCIDENT_ACKNOWLEDGED'
  | 'ACTION_ASSIGNED'
  | 'INCIDENT_RESOLVED'
  | 'PORT_WAIT_UPDATED'
  | 'PORT_QUEUE_JOINED'
  | 'BERTH_ESTIMATE_UPDATED';

export interface TimelineEvent {
  eventId: string;
  type: EventType;
  occurredAtUtc: IsoUtc;
  ingestedAtUtc: IsoUtc;
  entityRefs: EntityRef[];
  payload: Record<string, unknown>;
  sourceType: string;
  quality: Quality;
}

export interface User {
  userId: string;
  displayName: string;
  role: Role;
  title: string;
  organizationId: string;
  defaultWorkspace: string;
  permissionFlags: string[];
  locale: string;
  timeZone: string;
  sourceType: string;
}

export interface Manifest {
  dataset: string;
  version: string;
  scenarioVersion?: string;
  seed: number;
  fixedScenarioTimeUtc: IsoUtc;
  generatedAtUtc: IsoUtc;
  replayRange: { startUtc: IsoUtc; endUtc: IsoUtc };
  sourceDisclosure: string;
  counts: Record<string, number>;
  scenario: {
    vesselId: string;
    vesselName: string;
    voyageId: string;
    incidentId: string;
    portId: string;
    destinationPortId: string;
    routeId: string;
    alternativeRouteId: string;
    weatherHazardId: string;
    etaShiftHours: number;
    dailyDelayCostUsd: number;
    expectedEstimatedExposureUsd: number;
  };
  scenarios: string[];
}

/* ---------------- V2 scenario module (sample-data/v2, fixture v2.0) ---------------- */

/** DCSA just-in-time classifiers: estimated, requested, planned, actual. */
export type DcsaClassifier = 'EST' | 'REQ' | 'PLN' | 'ACT';

export interface BerthMilestone {
  eventType: 'ARRIVAL' | 'DEPARTURE';
  location: 'BERTH' | 'PBP';
  classifier: DcsaClassifier;
  atUtc: IsoUtc;
  recordedAtUtc: IsoUtc;
}

export interface BerthBooking {
  bookingId: string;
  portCallId: string;
  vesselId: string;
  berthId: string | null;
  terminalId: string | null;
  status: PortCall['status'];
  bufferMinutes: number;
  milestones: BerthMilestone[];
}

export interface LayoutBerth {
  berthId: string;
  center: GeoPoint;
  quayBearingDeg: number;
  lengthMeters: number;
  depthMeters: number;
  craneCount: number;
  /** Always false: draft, tide, services and policy are not modelled. */
  constraintsValidated: false;
}

export interface LayoutTerminal {
  terminalId: string;
  name: string;
  quayBearingDeg: number;
  quayLine: GeoPoint[];
  landSide: 'north' | 'east' | 'south' | 'west';
  yardDepthMeters: number;
  berths: LayoutBerth[];
}

export interface PortLayout {
  portId: string;
  detail: 'flagship' | 'procedural';
  cityId: string;
  bounds: Bounds;
  terminals: LayoutTerminal[];
  anchorages: { anchorageId: string; name: string; polygon: GeoPoint[]; usage: 'waiting' | 'illustrative' }[];
  pilotBoardingPlace: GeoPoint;
  sourceType: string;
}

/** [lon, lat, sogKn, cogDeg | null, navStatus] */
export type KeyframeSample = [number, number, number, number | null, NavStatus];

export interface FlagshipTrack {
  vesselId: string;
  voyageId: string;
  routeId: string;
  intervalMinutes: number;
  history: { startUtc: IsoUtc; samples: KeyframeSample[] };
  forecast: { startUtc: IsoUtc; samples: KeyframeSample[] };
  sourceType: string;
}

export interface V2Scenario {
  scenarioVersion: string;
  baseFixtureVersion: string;
  seed: number;
  window: { minUtc: IsoUtc; maxUtc: IsoUtc };
  anchorUtc: IsoUtc;
  baseReplayRange: { startUtc: IsoUtc; endUtc: IsoUtc };
  flagshipVesselIds: string[];
  followDemo: { vesselId: string; voyageId: string; routeId: string };
  singaporeCase: {
    vesselId: string;
    portCallId: string;
    incidentId: string;
    queueSinceUtc: IsoUtc;
    anchorageEnterUtc: IsoUtc;
    estimatedBerthUtc: IsoUtc;
    berthAssigned: boolean;
  };
  precedence: string[];
  disclosure: string;
}

export interface V2Module {
  scenario: V2Scenario;
  flagshipTracks: FlagshipTrack[];
  portLayouts: PortLayout[];
  berthSchedule: BerthBooking[];
}

export const V2_KEYS = ['scenario', 'flagshipTracks', 'portLayouts', 'berthSchedule'] as const;

export interface RawDataset {
  manifest: Manifest;
  /** Optional: without it the app runs on the base fixture only. */
  v2?: V2Module | null;
  regions: Region[];
  ports: Port[];
  terminals: Terminal[];
  berths: Berth[];
  anchorages: Anchorage[];
  routes: Route[];
  vessels: Vessel[];
  voyages: Voyage[];
  positions: PositionSample[];
  portCalls: PortCall[];
  incidents: Incident[];
  evidence: Evidence[];
  weatherHazards: WeatherHazard[];
  events: TimelineEvent[];
  users: User[];
}

export const DATASET_KEYS = [
  'regions',
  'ports',
  'terminals',
  'berths',
  'anchorages',
  'routes',
  'vessels',
  'voyages',
  'positions',
  'portCalls',
  'incidents',
  'evidence',
  'weatherHazards',
  'events',
  'users',
] as const;
export type DatasetKey = (typeof DATASET_KEYS)[number];

import { expect, type Page } from '@playwright/test';

export interface PortosAdapter {
  state(): string;
  stats(): { calls: number; triangles: number; geometries: number; textures: number };
  flying(): boolean;
  reducedMotion(): boolean;
  pointOf(lat: number, lon: number): { x: number; y: number; visible: boolean } | null;
  vesselPoint(id: string): { x: number; y: number; visible: boolean } | null;
  vesselsNear(x: number, y: number, radius: number): string[];
  portPoint(id: string): { x: number; y: number; visible: boolean } | null;
  berthPoint(id: string): { x: number; y: number; visible: boolean } | null;
  twin(): {
    portId: string;
    sceneKey: string;
    landHeightM: number;
    moored: number;
    terminals: number;
    berths: number;
    cranes: number;
    containers: number;
    anchorages: number;
    conflicts: number;
    selected: string | null;
  } | null;
  loseContext(): void;
  spatialV2: boolean;
  director(): { phase: string; activeSceneKey: string | null; activeKind: string | null; activeFocusId: string | null; flights: number; cancelled: number; lastOutcome: string | null } | null;
  sceneCache(): { size: number; created: number; disposed: number; keys: string[] } | null;
  surfaceKind(): 'globe' | 'planar' | null;
  surface(): unknown;
  bridge(): { timeline: { step: string; ms: number; plannedMs: number }[]; stageVisible: boolean; labelsHidden: boolean };
  compass(): { northDeg: number; metresPerPx: number } | null;
  overlayStats(): { lod: number; drawnVessels: number; wakes: number; detailVessels: string[]; modelVessels: number; px: number; shipDrawCalls: number; trackRuns: ('observed' | 'modelled' | 'unverified')[] } | null;
  clock(): { timeMs: number; frameMs: number; mode: 'playing' | 'paused' | 'scrubbing'; rate: number; phase: 'history' | 'now' | 'simulation'; rangeStartMs: number; rangeEndMs: number };
  follow(): {
    follow: { vesselId: string; mode: 'chase' | 'above' | 'orbit' | 'courseUp' } | null;
    hold: 'panned' | 'edge' | null;
    edge: boolean;
    centre: { x: number; y: number } | null;
    ship: { x: number; y: number; visible: boolean } | null;
  };
  vesselPose(id: string): {
    model: string;
    state: 'underway' | 'anchored' | 'moored' | 'stopped';
    headingDeg: number;
    wake: number;
    detail: 0 | 1 | 2;
    lat: number;
    lon: number;
    navStatus: string;
    sogKn: number | null;
    cogDeg: number | null;
    vesselType: string;
  } | null;
}

declare global {
  interface Window {
    __portos?: PortosAdapter;
    __portos2d?: unknown;
  }
}

/** First load in a tab starts from the clean demo state; reloads keep whatever the test saved. */
export async function cleanStart(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__portos_e2e')) return;
    sessionStorage.setItem('__portos_e2e', '1');
    localStorage.removeItem('portos:workflow:v1');
    localStorage.removeItem('portos:assumptions:v1');
    localStorage.setItem('portos:preferences:v1', JSON.stringify({ userId: 'USR-005', reducedMotion: null }));
  });
}

export async function open(page: Page, path: string) {
  await cleanStart(page);
  await page.goto(path);
}

export async function globeReady(page: Page) {
  await page.waitForFunction(() => window.__portos?.state() === 'ready', null, { timeout: 30_000 });
}

export async function flightDone(page: Page) {
  await page.waitForFunction(() => window.__portos && !window.__portos.flying(), null, { timeout: 15_000 });
}

export function inspector(page: Page) {
  return page.getByTestId('inspector');
}

export async function search(page: Page, query: string) {
  const box = page.getByRole('combobox', { name: /Search vessels/ });
  await box.fill(query);
  await box.press('Enter');
}

export async function expectHeading(page: Page, text: string | RegExp) {
  await expect(inspector(page).getByRole('heading', { level: 2 })).toHaveText(text);
}

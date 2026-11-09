import type { BerthStatus } from '@/core/types';
import type { MarkerTone } from '@/selectors/mapLayers';
import { cssHex, markerColors } from '../theme';

/** Icons are drawn on canvas so vessels and berths render even when the tile/glyph server is unreachable. */
export interface MapIcon {
  name: string;
  image: ImageData;
  pixelRatio: number;
}

const PR = 2;
const OUTLINE = '#061a28';

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size * PR;
  const ctx = c.getContext('2d')!;
  ctx.scale(PR, PR);
  return { c, ctx };
}

function done(name: string, c: HTMLCanvasElement): MapIcon {
  return { name, image: c.getContext('2d')!.getImageData(0, 0, c.width, c.height), pixelRatio: PR };
}

const TONES: (MarkerTone | 'stale')[] = ['incident', 'atRisk', 'delayed', 'onPlan', 'ambient', 'stale'];

function toneColor(t: MarkerTone | 'stale') {
  return cssHex(markerColors[t]);
}

/** Heading chevron (bow up; MapLibre rotates it by course over ground). */
function vessel(t: MarkerTone | 'stale'): MapIcon {
  const s = 22;
  const { c, ctx } = canvas(s);
  ctx.beginPath();
  ctx.moveTo(s / 2, 2);
  ctx.lineTo(s - 5, s - 3);
  ctx.lineTo(s / 2, s - 7);
  ctx.lineTo(5, s - 3);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = toneColor(t);
  ctx.fill();
  if (t === 'delayed') {
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  return done(`vessel-${t}`, c);
}

/** At anchor / moored / no course: a rounded hull plan without a heading claim. */
function moored(t: MarkerTone | 'stale'): MapIcon {
  const s = 16;
  const { c, ctx } = canvas(s);
  ctx.beginPath();
  ctx.ellipse(s / 2, s / 2, 4.2, 6.2, 0, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = toneColor(t);
  ctx.fill();
  return done(`vessel-moored-${t}`, c);
}

const BERTH_COLORS: Record<BerthStatus, string> = {
  occupied: '#9fc1d1',
  scheduled: '#9fc1d1',
  free: '#7fcfa4',
  unavailable: '#77838e',
  unknown: '#a7b3bc',
};

function berth(status: BerthStatus): MapIcon {
  const s = 18;
  const { c, ctx } = canvas(s);
  const col = BERTH_COLORS[status];
  ctx.beginPath();
  ctx.roundRect(3, 3, s - 6, s - 6, 3);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = col;
  if (status === 'unknown') ctx.setLineDash([2.5, 2]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (status === 'occupied') {
    ctx.fillStyle = col;
    ctx.fillRect(6.5, 6.5, s - 13, s - 13);
  } else if (status === 'scheduled') {
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  } else if (status === 'unavailable') {
    ctx.beginPath();
    ctx.moveTo(6, 6);
    ctx.lineTo(s - 6, s - 6);
    ctx.moveTo(s - 6, 6);
    ctx.lineTo(6, s - 6);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else if (status === 'unknown') {
    ctx.fillStyle = col;
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', s / 2, s / 2 + 0.5);
  }
  return done(`berth-${status}`, c);
}

export function buildMapIcons(): MapIcon[] {
  const statuses: BerthStatus[] = ['occupied', 'scheduled', 'free', 'unavailable', 'unknown'];
  return [...TONES.map(vessel), ...TONES.map(moored), ...statuses.map(berth)];
}

export { BERTH_COLORS };

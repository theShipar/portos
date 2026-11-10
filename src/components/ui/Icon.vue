<script setup lang="ts">
import { computed } from 'vue';

export type IconName =
  | 'search'
  | 'close'
  | 'layers'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'ship'
  | 'port'
  | 'route'
  | 'incident'
  | 'region'
  | 'place'
  | 'voyage'
  | 'check'
  | 'alert'
  | 'octagon'
  | 'question'
  | 'info'
  | 'dot'
  | 'anchor'
  | 'clock'
  | 'user'
  | 'play'
  | 'pause'
  | 'reset'
  | 'expand'
  | 'collapse'
  | 'globe'
  | 'map'
  | 'cube'
  | 'arrow-left'
  | 'crosshair'
  | 'loop'
  | 'step-back'
  | 'step-forward';

const props = withDefaults(defineProps<{ name: IconName; size?: number; label?: string }>(), { size: 16, label: undefined });

const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35',
  close: 'M6 6l12 12M18 6 6 18',
  layers: 'M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5',
  'chevron-right': 'm9 6 6 6-6 6',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-down': 'm6 9 6 6 6-6',
  ship: 'M3 17h18l-2 4H5l-2-4Zm2-1V11l7-3 7 3v5M12 8V3m-3 2h6',
  port: 'M12 3v14m-6-7h12M5 21a7 7 0 0 0 14 0M12 3a2 2 0 1 0 0 4',
  route: 'M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14-10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 17h7a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h7',
  incident: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  region: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',
  place: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  voyage: 'M4 18c4-8 12-8 16 0M4 18h.01M20 18h.01M12 8V4',
  check: 'm5 12 5 5 9-10',
  alert: 'M12 3 2 20h20L12 3Zm0 6v5m0 3v.5',
  octagon: 'M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5Zm4 5v5m0 3v.5',
  question: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-12a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14m0 3v.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9v.5',
  dot: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  anchor: 'M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 0v13M5 13H3a9 9 0 0 0 18 0h-2M8 11h8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 9a8 8 0 0 1 16 0',
  play: 'M7 4v16l13-8L7 4Z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z',
  cube: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 10 9-5M12 12 3 7m9 5v10',
  'arrow-left': 'M19 12H5m6-6-6 6 6 6',
  crosshair: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-17v5m0 10v5M2 12h5m10 0h5',
  loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3m13-3v2a4 4 0 0 1-4 4H4',
  'step-back': 'M6 5v14M18 5 9 12l9 7V5Z',
  'step-forward': 'M18 5v14M6 5l9 7-9 7V5Z',
};

const d = computed(() => PATHS[props.name]);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <path :d="d" :fill="name === 'dot' || name === 'play' ? 'currentColor' : 'none'" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { modelKeyOf, type ShipModelKey } from '@/map/vessels3d/categories';

const props = defineProps<{ vesselType: string; tone?: 'ok' | 'warning' | 'critical' | 'unknown' }>();

/** Side profiles (bow to the right) matching the procedural 3D library categories; schematic, not to scale. */
const UPPER: Record<ShipModelKey, string> = {
  container: 'M30 22h8v-10h10v10h4v-6h120v6H30zM56 16h112v-4H56z',
  tanker: 'M30 22h8v-12h12v12h120v-2H30zM60 20h100v-2H60z',
  gas: 'M30 22h8v-12h12v12h120zM70 22a12 10 0 0 1 24 0zM100 22a12 10 0 0 1 24 0zM130 22a12 10 0 0 1 24 0z',
  bulk: 'M30 22h8v-12h12v12h120zM62 22v-4h16v4zM90 22v-4h16v4zM118 22v-4h16v4zM146 22v-4h16v4zM84 18l2-10 2 10zM112 18l2-10 2 10zM140 18l2-10 2 10z',
  roro: 'M30 22v-12h132l10 12z',
  general: 'M30 22h8v-12h12v12h120zM66 22v-4h22v4zM104 22v-4h22v4zM142 22v-4h18v4zM94 18l2-14 2 14zM132 18l2-14 2 14zM96 6l18 8h-2l-16-6z',
  tug: 'M80 22v-6h14v-8h12v8h14v6z',
  other: 'M30 22h8v-12h12v12h120zM64 22v-4h30v4zM110 22v-4h30v4zM100 18l2-12 2 12z',
};
const HULL: Record<ShipModelKey, string> = {
  container: 'M22 22h164l-10 14H34z',
  tanker: 'M22 22h164l-10 14H34z',
  gas: 'M22 22h164l-10 14H34z',
  bulk: 'M22 22h164l-10 14H34z',
  roro: 'M24 22h158l-8 14H32z',
  general: 'M22 22h164l-10 14H34z',
  tug: 'M66 22h80l-8 12H74z',
  other: 'M22 22h164l-10 14H34z',
};
const key = computed(() => modelKeyOf(props.vesselType));
</script>

<template>
  <svg class="ship" :class="`ship--${tone ?? 'ok'}`" viewBox="0 0 208 44" role="img" :aria-label="`${vesselType} silhouette (schematic)`" data-testid="ship-silhouette" :data-model="key">
    <line x1="4" y1="34" x2="204" y2="34" class="ship__water" />
    <path :d="UPPER[key]" class="ship__upper" />
    <path :d="HULL[key]" class="ship__hull" />
  </svg>
</template>

<style scoped>
.ship {
  display: block;
  width: 100%;
  max-width: 240px;
  height: 48px;
  margin: 0 auto;
}
.ship__water {
  stroke: var(--color-data-observed);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.ship__hull {
  fill: var(--color-ink);
}
.ship__upper {
  fill: var(--color-ink-secondary);
}
.ship--warning .ship__hull {
  fill: var(--color-warning-ink);
}
.ship--critical .ship__hull {
  fill: var(--color-critical);
}
.ship--unknown .ship__hull {
  fill: var(--color-unknown);
}
</style>

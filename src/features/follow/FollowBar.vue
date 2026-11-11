<script setup lang="ts">
import { computed } from 'vue';
import { FOLLOW_MODES } from '@/core/follow';
import { useCatalogStore } from '@/stores/catalog';
import { useClockStore } from '@/stores/clock';
import { useViewStore } from '@/stores/view';
import Icon from '@/components/ui/Icon.vue';

/** `edge`: the followed vessel is outside the scene's bounds; the camera waits at the edge (never jumps regions). */
defineProps<{ edge: boolean }>();

const view = useViewStore();
const clock = useClockStore();
const catalog = useCatalogStore();

const name = computed(() => (view.follow ? (catalog.catalog?.byId.vessel.get(view.follow.vesselId)?.name ?? view.follow.vesselId) : ''));
</script>

<template>
  <div v-if="view.follow" class="follow" role="region" aria-label="Follow camera" data-testid="follow-bar">
    <div class="follow__bar">
      <Icon name="crosshair" :size="14" />
      <span class="follow__title">
        Following <strong>{{ name }}</strong>
        <span class="follow__sub">Simulated{{ clock.playing ? ` · ×${clock.rate}` : '' }}</span>
      </span>
      <div class="seg" role="group" aria-label="Follow mode">
        <button
          v-for="m in FOLLOW_MODES"
          :key="m.key"
          type="button"
          class="seg__btn"
          :aria-pressed="view.follow.mode === m.key"
          :title="m.hint"
          :data-testid="`follow-mode-${m.key}`"
          @click="view.setFollowMode(m.key)"
        >
          {{ m.label }}
        </button>
      </div>
      <button type="button" class="icon-btn" aria-label="Stop following" data-testid="follow-stop" @click="view.stopFollow()">
        <Icon name="close" :size="14" />
      </button>
    </div>
    <button v-if="view.followHold" type="button" class="follow__chip" data-testid="follow-resume" @click="view.resumeFollow()">
      <Icon name="crosshair" :size="13" /> Resume following
    </button>
    <p v-else-if="edge" class="follow__chip follow__chip--note" role="status" data-testid="follow-edge">Vessel has left this map area · camera holds at the edge</p>
  </div>
</template>

<style scoped>
.follow {
  position: absolute;
  top: 12px;
  right: calc(var(--card-right, 0px) + var(--map-control-gap, 12px));
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  pointer-events: none;
}
.follow > * {
  pointer-events: auto;
}
.follow__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 10px;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
  font-size: var(--text-12);
  color: var(--color-ink);
}
.follow__title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}
.follow__sub {
  color: var(--color-ink-muted);
  font-size: var(--text-11);
}
.seg {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  overflow: hidden;
}
.seg__btn {
  height: 26px;
  padding: 0 8px;
  border: 0;
  background: var(--color-panel);
  color: var(--color-ink-secondary);
  font-size: var(--text-11);
  cursor: pointer;
}
.seg__btn + .seg__btn {
  border-left: 1px solid var(--color-border);
}
.seg__btn[aria-pressed='true'] {
  background: var(--toggle-on-bg);
  color: var(--toggle-on-ink);
  font-weight: 600;
}
.follow__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid var(--color-accent);
  border-radius: 999px;
  background: var(--surface-hud);
  -webkit-backdrop-filter: var(--hud-filter);
  backdrop-filter: var(--hud-filter);
  color: var(--color-accent-ink);
  font-size: var(--text-12);
  font-weight: 600;
  box-shadow: var(--shadow-panel);
  cursor: pointer;
}
.follow__chip--note {
  border-color: var(--color-border);
  color: var(--color-ink-secondary);
  font-weight: 500;
  cursor: default;
}
</style>

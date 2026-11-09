<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId } from 'vue';
import type { Provenance } from '@/engines/provenance';
import Icon from './Icon.vue';
import ProvenanceDetails from './ProvenanceDetails.vue';

const props = defineProps<{ provenance: Provenance; label: string }>();

const POP_W = 340;
const GAP = 6;
const open = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
const pop = ref<HTMLElement | null>(null);
const pos = ref({ top: 0, left: 0 });
const id = useId();

function place() {
  const b = btn.value?.getBoundingClientRect();
  if (!b) return;
  const h = pop.value?.offsetHeight ?? 0;
  const left = Math.min(Math.max(8, b.right - POP_W), window.innerWidth - POP_W - 8);
  const below = b.bottom + GAP;
  const top = below + h > window.innerHeight - 8 && b.top - GAP - h > 8 ? b.top - GAP - h : Math.min(below, Math.max(8, window.innerHeight - h - 8));
  pos.value = { top, left };
}

function onDocPointer(e: PointerEvent) {
  const t = e.target as Node;
  if (pop.value?.contains(t) || btn.value?.contains(t)) return;
  close(false);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    close(true);
  }
}

async function toggle() {
  if (open.value) return close(true);
  open.value = true;
  await nextTick();
  place();
  pop.value?.focus();
  document.addEventListener('pointerdown', onDocPointer, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
}

function close(returnFocus: boolean) {
  if (!open.value) return;
  open.value = false;
  document.removeEventListener('pointerdown', onDocPointer, true);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
  if (returnFocus) btn.value?.focus();
}

onBeforeUnmount(() => close(false));
defineExpose({ close, label: props.label });
</script>

<template>
  <button
    ref="btn"
    type="button"
    class="prov-btn"
    :class="{ 'prov-btn--scenario': provenance.sourceClass === 'user-scenario', 'prov-btn--open': open }"
    :aria-expanded="open"
    :aria-controls="open ? id : undefined"
    :aria-label="`Source and method for ${label}`"
    :title="`Source and method for ${label}`"
    data-testid="provenance-button"
    @click.stop="toggle"
  >
    <Icon name="info" :size="13" />
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      :id="id"
      ref="pop"
      class="prov-pop panel"
      role="dialog"
      :aria-label="`${label} — source and method`"
      tabindex="-1"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${POP_W}px` }"
      data-testid="provenance-popover"
      @keydown="onKey"
    >
      <div class="prov-pop__head">
        <strong>{{ label }}</strong>
        <button type="button" class="prov-pop__close" aria-label="Close source details" @click="close(true)"><Icon name="close" :size="14" /></button>
      </div>
      <ProvenanceDetails :provenance="provenance" />
    </div>
  </Teleport>
</template>

<style scoped>
.prov-btn {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--color-ink-muted);
  cursor: pointer;
  vertical-align: middle;
  flex: none;
}
.prov-btn:hover,
.prov-btn--open {
  color: var(--color-accent);
  background: var(--color-accent-subtle);
}
.prov-btn--scenario {
  color: var(--color-accent-hover);
  border-color: var(--color-accent);
}
.prov-pop {
  position: fixed;
  z-index: 200;
  max-height: min(70vh, 560px);
  overflow: auto;
  padding: 12px 14px 14px;
  background: var(--color-panel);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-panel);
}
.prov-pop:focus {
  outline: none;
}
.prov-pop__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: var(--text-13);
}
.prov-pop__close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--color-ink-muted);
  cursor: pointer;
}
.prov-pop__close:hover {
  background: var(--color-panel-secondary);
  color: var(--color-ink);
}
</style>

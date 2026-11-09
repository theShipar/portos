<script setup lang="ts">
import { useNoticeStore } from '@/stores/notices';
import Icon from '@/components/ui/Icon.vue';

const notices = useNoticeStore();
const ICON = { info: 'info', success: 'check', warning: 'alert', critical: 'octagon' } as const;
</script>

<template>
  <div class="notices" role="status" aria-live="polite">
    <div v-for="n in notices.items" :key="n.id" class="notice panel" :class="`notice--${n.tone}`">
      <Icon :name="ICON[n.tone]" />
      <span class="notice__text">{{ n.text }}</span>
      <button type="button" class="icon-btn notice__close" aria-label="Dismiss notice" @click="notices.dismiss(n.id)"><Icon name="close" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.notices {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 70;
  display: grid;
  gap: 8px;
  width: min(480px, calc(100% - 48px));
  pointer-events: none;
}
.notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 12px;
  box-shadow: var(--shadow-drawer);
  pointer-events: auto;
  font-size: var(--text-13);
}
.notice__text {
  flex: 1;
}
.notice__close {
  width: 26px;
  height: 26px;
}
.notice--info svg:first-child {
  color: var(--color-info);
}
.notice--success svg:first-child {
  color: var(--color-healthy);
}
.notice--warning svg:first-child {
  color: var(--color-warning);
}
.notice--critical svg:first-child {
  color: var(--color-critical);
}
</style>

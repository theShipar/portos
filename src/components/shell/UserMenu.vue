<script setup lang="ts">
import AppSelect from '@/components/ui/AppSelect.vue';
import { computed } from 'vue';
import { useCatalogStore } from '@/stores/catalog';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
const catalog = useCatalogStore();
const users = computed(() => catalog.catalog?.users ?? []);
const initials = computed(() =>
  (session.user?.displayName ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2),
);
</script>

<template>
  <div class="user">
    <span class="user__avatar" aria-hidden="true">{{ initials }}</span>
    <label class="user__label">
      <span class="sr-only">Demo identity (changes permissions only; not authentication)</span>
      <AppSelect :value="session.user?.userId" :disabled="!users.length" @change="session.switchUser(($event.target as HTMLSelectElement).value)">
        <option v-for="u in users" :key="u.userId" :value="u.userId">{{ u.displayName }} · {{ u.title }}</option>
      </AppSelect>
      <span class="user__role">Demo role: {{ session.user?.role ?? '—' }}</span>
    </label>
  </div>
</template>

<style scoped>
.user {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user__avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--color-panel-secondary);
  border: 1px solid var(--color-border);
  font-size: var(--text-12);
  font-weight: 600;
  color: var(--color-ink-secondary);
}
.user__label {
  display: grid;
  min-width: 0;
  max-width: 220px;
  line-height: 15px;
}
.user__label :deep(.app-select__trigger) {
  min-height: 28px;
  padding: 4px 8px;
  font-size: var(--text-12);
}
.user__role {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
  text-transform: capitalize;
}
</style>

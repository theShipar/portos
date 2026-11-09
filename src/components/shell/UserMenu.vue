<script setup lang="ts">
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
      <select :value="session.user?.userId" :disabled="!users.length" @change="session.switchUser(($event.target as HTMLSelectElement).value)">
        <option v-for="u in users" :key="u.userId" :value="u.userId">{{ u.displayName }} · {{ u.title }}</option>
      </select>
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
  line-height: 15px;
}
select {
  max-width: 150px;
  text-overflow: ellipsis;
  border: none;
  background: transparent;
  font-size: var(--text-12);
  font-weight: 600;
  color: var(--color-ink);
  padding: 0;
  cursor: pointer;
}
.user__role {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
  text-transform: capitalize;
}
</style>

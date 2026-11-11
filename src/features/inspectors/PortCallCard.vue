<script setup lang="ts">
import type { PortCallValue } from '@/selectors/portCall';
import StatusChip from '@/components/ui/StatusChip.vue';

defineProps<{ value: PortCallValue }>();
</script>

<template>
  <section class="pc" data-testid="port-call-value" :aria-label="`Port call ${value.portCallId}`">
    <header class="pc__head">
      <h3 class="pc__title">{{ value.portName }} · {{ value.stageLabel }}</h3>
      <span class="pc__ids mono">{{ value.portCallId }}<template v-if="value.bookingId"> · {{ value.bookingId }}</template></span>
    </header>
    <dl class="pc__rows">
      <template v-for="r in value.rows" :key="r.key">
        <dt>{{ r.label }}</dt>
        <dd :data-testid="`port-call-${r.key}`">
          <span class="mono">{{ r.value }}</span>
          <span v-if="r.hint" class="pc__hint">{{ r.hint }}</span>
          <span v-if="r.sourceIds.length" class="pc__src mono">{{ r.sourceIds.join(' · ') }}</span>
        </dd>
      </template>
      <template v-for="r in value.downstream" :key="r.key">
        <dt>{{ r.label }}</dt>
        <dd :data-testid="`port-call-${r.key}`">
          <span class="mono">{{ r.value }}</span>
          <span v-if="r.hint" class="pc__hint">{{ r.hint }}</span>
        </dd>
      </template>
    </dl>
    <p class="pc__jit" data-testid="port-call-jit">
      <StatusChip :status="{ tone: value.jit?.status === 'opportunity' ? 'info' : value.jit?.status === 'unconfirmedSlot' ? 'warning' : 'neutral', label: 'JIT', icon: 'clock' }" dense />
      <span>{{ value.jitText }}</span>
    </p>
    <ul v-if="value.jit?.options.length" class="pc__opts">
      <li v-for="o in value.jit.options" :key="o.id">{{ o.label }} <span class="pc__hint">{{ o.approval }}</span></li>
    </ul>
    <details class="pc__more">
      <summary>Service chain and milestone variance</summary>
      <ol class="pc__chain" data-testid="service-chain">
        <li v-for="s in value.chain" :key="s.key">
          <span>{{ s.label }}</span>
          <StatusChip :status="{ tone: s.tone, label: s.statusLabel, icon: 'dot' }" dense />
          <span class="pc__hint mono">{{ s.timeText }}</span>
        </li>
      </ol>
      <ul class="pc__chain">
        <li v-for="v in value.variance" :key="v.milestone" :title="v.note">
          <span>{{ v.label }}</span>
          <StatusChip :status="{ tone: v.tone, label: v.value, icon: 'dot' }" dense />
        </li>
      </ul>
    </details>
    <p class="pc__asof">{{ value.asOfText }}</p>
  </section>
</template>

<style scoped>
.pc {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-input);
  background: var(--color-panel);
}
.pc__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.pc__title {
  font-size: var(--text-14);
  line-height: 20px;
  font-weight: 600;
}
.pc__ids,
.pc__src,
.pc__asof {
  font-size: var(--text-11);
  color: var(--color-ink-muted);
}
.pc__rows {
  display: grid;
  grid-template-columns: minmax(110px, auto) 1fr;
  gap: 6px 10px;
  margin: 0;
  font-size: var(--text-12);
}
.pc__rows dt {
  color: var(--color-ink-secondary);
}
.pc__rows dd {
  display: grid;
  margin: 0;
}
.pc__hint {
  font-size: var(--text-11);
  color: var(--color-ink-secondary);
}
.pc__jit {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-12);
}
.pc__opts {
  margin: 0;
  padding-left: 18px;
  font-size: var(--text-12);
}
.pc__opts li {
  display: grid;
}
.pc__more summary {
  cursor: pointer;
  font-size: var(--text-12);
  color: var(--color-ink-secondary);
}
.pc__chain {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: var(--text-12);
}
.pc__chain li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 8px;
}
</style>

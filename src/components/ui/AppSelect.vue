<script setup lang="ts" generic="T extends string | number | null">
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useAttrs, useId } from 'vue';
import Icon from './Icon.vue';
defineOptions({ inheritAttrs: false });
const props = defineProps<{ modelValue?: T; value?: T; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [T]; change: [Event] }>();
const attrs = useAttrs();
const uid = useId();
const native = ref<HTMLSelectElement>();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const open = ref(false);
const menuTarget = ref<HTMLElement | string>('body');
const optionValue = (o: HTMLOptionElement) => '_value' in o ? (o as HTMLOptionElement & { _value: T })._value : o.value;
const options = ref<{ value: string; label: string; disabled: boolean }[]>([]);
const selected = ref('');
const label = ref('Choose an option');
const active = ref(0);
const position = ref<Record<string, string>>({});
const text = computed(() => options.value.find(o => o.value === selected.value)?.label ?? 'Choose…');
function sync() {
  if (!native.value) return;
  const rows = Array.from(native.value.options, o => ({ value: o.value, label: o.text, disabled: o.disabled }));
  if (JSON.stringify(rows) !== JSON.stringify(options.value)) options.value = rows;
  const value = props.modelValue !== undefined ? props.modelValue : props.value;
  if (value !== undefined) native.value.selectedIndex = Array.from(native.value.options).findIndex(o => String(optionValue(o)) === String(value));
  selected.value = native.value.value;
  const parent = native.value.closest('label')?.cloneNode(true) as HTMLElement | undefined;
  parent?.querySelectorAll('select,button,.user__role').forEach(n => n.remove());
  const external = attrs.id ? document.querySelector(`label[for="${attrs.id}"]`)?.textContent : null;
  label.value = String(attrs['aria-label'] ?? external ?? parent?.textContent?.trim() ?? 'Choose an option');
}
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus(); }
async function show() {
  if (props.disabled) return;
  sync();
  menuTarget.value = trigger.value?.closest('dialog') ?? 'body';
  const r = trigger.value!.getBoundingClientRect();
  const height = Math.min(320, options.value.length * 44 + 16);
  const below = window.innerHeight - r.bottom;
  position.value = { left: `${Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 280) - 8))}px`, width: `${Math.min(Math.max(r.width, 280), window.innerWidth - 16)}px`, maxHeight: `${Math.max(100, Math.min(320, below > height ? below - 16 : r.top - 16))}px`, ...(below > height ? { top: `${r.bottom + 8}px` } : { bottom: `${window.innerHeight - r.top + 8}px` }) };
  active.value = Math.max(0, options.value.findIndex(o => o.value === selected.value));
  open.value = true;
  await nextTick(); menu.value?.focus(); scrollActive();
}
function choose(i: number) {
  const o = options.value[i]; if (!o || o.disabled || !native.value) return;
  native.value.value = o.value;
  selected.value = o.value;
  native.value.dispatchEvent(new Event('change', { bubbles: true }));
  close(true);
}
function scrollActive() { menu.value?.children[active.value]?.scrollIntoView({ block: 'nearest' }); }
let search = ''; let lastKey = 0;
function key(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
  if (e.key === 'Tab') { close(true); return; }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const enabled = options.value.map((o, i) => o.disabled ? -1 : i).filter(i => i >= 0);
    const at = enabled.indexOf(active.value);
    active.value = (e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled.at(-1) : enabled[(at + (e.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]) ?? 0;
    scrollActive();
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active.value); }
  else if (e.key.length === 1) {
    search = Date.now() - lastKey < 700 ? search + e.key : e.key; lastKey = Date.now();
    const i = options.value.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(search.toLowerCase()));
    if (i >= 0) { active.value = i; scrollActive(); }
  }
}
function outside(e: PointerEvent) { if (!menu.value?.contains(e.target as Node) && !trigger.value?.contains(e.target as Node)) close(); }
function onChange(e: Event) {
  const el = e.target as HTMLSelectElement;
  selected.value = el.value;
  const option = el.options[el.selectedIndex];
  if (option) emit('update:modelValue', optionValue(option) as T);
  emit('change', e);
}
onMounted(() => { sync(); document.addEventListener('pointerdown', outside); window.addEventListener('resize', dismiss); window.addEventListener('scroll', onScroll, true); });
onUpdated(sync);
function dismiss() { close(); }
function onScroll(e: Event) { if (!menu.value?.contains(e.target as Node)) close(); }
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', onScroll, true); });
defineExpose({ focus: () => trigger.value?.focus() });
</script>
<template>
  <span class="app-select">
    <select ref="native" class="app-select__native" :value="modelValue ?? value" :disabled="disabled" tabindex="-1" aria-hidden="true" @change="onChange"><slot /></select>
    <button v-bind="attrs" ref="trigger" type="button" class="app-select__trigger" :disabled="disabled" :aria-label="label" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="open ? uid : undefined" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show()">
      <span>{{ text }}</span><Icon name="chevron-down" :size="14" />
    </button>
    <Teleport :to="menuTarget">
      <div v-if="open" :id="uid" ref="menu" class="app-select__menu" :style="position" role="listbox" :aria-label="label" :aria-activedescendant="`${uid}-${active}`" tabindex="-1" @keydown="key">
        <div v-for="(o, i) in options" :id="`${uid}-${i}`" :key="o.value" role="option" :data-value="o.value" :aria-selected="o.value === selected" :aria-disabled="o.disabled" class="app-select__option" :class="{ 'is-active': i === active }" @pointermove="active = i" @click="choose(i)"><span>{{ o.label }}</span><span v-if="o.value === selected" aria-hidden="true">✓</span></div>
      </div>
    </Teleport>
  </span>
</template>
<style scoped>
.app-select { display: inline-flex; min-width: 0; width: 100%; }
.app-select__native { display: none; }
.app-select__trigger { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-width: 0; min-height: 36px; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-input); background: var(--color-panel-secondary); color: var(--color-ink); font: inherit; font-size: var(--text-12); text-align: left; cursor: pointer; }
.app-select__trigger > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-select__trigger:hover, .app-select__trigger[aria-expanded=true] { border-color: var(--color-accent); }
.app-select__trigger:disabled { opacity: .45; cursor: not-allowed; }
.app-select__menu { position: fixed; z-index: 10000; overflow-y: auto; padding: 6px; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-panel); color: var(--color-ink); box-shadow: var(--shadow-drawer); outline: none; }
.app-select__option { display: flex; justify-content: space-between; gap: 16px; padding: 12px; border-radius: 6px; font-size: var(--text-13); line-height: 20px; cursor: pointer; overflow-wrap: anywhere; }
.app-select__option.is-active { background: var(--color-panel-secondary); outline: 1px solid var(--color-border); }
.app-select__option[aria-selected=true] { color: var(--color-accent-ink); background: var(--color-accent-subtle); }
.app-select__option[aria-disabled=true] { opacity: .4; cursor: not-allowed; }
</style>

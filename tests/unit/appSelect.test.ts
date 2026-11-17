// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import AppSelect from '@/components/ui/AppSelect.vue';

afterEach(() => { document.body.innerHTML = ''; });

describe('styled select interaction contracts', () => {
  it('preserves numeric and null model values with keyboard selection', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const Host = defineComponent({ components: { AppSelect }, setup: () => ({ value: ref<number | null>(null) }), template: `<AppSelect v-model="value" aria-label="Rate"><option :value="null">All</option><option :value="10">Ten</option><option :value="20" disabled>Twenty</option></AppSelect>` });
    const wrapper = mount(Host, { attachTo: document.body });
    await wrapper.get('button').trigger('click');
    await nextTick();
    const menu = document.querySelector('[role=listbox]')!;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await nextTick();
    expect(wrapper.vm.value).toBe(10);
    expect(wrapper.get('button').text()).toContain('Ten');
    await wrapper.get('button').trigger('click');
    await nextTick();
    document.querySelector('[role=option]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(wrapper.vm.value).toBeNull();
    wrapper.unmount();
  });
  it('forwards the new selection to existing change handlers and closes on Escape', async () => {
    const selected = vi.fn();
    const wrapper = mount(AppSelect, { props: { value: 'a', onChange: (e: Event) => selected((e.target as HTMLSelectElement).value) }, slots: { default: '<option value="a">Alpha</option><option value="b">Beta</option>' }, attachTo: document.body });
    await wrapper.get('button').trigger('click');
    await nextTick();
    document.querySelectorAll('[role=option]')[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(selected).toHaveBeenCalledWith('b');
    await nextTick();
    await wrapper.get('button').trigger('click');
    await nextTick();
    document.querySelector('[role=listbox]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(document.querySelector('[role=listbox]')).toBeNull();
    expect(document.activeElement).toBe(wrapper.get('button').element);
    wrapper.unmount();
  });
});

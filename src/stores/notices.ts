import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Notice {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'critical';
  text: string;
  /** Persistent notices stay until dismissed. */
  persistent?: boolean;
}

let seq = 0;

export const useNoticeStore = defineStore('notices', () => {
  const items = ref<Notice[]>([]);

  function push(text: string, tone: Notice['tone'] = 'info', opts: { persistent?: boolean; timeoutMs?: number } = {}) {
    const n: Notice = { id: ++seq, tone, text, persistent: opts.persistent };
    items.value = [...items.value.filter((i) => i.text !== text), n].slice(-4);
    if (!opts.persistent) setTimeout(() => dismiss(n.id), opts.timeoutMs ?? 5000);
    return n.id;
  }

  function dismiss(id: number) {
    items.value = items.value.filter((i) => i.id !== id);
  }

  return { items, push, dismiss };
});

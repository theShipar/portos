import { defineStore } from 'pinia';
import { markRaw, ref } from 'vue';

export interface NoticeAction {
  label: string;
  run: () => void;
}

export interface Notice {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'critical';
  text: string;
  /** Persistent notices stay until dismissed. */
  persistent?: boolean;
  action?: NoticeAction;
}

let seq = 0;

export const useNoticeStore = defineStore('notices', () => {
  const items = ref<Notice[]>([]);

  function push(text: string, tone: Notice['tone'] = 'info', opts: { persistent?: boolean; timeoutMs?: number; action?: NoticeAction } = {}) {
    const n: Notice = { id: ++seq, tone, text, persistent: opts.persistent, action: opts.action ? markRaw(opts.action) : undefined };
    items.value = [...items.value.filter((i) => i.text !== text), n].slice(-4);
    if (!opts.persistent) setTimeout(() => dismiss(n.id), opts.timeoutMs ?? (opts.action ? 8000 : 5000));
    return n.id;
  }

  function dismiss(id: number) {
    items.value = items.value.filter((i) => i.id !== id);
  }

  function runAction(n: Notice) {
    dismiss(n.id);
    n.action?.run();
  }

  return { items, push, dismiss, runAction };
});

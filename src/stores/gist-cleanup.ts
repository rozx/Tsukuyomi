import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { GistCleanupPlan } from 'src/services/gist-file-cleanup';

/** 仅内存状态；让设置页在 Desktop / Tablet / Mobile 切换时保留清理进度。 */
export const useGistCleanupStore = defineStore('gist-cleanup', () => {
  const plan = shallowRef<GistCleanupPlan | null>(null);
  const error = ref('');
  const phase = ref<'scan' | 'cleanup' | null>(null);
  const gistId = ref('');
  const completed = ref(0);
  return { plan, error, phase, gistId, completed };
});

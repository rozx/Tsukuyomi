import { computed, ref, watch } from 'vue';
import { useSettingsStore } from 'src/stores/settings';
import { FirecrawlClient } from 'src/services/firecrawl/firecrawl-client';

/**
 * API Keys 标签页中 Firecrawl 卡片的状态：Key 保存前经额度查询校验（401 拒绝保存），
 * 「检查额度」按需查询，不在挂载或后台轮询。
 */

interface FirecrawlCredits {
  remainingCredits: number;
  planCredits: number;
  billingPeriodEnd?: string;
}

export function useFirecrawlKeySettings() {
  const settingsStore = useSettingsStore();

  const keyInput = ref(settingsStore.firecrawlApiKey ?? '');
  const busy = ref(false);
  const error = ref<string | null>(null);
  const credits = ref<FirecrawlCredits | null>(null);

  // 设置在后台异步加载（App.vue 不阻塞渲染）：已保存的 Key 变化时回填输入框，
  // 避免输入框停留为空、「保存」被误判为可用而删掉已保存的 Key
  watch(
    () => settingsStore.firecrawlApiKey,
    (key) => {
      keyInput.value = key ?? '';
    },
  );

  const hasKey = computed(() => !!settingsStore.firecrawlApiKey);
  const isDirty = computed(() => keyInput.value.trim() !== (settingsStore.firecrawlApiKey ?? ''));
  const canCheckCredits = computed(() => hasKey.value && !busy.value);
  const fallbackEnabled = computed(() => settingsStore.firecrawlFallbackEnabled);

  /** 查询额度；返回 false 表示 Key 无效或查询失败（error 已设置） */
  async function queryCredits(key: string): Promise<boolean> {
    try {
      const result = await FirecrawlClient.getCreditUsage(key);
      if (result.kind === 'invalid-key') {
        error.value = '无效的 API Key';
        return false;
      }
      credits.value = {
        remainingCredits: result.remainingCredits,
        planCredits: result.planCredits,
        ...(result.billingPeriodEnd ? { billingPeriodEnd: result.billingPeriodEnd } : {}),
      };
      return true;
    } catch {
      error.value = '无法验证 API Key，请检查网络后重试';
      return false;
    }
  }

  async function save(): Promise<void> {
    const key = keyInput.value.trim();
    error.value = null;
    if (!key) {
      await settingsStore.setFirecrawlApiKey(undefined);
      keyInput.value = '';
      credits.value = null;
      return;
    }
    busy.value = true;
    try {
      if (await queryCredits(key)) {
        await settingsStore.setFirecrawlApiKey(key);
        keyInput.value = key;
      }
    } finally {
      busy.value = false;
    }
  }

  async function refreshCredits(): Promise<void> {
    const key = settingsStore.firecrawlApiKey;
    if (!key || busy.value) return;
    error.value = null;
    busy.value = true;
    try {
      await queryCredits(key);
    } finally {
      busy.value = false;
    }
  }

  async function setFallbackEnabled(enabled: boolean): Promise<void> {
    await settingsStore.setFirecrawlFallbackEnabled(enabled);
  }

  return {
    keyInput,
    busy,
    error,
    credits,
    hasKey,
    isDirty,
    canCheckCredits,
    fallbackEnabled,
    save,
    refreshCredits,
    setFallbackEnabled,
  };
}

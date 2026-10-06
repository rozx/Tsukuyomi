import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsStore } from 'src/stores/settings';
import { useUiStore } from 'src/stores/ui';
import { isLocalEmbeddingEffectivelyEnabled } from 'src/utils/local-embedding';

/** 功能可用性看本地嵌入开关，窗口宽度只负责选择入口的布局。 */
export function useBatchEmbeddingsPanel() {
  const route = useRoute();
  const settings = useSettingsStore();
  const ui = useUiStore();
  const bookId = computed(() => (typeof route.params.id === 'string' ? route.params.id : ''));
  const isAvailable = computed(
    () =>
      Boolean(bookId.value) &&
      isLocalEmbeddingEffectivelyEnabled(settings.settings.enableLocalEmbedding),
  );
  const visible = computed({
    get: () => ui.batchEmbeddingsPanelOpen,
    set: (open: boolean) => {
      ui.batchEmbeddingsPanelOpen = open && isAvailable.value;
    },
  });
  const toggle = () => {
    visible.value = !visible.value;
  };
  return { bookId, isAvailable, visible, toggle };
}

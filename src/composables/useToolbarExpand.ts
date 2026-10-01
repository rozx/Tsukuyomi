import { computed } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * 设置面板（角色 / 术语等）工具栏展开状态对应的图标与标题文案。
 * 把模板内联三元收敛为 computed，供多个面板复用，避免逻辑重复。
 */
export function useToolbarExpand(isToolbarExpanded: Ref<boolean>) {
  const { t } = useI18n();
  const toolbarExpandIcon = computed(() =>
    isToolbarExpanded.value ? 'pi pi-chevron-up' : 'pi pi-sliders-h',
  );
  const toolbarExpandTitle = computed(() =>
    t(isToolbarExpanded.value ? 'panelUi.collapse' : 'panelUi.searchFilter'),
  );

  return { toolbarExpandIcon, toolbarExpandTitle };
}

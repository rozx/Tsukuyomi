import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import { useUiStore } from 'src/stores/ui';
import { useImportRouteScope } from 'src/composables/import-page/useImportRouteScope';
import { useMainNavDispatch } from './useMainNavDispatch';

/**
 * 顶部系统条「月詠」助手按钮（桌面 header 与平板顶部信息条共用）。
 *
 * 开关走 `useMainNavDispatch().dispatch('chat')`，与手机底部 Tab 栏同一套逻辑。
 * 导入页的对话常驻停靠时（桌面、平板横屏）按钮只显示激活态、拦掉点击：`dispatch('chat')`
 * 不认导入路由，直接调用会把 `rightPanelOpen` 切掉，离开导入页后面板的开关就变了。
 */
export function useAssistantToggle(options: {
  /** 导入页的对话是否常驻停靠（桌面恒为 true，平板横屏为 true、竖屏为 false） */
  importDocked: MaybeRefOrGetter<boolean>;
}) {
  const ui = useUiStore();
  const { dispatch } = useMainNavDispatch();
  const isImportRoute = useImportRouteScope();

  const locked = computed(() => isImportRoute.value && toValue(options.importDocked));
  const active = computed(
    () => locked.value || (ui.rightPanelOpen && ui.activeRightTab === 'chat'),
  );

  const toggle = () => {
    if (locked.value) return;
    dispatch('chat');
  };

  return { active, locked, toggle };
}

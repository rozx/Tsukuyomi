import { computed } from 'vue';
import { useUiStore } from 'src/stores/ui';

/**
 * 平板右侧 rail 的共享状态：AI 助手按钮的激活态与开关逻辑。
 * BookDetailsTablet / BooksPageTablet 都复用。翻译进度已移到顶部信息条的任务中心。
 *
 * toggleRail() 语义：右侧面板已打开就关闭，否则打开 AI 助手；与 MobileTabBar 的 chat 按钮一致。
 */
export function useTabletRightRail() {
  const ui = useUiStore();

  const isChatActive = computed(() => ui.rightPanelOpen && ui.activeRightTab === 'chat');

  const toggleRail = () => {
    if (ui.rightPanelOpen && ui.activeRightTab === 'chat') {
      ui.closeRightPanel();
      return;
    }
    ui.setActiveRightTab('chat');
    ui.openRightPanel();
  };

  return { isChatActive, toggleRail };
}

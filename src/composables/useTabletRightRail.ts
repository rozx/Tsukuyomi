import { computed } from 'vue';
import { useUiStore } from 'src/stores/ui';
import { useAIProcessingStore } from 'src/stores/ai-processing';

/**
 * 平板右侧 rail 的共享状态：AI 助手 / 翻译进度两颗按钮都需要的激活态、
 * 活动任务计数、以及切换逻辑。BookDetailsTablet / BooksPageTablet 都复用。
 *
 * toggleRail(tab) 语义：
 *   - 若右侧面板已打开且当前正是 `tab`，再次点击就关闭
 *   - 否则切换到 `tab`、并确保面板打开
 * 和 MobileTabBar 的 chat 按钮保持一致。
 */
export function useTabletRightRail() {
  const ui = useUiStore();
  const aiProcessing = useAIProcessingStore();

  const isChatActive = computed(() => ui.rightPanelOpen && ui.activeRightTab === 'chat');
  const isProgressActive = computed(
    () => ui.rightPanelOpen && ui.activeRightTab === 'progress',
  );

  const activeTranslationTaskCount = computed(
    () =>
      aiProcessing.activeTasks.filter(
        (t) =>
          (t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading') &&
          (t.status === 'thinking' || t.status === 'processing'),
      ).length,
  );

  const toggleRail = (tab: 'chat' | 'progress') => {
    if (ui.rightPanelOpen && ui.activeRightTab === tab) {
      ui.closeRightPanel();
      return;
    }
    ui.setActiveRightTab(tab);
    ui.openRightPanel();
  };

  return { isChatActive, isProgressActive, activeTranslationTaskCount, toggleRail };
}

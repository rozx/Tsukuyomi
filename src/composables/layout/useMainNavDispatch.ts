import { useRouter, useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

export type MainNavTarget = 'home' | 'library' | 'chat' | 'ai' | 'help' | 'settings';

/**
 * MobileTabBar / TabletNavRail 共享的导航分派逻辑。
 *
 * - 各 tab 导航到对应路由并关闭右侧面板
 * - 'chat' 特殊处理：已打开则关闭、已在其它 tab 则切换到 chat
 * - tabs 未在此覆盖的 case 由调用方自行扩展（默认无操作）
 */
export function useMainNavDispatch() {
  const router = useRouter();
  const route = useRoute();
  const ui = useUiStore();

  const closeRightPanelIfOpen = () => {
    if (ui.rightPanelOpen) ui.closeRightPanel();
  };

  const pushIfNeeded = (targetPath: string, matcher: (path: string) => boolean) => {
    if (!matcher(route.path)) void router.push(targetPath);
  };

  const dispatchChatTab = () => {
    // 右面板已打开且当前在 chat tab 上：再次点击关闭
    // 右面板已打开但在其它 tab（如 progress）：切换到 chat，不关闭
    // 右面板已关闭：打开并定位到 chat
    if (ui.rightPanelOpen && ui.activeRightTab === 'chat') {
      ui.closeRightPanel();
      return;
    }
    ui.setActiveRightTab('chat');
    if (!ui.rightPanelOpen) ui.openRightPanel();
  };

  const navigateAndCloseRightPanel = (
    targetPath: string,
    matcher: (path: string) => boolean,
  ) => {
    closeRightPanelIfOpen();
    pushIfNeeded(targetPath, matcher);
  };

  const ROUTE_TARGETS: Partial<
    Record<MainNavTarget, { path: string; match: (p: string) => boolean }>
  > = {
    home: { path: '/', match: (p) => p === '/' },
    library: { path: '/books', match: (p) => p === '/books' },
    ai: { path: '/ai', match: (p) => p === '/ai' },
    help: { path: '/help', match: (p) => p.startsWith('/help') },
    settings: { path: '/settings', match: (p) => p.startsWith('/settings') },
  };

  const dispatch = (id: MainNavTarget) => {
    if (id === 'chat') {
      dispatchChatTab();
      return;
    }
    const target = ROUTE_TARGETS[id];
    if (target) navigateAndCloseRightPanel(target.path, target.match);
  };

  return { dispatch };
}

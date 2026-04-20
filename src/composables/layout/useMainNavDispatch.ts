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

  const dispatch = (id: MainNavTarget) => {
    switch (id) {
      case 'home':
        closeRightPanelIfOpen();
        pushIfNeeded('/', (p) => p === '/');
        return;
      case 'library':
        closeRightPanelIfOpen();
        pushIfNeeded('/books', (p) => p === '/books');
        return;
      case 'chat':
        // 右面板已打开且当前在 chat tab 上：再次点击关闭
        // 右面板已打开但在其它 tab（如 progress）：切换到 chat，不关闭
        // 右面板已关闭：打开并定位到 chat
        if (ui.rightPanelOpen && ui.activeRightTab === 'chat') {
          ui.closeRightPanel();
        } else {
          ui.setActiveRightTab('chat');
          if (!ui.rightPanelOpen) ui.openRightPanel();
        }
        return;
      case 'ai':
        closeRightPanelIfOpen();
        pushIfNeeded('/ai', (p) => p === '/ai');
        return;
      case 'help':
        closeRightPanelIfOpen();
        pushIfNeeded('/help', (p) => p.startsWith('/help'));
        return;
      case 'settings':
        closeRightPanelIfOpen();
        pushIfNeeded('/settings', (p) => p.startsWith('/settings'));
        return;
    }
  };

  return { dispatch };
}

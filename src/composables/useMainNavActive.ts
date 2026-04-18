import { computed, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

export type MainNavTab = 'home' | 'library' | 'chat' | 'ai' | 'settings';

/**
 * 主导航入口（首页 / 书库 / AI 助手 / AI 模型 / 设置）当前激活项的共享派生状态。
 *
 * 移动端底部导航与平板侧边图标导航共用此逻辑，避免激活态规则在两个位置漂移。
 */
export function useMainNavActive(): ComputedRef<MainNavTab> {
  const route = useRoute();
  const ui = useUiStore();

  return computed<MainNavTab>(() => {
    const path = route.path;
    // 平板专用 chat 页面
    if (path === '/chat' || path.startsWith('/chat/')) return 'chat';
    // 其他变体 chat 仍挂在右侧面板 / 底部抽屉
    if (ui.rightPanelOpen && ui.activeRightTab === 'chat') return 'chat';
    if (path === '/') return 'home';
    if (path.startsWith('/ai')) return 'ai';
    if (path.startsWith('/settings')) return 'settings';
    if (path === '/books' || path.startsWith('/books/')) return 'library';
    return 'home';
  });
}

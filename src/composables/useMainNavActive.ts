import { computed, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

export type MainNavTab = 'home' | 'library' | 'chat' | 'ai' | 'help' | 'settings';

/**
 * 主导航入口（首页 / 书库 / AI 助手 / AI 模型 / 帮助 / 设置）当前激活项的共享派生状态。
 *
 * 移动端底部导航与平板侧边图标导航共用此逻辑，避免激活态规则在两个位置漂移。
 */
export function useMainNavActive(): ComputedRef<MainNavTab> {
  const route = useRoute();
  const ui = useUiStore();

  return computed<MainNavTab>(() => {
    const path = route.path;
    // AI 助手始终挂在右侧面板 / 底部抽屉（不再提供全屏路由）
    if (ui.rightPanelOpen && ui.activeRightTab === 'chat') return 'chat';
    if (path === '/') return 'home';
    if (path.startsWith('/ai')) return 'ai';
    if (path.startsWith('/help')) return 'help';
    if (path.startsWith('/settings')) return 'settings';
    if (path === '/books' || path.startsWith('/books/')) return 'library';
    return 'home';
  });
}

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUiStore } from 'src/stores/ui';

const router = useRouter();
const route = useRoute();
const ui = useUiStore();

type TabId = 'home' | 'library' | 'chat' | 'ai' | 'settings';

type Tab = { id: TabId; icon: string; label: string };

// 内容 → AI 工具 → 应用设置：
//   首页 · 书库   ← 内容入口
//   AI 助手 · AI 模型  ← 核心 AI 功能（把 AI 集群放在中间方便拇指触达）
//   设置         ← 配置入口（帮助已移至顶栏）
const tabs: Tab[] = [
  { id: 'home', icon: 'pi-home', label: '首页' },
  { id: 'library', icon: 'pi-book', label: '书库' },
  { id: 'chat', icon: 'pi-sparkles', label: 'AI 助手' },
  { id: 'ai', icon: 'pi-objects-column', label: 'AI 模型' },
  { id: 'settings', icon: 'pi-cog', label: '设置' },
];

const activeTab = computed<TabId>(() => {
  if (ui.rightPanelOpen && ui.activeRightTab === 'chat') return 'chat';
  const path = route.path;
  if (path === '/') return 'home';
  if (path.startsWith('/ai')) return 'ai';
  if (path.startsWith('/settings')) return 'settings';
  if (path === '/books' || path.startsWith('/books/')) return 'library';
  return 'home';
});

const onTabClick = (id: TabId) => {
  switch (id) {
    case 'home':
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (route.path !== '/') void router.push('/');
      return;
    case 'library':
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (route.path !== '/books') void router.push('/books');
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
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (route.path !== '/ai') void router.push('/ai');
      return;
    case 'settings':
      if (ui.rightPanelOpen) ui.closeRightPanel();
      if (!route.path.startsWith('/settings')) void router.push('/settings');
      return;
  }
};
</script>

<template>
  <nav class="mobile-tabbar" aria-label="主导航">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: activeTab === tab.id }"
      @click="onTabClick(tab.id)"
    >
      <i :class="['pi', tab.icon]" />
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.mobile-tabbar {
  display: flex;
  align-items: stretch;
  padding: 8px 6px calc(env(safe-area-inset-bottom, 0px) + 18px);
  background: rgba(10, 12, 15, 0.88);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  z-index: 40;
  flex-shrink: 0;
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 10px;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 500;
  color: rgba(138, 147, 160, 0.95);
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tab i {
  font-size: 20px;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    text-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tab:active {
  background: rgba(255, 255, 255, 0.04);
}

.tab.active {
  color: #e9edf5;
}

.tab.active i {
  color: #a3b7cf;
  text-shadow: 0 0 12px rgba(109, 136, 168, 0.5);
}
</style>
